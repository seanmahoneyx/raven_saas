# apps/reporting/services.py
"""
Reporting service for generating and managing reports.

ReportingService handles:
- Running built-in report types
- Managing saved reports
- Scheduling report execution
- Exporting reports to various formats
"""
from decimal import Decimal
from datetime import timedelta
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
