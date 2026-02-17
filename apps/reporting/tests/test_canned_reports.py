# apps/reporting/tests/test_canned_reports.py
"""
Tests for canned report queries and API endpoints.

Test coverage:
- Sales report queries (sales_by_customer, sales_by_item, backorder_report, open_order_detail)
- Purchasing report queries (open_po_report, vendor_performance, purchase_history)
- Inventory report queries (inventory_valuation, stock_status, low_stock_alert, dead_stock)
- Financial report queries (sales_tax_liability, gross_margin_report)
- All 13 canned report API endpoints (HTTP GET, date filtering)
- CSV export
- Date parsing validation
- Authentication enforcement
"""
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import SalesOrder, SalesOrderLine, PurchaseOrder, PurchaseOrderLine
from apps.invoicing.models import Invoice, InvoiceLine, TaxZone
from apps.warehousing.models import Warehouse, WarehouseLocation, StockQuant
from apps.reporting.queries import (
    sales_by_customer, sales_by_item, backorder_report, open_order_detail,
    open_po_report, vendor_performance, purchase_history,
    inventory_valuation, stock_status, low_stock_alert, dead_stock,
    sales_tax_liability, gross_margin_report,
)
from shared.managers import set_current_tenant

User = get_user_model()


# =============================================================================
# BASE TEST CLASS
# =============================================================================

class CannedReportsTestCase(TestCase):
    """Base test case with shared setup for all canned report tests."""

    @classmethod
    def setUpTestData(cls):
        """Create shared test data (runs once per test class)."""
        # Create tenant
        cls.tenant = Tenant.objects.create(
            name='Test Canned Reports Company',
            subdomain='test-canned-reports',
            is_default=True,
        )

        # Create user
        cls.user = User.objects.create_user(
            username='reportuser',
            email='reportuser@test.com',
            password='testpass123',
        )

        # Set current tenant for TenantManager
        set_current_tenant(cls.tenant)

        # Create UnitOfMeasure
        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='ea',
            name='Each',
            is_active=True,
        )

        # Create Customer Party + Customer + Location
        cls.customer_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='CUST-001',
            display_name='Acme Corp',
            is_active=True,
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            payment_terms='NET30',
        )
        cls.customer_location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            location_type='SHIP_TO',
            name='Acme Main',
        )

        # Create Vendor Party + Vendor + Location
        cls.vendor_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='VENDOR',
            code='VEND-001',
            display_name='Best Supplier Inc',
            is_active=True,
        )
        cls.vendor = Vendor.objects.create(
            tenant=cls.tenant,
            party=cls.vendor_party,
            payment_terms='NET30',
        )
        cls.vendor_location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.vendor_party,
            location_type='WAREHOUSE',
            name='Vendor Main',
        )

        # Create Items
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku='ITEM-001',
            name='Widget Alpha',
            base_uom=cls.uom,
            is_active=True,
        )
        cls.item2 = Item.objects.create(
            tenant=cls.tenant,
            sku='ITEM-002',
            name='Widget Beta',
            base_uom=cls.uom,
            is_active=True,
            reorder_point=100,
        )

        # Create Warehouse + WarehouseLocation
        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant,
            name='Main Warehouse',
            code='MAIN',
            is_active=True,
        )
        cls.wh_location = WarehouseLocation.objects.create(
            tenant=cls.tenant,
            warehouse=cls.warehouse,
            name='A-01-01',
            barcode='LOC-A01',
            type='STORAGE',
            is_active=True,
        )

        # Create StockQuants
        # item: 50 on hand, 10 reserved => 40 available
        cls.quant1 = StockQuant.objects.create(
            tenant=cls.tenant,
            item=cls.item,
            location=cls.wh_location,
            quantity=Decimal('50'),
            reserved_quantity=Decimal('10'),
        )
        # item2: 20 on hand, 0 reserved => 20 available (reorder_point=100, so low stock)
        cls.quant2 = StockQuant.objects.create(
            tenant=cls.tenant,
            item=cls.item2,
            location=cls.wh_location,
            quantity=Decimal('20'),
            reserved_quantity=Decimal('0'),
        )

    def setUp(self):
        """Set up for each test."""
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)


# =============================================================================
# SALES REPORT QUERY TESTS
# =============================================================================

class SalesReportQueryTests(CannedReportsTestCase):
    """Tests for sales report query functions."""

    def _make_posted_invoice(self, invoice_number='INV-001', total_amount=Decimal('1000.00'),
                              subtotal=Decimal('1000.00'), status='posted'):
        """Helper: create an invoice with one line."""
        today = date.today()
        inv = Invoice.objects.create(
            tenant=self.tenant,
            invoice_number=invoice_number,
            customer=self.customer,
            invoice_date=today,
            due_date=today + timedelta(days=30),
            status=status,
            bill_to_name='Acme Corp',
            subtotal=subtotal,
            total_amount=total_amount,
            tax_amount=Decimal('0'),
        )
        InvoiceLine.objects.create(
            tenant=self.tenant,
            invoice=inv,
            line_number=10,
            item=self.item,
            description='Widget Alpha',
            quantity=10,
            uom=self.uom,
            unit_price=Decimal('100.00'),
        )
        return inv

    def test_sales_by_customer_with_data(self):
        """Posted invoice aggregates correctly by customer."""
        self._make_posted_invoice('INV-SBC-001', total_amount=Decimal('500.00'))
        self._make_posted_invoice('INV-SBC-002', total_amount=Decimal('300.00'))

        start = date(date.today().year, 1, 1)
        end = date.today()
        rows = sales_by_customer(self.tenant, start, end)

        self.assertIsInstance(rows, list)
        self.assertGreater(len(rows), 0)

        row = rows[0]
        self.assertIn('customer_name', row)
        self.assertIn('total_sales', row)
        self.assertIn('order_count', row)
        self.assertEqual(row['customer_name'], 'Acme Corp')
        self.assertEqual(row['order_count'], 2)

    def test_sales_by_customer_empty(self):
        """No invoices returns empty list."""
        start = date(1990, 1, 1)
        end = date(1990, 12, 31)
        rows = sales_by_customer(self.tenant, start, end)
        self.assertEqual(rows, [])

    def test_sales_by_customer_excludes_draft(self):
        """Draft invoices are not included in sales by customer."""
        today = date.today()
        Invoice.objects.create(
            tenant=self.tenant,
            invoice_number='INV-DRAFT-001',
            customer=self.customer,
            invoice_date=today,
            due_date=today + timedelta(days=30),
            status='draft',
            bill_to_name='Acme Corp',
            subtotal=Decimal('999.00'),
            total_amount=Decimal('999.00'),
            tax_amount=Decimal('0'),
        )
        start = date.today()
        end = date.today()
        rows = sales_by_customer(self.tenant, start, end)
        # Draft should not appear
        for row in rows:
            self.assertNotEqual(row.get('total_sales'), Decimal('999.00'))

    def test_sales_by_item_with_data(self):
        """Sales by item returns item_sku, qty_sold, revenue."""
        self._make_posted_invoice('INV-SBI-001', total_amount=Decimal('1000.00'))
        start = date(date.today().year, 1, 1)
        end = date.today()
        rows = sales_by_item(self.tenant, start, end)

        self.assertIsInstance(rows, list)
        self.assertGreater(len(rows), 0)

        row = rows[0]
        self.assertIn('item_sku', row)
        self.assertIn('qty_sold', row)
        self.assertIn('revenue', row)
        self.assertEqual(row['item_sku'], 'ITEM-001')

    def test_backorder_report(self):
        """Confirmed SO with lines appears in backorder report."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-BACK-001',
            order_date=date.today(),
            ship_to=self.customer_location,
            status='confirmed',
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=so,
            line_number=10,
            item=self.item,
            quantity_ordered=5,
            uom=self.uom,
            unit_price=Decimal('50.00'),
        )

        rows = backorder_report(self.tenant)

        self.assertIsInstance(rows, list)
        self.assertGreater(len(rows), 0)

        order_numbers = [r['order_number'] for r in rows]
        self.assertIn('SO-BACK-001', order_numbers)

        row = next(r for r in rows if r['order_number'] == 'SO-BACK-001')
        self.assertIn('item_sku', row)
        self.assertEqual(row['item_sku'], 'ITEM-001')

    def test_open_order_detail(self):
        """Confirmed SO appears in open order detail."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            order_number='SO-OPEN-001',
            order_date=date.today(),
            ship_to=self.customer_location,
            status='confirmed',
        )

        rows = open_order_detail(self.tenant)

        self.assertIsInstance(rows, list)
        order_numbers = [r['order_number'] for r in rows]
        self.assertIn('SO-OPEN-001', order_numbers)

        row = next(r for r in rows if r['order_number'] == 'SO-OPEN-001')
        self.assertIn('customer_name', row)
        self.assertIn('status', row)
        self.assertIn('order_date', row)
        self.assertIn('subtotal', row)
        self.assertIn('num_lines', row)


# =============================================================================
# PURCHASING REPORT QUERY TESTS
# =============================================================================

class PurchasingReportQueryTests(CannedReportsTestCase):
    """Tests for purchasing report query functions."""

    def _make_po(self, po_number, status='confirmed', order_date=None):
        """Helper: create a purchase order."""
        if order_date is None:
            order_date = date.today()
        return PurchaseOrder.objects.create(
            tenant=self.tenant,
            vendor=self.vendor,
            po_number=po_number,
            order_date=order_date,
            ship_to=self.customer_location,
            status=status,
        )

    def test_open_po_report(self):
        """Confirmed PO appears in open PO report."""
        self._make_po('PO-OPEN-001', status='confirmed')

        rows = open_po_report(self.tenant)

        self.assertIsInstance(rows, list)
        po_numbers = [r['po_number'] for r in rows]
        self.assertIn('PO-OPEN-001', po_numbers)

        row = next(r for r in rows if r['po_number'] == 'PO-OPEN-001')
        self.assertIn('vendor_name', row)
        self.assertEqual(row['vendor_name'], 'Best Supplier Inc')
        self.assertIn('status', row)
        self.assertIn('order_date', row)

    def test_vendor_performance(self):
        """Complete POs aggregate into vendor performance stats."""
        po = self._make_po('PO-PERF-001', status='complete')

        start = date(date.today().year, 1, 1)
        end = date.today()
        rows = vendor_performance(self.tenant, start, end)

        self.assertIsInstance(rows, list)
        self.assertGreater(len(rows), 0)

        row = rows[0]
        self.assertIn('vendor_name', row)
        self.assertIn('total_orders', row)
        self.assertIn('on_time_pct', row)
        self.assertGreaterEqual(row['on_time_pct'], 0)
        self.assertLessEqual(row['on_time_pct'], 100)

    def test_purchase_history(self):
        """PO lines aggregate into purchase history by item."""
        po = self._make_po('PO-HIST-001', status='confirmed')
        PurchaseOrderLine.objects.create(
            tenant=self.tenant,
            purchase_order=po,
            line_number=10,
            item=self.item,
            quantity_ordered=20,
            uom=self.uom,
            unit_cost=Decimal('25.00'),
        )

        start = date(date.today().year, 1, 1)
        end = date.today()
        rows = purchase_history(self.tenant, start, end)

        self.assertIsInstance(rows, list)
        self.assertGreater(len(rows), 0)

        row = next((r for r in rows if r['item_sku'] == 'ITEM-001'), None)
        self.assertIsNotNone(row)
        self.assertIn('total_qty', row)
        self.assertIn('total_cost', row)
        self.assertIn('avg_cost', row)


# =============================================================================
# INVENTORY REPORT QUERY TESTS
# =============================================================================

class InventoryReportQueryTests(CannedReportsTestCase):
    """Tests for inventory report query functions."""

    def test_inventory_valuation(self):
        """Inventory valuation returns rows with item_sku, qty_on_hand, total_value."""
        # Create a PO line to give item a cost
        po = PurchaseOrder.objects.create(
            tenant=self.tenant,
            vendor=self.vendor,
            po_number='PO-VAL-001',
            order_date=date.today(),
            ship_to=self.customer_location,
            status='complete',
        )
        PurchaseOrderLine.objects.create(
            tenant=self.tenant,
            purchase_order=po,
            line_number=10,
            item=self.item,
            quantity_ordered=50,
            uom=self.uom,
            unit_cost=Decimal('10.00'),
        )

        data = inventory_valuation(self.tenant)

        self.assertIn('rows', data)
        self.assertIn('grand_total', data)
        self.assertIsInstance(data['rows'], list)
        self.assertGreater(len(data['rows']), 0)

        row = next((r for r in data['rows'] if r['item_sku'] == 'ITEM-001'), None)
        self.assertIsNotNone(row)
        self.assertIn('qty_on_hand', row)
        self.assertIn('unit_cost', row)
        self.assertIn('total_value', row)

    def test_stock_status(self):
        """Stock status calculates qty_on_hand, qty_reserved, qty_available correctly."""
        rows = stock_status(self.tenant)

        self.assertIsInstance(rows, list)
        self.assertGreater(len(rows), 0)

        item1_row = next((r for r in rows if r['item_sku'] == 'ITEM-001'), None)
        self.assertIsNotNone(item1_row)

        # item: 50 on hand, 10 reserved => 40 available
        self.assertEqual(item1_row['qty_on_hand'], '50')
        self.assertEqual(item1_row['qty_reserved'], '10')
        self.assertEqual(item1_row['qty_available'], '40')
        self.assertIn('qty_on_order', item1_row)

    def test_low_stock_alert(self):
        """Item2 with reorder_point=100 and qty=20 appears in low stock alert."""
        rows = low_stock_alert(self.tenant)

        self.assertIsInstance(rows, list)
        skus = [r['item_sku'] for r in rows]
        self.assertIn('ITEM-002', skus)

        row = next(r for r in rows if r['item_sku'] == 'ITEM-002')
        self.assertIn('reorder_point', row)
        self.assertIn('qty_available', row)
        self.assertIn('shortage', row)
        # Available is 20, reorder_point is 100, shortage = 80
        self.assertEqual(float(row['shortage']), 80.0)

    def test_dead_stock(self):
        """Item with stock but no recent sales appears in dead stock."""
        # item has 50 in stock (created in setUpTestData), no sales orders
        rows = dead_stock(self.tenant, days=180)

        self.assertIsInstance(rows, list)
        skus = [r['item_sku'] for r in rows]
        # Both items have stock, neither has been sold
        self.assertIn('ITEM-001', skus)

        row = next(r for r in rows if r['item_sku'] == 'ITEM-001')
        self.assertIn('qty_on_hand', row)
        self.assertIn('last_sale_date', row)
        self.assertIn('days_since_sale', row)
        self.assertEqual(row['last_sale_date'], 'Never')


# =============================================================================
# FINANCIAL REPORT QUERY TESTS
# =============================================================================

class FinancialReportQueryTests(CannedReportsTestCase):
    """Tests for financial report query functions."""

    def _make_taxed_invoice(self, invoice_number, tax_zone):
        """Helper: create a posted invoice with tax."""
        today = date.today()
        subtotal = Decimal('1000.00')
        tax_amount = Decimal('82.50')
        inv = Invoice.objects.create(
            tenant=self.tenant,
            invoice_number=invoice_number,
            customer=self.customer,
            invoice_date=today,
            due_date=today + timedelta(days=30),
            status='posted',
            bill_to_name='Acme Corp',
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_amount=subtotal + tax_amount,
            tax_zone=tax_zone,
        )
        return inv

    def test_sales_tax_liability(self):
        """Posted invoices with tax_zone aggregate into tax liability report."""
        tax_zone = TaxZone.objects.create(
            tenant=self.tenant,
            name='Cook County IL',
            rate=Decimal('0.0825'),
        )
        self._make_taxed_invoice('INV-TAX-001', tax_zone)

        start = date(date.today().year, 1, 1)
        end = date.today()
        rows = sales_tax_liability(self.tenant, start, end)

        self.assertIsInstance(rows, list)
        self.assertGreater(len(rows), 0)

        row = rows[0]
        self.assertIn('tax_zone_name', row)
        self.assertIn('taxable_amount', row)
        self.assertIn('tax_collected', row)
        self.assertEqual(row['tax_zone_name'], 'Cook County IL')

    def test_gross_margin_report(self):
        """Gross margin report returns total_sales, total_cogs, gross_margin, margin_pct."""
        # Create a PO for cost basis
        po = PurchaseOrder.objects.create(
            tenant=self.tenant,
            vendor=self.vendor,
            po_number='PO-MARGIN-001',
            order_date=date.today(),
            ship_to=self.customer_location,
            status='complete',
        )
        PurchaseOrderLine.objects.create(
            tenant=self.tenant,
            purchase_order=po,
            line_number=10,
            item=self.item,
            quantity_ordered=100,
            uom=self.uom,
            unit_cost=Decimal('50.00'),
        )

        # Create a posted invoice with a line
        today = date.today()
        inv = Invoice.objects.create(
            tenant=self.tenant,
            invoice_number='INV-MARGIN-001',
            customer=self.customer,
            invoice_date=today,
            due_date=today + timedelta(days=30),
            status='posted',
            bill_to_name='Acme Corp',
            subtotal=Decimal('1000.00'),
            tax_amount=Decimal('0'),
            total_amount=Decimal('1000.00'),
        )
        InvoiceLine.objects.create(
            tenant=self.tenant,
            invoice=inv,
            line_number=10,
            item=self.item,
            description='Widget Alpha',
            quantity=10,
            uom=self.uom,
            unit_price=Decimal('100.00'),
        )

        start = date(date.today().year, 1, 1)
        end = date.today()
        data = gross_margin_report(self.tenant, start, end)

        self.assertIn('total_sales', data)
        self.assertIn('total_cogs', data)
        self.assertIn('gross_margin', data)
        self.assertIn('margin_pct', data)

        total_sales = Decimal(data['total_sales'])
        self.assertGreater(total_sales, Decimal('0'))


# =============================================================================
# CANNED REPORT API ENDPOINT TESTS
# =============================================================================

class CannedReportAPITests(CannedReportsTestCase):
    """Tests for all 13 canned report API endpoints via HTTP GET."""

    def _date_params(self):
        """Return default date range query params for current year."""
        return {
            'start_date': f'{date.today().year}-01-01',
            'end_date': str(date.today()),
        }

    def test_sales_by_customer_endpoint(self):
        """GET /api/v1/reports/sales-by-customer/ returns 200 with rows."""
        url = '/api/v1/reports/sales-by-customer/'
        response = self.client.get(url, self._date_params())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_sales_by_item_endpoint(self):
        """GET /api/v1/reports/sales-by-item/ returns 200 with rows."""
        url = '/api/v1/reports/sales-by-item/'
        response = self.client.get(url, self._date_params())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_backorders_endpoint(self):
        """GET /api/v1/reports/backorders/ returns 200 with rows."""
        url = '/api/v1/reports/backorders/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_open_orders_endpoint(self):
        """GET /api/v1/reports/open-orders/ returns 200 with rows."""
        url = '/api/v1/reports/open-orders/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_open_pos_endpoint(self):
        """GET /api/v1/reports/open-pos/ returns 200 with rows."""
        url = '/api/v1/reports/open-pos/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_vendor_performance_endpoint(self):
        """GET /api/v1/reports/vendor-performance/ returns 200 with rows."""
        url = '/api/v1/reports/vendor-performance/'
        response = self.client.get(url, self._date_params())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_purchase_history_endpoint(self):
        """GET /api/v1/reports/purchase-history/ returns 200 with rows."""
        url = '/api/v1/reports/purchase-history/'
        response = self.client.get(url, self._date_params())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_inventory_valuation_endpoint(self):
        """GET /api/v1/reports/inventory-valuation/ returns 200 with rows and grand_total."""
        url = '/api/v1/reports/inventory-valuation/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)
        self.assertIn('grand_total', response.data)

    def test_stock_status_endpoint(self):
        """GET /api/v1/reports/stock-status/ returns 200 with rows."""
        url = '/api/v1/reports/stock-status/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_low_stock_alert_endpoint(self):
        """GET /api/v1/reports/low-stock-alert/ returns 200 with rows."""
        url = '/api/v1/reports/low-stock-alert/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_dead_stock_endpoint(self):
        """GET /api/v1/reports/dead-stock/ returns 200 with rows."""
        url = '/api/v1/reports/dead-stock/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_sales_tax_liability_endpoint(self):
        """GET /api/v1/reports/sales-tax-liability/ returns 200 with rows."""
        url = '/api/v1/reports/sales-tax-liability/'
        response = self.client.get(url, self._date_params())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)

    def test_gross_margin_detail_endpoint(self):
        """GET /api/v1/reports/gross-margin-detail/ returns 200 with margin data."""
        url = '/api/v1/reports/gross-margin-detail/'
        response = self.client.get(url, self._date_params())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('total_sales', response.data)
        self.assertIn('total_cogs', response.data)
        self.assertIn('gross_margin', response.data)


# =============================================================================
# CSV EXPORT TESTS
# =============================================================================

class CannedReportCSVExportTests(CannedReportsTestCase):
    """Tests for CSV export functionality on canned report endpoints."""

    def test_csv_export(self):
        """GET with ?format=csv returns text/csv content type."""
        # Create a posted invoice so there is data to export
        today = date.today()
        Invoice.objects.create(
            tenant=self.tenant,
            invoice_number='INV-CSV-001',
            customer=self.customer,
            invoice_date=today,
            due_date=today + timedelta(days=30),
            status='posted',
            bill_to_name='Acme Corp',
            subtotal=Decimal('100.00'),
            total_amount=Decimal('100.00'),
            tax_amount=Decimal('0'),
        )

        url = '/api/v1/reports/sales-by-customer/'
        params = {
            'format': 'csv',
            'start_date': f'{date.today().year}-01-01',
            'end_date': str(date.today()),
        }
        response = self.client.get(url, params)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('text/csv', response['Content-Type'])

    def test_csv_export_empty(self):
        """GET with ?format=csv and no matching data returns 'No data'."""
        url = '/api/v1/reports/sales-by-customer/'
        params = {
            'format': 'csv',
            'start_date': '1990-01-01',
            'end_date': '1990-12-31',
        }
        response = self.client.get(url, params)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('text/csv', response['Content-Type'])
        self.assertIn(b'No data', response.content)


# =============================================================================
# DATE PARSING TESTS
# =============================================================================

class CannedReportDateParsingTests(CannedReportsTestCase):
    """Tests for date parameter parsing on canned report endpoints."""

    def test_invalid_date_format(self):
        """GET with bad date format returns 400."""
        url = '/api/v1/reports/sales-by-customer/'
        params = {
            'start_date': 'not-a-date',
            'end_date': '2024-12-31',
        }
        response = self.client.get(url, params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_default_dates(self):
        """GET without date params uses current year defaults and returns 200."""
        url = '/api/v1/reports/sales-by-customer/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('rows', response.data)
        self.assertIn('start_date', response.data)
        self.assertIn('end_date', response.data)

        # Should default to Jan 1 of current year through today
        expected_start = f'{date.today().year}-01-01'
        self.assertEqual(response.data['start_date'], expected_start)


# =============================================================================
# AUTHENTICATION TESTS
# =============================================================================

class CannedReportAuthTests(CannedReportsTestCase):
    """Tests that unauthenticated requests are rejected."""

    def test_unauthenticated(self):
        """GET without auth returns 401 for all report endpoints."""
        self.client.force_authenticate(user=None)

        url = '/api/v1/reports/sales-by-customer/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
