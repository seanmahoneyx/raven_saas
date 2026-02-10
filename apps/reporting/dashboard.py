# apps/reporting/dashboard.py
"""
Dashboard aggregation service.

Provides a single-call endpoint for the executive dashboard,
aggregating data from Sales, Invoicing, and Inventory.
"""
from datetime import date, timedelta
from decimal import Decimal
from django.db.models import Sum, Count, F, Q
from django.utils import timezone


def get_dashboard_stats(tenant):
    """
    Aggregate dashboard statistics for a tenant.

    Returns dict with kpis, charts, recent_activity, low_stock_items.
    """
    from apps.invoicing.models import Invoice
    from apps.orders.models import SalesOrder
    from apps.inventory.models import InventoryBalance
    from apps.shipping.models import Shipment
    from apps.items.models import Item

    today = timezone.now().date()
    thirty_days_ago = today - timedelta(days=30)
    seven_days_ago = today - timedelta(days=7)

    # ─── KPI CARDS ──────────────────────────────────────────────────────────

    # Revenue today: sum of invoices created today
    revenue_today = Invoice.objects.filter(
        tenant=tenant,
        invoice_date=today,
        status__in=['posted', 'sent', 'paid', 'partial'],
    ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')

    # Revenue this week (for trend comparison)
    revenue_this_week = Invoice.objects.filter(
        tenant=tenant,
        invoice_date__gte=seven_days_ago,
        status__in=['posted', 'sent', 'paid', 'partial'],
    ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')

    # Revenue previous week (for trend %)
    fourteen_days_ago = today - timedelta(days=14)
    revenue_last_week = Invoice.objects.filter(
        tenant=tenant,
        invoice_date__gte=fourteen_days_ago,
        invoice_date__lt=seven_days_ago,
        status__in=['posted', 'sent', 'paid', 'partial'],
    ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')

    # Revenue trend percentage
    if revenue_last_week > 0:
        revenue_trend = round(float((revenue_this_week - revenue_last_week) / revenue_last_week * 100), 1)
    else:
        revenue_trend = 0

    # Open orders: SOs with status confirmed, scheduled, picking
    open_orders_count = SalesOrder.objects.filter(
        tenant=tenant,
        status__in=['confirmed', 'scheduled', 'picking'],
    ).count()

    # Open orders last week for trend
    # We can't easily compare "count last week" so just show the count

    # Low stock: InventoryBalance where on_hand <= 10 and on_hand > 0
    # Since Item model has no reorder_level, we use a threshold of available <= 0
    # (allocated >= on_hand means nothing available to sell)
    low_stock_count = InventoryBalance.objects.filter(
        tenant=tenant,
        on_hand__gt=0,
    ).filter(
        allocated__gte=F('on_hand')
    ).count()

    # Also count items with zero on_hand that have had activity
    zero_stock_count = InventoryBalance.objects.filter(
        tenant=tenant,
        on_hand__lte=0,
    ).count()

    total_low_stock = low_stock_count + zero_stock_count

    # Overdue invoices: unpaid with due_date < today
    overdue_invoices_data = Invoice.objects.filter(
        tenant=tenant,
        status__in=['posted', 'sent', 'partial', 'overdue'],
        due_date__lt=today,
    ).aggregate(
        total=Sum(F('total_amount') - F('amount_paid')),
        count=Count('id'),
    )
    overdue_amount = overdue_invoices_data['total'] or Decimal('0.00')
    overdue_count = overdue_invoices_data['count'] or 0

    kpis = {
        'revenue_today': str(revenue_today),
        'revenue_trend': revenue_trend,
        'open_orders_count': open_orders_count,
        'low_stock_count': total_low_stock,
        'overdue_invoices_amount': str(overdue_amount),
        'overdue_invoices_count': overdue_count,
    }

    # ─── CHARTS ─────────────────────────────────────────────────────────────

    # Sales trend: daily revenue for last 30 days
    sales_trend_qs = Invoice.objects.filter(
        tenant=tenant,
        invoice_date__gte=thirty_days_ago,
        status__in=['posted', 'sent', 'paid', 'partial'],
    ).values(
        'invoice_date'
    ).annotate(
        amount=Sum('total_amount')
    ).order_by('invoice_date')

    # Fill in missing days with 0
    sales_trend = []
    sales_by_day = {entry['invoice_date']: entry['amount'] for entry in sales_trend_qs}
    for i in range(30):
        d = thirty_days_ago + timedelta(days=i)
        sales_trend.append({
            'date': d.isoformat(),
            'amount': str(sales_by_day.get(d, Decimal('0.00'))),
        })

    # Top 5 items by revenue (last 30 days)
    from apps.invoicing.models import InvoiceLine
    top_items = list(
        InvoiceLine.objects.filter(
            tenant=tenant,
            invoice__invoice_date__gte=thirty_days_ago,
            invoice__status__in=['posted', 'sent', 'paid', 'partial'],
        ).values(
            sku=F('item__sku'),
            name=F('item__name'),
        ).annotate(
            revenue=Sum('line_total')
        ).order_by('-revenue')[:5]
    )
    # Convert Decimal to str for JSON
    for item in top_items:
        item['revenue'] = str(item['revenue'])

    charts = {
        'sales_trend': sales_trend,
        'top_items': top_items,
    }

    # ─── LOW STOCK ITEMS (for table) ────────────────────────────────────────

    low_stock_items = list(
        InventoryBalance.objects.filter(
            tenant=tenant,
        ).filter(
            Q(on_hand__lte=0) | Q(allocated__gte=F('on_hand'))
        ).select_related('item', 'warehouse').values(
            sku=F('item__sku'),
            item_name=F('item__name'),
            warehouse_code=F('warehouse__code'),
            on_hand_qty=F('on_hand'),
            allocated_qty=F('allocated'),
            on_order_qty=F('on_order'),
        ).order_by('on_hand')[:10]
    )

    # ─── RECENT ACTIVITY ────────────────────────────────────────────────────
    # Combine recent orders, invoices, and shipments into a unified activity feed

    recent_activity = []

    # Recent sales orders (last 10)
    recent_orders = SalesOrder.objects.filter(
        tenant=tenant,
    ).select_related('customer__party').order_by('-created_at')[:5]

    for order in recent_orders:
        customer_name = order.customer.party.display_name if order.customer and order.customer.party else 'Unknown'
        recent_activity.append({
            'type': 'order',
            'icon': 'shopping-cart',
            'message': f"{order.order_number} ({order.get_status_display()}) — {customer_name}",
            'timestamp': order.created_at.isoformat(),
        })

    # Recent invoices (last 5)
    recent_invoices = Invoice.objects.filter(
        tenant=tenant,
    ).select_related('customer__party').order_by('-created_at')[:5]

    for inv in recent_invoices:
        customer_name = inv.customer.party.display_name if inv.customer and inv.customer.party else 'Unknown'
        recent_activity.append({
            'type': 'invoice',
            'icon': 'file-text',
            'message': f"{inv.invoice_number} ${inv.total_amount} — {customer_name}",
            'timestamp': inv.created_at.isoformat(),
        })

    # Sort all activity by timestamp descending, take top 10
    recent_activity.sort(key=lambda x: x['timestamp'], reverse=True)
    recent_activity = recent_activity[:10]

    return {
        'kpis': kpis,
        'charts': charts,
        'low_stock_items': low_stock_items,
        'recent_activity': recent_activity,
    }
