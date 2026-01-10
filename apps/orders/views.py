# apps/orders/views.py
"""
Views for order management.

Provides list and detail views for purchase orders and sales orders.
"""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView
from django.db.models import Q, Count, Sum
from .models import PurchaseOrder, SalesOrder


class PurchaseOrderListView(LoginRequiredMixin, ListView):
    """
    List view for purchase orders with filtering and search.

    Features:
    - Search by PO number, vendor name
    - Filter by status, scheduled date
    - Sort by various fields
    - Pagination
    """
    model = PurchaseOrder
    template_name = 'orders/purchase_order_list.html'
    context_object_name = 'orders'
    paginate_by = 25

    def get_queryset(self):
        """
        Filter and search purchase orders.
        Automatically filtered by tenant via TenantManager.
        """
        queryset = PurchaseOrder.objects.select_related(
            'vendor__party',
            'ship_to',
            'scheduled_truck'
        ).prefetch_related('lines').annotate(
            line_count=Count('lines'),
            total_amount=Sum('lines__quantity_ordered')
        )

        # Search
        search = self.request.GET.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(po_number__icontains=search) |
                Q(vendor__party__display_name__icontains=search) |
                Q(notes__icontains=search)
            )

        # Status filter
        status = self.request.GET.get('status', '').strip()
        if status:
            queryset = queryset.filter(status=status)

        # Scheduled/Unscheduled filter
        scheduled_filter = self.request.GET.get('scheduled', '').strip()
        if scheduled_filter == 'yes':
            queryset = queryset.filter(scheduled_date__isnull=False)
        elif scheduled_filter == 'no':
            queryset = queryset.filter(scheduled_date__isnull=True)

        # Date range filter
        date_from = self.request.GET.get('date_from', '').strip()
        if date_from:
            queryset = queryset.filter(order_date__gte=date_from)

        date_to = self.request.GET.get('date_to', '').strip()
        if date_to:
            queryset = queryset.filter(order_date__lte=date_to)

        # Sorting
        sort = self.request.GET.get('sort', '-order_date')
        valid_sorts = [
            'po_number', '-po_number',
            'order_date', '-order_date',
            'scheduled_date', '-scheduled_date',
            'status', '-status',
            'vendor__party__display_name', '-vendor__party__display_name',
        ]
        if sort in valid_sorts:
            queryset = queryset.order_by(sort)
        else:
            queryset = queryset.order_by('-order_date')

        return queryset

    def get_context_data(self, **kwargs):
        """Add filter context for template."""
        context = super().get_context_data(**kwargs)
        context['search'] = self.request.GET.get('search', '')
        context['status_filter'] = self.request.GET.get('status', '')
        context['scheduled_filter'] = self.request.GET.get('scheduled', '')
        context['date_from'] = self.request.GET.get('date_from', '')
        context['date_to'] = self.request.GET.get('date_to', '')
        context['sort'] = self.request.GET.get('sort', '-order_date')
        context['status_choices'] = PurchaseOrder.STATUS_CHOICES
        return context


class PurchaseOrderDetailView(LoginRequiredMixin, DetailView):
    """
    Detail view for a single purchase order.

    Shows complete order information including all line items.
    """
    model = PurchaseOrder
    template_name = 'orders/purchase_order_detail.html'
    context_object_name = 'order'

    def get_queryset(self):
        """Include related data for efficiency."""
        return PurchaseOrder.objects.select_related(
            'vendor__party',
            'ship_to',
            'scheduled_truck'
        ).prefetch_related(
            'lines__item',
            'lines__uom'
        )


class SalesOrderListView(LoginRequiredMixin, ListView):
    """
    List view for sales orders with filtering and search.

    Features:
    - Search by order number, customer name
    - Filter by status, scheduled date
    - Sort by various fields
    - Pagination
    """
    model = SalesOrder
    template_name = 'orders/sales_order_list.html'
    context_object_name = 'orders'
    paginate_by = 25

    def get_queryset(self):
        """
        Filter and search sales orders.
        Automatically filtered by tenant via TenantManager.
        """
        queryset = SalesOrder.objects.select_related(
            'customer__party',
            'ship_to',
            'bill_to',
            'scheduled_truck'
        ).prefetch_related('lines').annotate(
            line_count=Count('lines'),
            total_amount=Sum('lines__quantity_ordered')
        )

        # Search
        search = self.request.GET.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(order_number__icontains=search) |
                Q(customer__party__display_name__icontains=search) |
                Q(customer_po__icontains=search) |
                Q(notes__icontains=search)
            )

        # Status filter
        status = self.request.GET.get('status', '').strip()
        if status:
            queryset = queryset.filter(status=status)

        # Scheduled/Unscheduled filter
        scheduled_filter = self.request.GET.get('scheduled', '').strip()
        if scheduled_filter == 'yes':
            queryset = queryset.filter(scheduled_date__isnull=False)
        elif scheduled_filter == 'no':
            queryset = queryset.filter(scheduled_date__isnull=True)

        # Date range filter
        date_from = self.request.GET.get('date_from', '').strip()
        if date_from:
            queryset = queryset.filter(order_date__gte=date_from)

        date_to = self.request.GET.get('date_to', '').strip()
        if date_to:
            queryset = queryset.filter(order_date__lte=date_to)

        # Sorting
        sort = self.request.GET.get('sort', '-order_date')
        valid_sorts = [
            'order_number', '-order_number',
            'order_date', '-order_date',
            'scheduled_date', '-scheduled_date',
            'status', '-status',
            'customer__party__display_name', '-customer__party__display_name',
        ]
        if sort in valid_sorts:
            queryset = queryset.order_by(sort)
        else:
            queryset = queryset.order_by('-order_date')

        return queryset

    def get_context_data(self, **kwargs):
        """Add filter context for template."""
        context = super().get_context_data(**kwargs)
        context['search'] = self.request.GET.get('search', '')
        context['status_filter'] = self.request.GET.get('status', '')
        context['scheduled_filter'] = self.request.GET.get('scheduled', '')
        context['date_from'] = self.request.GET.get('date_from', '')
        context['date_to'] = self.request.GET.get('date_to', '')
        context['sort'] = self.request.GET.get('sort', '-order_date')
        context['status_choices'] = SalesOrder.STATUS_CHOICES
        return context


class SalesOrderDetailView(LoginRequiredMixin, DetailView):
    """
    Detail view for a single sales order.

    Shows complete order information including all line items.
    """
    model = SalesOrder
    template_name = 'orders/sales_order_detail.html'
    context_object_name = 'order'

    def get_queryset(self):
        """Include related data for efficiency."""
        return SalesOrder.objects.select_related(
            'customer__party',
            'ship_to',
            'bill_to',
            'scheduled_truck'
        ).prefetch_related(
            'lines__item',
            'lines__uom'
        )
