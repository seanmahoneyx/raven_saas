"""
Canned report queries using Django ORM aggregations.

All functions accept (tenant, start_date, end_date) and return dicts/lists
suitable for JSON serialization.
"""
from decimal import Decimal
from datetime import date, timedelta
from django.db.models import Sum, Count, Avg, F, Q, Min, Max, DecimalField
from django.db.models.functions import Coalesce


# ==================== SALES REPORTS ====================

def sales_by_customer(tenant, start_date, end_date):
    """Group by Customer -> Sum(Total Sales), Count(Orders)."""
    from apps.invoicing.models import Invoice

    rows = Invoice.objects.filter(
        tenant=tenant,
        invoice_date__range=[start_date, end_date],
        status__in=['posted', 'sent', 'partial', 'paid', 'overdue'],
    ).values(
        customer_code=F('customer__party__code'),
        customer_name=F('customer__party__display_name'),
    ).annotate(
        total_sales=Coalesce(Sum('total_amount'), Decimal('0'), output_field=DecimalField()),
        order_count=Count('id'),
    ).order_by('-total_sales')

    return list(rows)


def sales_by_item(tenant, start_date, end_date):
    """Group by Item -> Sum(Qty Sold), Sum(Revenue), Avg(Price)."""
    from apps.invoicing.models import InvoiceLine

    rows = InvoiceLine.objects.filter(
        invoice__tenant=tenant,
        invoice__invoice_date__range=[start_date, end_date],
        invoice__status__in=['posted', 'sent', 'partial', 'paid', 'overdue'],
    ).values(
        item_sku=F('item__sku'),
        item_name=F('item__name'),
    ).annotate(
        qty_sold=Coalesce(Sum('quantity'), 0),
        revenue=Coalesce(
            Sum(F('quantity') * F('unit_price')),
            Decimal('0'),
            output_field=DecimalField(),
        ),
        avg_price=Coalesce(Avg('unit_price'), Decimal('0'), output_field=DecimalField()),
    ).order_by('-revenue')

    return list(rows)


def backorder_report(tenant):
    """List all SO lines where order has confirmed/scheduled status but qty not fulfilled."""
    from apps.orders.models import SalesOrderLine

    rows = SalesOrderLine.objects.filter(
        tenant=tenant,
        sales_order__status__in=['confirmed', 'scheduled'],
    ).select_related(
        'sales_order',
        'sales_order__customer',
        'sales_order__customer__party',
        'item',
        'uom',
    ).order_by('sales_order__scheduled_date', 'sales_order__order_number')

    return [{
        'order_number': line.sales_order.order_number,
        'customer_name': line.sales_order.customer.party.display_name,
        'scheduled_date': str(line.sales_order.scheduled_date) if line.sales_order.scheduled_date else '',
        'item_sku': line.item.sku,
        'item_name': line.item.name,
        'qty_ordered': line.quantity_ordered,
        'uom': line.uom.code,
        'line_total': str(line.line_total),
    } for line in rows]


def open_order_detail(tenant):
    """All active sales orders sorted by scheduled date."""
    from apps.orders.models import SalesOrder

    orders = SalesOrder.objects.filter(
        tenant=tenant,
        status__in=['confirmed', 'scheduled', 'picking'],
    ).select_related(
        'customer',
        'customer__party',
    ).prefetch_related('lines').order_by('scheduled_date', 'order_number')

    return [{
        'order_number': o.order_number,
        'customer_name': o.customer.party.display_name,
        'status': o.status,
        'order_date': str(o.order_date),
        'scheduled_date': str(o.scheduled_date) if o.scheduled_date else '',
        'subtotal': str(o.subtotal),
        'num_lines': o.num_lines,
    } for o in orders]


# ==================== PURCHASING REPORTS ====================

def open_po_report(tenant):
    """List of all incoming stock sorted by expected_date."""
    from apps.orders.models import PurchaseOrder

    orders = PurchaseOrder.objects.filter(
        tenant=tenant,
        status__in=['confirmed', 'scheduled'],
    ).select_related(
        'vendor',
        'vendor__party',
    ).prefetch_related('lines').order_by('expected_date', 'po_number')

    return [{
        'po_number': po.po_number,
        'vendor_name': po.vendor.party.display_name,
        'status': po.status,
        'order_date': str(po.order_date),
        'expected_date': str(po.expected_date) if po.expected_date else '',
        'subtotal': str(po.subtotal),
        'num_lines': po.num_lines,
    } for po in orders]


def vendor_performance(tenant, start_date, end_date):
    """For each Vendor -> Count(Late Deliveries) / Count(Total Deliveries)."""
    from apps.orders.models import PurchaseOrder

    rows = PurchaseOrder.objects.filter(
        tenant=tenant,
        status='complete',
        order_date__range=[start_date, end_date],
    ).values(
        vendor_code=F('vendor__party__code'),
        vendor_name=F('vendor__party__display_name'),
    ).annotate(
        total_orders=Count('id'),
        late_orders=Count('id', filter=Q(
            scheduled_date__isnull=False,
            expected_date__isnull=False,
            scheduled_date__gt=F('expected_date'),
        )),
    ).order_by('vendor_name')

    result = []
    for row in rows:
        total = row['total_orders']
        late = row['late_orders']
        on_time_pct = round(((total - late) / total * 100), 1) if total > 0 else 0
        result.append({
            **row,
            'on_time_pct': on_time_pct,
        })
    return result


def purchase_history(tenant, start_date, end_date):
    """Items purchased with price variance over time."""
    from apps.orders.models import PurchaseOrderLine

    rows = PurchaseOrderLine.objects.filter(
        tenant=tenant,
        purchase_order__order_date__range=[start_date, end_date],
        purchase_order__status__in=['confirmed', 'scheduled', 'complete'],
    ).values(
        item_sku=F('item__sku'),
        item_name=F('item__name'),
    ).annotate(
        total_qty=Coalesce(Sum('quantity_ordered'), 0),
        total_cost=Coalesce(
            Sum(F('quantity_ordered') * F('unit_cost')),
            Decimal('0'),
            output_field=DecimalField(),
        ),
        avg_cost=Coalesce(Avg('unit_cost'), Decimal('0'), output_field=DecimalField()),
        min_cost=Min('unit_cost'),
        max_cost=Max('unit_cost'),
    ).order_by('-total_cost')

    result = []
    for row in rows:
        min_c = row['min_cost'] or Decimal('0')
        max_c = row['max_cost'] or Decimal('0')
        result.append({
            'item_sku': row['item_sku'],
            'item_name': row['item_name'],
            'total_qty': row['total_qty'],
            'total_cost': str(row['total_cost']),
            'avg_cost': str(row['avg_cost']),
            'min_cost': str(min_c),
            'max_cost': str(max_c),
            'variance': str(max_c - min_c),
        })
    return result


# ==================== WAREHOUSE & INVENTORY REPORTS ====================

def inventory_valuation(tenant):
    """List all items -> Qty * Cost = Total Value."""
    from apps.warehousing.models import StockQuant
    from apps.orders.models import PurchaseOrderLine

    # Get on-hand quantities by item
    quants = StockQuant.objects.filter(
        tenant=tenant,
        quantity__gt=0,
    ).values(
        item_sku=F('item__sku'),
        item_name=F('item__name'),
    ).annotate(
        qty_on_hand=Sum('quantity'),
    ).order_by('item_sku')

    # Get average cost per item from purchase history
    costs = PurchaseOrderLine.objects.filter(
        tenant=tenant,
    ).values('item__sku').annotate(
        latest_cost=Avg('unit_cost'),
    )
    cost_map = {c['item__sku']: c['latest_cost'] for c in costs}

    rows = []
    grand_total = Decimal('0')
    for q in quants:
        cost = cost_map.get(q['item_sku'], Decimal('0'))
        value = q['qty_on_hand'] * cost
        grand_total += value
        rows.append({
            'item_sku': q['item_sku'],
            'item_name': q['item_name'],
            'qty_on_hand': str(q['qty_on_hand']),
            'unit_cost': str(cost),
            'total_value': str(value),
        })

    return {'rows': rows, 'grand_total': str(grand_total)}


def stock_status(tenant):
    """Qty on Hand, Qty Reserved, Qty Available, Qty on Order per item."""
    from apps.warehousing.models import StockQuant
    from apps.orders.models import PurchaseOrderLine

    on_hand = StockQuant.objects.filter(
        tenant=tenant,
        quantity__gt=0,
    ).values(
        item_sku=F('item__sku'),
        item_name=F('item__name'),
    ).annotate(
        qty_on_hand=Sum('quantity'),
        qty_reserved=Sum('reserved_quantity'),
    ).order_by('item_sku')

    # Qty on order (open POs)
    on_order = PurchaseOrderLine.objects.filter(
        tenant=tenant,
        purchase_order__status__in=['confirmed', 'scheduled'],
    ).values(item_sku=F('item__sku')).annotate(
        qty_on_order=Sum('quantity_ordered'),
    )
    on_order_map = {r['item_sku']: r['qty_on_order'] for r in on_order}

    rows = []
    for r in on_hand:
        oh = r['qty_on_hand'] or 0
        res = r['qty_reserved'] or 0
        oo = on_order_map.get(r['item_sku'], 0)
        rows.append({
            'item_sku': r['item_sku'],
            'item_name': r['item_name'],
            'qty_on_hand': str(oh),
            'qty_reserved': str(res),
            'qty_available': str(oh - res),
            'qty_on_order': str(oo),
        })
    return rows


def low_stock_alert(tenant):
    """Items where Qty Available < Reorder Point."""
    from apps.warehousing.models import StockQuant
    from apps.items.models import Item

    items_with_reorder = Item.objects.filter(
        tenant=tenant,
        reorder_point__isnull=False,
        reorder_point__gt=0,
    )

    rows = []
    for item in items_with_reorder:
        quants = StockQuant.objects.filter(
            tenant=tenant, item=item,
        ).aggregate(
            on_hand=Coalesce(Sum('quantity'), Decimal('0')),
            reserved=Coalesce(Sum('reserved_quantity'), Decimal('0')),
        )
        available = (quants['on_hand'] or 0) - (quants['reserved'] or 0)
        if available < item.reorder_point:
            rows.append({
                'item_sku': item.sku,
                'item_name': item.name,
                'reorder_point': item.reorder_point,
                'qty_available': str(available),
                'shortage': str(item.reorder_point - available),
            })

    return sorted(rows, key=lambda x: float(x['shortage']), reverse=True)


def dead_stock(tenant, days=180):
    """Items with Qty > 0 but last sale > N days ago."""
    from apps.warehousing.models import StockQuant
    from apps.orders.models import SalesOrderLine

    cutoff = date.today() - timedelta(days=days)

    # Items with stock
    stocked = StockQuant.objects.filter(
        tenant=tenant, quantity__gt=0,
    ).values(
        'item_id',
        item_sku=F('item__sku'),
        item_name=F('item__name'),
    ).annotate(
        qty_on_hand=Sum('quantity'),
    )

    # Last sale date per item
    last_sales = SalesOrderLine.objects.filter(
        tenant=tenant,
    ).values('item_id').annotate(
        last_sale=Max('sales_order__order_date'),
    )
    sale_map = {r['item_id']: r['last_sale'] for r in last_sales}

    rows = []
    for item in stocked:
        last_sale = sale_map.get(item['item_id'])
        if last_sale is None or last_sale < cutoff:
            rows.append({
                'item_sku': item['item_sku'],
                'item_name': item['item_name'],
                'qty_on_hand': str(item['qty_on_hand']),
                'last_sale_date': str(last_sale) if last_sale else 'Never',
                'days_since_sale': (date.today() - last_sale).days if last_sale else 999,
            })

    return sorted(rows, key=lambda x: x['days_since_sale'], reverse=True)


# ==================== FINANCIAL REPORTS ====================

def sales_tax_liability(tenant, start_date, end_date):
    """Total Tax Collected by TaxZone."""
    from apps.invoicing.models import Invoice

    rows = Invoice.objects.filter(
        tenant=tenant,
        invoice_date__range=[start_date, end_date],
        status__in=['posted', 'sent', 'partial', 'paid', 'overdue'],
        tax_amount__gt=0,
    ).values(
        tax_zone_name=F('tax_zone__name'),
        tax_zone_rate=F('tax_zone__rate'),
    ).annotate(
        taxable_amount=Sum('subtotal'),
        tax_collected=Sum('tax_amount'),
        invoice_count=Count('id'),
    ).order_by('-tax_collected')

    return list(rows)


def gross_margin_report(tenant, start_date, end_date):
    """Sales - COGS for the selected period."""
    from apps.invoicing.models import Invoice, InvoiceLine
    from apps.orders.models import PurchaseOrderLine

    # Total sales
    sales = Invoice.objects.filter(
        tenant=tenant,
        invoice_date__range=[start_date, end_date],
        status__in=['posted', 'sent', 'partial', 'paid', 'overdue'],
    ).aggregate(
        total_sales=Coalesce(Sum('subtotal'), Decimal('0')),
        total_tax=Coalesce(Sum('tax_amount'), Decimal('0')),
    )

    # Estimate COGS from invoice lines * avg purchase cost
    line_items = InvoiceLine.objects.filter(
        invoice__tenant=tenant,
        invoice__invoice_date__range=[start_date, end_date],
        invoice__status__in=['posted', 'sent', 'partial', 'paid', 'overdue'],
    ).values('item_id').annotate(
        qty_sold=Sum('quantity'),
    )

    total_cogs = Decimal('0')
    for li in line_items:
        avg_cost = PurchaseOrderLine.objects.filter(
            tenant=tenant, item_id=li['item_id'],
        ).aggregate(avg=Coalesce(Avg('unit_cost'), Decimal('0')))['avg']
        total_cogs += avg_cost * li['qty_sold']

    total_sales = sales['total_sales']
    margin = total_sales - total_cogs
    margin_pct = (margin / total_sales * 100) if total_sales > 0 else Decimal('0')

    return {
        'total_sales': str(total_sales),
        'total_cogs': str(total_cogs),
        'gross_margin': str(margin),
        'margin_pct': str(round(margin_pct, 2)),
    }
