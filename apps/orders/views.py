# apps/orders/views.py
"""
Views for order management.

Provides list and detail views for purchase orders and sales orders.
"""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView, CreateView
from django.views import View
from django.db.models import Q, Count, Sum
from django.urls import reverse_lazy
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, HttpResponse
from django.db import transaction
from decimal import Decimal
from .models import PurchaseOrder, SalesOrder, PurchaseOrderLine, SalesOrderLine
from .forms import (
    PurchaseOrderForm, PurchaseOrderLineFormSet,
    SalesOrderForm, SalesOrderLineFormSet
)
from apps.parties.models import Vendor, Customer, Location
from apps.items.models import Item, UnitOfMeasure
from shared.models import get_current_tenant
import datetime


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

class PurchaseOrderCreateView(LoginRequiredMixin, CreateView):
    """
    Create view for purchase orders with line items.
    Uses formsets for dynamic line item management.
    """
    model = PurchaseOrder
    form_class = PurchaseOrderForm
    template_name = 'orders/purchase_order_create.html'
    
    def get_success_url(self):
        return reverse_lazy('orders:purchase_order_detail', kwargs={'pk': self.object.pk})
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        if self.request.POST:
            context['formset'] = PurchaseOrderLineFormSet(self.request.POST, instance=self.object)
        else:
            context['formset'] = PurchaseOrderLineFormSet(instance=self.object)
        return context
    
    def form_valid(self, form):
        context = self.get_context_data()
        formset = context['formset']
        
        with transaction.atomic():
            # Auto-generate PO number if not provided
            if not form.cleaned_data.get('po_number'):
                tenant = get_current_tenant()
                last_po = PurchaseOrder.objects.filter(
                    tenant=tenant
                ).order_by('-id').first()
                if last_po and last_po.po_number.isdigit():
                    form.instance.po_number = str(int(last_po.po_number) + 1).zfill(6)
                else:
                    form.instance.po_number = '000001'
            
            self.object = form.save()
            
            if formset.is_valid():
                formset.instance = self.object
                formset.save()
            else:
                return self.form_invalid(form)
        
        return super().form_valid(form)


class SalesOrderCreateView(LoginRequiredMixin, CreateView):
    """
    Create view for sales orders with line items.
    Uses formsets for dynamic line item management.
    """
    model = SalesOrder
    form_class = SalesOrderForm
    template_name = 'orders/sales_order_create.html'
    
    def get_success_url(self):
        return reverse_lazy('orders:sales_order_detail', kwargs={'pk': self.object.pk})
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        if self.request.POST:
            context['formset'] = SalesOrderLineFormSet(self.request.POST, instance=self.object)
        else:
            context['formset'] = SalesOrderLineFormSet(instance=self.object)
        return context
    
    def form_valid(self, form):
        context = self.get_context_data()
        formset = context['formset']
        
        with transaction.atomic():
            # Auto-generate order number if not provided
            if not form.cleaned_data.get('order_number'):
                tenant = get_current_tenant()
                last_so = SalesOrder.objects.filter(
                    tenant=tenant
                ).order_by('-id').first()
                if last_so and last_so.order_number.isdigit():
                    form.instance.order_number = str(int(last_so.order_number) + 1).zfill(6)
                else:
                    form.instance.order_number = '000001'
            
            self.object = form.save()
            
            if formset.is_valid():
                formset.instance = self.object
                formset.save()
            else:
                return self.form_invalid(form)
        
        return super().form_valid(form)


# HTMX Endpoints for dynamic functionality

class VendorLocationsView(LoginRequiredMixin, View):
    """
    HTMX endpoint to get vendor locations for ship_to selection.
    """
    def get(self, request):
        vendor_id = request.GET.get('vendor')
        if not vendor_id:
            return HttpResponse('<option value="">Select a location</option>')
        
        vendor = get_object_or_404(Vendor, pk=vendor_id)
        locations = Location.objects.filter(party=vendor.party)
        
        html = '<option value="">Select a location</option>'
        for location in locations:
            html += f'<option value="{location.pk}">{location.name}</option>'
        
        return HttpResponse(html)


class CustomerLocationsView(LoginRequiredMixin, View):
    """
    HTMX endpoint to get customer locations for ship_to/bill_to selection.
    """
    def get(self, request):
        customer_id = request.GET.get('customer')
        if not customer_id:
            return HttpResponse('<option value="">Select a location</option>')
        
        customer = get_object_or_404(Customer, pk=customer_id)
        locations = Location.objects.filter(party=customer.party)
        
        html = '<option value="">Select a location</option>'
        for location in locations:
            html += f'<option value="{location.pk}">{location.name}</option>'
        
        return HttpResponse(html)


class ItemUOMsView(LoginRequiredMixin, View):
    """
    HTMX endpoint to get item UOMs.
    """
    def get(self, request):
        item_id = request.GET.get('item')
        if not item_id:
            return HttpResponse('<option value="">Select UOM</option>')
        
        item = get_object_or_404(Item, pk=item_id)
        uoms = UnitOfMeasure.objects.all()  # In production, filter by item's allowed UOMs
        
        html = '<option value="">Select UOM</option>'
        for uom in uoms:
            html += f'<option value="{uom.pk}">{uom.name} ({uom.code})</option>'
        
        return HttpResponse(html)


class CalculateLineView(LoginRequiredMixin, View):
    """
    HTMX endpoint to calculate line total.
    """
    def post(self, request):
        quantity = request.POST.get('quantity_ordered', '0')
        price = request.POST.get('unit_cost') or request.POST.get('unit_price', '0')
        
        try:
            quantity = Decimal(quantity)
            price = Decimal(price)
            total = quantity * price
            return HttpResponse(f'${total:.2f}')
        except (ValueError, TypeError, Decimal.InvalidOperation):
            return HttpResponse('$0.00')
