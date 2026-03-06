# apps/reporting/pipeline.py
"""
Business pipeline Kanban dashboard service layer.

Provides a single-call function that returns all Kanban stage data
for both the customer track and vendor track.
"""
from datetime import timedelta

from django.utils import timezone


def get_pipeline_data(tenant, customer_id=None, vendor_id=None, date_from=None, date_to=None):
    """
    Aggregate pipeline Kanban data for a tenant.

    Returns dict with customer_track and vendor_track lists, each containing
    stage objects with kpi metrics and up to 20 preview cards.

    Args:
        tenant: Tenant instance (used for all ORM filters).
        customer_id: Optional int — filter customer-track stages to one customer.
        vendor_id: Optional int — filter vendor-track stages to one vendor.
        date_from: Optional date — filter created_at >= date_from.
        date_to: Optional date — filter created_at <= date_to.
    """
    from apps.design.models import DesignRequest
    from apps.orders.models import Estimate, SalesOrder, PurchaseOrder, RFQ
    from apps.shipping.models import Shipment, ShipmentLine
    from apps.invoicing.models import Invoice, VendorBill, BillPayment
    from apps.payments.models import CustomerPayment, PaymentApplication
    from apps.inventory.models import InventoryLot

    today = timezone.now().date()

    # ─── helpers ────────────────────────────────────────────────────────────

    def _date_filters(qs):
        """Apply date_from / date_to filters on created_at."""
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs

    def _age(obj):
        return (today - obj.created_at.date()).days

    def _val(amount):
        return str(amount) if amount is not None else None

    def _avg_age(queryset):
        """Compute average age in days (float) from a queryset with created_at."""
        dates = list(queryset.values_list('created_at', flat=True))
        if not dates:
            return None
        total = sum((today - d.date()).days for d in dates)
        return round(total / len(dates), 1)

    # ─── STAGE BUILDERS ─────────────────────────────────────────────────────

    # ── 1. Design Requests ──────────────────────────────────────────────────
    def stage_design_request():
        active_statuses = ['pending', 'in_progress']
        qs = DesignRequest.objects.filter(tenant=tenant, status__in=active_statuses)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        qs = _date_filters(qs)
        qs = qs.select_related('customer')

        total_count = qs.count()
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': None,
            'avg_days_in_stage': avg_days,
        }

        cards = []
        for dr in qs.order_by('-created_at')[:20]:
            customer_name = dr.customer.display_name if dr.customer else None
            estimate_ids = list(
                Estimate.objects.filter(tenant=tenant, design_request_id=dr.id)
                .values_list('id', flat=True)
            )
            cards.append({
                'id': dr.id,
                'number': dr.file_number,
                'entity_type': 'design_request',
                'customer_name': customer_name,
                'vendor_name': None,
                'total_value': None,
                'status': dr.status,
                'age_days': _age(dr),
                'created_at': dr.created_at.isoformat(),
                'links': {'estimate_ids': estimate_ids},
            })

        return {
            'stage': 'design_request',
            'label': 'Design Request',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ── 2. Estimates ────────────────────────────────────────────────────────
    def stage_estimate():
        active_statuses = ['draft', 'sent', 'accepted']
        qs = Estimate.objects.filter(tenant=tenant, status__in=active_statuses)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        qs = _date_filters(qs)
        qs = qs.select_related('customer__party')

        total_count = qs.count()
        from django.db.models import Sum as _Sum
        total_value = qs.aggregate(v=_Sum('total_amount'))['v']
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': _val(total_value),
            'avg_days_in_stage': avg_days,
        }

        cards = []
        for est in qs.order_by('-created_at')[:20]:
            customer_name = (
                est.customer.party.display_name
                if est.customer and est.customer.party
                else None
            )
            sales_order_ids = list(
                SalesOrder.objects.filter(tenant=tenant, source_estimate_id=est.id)
                .values_list('id', flat=True)
            )
            cards.append({
                'id': est.id,
                'number': est.estimate_number,
                'entity_type': 'estimate',
                'customer_name': customer_name,
                'vendor_name': None,
                'total_value': _val(est.total_amount),
                'status': est.status,
                'age_days': _age(est),
                'created_at': est.created_at.isoformat(),
                'links': {
                    'design_request_id': est.design_request_id,
                    'sales_order_ids': sales_order_ids,
                },
            })

        return {
            'stage': 'estimate',
            'label': 'Estimate',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ── 3. Sales Orders ─────────────────────────────────────────────────────
    def stage_sales_order():
        from django.db.models import Sum as _Sum, F
        active_statuses = ['draft', 'pending_approval', 'confirmed', 'scheduled', 'picking']
        qs = SalesOrder.objects.filter(tenant=tenant, status__in=active_statuses)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        qs = _date_filters(qs)
        qs = qs.select_related('customer__party')

        total_count = qs.count()
        # SalesOrder has no total_amount field — compute from lines
        total_value = qs.aggregate(
            v=_Sum(F('lines__quantity_ordered') * F('lines__unit_price'))
        )['v']
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': _val(total_value),
            'avg_days_in_stage': avg_days,
        }

        # Annotate each SO with computed line total
        card_qs = qs.annotate(
            computed_total=_Sum(F('lines__quantity_ordered') * F('lines__unit_price'))
        ).order_by('-created_at')[:20]

        cards = []
        for so in card_qs:
            customer_name = (
                so.customer.party.display_name
                if so.customer and so.customer.party
                else None
            )
            shipment_ids = list(
                ShipmentLine.objects.filter(tenant=tenant, sales_order_id=so.id)
                .values_list('shipment_id', flat=True)
                .distinct()
            )
            invoice_ids = list(
                Invoice.objects.filter(tenant=tenant, sales_order_id=so.id)
                .values_list('id', flat=True)
            )
            cards.append({
                'id': so.id,
                'number': so.order_number,
                'entity_type': 'sales_order',
                'customer_name': customer_name,
                'vendor_name': None,
                'total_value': _val(so.computed_total),
                'status': so.status,
                'age_days': _age(so),
                'created_at': so.created_at.isoformat(),
                'links': {
                    'source_estimate_id': so.source_estimate_id,
                    'shipment_ids': shipment_ids,
                    'invoice_ids': invoice_ids,
                },
            })

        return {
            'stage': 'sales_order',
            'label': 'Sales Order',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ── 4. Shipments ────────────────────────────────────────────────────────
    def stage_shipment():
        active_statuses = ['planned', 'loading', 'in_transit']
        qs = Shipment.objects.filter(tenant=tenant, status__in=active_statuses)
        qs = _date_filters(qs)

        # Filter by customer_id via ShipmentLine → SalesOrder
        if customer_id:
            shipment_ids_for_customer = (
                ShipmentLine.objects.filter(
                    tenant=tenant,
                    sales_order__customer_id=customer_id,
                )
                .values_list('shipment_id', flat=True)
                .distinct()
            )
            qs = qs.filter(id__in=shipment_ids_for_customer)

        total_count = qs.count()
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': None,
            'avg_days_in_stage': avg_days,
        }

        cards = []
        for s in qs.order_by('-created_at')[:20]:
            # Resolve customer name from first ShipmentLine
            first_line = (
                ShipmentLine.objects.filter(tenant=tenant, shipment_id=s.id)
                .select_related('sales_order__customer__party')
                .first()
            )
            customer_name = None
            if first_line and first_line.sales_order and first_line.sales_order.customer:
                party = first_line.sales_order.customer.party
                customer_name = party.display_name if party else None

            sales_order_ids = list(
                ShipmentLine.objects.filter(tenant=tenant, shipment_id=s.id)
                .values_list('sales_order_id', flat=True)
                .distinct()
            )
            invoice_ids = list(
                Invoice.objects.filter(tenant=tenant, shipment_id=s.id)
                .values_list('id', flat=True)
            )
            cards.append({
                'id': s.id,
                'number': s.shipment_number,
                'entity_type': 'shipment',
                'customer_name': customer_name,
                'vendor_name': None,
                'total_value': None,
                'status': s.status,
                'age_days': _age(s),
                'created_at': s.created_at.isoformat(),
                'links': {
                    'sales_order_ids': sales_order_ids,
                    'invoice_ids': invoice_ids,
                },
            })

        return {
            'stage': 'shipment',
            'label': 'Shipment',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ── 5. Invoices ─────────────────────────────────────────────────────────
    def stage_invoice():
        active_statuses = ['draft', 'posted', 'sent', 'partial', 'overdue']
        qs = Invoice.objects.filter(tenant=tenant, status__in=active_statuses)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        qs = _date_filters(qs)
        qs = qs.select_related('customer__party')

        total_count = qs.count()
        from django.db.models import Sum as _Sum
        total_value = qs.aggregate(v=_Sum('total_amount'))['v']
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': _val(total_value),
            'avg_days_in_stage': avg_days,
        }

        cards = []
        for inv in qs.order_by('-created_at')[:20]:
            customer_name = (
                inv.customer.party.display_name
                if inv.customer and inv.customer.party
                else None
            )
            payment_ids = list(
                PaymentApplication.objects.filter(tenant=tenant, invoice_id=inv.id)
                .values_list('payment_id', flat=True)
                .distinct()
            )
            cards.append({
                'id': inv.id,
                'number': inv.invoice_number,
                'entity_type': 'invoice',
                'customer_name': customer_name,
                'vendor_name': None,
                'total_value': _val(inv.total_amount),
                'status': inv.status,
                'age_days': _age(inv),
                'created_at': inv.created_at.isoformat(),
                'links': {
                    'sales_order_id': inv.sales_order_id,
                    'shipment_id': inv.shipment_id,
                    'payment_ids': payment_ids,
                },
            })

        return {
            'stage': 'invoice',
            'label': 'Invoice',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ── 6. Customer Payments ─────────────────────────────────────────────────
    def stage_payment():
        active_statuses = ['draft', 'posted']
        qs = CustomerPayment.objects.filter(tenant=tenant, status__in=active_statuses)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        qs = _date_filters(qs)
        qs = qs.select_related('customer__party')

        total_count = qs.count()
        from django.db.models import Sum as _Sum
        total_value = qs.aggregate(v=_Sum('amount'))['v']
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': _val(total_value),
            'avg_days_in_stage': avg_days,
        }

        cards = []
        for cp in qs.order_by('-created_at')[:20]:
            customer_name = (
                cp.customer.party.display_name
                if cp.customer and cp.customer.party
                else None
            )
            invoice_ids = list(
                PaymentApplication.objects.filter(tenant=tenant, payment_id=cp.id)
                .values_list('invoice_id', flat=True)
                .distinct()
            )
            cards.append({
                'id': cp.id,
                'number': cp.payment_number,
                'entity_type': 'customer_payment',
                'customer_name': customer_name,
                'vendor_name': None,
                'total_value': _val(cp.amount),
                'status': cp.status,
                'age_days': _age(cp),
                'created_at': cp.created_at.isoformat(),
                'links': {'invoice_ids': invoice_ids},
            })

        return {
            'stage': 'payment',
            'label': 'Payment',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ── 7. RFQs ─────────────────────────────────────────────────────────────
    def stage_rfq():
        active_statuses = ['draft', 'sent', 'received']
        qs = RFQ.objects.filter(tenant=tenant, status__in=active_statuses)
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        qs = _date_filters(qs)
        qs = qs.select_related('vendor__party')

        total_count = qs.count()
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': None,
            'avg_days_in_stage': avg_days,
        }

        cards = []
        for rfq in qs.order_by('-created_at')[:20]:
            vendor_name = (
                rfq.vendor.party.display_name
                if rfq.vendor and rfq.vendor.party
                else None
            )
            purchase_order_ids = list(
                PurchaseOrder.objects.filter(tenant=tenant, source_rfq_id=rfq.id)
                .values_list('id', flat=True)
            )
            cards.append({
                'id': rfq.id,
                'number': rfq.rfq_number,
                'entity_type': 'rfq',
                'customer_name': None,
                'vendor_name': vendor_name,
                'total_value': None,
                'status': rfq.status,
                'age_days': _age(rfq),
                'created_at': rfq.created_at.isoformat(),
                'links': {'purchase_order_ids': purchase_order_ids},
            })

        return {
            'stage': 'rfq',
            'label': 'RFQ',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ── 8. Purchase Orders ──────────────────────────────────────────────────
    def stage_purchase_order():
        from django.db.models import Sum as _Sum, F
        active_statuses = ['draft', 'pending_approval', 'confirmed', 'scheduled', 'picking']
        qs = PurchaseOrder.objects.filter(tenant=tenant, status__in=active_statuses)
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        qs = _date_filters(qs)
        qs = qs.select_related('vendor__party')

        total_count = qs.count()
        # PurchaseOrder has no total_amount field — compute from lines
        total_value = qs.aggregate(
            v=_Sum(F('lines__quantity_ordered') * F('lines__unit_cost'))
        )['v']
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': _val(total_value),
            'avg_days_in_stage': avg_days,
        }

        # Annotate each PO with computed line total
        card_qs = qs.annotate(
            computed_total=_Sum(F('lines__quantity_ordered') * F('lines__unit_cost'))
        ).order_by('-created_at')[:20]

        cards = []
        for po in card_qs:
            vendor_name = (
                po.vendor.party.display_name
                if po.vendor and po.vendor.party
                else None
            )
            inventory_lot_ids = list(
                InventoryLot.objects.filter(tenant=tenant, purchase_order_id=po.id)
                .values_list('id', flat=True)
            )
            vendor_bill_ids = list(
                VendorBill.objects.filter(tenant=tenant, purchase_order_id=po.id)
                .values_list('id', flat=True)
            )
            cards.append({
                'id': po.id,
                'number': po.po_number,
                'entity_type': 'purchase_order',
                'customer_name': None,
                'vendor_name': vendor_name,
                'total_value': _val(po.computed_total),
                'status': po.status,
                'age_days': _age(po),
                'created_at': po.created_at.isoformat(),
                'links': {
                    'source_rfq_id': po.source_rfq_id,
                    'inventory_lot_ids': inventory_lot_ids,
                    'vendor_bill_ids': vendor_bill_ids,
                },
            })

        return {
            'stage': 'purchase_order',
            'label': 'Purchase Order',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ── 9. Receiving (InventoryLot) ──────────────────────────────────────────
    def stage_receiving():
        # InventoryLot has no status field — only show recent (last 30 days)
        cutoff = today - timedelta(days=30)
        qs = InventoryLot.objects.filter(tenant=tenant, created_at__date__gte=cutoff)
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        qs = _date_filters(qs)
        qs = qs.select_related('vendor__party', 'purchase_order__vendor__party')

        total_count = qs.count()
        from django.db.models import Sum as _Sum
        total_value = qs.aggregate(v=_Sum('total_quantity'))['v']
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': _val(total_value),
            'avg_days_in_stage': avg_days,
        }

        cards = []
        for lot in qs.order_by('-created_at')[:20]:
            # Resolve vendor name: prefer direct vendor FK, fall back to PO vendor
            vendor_name = None
            if lot.vendor and lot.vendor.party:
                vendor_name = lot.vendor.party.display_name
            elif lot.purchase_order and lot.purchase_order.vendor and lot.purchase_order.vendor.party:
                vendor_name = lot.purchase_order.vendor.party.display_name

            cards.append({
                'id': lot.id,
                'number': lot.lot_number,
                'entity_type': 'inventory_lot',
                'customer_name': None,
                'vendor_name': vendor_name,
                'total_value': _val(lot.total_quantity),
                'status': 'received',
                'age_days': _age(lot),
                'created_at': lot.created_at.isoformat(),
                'links': {
                    'purchase_order_id': lot.purchase_order_id,
                    'vendor_id': lot.vendor_id,
                },
            })

        return {
            'stage': 'receiving',
            'label': 'Receiving',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ── 10. Vendor Bills ─────────────────────────────────────────────────────
    def stage_vendor_bill():
        active_statuses = ['draft', 'posted', 'partial']
        qs = VendorBill.objects.filter(tenant=tenant, status__in=active_statuses)
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        qs = _date_filters(qs)
        qs = qs.select_related('vendor__party')

        total_count = qs.count()
        from django.db.models import Sum as _Sum
        total_value = qs.aggregate(v=_Sum('total_amount'))['v']
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': _val(total_value),
            'avg_days_in_stage': avg_days,
        }

        cards = []
        for vb in qs.order_by('-created_at')[:20]:
            vendor_name = (
                vb.vendor.party.display_name
                if vb.vendor and vb.vendor.party
                else None
            )
            bill_payment_ids = list(
                BillPayment.objects.filter(tenant=tenant, bill_id=vb.id)
                .values_list('id', flat=True)
            )
            cards.append({
                'id': vb.id,
                'number': vb.bill_number,
                'entity_type': 'vendor_bill',
                'customer_name': None,
                'vendor_name': vendor_name,
                'total_value': _val(vb.total_amount),
                'status': vb.status,
                'age_days': _age(vb),
                'created_at': vb.created_at.isoformat(),
                'links': {
                    'purchase_order_id': vb.purchase_order_id,
                    'bill_payment_ids': bill_payment_ids,
                },
            })

        return {
            'stage': 'vendor_bill',
            'label': 'Vendor Bill',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ── 11. Bill Payments ────────────────────────────────────────────────────
    def stage_bill_payment():
        # BillPayment has no status field — only show recent (last 30 days)
        cutoff = today - timedelta(days=30)
        qs = BillPayment.objects.filter(tenant=tenant, created_at__date__gte=cutoff)
        if vendor_id:
            qs = qs.filter(bill__vendor_id=vendor_id)
        qs = _date_filters(qs)
        qs = qs.select_related('bill__vendor__party')

        total_count = qs.count()
        from django.db.models import Sum as _Sum
        total_value = qs.aggregate(v=_Sum('amount'))['v']
        avg_days = _avg_age(qs)
        kpi = {
            'count': total_count,
            'total_value': _val(total_value),
            'avg_days_in_stage': avg_days,
        }

        cards = []
        for bp in qs.order_by('-created_at')[:20]:
            vendor_name = None
            if bp.bill and bp.bill.vendor and bp.bill.vendor.party:
                vendor_name = bp.bill.vendor.party.display_name

            cards.append({
                'id': bp.id,
                'number': f"BP-{bp.id}",
                'entity_type': 'bill_payment',
                'customer_name': None,
                'vendor_name': vendor_name,
                'total_value': _val(bp.amount),
                'status': 'paid',
                'age_days': _age(bp),
                'created_at': bp.created_at.isoformat(),
                'links': {
                    'vendor_bill_id': bp.bill_id,
                },
            })

        return {
            'stage': 'bill_payment',
            'label': 'Bill Payment',
            'kpi': kpi,
            'cards': cards,
            'total_count': total_count,
        }

    # ─── ASSEMBLE RESULT ─────────────────────────────────────────────────────

    customer_track = [
        stage_design_request(),
        stage_estimate(),
        stage_sales_order(),
        stage_shipment(),
        stage_invoice(),
        stage_payment(),
    ]

    vendor_track = [
        stage_rfq(),
        stage_purchase_order(),
        stage_receiving(),
        stage_vendor_bill(),
        stage_bill_payment(),
    ]

    return {
        'customer_track': customer_track,
        'vendor_track': vendor_track,
    }
