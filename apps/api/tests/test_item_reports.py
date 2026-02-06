from decimal import Decimal
from datetime import date, timedelta
from unittest import skipIf
import os
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import (
    Estimate, EstimateLine,
    RFQ, RFQLine,
    SalesOrder, SalesOrderLine,
    PurchaseOrder, PurchaseOrderLine,
)
from apps.invoicing.models import Invoice, InvoiceLine, VendorBill, VendorBillLine
from apps.reporting.services import ItemReportService
from shared.managers import set_current_tenant

User = get_user_model()


class ItemReportTestCase(TestCase):
    """Base test case for item reports with common setup."""

    @classmethod
    def setUpTestData(cls):
        """Set up test data shared across all tests."""
        cls.tenant = Tenant.objects.create(
            name='Test Co',
            subdomain='test-item-reports',
            is_default=True
        )
        cls.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123'
        )
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='ea',
            name='Each',
            is_active=True
        )

        # Customer party + customer + location
        cls.customer_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='CUST001',
            display_name='Test Customer',
            legal_name='Test Customer Inc.',
            is_active=True
        )
        cls.customer_location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party,
            name='Cust Office',
            location_type='billing',
            is_default=True
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant,
            party=cls.customer_party
        )

        # Vendor party + vendor + location
        cls.vendor_party = Party.objects.create(
            tenant=cls.tenant,
            party_type='VENDOR',
            code='VND001',
            display_name='Test Vendor',
            legal_name='Test Vendor Inc.',
            is_active=True
        )
        cls.vendor_location = Location.objects.create(
            tenant=cls.tenant,
            party=cls.vendor_party,
            name='Vendor HQ',
            location_type='shipping',
            is_default=True
        )
        cls.vendor = Vendor.objects.create(
            tenant=cls.tenant,
            party=cls.vendor_party
        )

        # Items
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku='ITEM-001',
            name='Test Widget',
            division='corrugated',
            base_uom=cls.uom,
            is_active=True
        )
        cls.item2 = Item.objects.create(
            tenant=cls.tenant,
            sku='ITEM-002',
            name='Other Item',
            division='corrugated',
            base_uom=cls.uom,
            is_active=True
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)


class ItemHistoryTests(ItemReportTestCase):
    """Tests for the Item 360 History endpoint."""

    def test_history_empty(self):
        """Item with no orders returns empty list."""
        response = self.client.get(f'/api/v1/items/{self.item.id}/history/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_history_with_estimate(self):
        """History includes estimate entries."""
        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number='EST-100',
            customer=self.customer,
            date=date.today(),
            status='draft',
            ship_to=self.customer_location
        )
        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=self.item,
            quantity=100,
            uom=self.uom,
            unit_price=Decimal('10.50')
        )

        response = self.client.get(f'/api/v1/items/{self.item.id}/history/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        entry = response.data[0]
        self.assertEqual(entry['type'], 'ESTIMATE')
        self.assertEqual(entry['document_number'], 'EST-100')
        self.assertEqual(entry['document_id'], estimate.id)
        self.assertEqual(entry['party_name'], 'Test Customer')
        self.assertEqual(entry['status'], 'draft')
        self.assertIn('status_display', entry)

    def test_history_with_rfq(self):
        """History includes RFQ entries."""
        rfq = RFQ.objects.create(
            tenant=self.tenant,
            rfq_number='RFQ-100',
            vendor=self.vendor,
            date=date.today(),
            status='sent',
            ship_to=self.vendor_location
        )
        RFQLine.objects.create(
            tenant=self.tenant,
            rfq=rfq,
            line_number=10,
            item=self.item,
            quantity=200,
            uom=self.uom,
            quoted_price=Decimal('8.00')
        )

        response = self.client.get(f'/api/v1/items/{self.item.id}/history/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        entry = response.data[0]
        self.assertEqual(entry['type'], 'RFQ')
        self.assertEqual(entry['document_number'], 'RFQ-100')
        self.assertEqual(entry['party_name'], 'Test Vendor')
        self.assertEqual(entry['status'], 'sent')

    def test_history_with_sales_order(self):
        """History includes sales order entries."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            order_number='SO-100',
            customer=self.customer,
            order_date=date.today(),
            status='confirmed',
            ship_to=self.customer_location
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=so,
            line_number=10,
            item=self.item,
            quantity_ordered=50,
            uom=self.uom,
            unit_price=Decimal('12.00')
        )

        response = self.client.get(f'/api/v1/items/{self.item.id}/history/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        entry = response.data[0]
        self.assertEqual(entry['type'], 'SO')
        self.assertEqual(entry['document_number'], 'SO-100')
        self.assertEqual(entry['party_name'], 'Test Customer')

    def test_history_with_purchase_order(self):
        """History includes purchase order entries."""
        po = PurchaseOrder.objects.create(
            tenant=self.tenant,
            po_number='PO-100',
            vendor=self.vendor,
            order_date=date.today(),
            status='confirmed',
            ship_to=self.vendor_location
        )
        PurchaseOrderLine.objects.create(
            tenant=self.tenant,
            purchase_order=po,
            line_number=10,
            item=self.item,
            quantity_ordered=300,
            uom=self.uom,
            unit_cost=Decimal('7.50')
        )

        response = self.client.get(f'/api/v1/items/{self.item.id}/history/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        entry = response.data[0]
        self.assertEqual(entry['type'], 'PO')
        self.assertEqual(entry['document_number'], 'PO-100')
        self.assertEqual(entry['party_name'], 'Test Vendor')

    def test_history_combined_sorted_by_date(self):
        """History returns all entry types sorted by date descending."""
        today = date.today()
        yesterday = today - timedelta(days=1)
        two_days_ago = today - timedelta(days=2)
        three_days_ago = today - timedelta(days=3)

        # Estimate (3 days ago)
        estimate = Estimate.objects.create(
            tenant=self.tenant, estimate_number='EST-100',
            customer=self.customer, date=three_days_ago, status='draft',
            ship_to=self.customer_location
        )
        EstimateLine.objects.create(
            tenant=self.tenant, estimate=estimate, line_number=10,
            item=self.item, quantity=100, uom=self.uom, unit_price=Decimal('10.00')
        )

        # RFQ (2 days ago)
        rfq = RFQ.objects.create(
            tenant=self.tenant, rfq_number='RFQ-100',
            vendor=self.vendor, date=two_days_ago, status='sent',
            ship_to=self.vendor_location
        )
        RFQLine.objects.create(
            tenant=self.tenant, rfq=rfq, line_number=10,
            item=self.item, quantity=200, uom=self.uom, quoted_price=Decimal('8.00')
        )

        # SO (yesterday)
        so = SalesOrder.objects.create(
            tenant=self.tenant, order_number='SO-100',
            customer=self.customer, order_date=yesterday, status='confirmed',
            ship_to=self.customer_location
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=10,
            item=self.item, quantity_ordered=50, uom=self.uom, unit_price=Decimal('12.00')
        )

        # PO (today)
        po = PurchaseOrder.objects.create(
            tenant=self.tenant, po_number='PO-100',
            vendor=self.vendor, order_date=today, status='confirmed',
            ship_to=self.vendor_location
        )
        PurchaseOrderLine.objects.create(
            tenant=self.tenant, purchase_order=po, line_number=10,
            item=self.item, quantity_ordered=300, uom=self.uom, unit_cost=Decimal('7.50')
        )

        response = self.client.get(f'/api/v1/items/{self.item.id}/history/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 4)

        # Most recent first
        self.assertEqual(response.data[0]['type'], 'PO')
        self.assertEqual(response.data[1]['type'], 'SO')
        self.assertEqual(response.data[2]['type'], 'RFQ')
        self.assertEqual(response.data[3]['type'], 'ESTIMATE')

    def test_history_only_shows_this_item(self):
        """History only shows entries for the requested item."""
        so = SalesOrder.objects.create(
            tenant=self.tenant, order_number='SO-100',
            customer=self.customer, order_date=date.today(), status='confirmed',
            ship_to=self.customer_location
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=10,
            item=self.item, quantity_ordered=50, uom=self.uom, unit_price=Decimal('12.00')
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=20,
            item=self.item2, quantity_ordered=75, uom=self.uom, unit_price=Decimal('15.00')
        )

        response = self.client.get(f'/api/v1/items/{self.item.id}/history/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['type'], 'SO')

    def test_history_unauthenticated(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)
        response = self.client.get(f'/api/v1/items/{self.item.id}/history/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ItemQuickReportServiceTests(ItemReportTestCase):
    """Tests for the ItemReportService.get_quick_report method."""

    def test_quick_report_empty(self):
        """Quick report with no data returns empty sections and zero summaries."""
        start_date = date.today() - timedelta(days=30)
        end_date = date.today()

        report = ItemReportService.get_quick_report(
            self.tenant, self.item.id, start_date, end_date
        )

        self.assertIn('financials', report)
        self.assertIn('purchase_orders', report)
        self.assertIn('sales_orders', report)

        self.assertEqual(len(report['financials']['rows']), 0)
        self.assertEqual(len(report['purchase_orders']['rows']), 0)
        self.assertEqual(len(report['sales_orders']['rows']), 0)

        summary = report['financials']['summary']
        self.assertEqual(summary['total_sales'], 0)
        self.assertEqual(summary['total_costs'], 0)
        self.assertEqual(summary['gross_margin'], 0)

    def test_quick_report_with_sales(self):
        """Quick report includes sales data from invoices."""
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            invoice_number='INV-100',
            customer=self.customer,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status='sent',
        )
        InvoiceLine.objects.create(
            tenant=self.tenant,
            invoice=invoice,
            line_number=10,
            item=self.item,
            description='Test Widget',
            quantity=50,
            uom=self.uom,
            unit_price=Decimal('15.00'),
            line_total=Decimal('750.00'),
        )

        start_date = date.today() - timedelta(days=1)
        end_date = date.today() + timedelta(days=1)

        report = ItemReportService.get_quick_report(
            self.tenant, self.item.id, start_date, end_date
        )

        rows = report['financials']['rows']
        self.assertEqual(len(rows), 1)

        entry = rows[0]
        self.assertEqual(entry['type'], 'Sale')
        self.assertEqual(entry['document_number'], 'INV-100')
        self.assertEqual(entry['total'], 750.0)

        summary = report['financials']['summary']
        self.assertEqual(summary['total_sales'], 750.0)

    def test_quick_report_with_costs(self):
        """Quick report includes cost data from vendor bills."""
        bill = VendorBill.objects.create(
            tenant=self.tenant,
            bill_number='BILL-100',
            vendor=self.vendor,
            bill_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status='approved',
        )
        VendorBillLine.objects.create(
            tenant=self.tenant,
            bill=bill,
            line_number=10,
            item=self.item,
            description='Test Widget',
            quantity=Decimal('50'),
            unit_price=Decimal('7.50'),
            amount=Decimal('375.00'),
        )

        start_date = date.today() - timedelta(days=1)
        end_date = date.today() + timedelta(days=1)

        report = ItemReportService.get_quick_report(
            self.tenant, self.item.id, start_date, end_date
        )

        rows = report['financials']['rows']
        self.assertEqual(len(rows), 1)

        entry = rows[0]
        self.assertEqual(entry['type'], 'Cost')
        self.assertEqual(entry['document_number'], 'BILL-100')
        self.assertEqual(entry['total'], 375.0)

        summary = report['financials']['summary']
        self.assertEqual(summary['total_costs'], 375.0)

    def test_quick_report_with_po_lines(self):
        """Quick report includes purchase order lines."""
        po = PurchaseOrder.objects.create(
            tenant=self.tenant,
            po_number='PO-100',
            vendor=self.vendor,
            order_date=date.today(),
            status='confirmed',
            ship_to=self.vendor_location
        )
        PurchaseOrderLine.objects.create(
            tenant=self.tenant,
            purchase_order=po,
            line_number=10,
            item=self.item,
            quantity_ordered=300,
            uom=self.uom,
            unit_cost=Decimal('7.50')
        )

        start_date = date.today() - timedelta(days=1)
        end_date = date.today() + timedelta(days=1)

        report = ItemReportService.get_quick_report(
            self.tenant, self.item.id, start_date, end_date
        )

        rows = report['purchase_orders']['rows']
        self.assertEqual(len(rows), 1)

        entry = rows[0]
        self.assertEqual(entry['po_number'], 'PO-100')
        self.assertEqual(entry['quantity_ordered'], 300)
        self.assertEqual(entry['unit_cost'], 7.5)
        self.assertEqual(entry['line_total'], 2250.0)

    def test_quick_report_with_so_lines(self):
        """Quick report includes sales order lines."""
        so = SalesOrder.objects.create(
            tenant=self.tenant,
            order_number='SO-100',
            customer=self.customer,
            order_date=date.today(),
            status='confirmed',
            ship_to=self.customer_location
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant,
            sales_order=so,
            line_number=10,
            item=self.item,
            quantity_ordered=50,
            uom=self.uom,
            unit_price=Decimal('12.00')
        )

        start_date = date.today() - timedelta(days=1)
        end_date = date.today() + timedelta(days=1)

        report = ItemReportService.get_quick_report(
            self.tenant, self.item.id, start_date, end_date
        )

        rows = report['sales_orders']['rows']
        self.assertEqual(len(rows), 1)

        entry = rows[0]
        self.assertEqual(entry['order_number'], 'SO-100')
        self.assertEqual(entry['quantity_ordered'], 50)
        self.assertEqual(entry['unit_price'], 12.0)
        self.assertEqual(entry['line_total'], 600.0)

    def test_quick_report_date_filtering(self):
        """Quick report only includes data within date range."""
        in_range_date = date.today()
        out_of_range_date = date.today() - timedelta(days=60)

        # Invoice in range
        invoice_in = Invoice.objects.create(
            tenant=self.tenant,
            invoice_number='INV-100',
            customer=self.customer,
            invoice_date=in_range_date,
            due_date=in_range_date + timedelta(days=30),
            status='sent',
        )
        InvoiceLine.objects.create(
            tenant=self.tenant,
            invoice=invoice_in,
            line_number=10,
            item=self.item,
            description='Test Widget',
            quantity=50,
            uom=self.uom,
            unit_price=Decimal('15.00'),
            line_total=Decimal('750.00'),
        )

        # Invoice out of range
        invoice_out = Invoice.objects.create(
            tenant=self.tenant,
            invoice_number='INV-200',
            customer=self.customer,
            invoice_date=out_of_range_date,
            due_date=out_of_range_date + timedelta(days=30),
            status='sent',
        )
        InvoiceLine.objects.create(
            tenant=self.tenant,
            invoice=invoice_out,
            line_number=10,
            item=self.item,
            description='Test Widget',
            quantity=25,
            uom=self.uom,
            unit_price=Decimal('15.00'),
            line_total=Decimal('375.00'),
        )

        start_date = date.today() - timedelta(days=30)
        end_date = date.today() + timedelta(days=1)

        report = ItemReportService.get_quick_report(
            self.tenant, self.item.id, start_date, end_date
        )

        rows = report['financials']['rows']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['document_number'], 'INV-100')

    def test_quick_report_excludes_cancelled(self):
        """Quick report excludes cancelled orders."""
        po = PurchaseOrder.objects.create(
            tenant=self.tenant, po_number='PO-100', vendor=self.vendor,
            order_date=date.today(), status='cancelled', ship_to=self.vendor_location
        )
        PurchaseOrderLine.objects.create(
            tenant=self.tenant, purchase_order=po, line_number=10,
            item=self.item, quantity_ordered=300, uom=self.uom, unit_cost=Decimal('7.50')
        )

        so = SalesOrder.objects.create(
            tenant=self.tenant, order_number='SO-100', customer=self.customer,
            order_date=date.today(), status='cancelled', ship_to=self.customer_location
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=10,
            item=self.item, quantity_ordered=50, uom=self.uom, unit_price=Decimal('12.00')
        )

        start_date = date.today() - timedelta(days=1)
        end_date = date.today() + timedelta(days=1)

        report = ItemReportService.get_quick_report(
            self.tenant, self.item.id, start_date, end_date
        )

        self.assertEqual(len(report['purchase_orders']['rows']), 0)
        self.assertEqual(len(report['sales_orders']['rows']), 0)

    def test_quick_report_excludes_draft_invoices(self):
        """Quick report excludes draft invoices from financials."""
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            invoice_number='INV-100',
            customer=self.customer,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status='draft',
        )
        InvoiceLine.objects.create(
            tenant=self.tenant,
            invoice=invoice,
            line_number=10,
            item=self.item,
            description='Test Widget',
            quantity=50,
            uom=self.uom,
            unit_price=Decimal('15.00'),
            line_total=Decimal('750.00'),
        )

        start_date = date.today() - timedelta(days=1)
        end_date = date.today() + timedelta(days=1)

        report = ItemReportService.get_quick_report(
            self.tenant, self.item.id, start_date, end_date
        )

        self.assertEqual(len(report['financials']['rows']), 0)

    def test_quick_report_margin_calculation(self):
        """Quick report calculates gross margin correctly."""
        # Sale
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            invoice_number='INV-100',
            customer=self.customer,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status='sent',
        )
        InvoiceLine.objects.create(
            tenant=self.tenant,
            invoice=invoice,
            line_number=10,
            item=self.item,
            description='Test Widget',
            quantity=50,
            uom=self.uom,
            unit_price=Decimal('15.00'),
            line_total=Decimal('750.00'),
        )

        # Cost
        bill = VendorBill.objects.create(
            tenant=self.tenant,
            bill_number='BILL-100',
            vendor=self.vendor,
            bill_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status='approved',
        )
        VendorBillLine.objects.create(
            tenant=self.tenant,
            bill=bill,
            line_number=10,
            item=self.item,
            description='Test Widget',
            quantity=Decimal('50'),
            unit_price=Decimal('7.50'),
            amount=Decimal('375.00'),
        )

        start_date = date.today() - timedelta(days=1)
        end_date = date.today() + timedelta(days=1)

        report = ItemReportService.get_quick_report(
            self.tenant, self.item.id, start_date, end_date
        )

        summary = report['financials']['summary']
        self.assertEqual(summary['total_sales'], 750.0)
        self.assertEqual(summary['total_costs'], 375.0)
        self.assertEqual(summary['gross_margin'], 375.0)


class ItemQuickReportAPITests(ItemReportTestCase):
    """Tests for the Item Quick Report API endpoint."""

    def test_quick_report_api_success(self):
        """Quick report API returns data successfully."""
        so = SalesOrder.objects.create(
            tenant=self.tenant, order_number='SO-100', customer=self.customer,
            order_date=date.today(), status='confirmed', ship_to=self.customer_location
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=10,
            item=self.item, quantity_ordered=50, uom=self.uom, unit_price=Decimal('12.00')
        )

        start_date = (date.today() - timedelta(days=30)).isoformat()
        end_date = date.today().isoformat()

        response = self.client.get(
            f'/api/v1/reports/item-quick-report/{self.item.id}/',
            {'start_date': start_date, 'end_date': end_date}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('financials', response.data)
        self.assertIn('purchase_orders', response.data)
        self.assertIn('sales_orders', response.data)

        # Verify nested structure
        self.assertIn('rows', response.data['financials'])
        self.assertIn('summary', response.data['financials'])
        self.assertIn('rows', response.data['sales_orders'])
        self.assertEqual(len(response.data['sales_orders']['rows']), 1)

    def test_quick_report_missing_dates(self):
        """Quick report API requires start_date and end_date."""
        response = self.client.get(
            f'/api/v1/reports/item-quick-report/{self.item.id}/'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_quick_report_invalid_dates(self):
        """Quick report API validates date format."""
        response = self.client.get(
            f'/api/v1/reports/item-quick-report/{self.item.id}/',
            {'start_date': 'invalid-date', 'end_date': '2024-01-01'}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_quick_report_start_after_end(self):
        """Quick report API validates start_date is before end_date."""
        start_date = date.today().isoformat()
        end_date = (date.today() - timedelta(days=30)).isoformat()

        response = self.client.get(
            f'/api/v1/reports/item-quick-report/{self.item.id}/',
            {'start_date': start_date, 'end_date': end_date}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_quick_report_unauthenticated(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)
        start_date = (date.today() - timedelta(days=30)).isoformat()
        end_date = date.today().isoformat()

        response = self.client.get(
            f'/api/v1/reports/item-quick-report/{self.item.id}/',
            {'start_date': start_date, 'end_date': end_date}
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


@skipIf(os.name == 'nt', 'WeasyPrint requires GTK libraries not available on Windows CI')
class ItemQuickReportPDFTests(ItemReportTestCase):
    """Tests for the Item Quick Report PDF download endpoint."""

    def test_pdf_download_success(self):
        """PDF download returns PDF with correct content type."""
        start_date = (date.today() - timedelta(days=30)).isoformat()
        end_date = date.today().isoformat()

        response = self.client.get(
            f'/api/v1/reports/item-quick-report/{self.item.id}/pdf/',
            {'start_date': start_date, 'end_date': end_date}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('Content-Disposition', response)

    def test_pdf_missing_dates(self):
        """PDF download requires start_date and end_date."""
        response = self.client.get(
            f'/api/v1/reports/item-quick-report/{self.item.id}/pdf/'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pdf_item_not_found(self):
        """PDF download returns 404 for non-existent item."""
        start_date = (date.today() - timedelta(days=30)).isoformat()
        end_date = date.today().isoformat()

        response = self.client.get(
            f'/api/v1/reports/item-quick-report/99999/pdf/',
            {'start_date': start_date, 'end_date': end_date}
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
