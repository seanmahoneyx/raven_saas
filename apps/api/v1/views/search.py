# apps/api/v1/views/search.py
"""Global search endpoint."""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q, Value, CharField
from drf_spectacular.utils import extend_schema, OpenApiParameter


@extend_schema(
    description="Global search across items, customers, orders, invoices",
    parameters=[
        OpenApiParameter(name='q', description='Search query', required=True, type=str),
    ],
    tags=["Search"]
)
class GlobalSearchView(APIView):
    """
    GET /api/v1/search/?q=...

    Searches across Items, Customers, SalesOrders, Invoices.
    Returns grouped results by category, max 5 per category.
    """

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if not q or len(q) < 2:
            return Response({'results': []})

        results = []

        # Items - search sku and name
        from apps.items.models import Item
        items = Item.objects.filter(
            Q(sku__icontains=q) | Q(name__icontains=q)
        )[:5]
        for item in items:
            results.append({
                'category': 'Items',
                'id': item.id,
                'title': item.name,
                'subtitle': item.sku,
                'url': f'/items/{item.id}',
            })

        # Customers - search party display_name and party name
        from apps.parties.models import Customer
        customers = Customer.objects.select_related('party').filter(
            Q(party__display_name__icontains=q) | Q(party__name__icontains=q)
        )[:5]
        for cust in customers:
            results.append({
                'category': 'Customers',
                'id': cust.id,
                'title': cust.party.display_name or cust.party.name,
                'subtitle': f'Customer #{cust.id}',
                'url': f'/parties?tab=customers&id={cust.id}',
            })

        # Sales Orders - search order_number
        from apps.orders.models import SalesOrder
        orders = SalesOrder.objects.select_related('customer__party').filter(
            Q(order_number__icontains=q)
        )[:5]
        for order in orders:
            customer_name = ''
            if order.customer and order.customer.party:
                customer_name = order.customer.party.display_name or ''
            results.append({
                'category': 'Sales Orders',
                'id': order.id,
                'title': order.order_number,
                'subtitle': customer_name,
                'url': f'/orders?tab=sales&id={order.id}',
            })

        # Invoices - search invoice_number
        from apps.invoicing.models import Invoice
        invoices = Invoice.objects.select_related('customer__party').filter(
            Q(invoice_number__icontains=q)
        )[:5]
        for inv in invoices:
            customer_name = ''
            if inv.customer and inv.customer.party:
                customer_name = inv.customer.party.display_name or ''
            results.append({
                'category': 'Invoices',
                'id': inv.id,
                'title': inv.invoice_number,
                'subtitle': customer_name,
                'url': f'/invoices?id={inv.id}',
            })

        return Response({'results': results})
