# apps/reporting/services.py
"""
Reporting service for generating and managing reports.

ReportingService handles:
- Running built-in report types
- Managing saved reports
- Scheduling report execution
- Exporting reports to various formats

FinancialReportService handles:
- Trial Balance
- Income Statement (P&L)
- Balance Sheet
- A/R Aging Report
"""
from decimal import Decimal
from datetime import timedelta
from collections import defaultdict
from django.db import models
from django.db.models import Sum, Count, F, Q, Avg
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.core.exceptions import ValidationError

from .models import ReportDefinition, ReportSchedule, SavedReport, ReportFavorite


class ReportingService:
    """
    Service for generating and managing reports.

    Usage:
        service = ReportingService(tenant, user)

        # Run a report
        saved_report = service.run_report(report_definition, filters={'warehouse_id': 1})

        # Get AR aging
        data = service.get_ar_aging()

        # Get inventory balance
        data = service.get_inventory_balance(warehouse_id=1)
    """

    def __init__(self, tenant, user=None):
        """
        Initialize reporting service.

        Args:
            tenant: Tenant instance to scope operations
            user: User performing operations
        """
        self.tenant = tenant
        self.user = user

    # ===== REPORT EXECUTION =====

    def run_report(self, report_definition, filters=None, output_format='TABLE'):
        """
        Run a report and save the results.

        Args:
            report_definition: ReportDefinition instance
            filters: Dict of filter values (overrides defaults)
            output_format: Output format (TABLE, CSV, PDF, EXCEL)

        Returns:
            SavedReport instance
        """
        # Merge default filters with provided filters
        merged_filters = dict(report_definition.default_filters)
        if filters:
            merged_filters.update(filters)

        # Create saved report record
        saved_report = SavedReport.objects.create(
            tenant=self.tenant,
            report=report_definition,
            name=f"{report_definition.name} - {timezone.now().strftime('%Y-%m-%d %H:%M')}",
            status='RUNNING',
            filter_values=merged_filters,
            output_format=output_format,
            started_at=timezone.now(),
            generated_by=self.user,
        )

        try:
            # Generate report data based on type
            data = self._generate_report_data(report_definition.report_type, merged_filters)

            saved_report.result_data = data
            saved_report.row_count = len(data) if isinstance(data, list) else 0
            saved_report.status = 'COMPLETED'
            saved_report.completed_at = timezone.now()

        except Exception as e:
            saved_report.status = 'FAILED'
            saved_report.error_message = str(e)
            saved_report.completed_at = timezone.now()

        saved_report.save()
        return saved_report

    def _generate_report_data(self, report_type, filters):
        """
        Generate report data based on report type.

        Routes to appropriate report generator method.
        """
        generators = {
            'INVENTORY_BALANCE': self._report_inventory_balance,
            'INVENTORY_VALUATION': self._report_inventory_valuation,
            'INVENTORY_MOVEMENT': self._report_inventory_movement,
            'LOT_STATUS': self._report_lot_status,
            'SALES_BY_CUSTOMER': self._report_sales_by_customer,
            'SALES_BY_ITEM': self._report_sales_by_item,
            'SALES_ORDER_STATUS': self._report_sales_order_status,
            'SHIPMENT_HISTORY': self._report_shipment_history,
            'PURCHASES_BY_VENDOR': self._report_purchases_by_vendor,
            'PURCHASES_BY_ITEM': self._report_purchases_by_item,
            'PO_STATUS': self._report_po_status,
            'AR_AGING': self._report_ar_aging,
            'INVOICE_STATUS': self._report_invoice_status,
            'PAYMENT_HISTORY': self._report_payment_history,
        }

        generator = generators.get(report_type)
        if not generator:
            raise ValidationError(f"Unknown report type: {report_type}")

        return generator(filters)

    # ===== INVENTORY REPORTS =====

    def _report_inventory_balance(self, filters):
        """Generate inventory balance report."""
        from apps.inventory.models import InventoryBalance

        qs = InventoryBalance.objects.filter(tenant=self.tenant)

        if filters.get('warehouse_id'):
            qs = qs.filter(warehouse_id=filters['warehouse_id'])
        if filters.get('item_id'):
            qs = qs.filter(item_id=filters['item_id'])

        qs = qs.select_related('item', 'warehouse')

        return [
            {
                'item_sku': bal.item.sku,
                'item_name': bal.item.name,
                'warehouse': bal.warehouse.code,
                'on_hand': bal.on_hand,
                'allocated': bal.allocated,
                'available': bal.available,
                'on_order': bal.on_order,
                'projected': bal.projected,
            }
            for bal in qs
        ]

    def _report_inventory_valuation(self, filters):
        """Generate inventory valuation report."""
        from apps.inventory.models import InventoryLot

        qs = InventoryLot.objects.filter(tenant=self.tenant)

        if filters.get('warehouse_id'):
            qs = qs.filter(warehouse_id=filters['warehouse_id'])
        if filters.get('as_of_date'):
            qs = qs.filter(received_date__lte=filters['as_of_date'])

        qs = qs.select_related('item', 'warehouse').prefetch_related('pallets')

        results = []
        for lot in qs:
            qty_on_hand = lot.quantity_on_hand
            if qty_on_hand > 0:
                results.append({
                    'lot_number': lot.lot_number,
                    'item_sku': lot.item.sku,
                    'item_name': lot.item.name,
                    'warehouse': lot.warehouse.code,
                    'quantity': qty_on_hand,
                    'unit_cost': float(lot.unit_cost),
                    'total_value': float(qty_on_hand * lot.unit_cost),
                    'received_date': lot.received_date.isoformat(),
                })
        return results

    def _report_inventory_movement(self, filters):
        """Generate inventory movement report."""
        from apps.inventory.models import InventoryTransaction

        qs = InventoryTransaction.objects.filter(tenant=self.tenant)

        if filters.get('warehouse_id'):
            qs = qs.filter(warehouse_id=filters['warehouse_id'])
        if filters.get('item_id'):
            qs = qs.filter(item_id=filters['item_id'])
        if filters.get('start_date'):
            qs = qs.filter(transaction_date__gte=filters['start_date'])
        if filters.get('end_date'):
            qs = qs.filter(transaction_date__lte=filters['end_date'])
        if filters.get('transaction_type'):
            qs = qs.filter(transaction_type=filters['transaction_type'])

        qs = qs.select_related('item', 'warehouse', 'user').order_by('-transaction_date')[:500]

        return [
            {
                'date': txn.transaction_date.isoformat(),
                'type': txn.transaction_type,
                'item_sku': txn.item.sku,
                'warehouse': txn.warehouse.code,
                'quantity': txn.quantity,
                'reference': txn.reference_number,
                'user': txn.user.username if txn.user else '',
                'balance_after': txn.balance_on_hand,
            }
            for txn in qs
        ]

    def _report_lot_status(self, filters):
        """Generate lot status report."""
        from apps.inventory.models import InventoryLot

        qs = InventoryLot.objects.filter(tenant=self.tenant)

        if filters.get('warehouse_id'):
            qs = qs.filter(warehouse_id=filters['warehouse_id'])
        if filters.get('vendor_id'):
            qs = qs.filter(vendor_id=filters['vendor_id'])
        if filters.get('received_after'):
            qs = qs.filter(received_date__gte=filters['received_after'])

        qs = qs.select_related('item', 'warehouse', 'vendor__party').prefetch_related('pallets')

        return [
            {
                'lot_number': lot.lot_number,
                'item_sku': lot.item.sku,
                'item_name': lot.item.name,
                'warehouse': lot.warehouse.code,
                'vendor': lot.vendor.party.display_name if lot.vendor else '',
                'received_date': lot.received_date.isoformat(),
                'total_qty': lot.total_quantity,
                'qty_on_hand': lot.quantity_on_hand,
                'pallet_count': lot.pallets.count(),
            }
            for lot in qs
        ]

    # ===== SALES REPORTS =====

    def _report_sales_by_customer(self, filters):
        """Generate sales by customer report."""
        from apps.orders.models import SalesOrderLine

        qs = SalesOrderLine.objects.filter(tenant=self.tenant)

        if filters.get('start_date'):
            qs = qs.filter(sales_order__order_date__gte=filters['start_date'])
        if filters.get('end_date'):
            qs = qs.filter(sales_order__order_date__lte=filters['end_date'])

        # Exclude cancelled/draft
        qs = qs.exclude(sales_order__status__in=['cancelled', 'draft'])

        results = qs.values(
            'sales_order__customer__party__display_name',
            'sales_order__customer_id',
        ).annotate(
            order_count=Count('sales_order', distinct=True),
            line_count=Count('id'),
            total_qty=Sum('quantity_ordered'),
            total_value=Sum(F('quantity_ordered') * F('unit_price')),
        ).order_by('-total_value')

        return [
            {
                'customer': r['sales_order__customer__party__display_name'],
                'customer_id': r['sales_order__customer_id'],
                'order_count': r['order_count'],
                'line_count': r['line_count'],
                'total_qty': r['total_qty'],
                'total_value': float(r['total_value'] or 0),
            }
            for r in results
        ]

    def _report_sales_by_item(self, filters):
        """Generate sales by item report."""
        from apps.orders.models import SalesOrderLine

        qs = SalesOrderLine.objects.filter(tenant=self.tenant)

        if filters.get('start_date'):
            qs = qs.filter(sales_order__order_date__gte=filters['start_date'])
        if filters.get('end_date'):
            qs = qs.filter(sales_order__order_date__lte=filters['end_date'])
        if filters.get('customer_id'):
            qs = qs.filter(sales_order__customer_id=filters['customer_id'])

        qs = qs.exclude(sales_order__status__in=['cancelled', 'draft'])

        results = qs.values(
            'item__sku',
            'item__name',
            'item_id',
        ).annotate(
            order_count=Count('sales_order', distinct=True),
            total_qty=Sum('quantity_ordered'),
            total_value=Sum(F('quantity_ordered') * F('unit_price')),
            avg_price=Avg('unit_price'),
        ).order_by('-total_qty')

        return [
            {
                'item_sku': r['item__sku'],
                'item_name': r['item__name'],
                'order_count': r['order_count'],
                'total_qty': r['total_qty'],
                'total_value': float(r['total_value'] or 0),
                'avg_price': float(r['avg_price'] or 0),
            }
            for r in results
        ]

    def _report_sales_order_status(self, filters):
        """Generate sales order status report."""
        from apps.orders.models import SalesOrder

        qs = SalesOrder.objects.filter(tenant=self.tenant)

        if filters.get('status'):
            qs = qs.filter(status=filters['status'])
        if filters.get('customer_id'):
            qs = qs.filter(customer_id=filters['customer_id'])
        if filters.get('start_date'):
            qs = qs.filter(order_date__gte=filters['start_date'])
        if filters.get('end_date'):
            qs = qs.filter(order_date__lte=filters['end_date'])

        qs = qs.select_related('customer__party').prefetch_related('lines')

        return [
            {
                'order_number': so.order_number,
                'customer': so.customer.party.display_name,
                'order_date': so.order_date.isoformat(),
                'scheduled_date': so.scheduled_date.isoformat() if so.scheduled_date else '',
                'status': so.status,
                'line_count': so.num_lines,
                'subtotal': float(so.subtotal),
            }
            for so in qs.order_by('-order_date')[:500]
        ]

    def _report_shipment_history(self, filters):
        """Generate shipment history report."""
        from apps.shipping.models import Shipment

        qs = Shipment.objects.filter(tenant=self.tenant)

        if filters.get('status'):
            qs = qs.filter(status=filters['status'])
        if filters.get('truck_id'):
            qs = qs.filter(truck_id=filters['truck_id'])
        if filters.get('start_date'):
            qs = qs.filter(ship_date__gte=filters['start_date'])
        if filters.get('end_date'):
            qs = qs.filter(ship_date__lte=filters['end_date'])

        qs = qs.select_related('truck').prefetch_related('lines__sales_order')

        return [
            {
                'shipment_number': ship.shipment_number,
                'ship_date': ship.ship_date.isoformat(),
                'truck': ship.truck.display_name if ship.truck else '',
                'driver': ship.driver_name,
                'status': ship.status,
                'order_count': ship.total_orders,
                'departure': ship.departure_time.isoformat() if ship.departure_time else '',
                'arrival': ship.arrival_time.isoformat() if ship.arrival_time else '',
            }
            for ship in qs.order_by('-ship_date')[:500]
        ]

    # ===== PURCHASING REPORTS =====

    def _report_purchases_by_vendor(self, filters):
        """Generate purchases by vendor report."""
        from apps.orders.models import PurchaseOrderLine

        qs = PurchaseOrderLine.objects.filter(tenant=self.tenant)

        if filters.get('start_date'):
            qs = qs.filter(purchase_order__order_date__gte=filters['start_date'])
        if filters.get('end_date'):
            qs = qs.filter(purchase_order__order_date__lte=filters['end_date'])

        qs = qs.exclude(purchase_order__status='cancelled')

        results = qs.values(
            'purchase_order__vendor__party__display_name',
            'purchase_order__vendor_id',
        ).annotate(
            po_count=Count('purchase_order', distinct=True),
            line_count=Count('id'),
            total_qty=Sum('quantity_ordered'),
            total_value=Sum(F('quantity_ordered') * F('unit_cost')),
        ).order_by('-total_value')

        return [
            {
                'vendor': r['purchase_order__vendor__party__display_name'],
                'vendor_id': r['purchase_order__vendor_id'],
                'po_count': r['po_count'],
                'line_count': r['line_count'],
                'total_qty': r['total_qty'],
                'total_value': float(r['total_value'] or 0),
            }
            for r in results
        ]

    def _report_purchases_by_item(self, filters):
        """Generate purchases by item report."""
        from apps.orders.models import PurchaseOrderLine

        qs = PurchaseOrderLine.objects.filter(tenant=self.tenant)

        if filters.get('start_date'):
            qs = qs.filter(purchase_order__order_date__gte=filters['start_date'])
        if filters.get('end_date'):
            qs = qs.filter(purchase_order__order_date__lte=filters['end_date'])
        if filters.get('vendor_id'):
            qs = qs.filter(purchase_order__vendor_id=filters['vendor_id'])

        qs = qs.exclude(purchase_order__status='cancelled')

        results = qs.values(
            'item__sku',
            'item__name',
            'item_id',
        ).annotate(
            po_count=Count('purchase_order', distinct=True),
            total_qty=Sum('quantity_ordered'),
            total_value=Sum(F('quantity_ordered') * F('unit_cost')),
            avg_cost=Avg('unit_cost'),
        ).order_by('-total_qty')

        return [
            {
                'item_sku': r['item__sku'],
                'item_name': r['item__name'],
                'po_count': r['po_count'],
                'total_qty': r['total_qty'],
                'total_value': float(r['total_value'] or 0),
                'avg_cost': float(r['avg_cost'] or 0),
            }
            for r in results
        ]

    def _report_po_status(self, filters):
        """Generate PO status report."""
        from apps.orders.models import PurchaseOrder

        qs = PurchaseOrder.objects.filter(tenant=self.tenant)

        if filters.get('status'):
            qs = qs.filter(status=filters['status'])
        if filters.get('vendor_id'):
            qs = qs.filter(vendor_id=filters['vendor_id'])
        if filters.get('start_date'):
            qs = qs.filter(order_date__gte=filters['start_date'])
        if filters.get('end_date'):
            qs = qs.filter(order_date__lte=filters['end_date'])

        qs = qs.select_related('vendor__party').prefetch_related('lines')

        return [
            {
                'po_number': po.po_number,
                'vendor': po.vendor.party.display_name,
                'order_date': po.order_date.isoformat(),
                'expected_date': po.expected_date.isoformat() if po.expected_date else '',
                'scheduled_date': po.scheduled_date.isoformat() if po.scheduled_date else '',
                'status': po.status,
                'line_count': po.num_lines,
                'subtotal': float(po.subtotal),
            }
            for po in qs.order_by('-order_date')[:500]
        ]

    # ===== FINANCE REPORTS =====

    def _report_ar_aging(self, filters):
        """Generate AR aging report."""
        from apps.invoicing.models import Invoice

        today = timezone.now().date()

        qs = Invoice.objects.filter(
            tenant=self.tenant,
            status__in=['sent', 'partial', 'overdue'],
        )

        if filters.get('customer_id'):
            qs = qs.filter(customer_id=filters['customer_id'])

        qs = qs.select_related('customer__party')

        results = []
        for inv in qs:
            balance = float(inv.balance_due)
            if balance <= 0:
                continue

            days_overdue = (today - inv.due_date).days
            bucket = self._get_aging_bucket(days_overdue)

            results.append({
                'invoice_number': inv.invoice_number,
                'customer': inv.customer.party.display_name,
                'invoice_date': inv.invoice_date.isoformat(),
                'due_date': inv.due_date.isoformat(),
                'days_overdue': max(0, days_overdue),
                'aging_bucket': bucket,
                'total_amount': float(inv.total_amount),
                'amount_paid': float(inv.amount_paid),
                'balance_due': balance,
            })

        return sorted(results, key=lambda x: -x['days_overdue'])

    def _get_aging_bucket(self, days_overdue):
        """Determine aging bucket for days overdue."""
        if days_overdue <= 0:
            return 'Current'
        elif days_overdue <= 30:
            return '1-30 Days'
        elif days_overdue <= 60:
            return '31-60 Days'
        elif days_overdue <= 90:
            return '61-90 Days'
        else:
            return '90+ Days'

    def _report_invoice_status(self, filters):
        """Generate invoice status report."""
        from apps.invoicing.models import Invoice

        qs = Invoice.objects.filter(tenant=self.tenant)

        if filters.get('status'):
            qs = qs.filter(status=filters['status'])
        if filters.get('customer_id'):
            qs = qs.filter(customer_id=filters['customer_id'])
        if filters.get('start_date'):
            qs = qs.filter(invoice_date__gte=filters['start_date'])
        if filters.get('end_date'):
            qs = qs.filter(invoice_date__lte=filters['end_date'])

        qs = qs.select_related('customer__party')

        return [
            {
                'invoice_number': inv.invoice_number,
                'customer': inv.customer.party.display_name,
                'invoice_date': inv.invoice_date.isoformat(),
                'due_date': inv.due_date.isoformat(),
                'status': inv.status,
                'payment_terms': inv.payment_terms,
                'total_amount': float(inv.total_amount),
                'amount_paid': float(inv.amount_paid),
                'balance_due': float(inv.balance_due),
            }
            for inv in qs.order_by('-invoice_date')[:500]
        ]

    def _report_payment_history(self, filters):
        """Generate payment history report."""
        from apps.invoicing.models import Payment

        qs = Payment.objects.filter(tenant=self.tenant)

        if filters.get('start_date'):
            qs = qs.filter(payment_date__gte=filters['start_date'])
        if filters.get('end_date'):
            qs = qs.filter(payment_date__lte=filters['end_date'])
        if filters.get('payment_method'):
            qs = qs.filter(payment_method=filters['payment_method'])
        if filters.get('customer_id'):
            qs = qs.filter(invoice__customer_id=filters['customer_id'])

        qs = qs.select_related('invoice__customer__party', 'recorded_by')

        return [
            {
                'payment_date': pmt.payment_date.isoformat(),
                'invoice_number': pmt.invoice.invoice_number,
                'customer': pmt.invoice.customer.party.display_name,
                'amount': float(pmt.amount),
                'payment_method': pmt.payment_method,
                'reference': pmt.reference_number,
                'recorded_by': pmt.recorded_by.username if pmt.recorded_by else '',
            }
            for pmt in qs.order_by('-payment_date')[:500]
        ]

    # ===== UTILITIES =====

    def get_available_reports(self, category=None):
        """Get list of available reports for the tenant."""
        qs = ReportDefinition.objects.filter(
            tenant=self.tenant,
            is_active=True,
        )
        if category:
            qs = qs.filter(category=category)
        return qs.order_by('category', 'name')

    def get_user_favorites(self):
        """Get user's favorite reports."""
        if not self.user:
            return ReportFavorite.objects.none()
        return ReportFavorite.objects.filter(
            tenant=self.tenant,
            user=self.user,
        ).select_related('report').order_by('display_order')

    def add_favorite(self, report_definition, saved_filters=None):
        """Add a report to user's favorites."""
        if not self.user:
            raise ValidationError("User required to add favorites")

        favorite, created = ReportFavorite.objects.get_or_create(
            tenant=self.tenant,
            user=self.user,
            report=report_definition,
            defaults={'saved_filters': saved_filters or {}},
        )
        return favorite

    def remove_favorite(self, report_definition):
        """Remove a report from user's favorites."""
        if not self.user:
            return
        ReportFavorite.objects.filter(
            tenant=self.tenant,
            user=self.user,
            report=report_definition,
        ).delete()


# ═══════════════════════════════════════════════════════════════════════════════
# Financial Reporting Service — GAAP-compliant financial statements from GL data
# ═══════════════════════════════════════════════════════════════════════════════

from apps.accounting.models import (
    Account, AccountType, JournalEntryLine,
    DEBIT_NORMAL_TYPES, CREDIT_NORMAL_TYPES,
)
from apps.invoicing.models import Invoice


class FinancialReportService:
    """
    Generates financial statements from GL data.

    Static/class methods (trial balance, income statement, balance sheet, aging)
    take tenant as an explicit parameter.

    Instance methods (gross margin, orders vs inventory, commission, contract
    utilization, vendor scorecard) use self.tenant set via __init__.
    """

    def __init__(self, tenant):
        """Initialize with tenant context."""
        self.tenant = tenant

    # ── Account Type Groupings ────────────────────────────────────────────

    ASSET_TYPES = {AccountType.ASSET_CURRENT, AccountType.ASSET_FIXED, AccountType.ASSET_OTHER}
    CONTRA_ASSET_TYPES = {AccountType.CONTRA_ASSET}
    LIABILITY_TYPES = {AccountType.LIABILITY_CURRENT, AccountType.LIABILITY_LONG_TERM}
    EQUITY_TYPES = {AccountType.EQUITY}
    REVENUE_TYPES = {AccountType.REVENUE, AccountType.REVENUE_OTHER}
    CONTRA_REVENUE_TYPES = {AccountType.CONTRA_REVENUE}
    EXPENSE_TYPES = {AccountType.EXPENSE_COGS, AccountType.EXPENSE_OPERATING, AccountType.EXPENSE_OTHER}

    INCOME_STATEMENT_TYPES = REVENUE_TYPES | CONTRA_REVENUE_TYPES | EXPENSE_TYPES
    BALANCE_SHEET_TYPES = ASSET_TYPES | CONTRA_ASSET_TYPES | LIABILITY_TYPES | EQUITY_TYPES

    # ── Trial Balance ─────────────────────────────────────────────────────

    @staticmethod
    def get_trial_balance(tenant, as_of_date):
        """
        Aggregate all posted JE lines up to as_of_date, grouped by account.

        Returns list of dicts:
        [
            {
                'account_id': int,
                'account_code': str,
                'account_name': str,
                'account_type': str,
                'total_debit': Decimal,
                'total_credit': Decimal,
                'net_balance': Decimal,  # Positive = normal balance direction
            },
            ...
        ]
        """
        rows = (
            JournalEntryLine.objects
            .filter(
                tenant=tenant,
                entry__status='posted',
                entry__date__lte=as_of_date,
            )
            .values(
                'account__id',
                'account__code',
                'account__name',
                'account__account_type',
            )
            .annotate(
                total_debit=Coalesce(Sum('debit'), Decimal('0.00')),
                total_credit=Coalesce(Sum('credit'), Decimal('0.00')),
            )
            .order_by('account__code')
        )

        result = []
        for row in rows:
            acct_type = row['account__account_type']
            total_dr = row['total_debit']
            total_cr = row['total_credit']

            # Net balance in normal-balance direction
            if acct_type in DEBIT_NORMAL_TYPES:
                net_balance = total_dr - total_cr
            else:
                net_balance = total_cr - total_dr

            result.append({
                'account_id': row['account__id'],
                'account_code': row['account__code'],
                'account_name': row['account__name'],
                'account_type': acct_type,
                'total_debit': total_dr,
                'total_credit': total_cr,
                'net_balance': net_balance,
            })

        return result

    # ── Income Statement (P&L) ────────────────────────────────────────────

    @classmethod
    def get_income_statement(cls, tenant, start_date, end_date):
        """
        Income Statement for a date range.

        Groups accounts by subtype:
        - Revenue (REVENUE, REVENUE_OTHER)
        - Contra Revenue (CONTRA_REVENUE / Sales Returns)
        - Net Revenue = Revenue - Contra Revenue
        - COGS (EXPENSE_COGS)
        - Gross Profit = Net Revenue - COGS
        - Operating Expenses (EXPENSE_OPERATING)
        - Other Expenses (EXPENSE_OTHER)
        - Net Income = Gross Profit - Operating Expenses - Other Expenses

        Returns structured dict.
        """
        rows = (
            JournalEntryLine.objects
            .filter(
                tenant=tenant,
                entry__status='posted',
                entry__date__gte=start_date,
                entry__date__lte=end_date,
                account__account_type__in=cls.INCOME_STATEMENT_TYPES,
            )
            .values(
                'account__id',
                'account__code',
                'account__name',
                'account__account_type',
            )
            .annotate(
                total_debit=Coalesce(Sum('debit'), Decimal('0.00')),
                total_credit=Coalesce(Sum('credit'), Decimal('0.00')),
            )
            .order_by('account__code')
        )

        # Bucket accounts by subtype
        revenue = []
        contra_revenue = []
        cogs = []
        operating_expenses = []
        other_expenses = []

        for row in rows:
            acct_type = row['account__account_type']
            total_dr = row['total_debit']
            total_cr = row['total_credit']

            # Net balance in normal direction
            if acct_type in DEBIT_NORMAL_TYPES:
                net = total_dr - total_cr
            else:
                net = total_cr - total_dr

            entry = {
                'account_id': row['account__id'],
                'account_code': row['account__code'],
                'account_name': row['account__name'],
                'account_type': acct_type,
                'balance': net,
            }

            if acct_type in cls.REVENUE_TYPES:
                revenue.append(entry)
            elif acct_type in cls.CONTRA_REVENUE_TYPES:
                contra_revenue.append(entry)
            elif acct_type == AccountType.EXPENSE_COGS:
                cogs.append(entry)
            elif acct_type == AccountType.EXPENSE_OPERATING:
                operating_expenses.append(entry)
            elif acct_type == AccountType.EXPENSE_OTHER:
                other_expenses.append(entry)

        total_revenue = sum(a['balance'] for a in revenue)
        total_contra_revenue = sum(a['balance'] for a in contra_revenue)
        net_revenue = total_revenue - total_contra_revenue
        total_cogs = sum(a['balance'] for a in cogs)
        gross_profit = net_revenue - total_cogs
        total_operating = sum(a['balance'] for a in operating_expenses)
        total_other = sum(a['balance'] for a in other_expenses)
        net_income = gross_profit - total_operating - total_other

        return {
            'start_date': str(start_date),
            'end_date': str(end_date),
            'sections': {
                'revenue': {
                    'label': 'Revenue',
                    'accounts': revenue,
                    'total': total_revenue,
                },
                'contra_revenue': {
                    'label': 'Sales Returns & Allowances',
                    'accounts': contra_revenue,
                    'total': total_contra_revenue,
                },
                'net_revenue': net_revenue,
                'cogs': {
                    'label': 'Cost of Goods Sold',
                    'accounts': cogs,
                    'total': total_cogs,
                },
                'gross_profit': gross_profit,
                'operating_expenses': {
                    'label': 'Operating Expenses',
                    'accounts': operating_expenses,
                    'total': total_operating,
                },
                'other_expenses': {
                    'label': 'Other Expenses',
                    'accounts': other_expenses,
                    'total': total_other,
                },
            },
            'net_income': net_income,
        }

    # ── Balance Sheet ─────────────────────────────────────────────────────

    @classmethod
    def get_balance_sheet(cls, tenant, as_of_date):
        """
        Balance Sheet as of a date.

        Assets = Liabilities + Equity (+ Retained Earnings).
        Retained Earnings = all-time net income (Revenue - Expenses) up to as_of_date.

        Returns structured dict with balance validation.
        """
        # Get all posted JE lines up to as_of_date
        rows = (
            JournalEntryLine.objects
            .filter(
                tenant=tenant,
                entry__status='posted',
                entry__date__lte=as_of_date,
            )
            .values(
                'account__id',
                'account__code',
                'account__name',
                'account__account_type',
            )
            .annotate(
                total_debit=Coalesce(Sum('debit'), Decimal('0.00')),
                total_credit=Coalesce(Sum('credit'), Decimal('0.00')),
            )
            .order_by('account__code')
        )

        # Bucket
        assets = []
        contra_assets = []
        liabilities = []
        equity = []
        # For retained earnings calc
        revenue_total = Decimal('0.00')
        expense_total = Decimal('0.00')

        for row in rows:
            acct_type = row['account__account_type']
            total_dr = row['total_debit']
            total_cr = row['total_credit']

            if acct_type in DEBIT_NORMAL_TYPES:
                net = total_dr - total_cr
            else:
                net = total_cr - total_dr

            entry = {
                'account_id': row['account__id'],
                'account_code': row['account__code'],
                'account_name': row['account__name'],
                'account_type': acct_type,
                'balance': net,
            }

            if acct_type in cls.ASSET_TYPES:
                assets.append(entry)
            elif acct_type in cls.CONTRA_ASSET_TYPES:
                contra_assets.append(entry)
            elif acct_type in cls.LIABILITY_TYPES:
                liabilities.append(entry)
            elif acct_type in cls.EQUITY_TYPES:
                equity.append(entry)
            elif acct_type in cls.REVENUE_TYPES:
                revenue_total += net
            elif acct_type in cls.CONTRA_REVENUE_TYPES:
                revenue_total -= net  # Contra reduces revenue
            elif acct_type in cls.EXPENSE_TYPES:
                expense_total += net

        retained_earnings = revenue_total - expense_total

        total_assets = sum(a['balance'] for a in assets) - sum(a['balance'] for a in contra_assets)
        total_liabilities = sum(a['balance'] for a in liabilities)
        total_equity = sum(a['balance'] for a in equity) + retained_earnings
        total_liabilities_and_equity = total_liabilities + total_equity

        # GAAP validation: A = L + E
        is_balanced = total_assets == total_liabilities_and_equity
        variance = total_assets - total_liabilities_and_equity

        return {
            'as_of_date': str(as_of_date),
            'sections': {
                'assets': {
                    'label': 'Assets',
                    'accounts': assets,
                    'contra_accounts': contra_assets,
                    'total': total_assets,
                },
                'liabilities': {
                    'label': 'Liabilities',
                    'accounts': liabilities,
                    'total': total_liabilities,
                },
                'equity': {
                    'label': 'Equity',
                    'accounts': equity,
                    'retained_earnings': retained_earnings,
                    'total': total_equity,
                },
            },
            'total_assets': total_assets,
            'total_liabilities_and_equity': total_liabilities_and_equity,
            'is_balanced': is_balanced,
            'variance': variance,
        }

    # ── A/R Aging ─────────────────────────────────────────────────────────

    @staticmethod
    def get_ar_aging(tenant, as_of_date):
        """
        A/R Aging report.

        Source: Invoice model (not GL).
        Filters: posted/sent/partial/overdue invoices with outstanding balance.
        Buckets by days past due_date.

        Returns:
        {
            'as_of_date': str,
            'customers': [
                {
                    'customer_id': int,
                    'customer_name': str,
                    'current': Decimal,
                    'days_1_30': Decimal,
                    'days_31_60': Decimal,
                    'days_61_90': Decimal,
                    'days_over_90': Decimal,
                    'total': Decimal,
                    'invoices': [...],
                },
                ...
            ],
            'totals': {
                'current': Decimal,
                'days_1_30': Decimal,
                'days_31_60': Decimal,
                'days_61_90': Decimal,
                'days_over_90': Decimal,
                'total': Decimal,
            }
        }
        """
        # Get all open invoices (posted, sent, partial, overdue)
        open_invoices = (
            Invoice.objects
            .filter(
                tenant=tenant,
                status__in=('posted', 'sent', 'partial', 'overdue'),
            )
            .select_related('customer__party')
            .order_by('customer__party__display_name', 'due_date')
        )

        # Group by customer and bucket
        customers = defaultdict(lambda: {
            'customer_id': None,
            'customer_name': '',
            'current': Decimal('0.00'),
            'days_1_30': Decimal('0.00'),
            'days_31_60': Decimal('0.00'),
            'days_61_90': Decimal('0.00'),
            'days_over_90': Decimal('0.00'),
            'total': Decimal('0.00'),
            'invoices': [],
        })

        for inv in open_invoices:
            balance = inv.total_amount - inv.amount_paid
            if balance <= 0:
                continue

            cust_id = inv.customer_id
            cust_name = inv.customer.party.display_name

            days_overdue = (as_of_date - inv.due_date).days

            # Determine bucket
            if days_overdue <= 0:
                bucket = 'current'
            elif days_overdue <= 30:
                bucket = 'days_1_30'
            elif days_overdue <= 60:
                bucket = 'days_31_60'
            elif days_overdue <= 90:
                bucket = 'days_61_90'
            else:
                bucket = 'days_over_90'

            c = customers[cust_id]
            c['customer_id'] = cust_id
            c['customer_name'] = cust_name
            c[bucket] += balance
            c['total'] += balance
            c['invoices'].append({
                'invoice_id': inv.id,
                'invoice_number': inv.invoice_number,
                'invoice_date': str(inv.invoice_date),
                'due_date': str(inv.due_date),
                'total_amount': inv.total_amount,
                'amount_paid': inv.amount_paid,
                'balance': balance,
                'days_overdue': max(days_overdue, 0),
                'bucket': bucket,
            })

        customer_list = sorted(customers.values(), key=lambda c: c['customer_name'])

        # Grand totals
        totals = {
            'current': sum(c['current'] for c in customer_list),
            'days_1_30': sum(c['days_1_30'] for c in customer_list),
            'days_31_60': sum(c['days_31_60'] for c in customer_list),
            'days_61_90': sum(c['days_61_90'] for c in customer_list),
            'days_over_90': sum(c['days_over_90'] for c in customer_list),
            'total': sum(c['total'] for c in customer_list),
        }

        return {
            'as_of_date': str(as_of_date),
            'customers': customer_list,
            'totals': totals,
        }

    # ── A/P Aging ─────────────────────────────────────────────────────────

    @staticmethod
    def get_ap_aging(tenant, as_of_date):
        """
        A/P Aging report.

        Source: VendorBill model.
        Filters: posted/partial bills with outstanding balance.
        Buckets by days past due_date.

        Returns same structure as AR aging but for vendors.
        """
        from apps.invoicing.models import VendorBill

        open_bills = (
            VendorBill.objects
            .filter(
                tenant=tenant,
                status__in=('posted', 'partial'),
            )
            .select_related('vendor__party')
            .order_by('vendor__party__display_name', 'due_date')
        )

        vendors = defaultdict(lambda: {
            'vendor_id': None,
            'vendor_name': '',
            'current': Decimal('0.00'),
            'days_1_30': Decimal('0.00'),
            'days_31_60': Decimal('0.00'),
            'days_61_90': Decimal('0.00'),
            'days_over_90': Decimal('0.00'),
            'total': Decimal('0.00'),
            'bills': [],
        })

        for bill in open_bills:
            balance = bill.total_amount - bill.amount_paid
            if balance <= 0:
                continue

            vendor_id = bill.vendor_id
            vendor_name = bill.vendor.party.display_name

            days_overdue = (as_of_date - bill.due_date).days

            if days_overdue <= 0:
                bucket = 'current'
            elif days_overdue <= 30:
                bucket = 'days_1_30'
            elif days_overdue <= 60:
                bucket = 'days_31_60'
            elif days_overdue <= 90:
                bucket = 'days_61_90'
            else:
                bucket = 'days_over_90'

            v = vendors[vendor_id]
            v['vendor_id'] = vendor_id
            v['vendor_name'] = vendor_name
            v[bucket] += balance
            v['total'] += balance
            v['bills'].append({
                'bill_id': bill.id,
                'bill_number': bill.bill_number,
                'vendor_invoice': bill.vendor_invoice_number,
                'bill_date': str(bill.bill_date),
                'due_date': str(bill.due_date),
                'total_amount': bill.total_amount,
                'amount_paid': bill.amount_paid,
                'balance': balance,
                'days_overdue': max(days_overdue, 0),
                'bucket': bucket,
            })

        vendor_list = sorted(vendors.values(), key=lambda v: v['vendor_name'])

        totals = {
            'current': sum(v['current'] for v in vendor_list),
            'days_1_30': sum(v['days_1_30'] for v in vendor_list),
            'days_31_60': sum(v['days_31_60'] for v in vendor_list),
            'days_61_90': sum(v['days_61_90'] for v in vendor_list),
            'days_over_90': sum(v['days_over_90'] for v in vendor_list),
            'total': sum(v['total'] for v in vendor_list),
        }

        return {
            'as_of_date': str(as_of_date),
            'vendors': vendor_list,
            'totals': totals,
        }

    # ── Cash Flow Statement ───────────────────────────────────────────────

    @staticmethod
    def get_cash_flow_statement(tenant, start_date, end_date):
        """
        Cash Flow Statement for a date range.

        Analyzes movements in cash/bank accounts grouped by activity type:
        - Operating: revenue receipts, expense payments, AP/AR changes
        - Investing: (placeholder - asset purchases/sales)
        - Financing: (placeholder - equity/loan changes)

        Returns structured dict with cash flow by activity.
        """
        from apps.accounting.models import Account, AccountType, JournalEntryLine
        from django.db.models.functions import Coalesce

        # Find all cash/bank accounts (current assets typically used for cash)
        # Look for accounts that are commonly cash accounts
        cash_accounts = Account.objects.filter(
            tenant=tenant,
            account_type=AccountType.ASSET_CURRENT,
            is_active=True,
        )

        # Get the default cash account from settings
        from apps.accounting.models import AccountingSettings
        acct_settings = AccountingSettings.get_for_tenant(tenant)
        cash_account_ids = set()
        if acct_settings.default_cash_account:
            cash_account_ids.add(acct_settings.default_cash_account_id)

        # Get all journal entry lines hitting cash accounts in the period
        cash_movements = (
            JournalEntryLine.objects
            .filter(
                tenant=tenant,
                entry__status='posted',
                entry__date__gte=start_date,
                entry__date__lte=end_date,
            )
            .filter(account_id__in=cash_account_ids) if cash_account_ids else
            JournalEntryLine.objects.none()
        )

        # Categorize by source type
        operating_inflows = Decimal('0.00')
        operating_outflows = Decimal('0.00')
        details = []

        for line in cash_movements.select_related('entry', 'account'):
            net = line.debit - line.credit
            entry_info = {
                'date': str(line.entry.date),
                'description': line.entry.memo,
                'reference': line.entry.reference_number,
                'amount': net,
                'account': line.account.name,
            }
            details.append(entry_info)

            if net > 0:
                operating_inflows += net
            else:
                operating_outflows += abs(net)

        net_operating = operating_inflows - operating_outflows

        # Beginning and ending cash balances
        beginning_lines = (
            JournalEntryLine.objects
            .filter(
                tenant=tenant,
                entry__status='posted',
                entry__date__lt=start_date,
            )
        )
        if cash_account_ids:
            beginning_lines = beginning_lines.filter(account_id__in=cash_account_ids)
        else:
            beginning_lines = beginning_lines.none()

        beginning_totals = beginning_lines.aggregate(
            total_debit=Coalesce(Sum('debit'), Decimal('0.00')),
            total_credit=Coalesce(Sum('credit'), Decimal('0.00')),
        )
        beginning_balance = beginning_totals['total_debit'] - beginning_totals['total_credit']
        ending_balance = beginning_balance + net_operating

        return {
            'start_date': str(start_date),
            'end_date': str(end_date),
            'beginning_cash_balance': beginning_balance,
            'sections': {
                'operating': {
                    'label': 'Cash from Operating Activities',
                    'inflows': operating_inflows,
                    'outflows': operating_outflows,
                    'net': net_operating,
                    'details': sorted(details, key=lambda x: x['date']),
                },
                'investing': {
                    'label': 'Cash from Investing Activities',
                    'inflows': Decimal('0.00'),
                    'outflows': Decimal('0.00'),
                    'net': Decimal('0.00'),
                    'details': [],
                },
                'financing': {
                    'label': 'Cash from Financing Activities',
                    'inflows': Decimal('0.00'),
                    'outflows': Decimal('0.00'),
                    'net': Decimal('0.00'),
                    'details': [],
                },
            },
            'net_change_in_cash': net_operating,
            'ending_cash_balance': ending_balance,
        }


    # ── Open Orders vs Inventory Report ──────────────────────────────

    def get_orders_vs_inventory(self):
        """
        Compare open order demand against available inventory.

        For each item with open orders, shows demand vs supply coverage.

        Returns list of item coverage summaries.
        """
        from apps.orders.models import SalesOrderLine, PurchaseOrderLine
        from apps.inventory.models import InventoryBalance
        from django.db.models import Sum, Q
        from decimal import Decimal
        from collections import defaultdict

        # Get open SO demand (confirmed/scheduled/picking)
        so_demand = SalesOrderLine.objects.filter(
            tenant=self.tenant,
            sales_order__status__in=['confirmed', 'scheduled', 'picking'],
        ).values('item_id', 'item__sku', 'item__name').annotate(
            total_so_qty=Sum('quantity_ordered')
        )

        # Get open PO supply (confirmed/scheduled)
        po_supply = PurchaseOrderLine.objects.filter(
            tenant=self.tenant,
            purchase_order__status__in=['confirmed', 'scheduled'],
        ).values('item_id').annotate(
            total_po_qty=Sum('quantity_ordered')
        )
        po_by_item = {row['item_id']: row['total_po_qty'] for row in po_supply}

        # Get current inventory balances per item (summed across warehouses)
        balances = InventoryBalance.objects.filter(
            tenant=self.tenant,
        ).values('item_id').annotate(
            total_on_hand=Sum('on_hand'),
            total_allocated=Sum('allocated'),
            total_on_order=Sum('on_order'),
        )
        balance_by_item = {row['item_id']: row for row in balances}

        results = []
        for row in so_demand:
            item_id = row['item_id']
            so_qty = row['total_so_qty'] or 0

            bal = balance_by_item.get(item_id, {})
            on_hand = bal.get('total_on_hand', 0) or 0
            allocated = bal.get('total_allocated', 0) or 0
            on_order = bal.get('total_on_order', 0) or 0
            available = on_hand - allocated

            incoming_po = po_by_item.get(item_id, 0) or 0
            projected = available + incoming_po

            # Coverage: can we fulfill all open SO demand?
            shortage = max(so_qty - projected, 0)
            coverage_pct = round(min(projected / so_qty * 100, 100), 1) if so_qty else 100

            status = 'ok' if shortage == 0 else ('critical' if available <= 0 else 'warning')

            results.append({
                'item_id': item_id,
                'item_sku': row['item__sku'],
                'item_name': row['item__name'],
                'open_so_qty': so_qty,
                'on_hand': on_hand,
                'allocated': allocated,
                'available': available,
                'on_order': on_order,
                'incoming_po': incoming_po,
                'projected': projected,
                'shortage': shortage,
                'coverage_pct': coverage_pct,
                'status': status,
            })

        # Sort: critical first, then warning, then ok
        status_order = {'critical': 0, 'warning': 1, 'ok': 2}
        results.sort(key=lambda x: (status_order.get(x['status'], 3), -x['shortage']))

        return results

    # ── Sales Commission Report ───────────────────────────────────────

    def get_sales_commission(self, date_from=None, date_to=None, commission_rate=None):
        """
        Sales commission report by sales rep.

        Computes commission from invoiced amounts per sales rep.

        Args:
            date_from: Start date
            date_to: End date
            commission_rate: Default commission rate as decimal (e.g., 0.05 for 5%). Defaults to 0.05.

        Returns:
            dict with summary and per-rep breakdown
        """
        from apps.invoicing.models import Invoice
        from django.db.models import Sum, Count, Q
        from decimal import Decimal

        rate = Decimal(str(commission_rate)) if commission_rate else Decimal('0.05')

        inv_filter = Q(
            tenant=self.tenant,
            status__in=['posted', 'sent', 'paid', 'partial'],
        )
        if date_from:
            inv_filter &= Q(invoice_date__gte=date_from)
        if date_to:
            inv_filter &= Q(invoice_date__lte=date_to)

        # Group by sales_rep (from customer)
        # Invoice -> customer -> sales_rep
        invoices = Invoice.objects.filter(inv_filter).select_related(
            'customer__party', 'customer'
        )

        rep_data = {}
        total_invoiced = Decimal('0')
        total_paid = Decimal('0')

        for invoice in invoices:
            rep_id = invoice.customer.sales_rep_id if invoice.customer.sales_rep_id else None
            rep_key = rep_id or 'unassigned'

            if rep_key not in rep_data:
                # Try to get rep name
                rep_name = 'Unassigned'
                if rep_id:
                    try:
                        from django.contrib.auth import get_user_model
                        User = get_user_model()
                        user = User.objects.get(pk=rep_id)
                        rep_name = user.get_full_name() or user.username
                    except Exception:
                        rep_name = f'Rep #{rep_id}'

                rep_data[rep_key] = {
                    'rep_id': rep_id,
                    'rep_name': rep_name,
                    'invoice_count': 0,
                    'total_invoiced': Decimal('0'),
                    'total_paid': Decimal('0'),
                }

            amount = Decimal(str(invoice.total_amount))
            paid = Decimal(str(invoice.amount_paid))

            rep_data[rep_key]['invoice_count'] += 1
            rep_data[rep_key]['total_invoiced'] += amount
            rep_data[rep_key]['total_paid'] += paid
            total_invoiced += amount
            total_paid += paid

        # Compute commission
        reps = []
        total_commission = Decimal('0')
        for rep in rep_data.values():
            commission = (rep['total_paid'] * rate).quantize(Decimal('0.01'))
            total_commission += commission
            reps.append({
                'rep_id': rep['rep_id'],
                'rep_name': rep['rep_name'],
                'invoice_count': rep['invoice_count'],
                'total_invoiced': str(rep['total_invoiced']),
                'total_paid': str(rep['total_paid']),
                'commission_rate': str(rate),
                'commission_earned': str(commission),
            })

        reps.sort(key=lambda x: Decimal(x['total_invoiced']), reverse=True)

        return {
            'date_from': str(date_from) if date_from else None,
            'date_to': str(date_to) if date_to else None,
            'commission_rate': str(rate),
            'summary': {
                'total_invoiced': str(total_invoiced),
                'total_paid': str(total_paid),
                'total_commission': str(total_commission),
            },
            'by_rep': reps,
        }

    # ── Gross Margin Report ───────────────────────────────────────────

    def get_gross_margin(self, date_from=None, date_to=None, customer_id=None, item_id=None):
        """
        Compute gross margin report.

        Returns:
            dict with:
            - summary: {total_revenue, total_cogs, gross_margin, margin_pct}
            - by_customer: [{customer_id, customer_name, revenue, cogs, margin, margin_pct}]
            - by_item: [{item_id, item_sku, item_name, revenue, cogs, margin, margin_pct}]
        """
        from decimal import Decimal
        from django.db.models import Sum, F, Q
        from apps.invoicing.models import Invoice, InvoiceLine

        # Base filter: posted/paid/partial invoices
        invoice_filter = Q(
            invoice__tenant=self.tenant,
            invoice__status__in=['posted', 'sent', 'paid', 'partial'],
        )

        if date_from:
            invoice_filter &= Q(invoice__invoice_date__gte=date_from)
        if date_to:
            invoice_filter &= Q(invoice__invoice_date__lte=date_to)
        if customer_id:
            invoice_filter &= Q(invoice__customer_id=customer_id)
        if item_id:
            invoice_filter &= Q(item_id=item_id)

        lines = InvoiceLine.objects.filter(invoice_filter).select_related(
            'invoice__customer__party', 'item'
        )

        # Revenue by customer
        by_customer = {}
        by_item = {}
        total_revenue = Decimal('0')

        for line in lines:
            revenue = Decimal(str(line.amount)) if hasattr(line, 'amount') else (
                Decimal(str(line.unit_price)) * line.quantity
            )
            total_revenue += revenue

            # By customer
            cust_id = line.invoice.customer_id
            if cust_id not in by_customer:
                by_customer[cust_id] = {
                    'customer_id': cust_id,
                    'customer_name': line.invoice.customer.party.display_name,
                    'revenue': Decimal('0'),
                }
            by_customer[cust_id]['revenue'] += revenue

            # By item
            if line.item_id:
                if line.item_id not in by_item:
                    by_item[line.item_id] = {
                        'item_id': line.item_id,
                        'item_sku': line.item.sku if line.item else 'N/A',
                        'item_name': line.item.name if line.item else 'N/A',
                        'revenue': Decimal('0'),
                    }
                by_item[line.item_id]['revenue'] += revenue

        # Get COGS from JournalEntry lines on COGS accounts
        from apps.accounting.models import JournalEntryLine, Account
        cogs_filter = Q(
            entry__tenant=self.tenant,
            entry__status='posted',
            account__account_type='EXPENSE_COGS',
        )
        if date_from:
            cogs_filter &= Q(entry__date__gte=date_from)
        if date_to:
            cogs_filter &= Q(entry__date__lte=date_to)

        cogs_total_qs = JournalEntryLine.objects.filter(cogs_filter).aggregate(
            total_cogs=Sum('debit')
        )
        total_cogs = cogs_total_qs['total_cogs'] or Decimal('0')

        gross_margin = total_revenue - total_cogs
        margin_pct = (gross_margin / total_revenue * 100) if total_revenue else Decimal('0')

        # Assign proportional COGS to customers/items (approximation)
        cogs_ratio = (total_cogs / total_revenue) if total_revenue else Decimal('0')

        customer_list = []
        for c in by_customer.values():
            c_cogs = c['revenue'] * cogs_ratio
            c_margin = c['revenue'] - c_cogs
            customer_list.append({
                **c,
                'revenue': str(c['revenue']),
                'cogs': str(c_cogs.quantize(Decimal('0.01'))),
                'margin': str(c_margin.quantize(Decimal('0.01'))),
                'margin_pct': str((c_margin / c['revenue'] * 100).quantize(Decimal('0.1'))) if c['revenue'] else '0',
            })

        item_list = []
        for i in by_item.values():
            i_cogs = i['revenue'] * cogs_ratio
            i_margin = i['revenue'] - i_cogs
            item_list.append({
                **i,
                'revenue': str(i['revenue']),
                'cogs': str(i_cogs.quantize(Decimal('0.01'))),
                'margin': str(i_margin.quantize(Decimal('0.01'))),
                'margin_pct': str((i_margin / i['revenue'] * 100).quantize(Decimal('0.1'))) if i['revenue'] else '0',
            })

        # Sort by revenue descending
        customer_list.sort(key=lambda x: Decimal(x['revenue']), reverse=True)
        item_list.sort(key=lambda x: Decimal(x['revenue']), reverse=True)

        return {
            'date_from': str(date_from) if date_from else None,
            'date_to': str(date_to) if date_to else None,
            'summary': {
                'total_revenue': str(total_revenue),
                'total_cogs': str(total_cogs),
                'gross_margin': str(gross_margin),
                'margin_pct': str(margin_pct.quantize(Decimal('0.1'))) if isinstance(margin_pct, Decimal) else '0',
            },
            'by_customer': customer_list,
            'by_item': item_list,
        }


    # ── Contract Utilization ──────────────────────────────────────────

    def get_contract_utilization(self):
        """
        Contract utilization report showing commitment vs release status.

        Returns list of contract summaries with utilization metrics.
        """
        from apps.contracts.models import Contract
        from datetime import date

        today = date.today()
        contracts = Contract.objects.filter(
            tenant=self.tenant,
            status__in=['active', 'complete'],
        ).select_related('customer__party').prefetch_related('lines')

        results = []
        for contract in contracts:
            total_committed = sum(line.blanket_qty for line in contract.lines.all())
            total_released = sum(line.released_qty for line in contract.lines.all())
            total_remaining = total_committed - total_released
            completion_pct = (total_released / total_committed * 100) if total_committed else 0

            # Days remaining
            days_remaining = None
            if contract.end_date:
                days_remaining = max((contract.end_date - today).days, 0)

            # Burn rate (releases per day since start)
            burn_rate = None
            if contract.start_date and total_released > 0:
                days_active = max((today - contract.start_date).days, 1)
                burn_rate = round(total_released / days_active, 2)

            # Projected completion date based on burn rate
            projected_completion = None
            if burn_rate and burn_rate > 0 and total_remaining > 0:
                days_to_complete = total_remaining / burn_rate
                from datetime import timedelta
                projected_completion = str(today + timedelta(days=int(days_to_complete)))

            results.append({
                'contract_id': contract.id,
                'contract_number': contract.contract_number,
                'blanket_po': contract.blanket_po,
                'customer_id': contract.customer_id,
                'customer_name': contract.customer.party.display_name,
                'status': contract.status,
                'start_date': str(contract.start_date) if contract.start_date else None,
                'end_date': str(contract.end_date) if contract.end_date else None,
                'total_committed': total_committed,
                'total_released': total_released,
                'total_remaining': total_remaining,
                'completion_pct': round(completion_pct, 1),
                'days_remaining': days_remaining,
                'burn_rate': burn_rate,
                'projected_completion': projected_completion,
                'num_lines': contract.lines.count(),
                'at_risk': days_remaining is not None and days_remaining < 30 and completion_pct < 80,
            })

        results.sort(key=lambda x: x['completion_pct'], reverse=True)
        return results

    # ── Vendor Scorecard ──────────────────────────────────────────────

    def get_vendor_scorecard(self, date_from=None, date_to=None):
        """
        Vendor scorecard with delivery performance, spend, and quality metrics.

        Args:
            date_from: Optional start date filter
            date_to: Optional end date filter

        Returns list of vendor performance summaries.
        """
        from apps.parties.models import Vendor
        from apps.orders.models import PurchaseOrder
        from django.db.models import Count, Sum, Avg, Q, F
        from decimal import Decimal

        vendors = Vendor.objects.filter(
            tenant=self.tenant,
            is_active=True,
        ).select_related('party')

        results = []
        for vendor in vendors:
            # PO filter
            po_filter = Q(tenant=self.tenant, vendor=vendor)
            if date_from:
                po_filter &= Q(order_date__gte=date_from)
            if date_to:
                po_filter &= Q(order_date__lte=date_to)

            pos = PurchaseOrder.objects.filter(po_filter)
            total_pos = pos.count()

            if total_pos == 0:
                continue

            # Completed POs
            completed_pos = pos.filter(status='complete')
            completed_count = completed_pos.count()

            # On-time delivery: POs completed where actual completion <= expected_date
            # (approximation: if status is complete and scheduled_date is not null)
            on_time = 0
            late = 0
            for po in completed_pos:
                if po.expected_date and po.scheduled_date:
                    if po.scheduled_date <= po.expected_date:
                        on_time += 1
                    else:
                        late += 1
                else:
                    on_time += 1  # Assume on-time if dates not set

            on_time_pct = round(on_time / completed_count * 100, 1) if completed_count else 0

            # Total spend from completed PO lines
            total_spend = Decimal('0')
            for po in completed_pos:
                total_spend += Decimal(str(po.subtotal))

            # Average lead time (days from order_date to scheduled completion)
            lead_times = []
            for po in completed_pos:
                if po.expected_date and po.order_date:
                    days = (po.expected_date - po.order_date).days
                    if days >= 0:
                        lead_times.append(days)
            avg_lead_time = round(sum(lead_times) / len(lead_times), 1) if lead_times else None

            # Active PO count (open)
            active_count = pos.filter(status__in=['draft', 'confirmed', 'scheduled']).count()

            results.append({
                'vendor_id': vendor.id,
                'vendor_name': vendor.party.display_name,
                'vendor_code': vendor.party.code,
                'total_pos': total_pos,
                'completed_pos': completed_count,
                'active_pos': active_count,
                'on_time_count': on_time,
                'late_count': late,
                'on_time_pct': on_time_pct,
                'total_spend': str(total_spend),
                'avg_lead_time_days': avg_lead_time,
            })

        results.sort(key=lambda x: Decimal(x['total_spend']), reverse=True)
        return results


class ItemReportService:
    """Item-level operational reports."""

    @staticmethod
    def get_quick_report(tenant, item_id, start_date, end_date):
        """
        Item QuickReport — financial and order activity for a single item.

        Returns dict with 3 sections:
        - financials: InvoiceLine (sales) + VendorBillLine (costs) for this item
        - purchase_orders: PurchaseOrderLine records for this item
        - sales_orders: SalesOrderLine records for this item

        Each section has 'rows' (list of dicts) and 'summary' totals.
        """
        from apps.invoicing.models import InvoiceLine, VendorBillLine
        from apps.orders.models import PurchaseOrderLine, SalesOrderLine

        # ── Section 1: Financials ─────────────────────────────────────────

        # Invoice lines (sales)
        invoice_lines = (
            InvoiceLine.objects
            .filter(
                tenant=tenant,
                item_id=item_id,
                invoice__invoice_date__gte=start_date,
                invoice__invoice_date__lte=end_date,
            )
            .exclude(invoice__status__in=('draft', 'void'))
            .select_related('invoice__customer__party')
            .order_by('-invoice__invoice_date')
        )

        sale_rows = [
            {
                'date': line.invoice.invoice_date.isoformat(),
                'type': 'Sale',
                'document_number': line.invoice.invoice_number,
                'party_name': line.invoice.customer.party.display_name,
                'quantity': line.quantity,
                'unit_price': float(line.unit_price),
                'total': float(line.line_total),
            }
            for line in invoice_lines
        ]

        # Vendor bill lines (costs)
        bill_lines = (
            VendorBillLine.objects
            .filter(
                tenant=tenant,
                item_id=item_id,
                item__isnull=False,
                bill__bill_date__gte=start_date,
                bill__bill_date__lte=end_date,
            )
            .exclude(bill__status__in=('draft', 'void'))
            .select_related('bill__vendor__party')
            .order_by('-bill__bill_date')
        )

        cost_rows = [
            {
                'date': line.bill.bill_date.isoformat(),
                'type': 'Cost',
                'document_number': line.bill.bill_number,
                'party_name': line.bill.vendor.party.display_name,
                'quantity': float(line.quantity),
                'unit_price': float(line.unit_price),
                'total': float(line.amount),
            }
            for line in bill_lines
        ]

        # Combine and sort by date descending
        financial_rows = sorted(
            sale_rows + cost_rows,
            key=lambda x: x['date'],
            reverse=True
        )

        total_sales = sum(row['total'] for row in sale_rows)
        total_costs = sum(row['total'] for row in cost_rows)

        financial_summary = {
            'total_sales': total_sales,
            'total_costs': total_costs,
            'gross_margin': total_sales - total_costs,
            'row_count': len(financial_rows),
        }

        # ── Section 2: Purchase Orders ────────────────────────────────────

        po_lines = (
            PurchaseOrderLine.objects
            .filter(
                tenant=tenant,
                item_id=item_id,
                purchase_order__order_date__gte=start_date,
                purchase_order__order_date__lte=end_date,
            )
            .exclude(purchase_order__status='cancelled')
            .select_related('purchase_order__vendor__party')
            .order_by('-purchase_order__order_date')
        )

        po_rows = [
            {
                'date': line.purchase_order.order_date.isoformat(),
                'po_number': line.purchase_order.po_number,
                'vendor_name': line.purchase_order.vendor.party.display_name,
                'status': line.purchase_order.status,
                'status_display': line.purchase_order.get_status_display(),
                'quantity_ordered': line.quantity_ordered,
                'unit_cost': float(line.unit_cost),
                'line_total': float(line.line_total),
            }
            for line in po_lines
        ]

        # Count distinct POs
        distinct_pos = set(line.purchase_order_id for line in po_lines)

        po_summary = {
            'total_quantity': sum(row['quantity_ordered'] for row in po_rows),
            'total_value': sum(row['line_total'] for row in po_rows),
            'po_count': len(distinct_pos),
            'row_count': len(po_rows),
        }

        # ── Section 3: Sales Orders ───────────────────────────────────────

        so_lines = (
            SalesOrderLine.objects
            .filter(
                tenant=tenant,
                item_id=item_id,
                sales_order__order_date__gte=start_date,
                sales_order__order_date__lte=end_date,
            )
            .exclude(sales_order__status='cancelled')
            .select_related('sales_order__customer__party')
            .order_by('-sales_order__order_date')
        )

        so_rows = [
            {
                'date': line.sales_order.order_date.isoformat(),
                'order_number': line.sales_order.order_number,
                'customer_name': line.sales_order.customer.party.display_name,
                'status': line.sales_order.status,
                'status_display': line.sales_order.get_status_display(),
                'quantity_ordered': line.quantity_ordered,
                'unit_price': float(line.unit_price),
                'line_total': float(line.line_total),
            }
            for line in so_lines
        ]

        # Count distinct SOs
        distinct_sos = set(line.sales_order_id for line in so_lines)

        so_summary = {
            'total_quantity': sum(row['quantity_ordered'] for row in so_rows),
            'total_value': sum(row['line_total'] for row in so_rows),
            'so_count': len(distinct_sos),
            'row_count': len(so_rows),
        }

        # ── Return Structure ──────────────────────────────────────────────

        return {
            'item_id': item_id,
            'start_date': str(start_date),
            'end_date': str(end_date),
            'financials': {'rows': financial_rows, 'summary': financial_summary},
            'purchase_orders': {'rows': po_rows, 'summary': po_summary},
            'sales_orders': {'rows': so_rows, 'summary': so_summary},
        }
