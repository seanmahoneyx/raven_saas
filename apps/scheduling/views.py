# apps/scheduling/views.py
"""
Schedulizer views using the new Order models.

This replaces the legacy scheduling/views.py with tenant-aware views
that use apps.orders.models.SalesOrder and PurchaseOrder.
"""
from django.shortcuts import render, get_object_or_404
from django.http import HttpResponse
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from datetime import date, timedelta, datetime
from itertools import chain
from operator import attrgetter

from apps.orders.models import SalesOrder, PurchaseOrder
from apps.parties.models import Truck
from shared.managers import get_current_tenant


class OrderWrapper:
    """
    Wrapper to provide consistent interface for templates.

    Maps new model fields to legacy template expectations:
    - order_type: 'SO' or 'PO'
    - number: order_number or po_number
    - customer/vendor: from the related party
    - num_pallets: computed from line items (sum of quantities)
    """
    def __init__(self, order):
        self._order = order

    def __getattr__(self, name):
        return getattr(self._order, name)

    @property
    def id(self):
        return self._order.id

    @property
    def order_type(self):
        if isinstance(self._order, SalesOrder):
            return 'SO'
        return 'PO'

    @property
    def number(self):
        if isinstance(self._order, SalesOrder):
            return self._order.order_number
        return self._order.po_number

    @property
    def customer(self):
        if isinstance(self._order, SalesOrder):
            return self._order.customer.party
        return None

    @property
    def vendor(self):
        if isinstance(self._order, PurchaseOrder):
            return self._order.vendor.party
        return None

    @property
    def num_pallets(self):
        """Sum quantities from line items."""
        if isinstance(self._order, SalesOrder):
            return sum(line.quantity_ordered for line in self._order.lines.all())
        return sum(line.quantity_ordered for line in self._order.lines.all())

    @property
    def status(self):
        return self._order.status

    @property
    def notes(self):
        return self._order.notes

    @property
    def scheduled_date(self):
        return self._order.scheduled_date

    @property
    def scheduled_truck(self):
        return self._order.scheduled_truck

    @property
    def is_unscheduled(self):
        return self._order.scheduled_date is None


def wrap_orders(orders):
    """Wrap a list of orders with OrderWrapper."""
    return [OrderWrapper(o) for o in orders]


@login_required
def schedulizer_dashboard(request):
    """
    Renders the Schedulizer Dashboard (Mon-Fri View).
    Uses the new SalesOrder and PurchaseOrder models.
    """
    anchor_date = date.today()
    if request.GET.get('date'):
        try:
            anchor_date = datetime.strptime(request.GET.get('date'), '%Y-%m-%d').date()
        except ValueError:
            pass

    # Anchor to the Sunday of 2 weeks ago to align the grid
    days_since_sunday = (anchor_date.weekday() + 1) % 7
    sunday_of_current_week = anchor_date - timedelta(days=days_since_sunday)
    start_date = sunday_of_current_week - timedelta(weeks=2)

    # Generate 8 Weeks, filtering for Mon-Fri (Days 1-5)
    weeks = []
    for w in range(8):
        week_days = []
        for d in range(1, 6):  # 1=Mon ... 5=Fri
            day_offset = (w * 7) + d
            week_days.append(start_date + timedelta(days=day_offset))
        weeks.append(week_days)

    # Fetch Data (tenant-scoped automatically via TenantManager)
    end_date = start_date + timedelta(weeks=8)

    scheduled_sales = SalesOrder.objects.filter(
        scheduled_date__gte=start_date,
        scheduled_date__lte=end_date
    ).select_related('customer__party', 'scheduled_truck').prefetch_related('lines')

    scheduled_purchases = PurchaseOrder.objects.filter(
        scheduled_date__gte=start_date,
        scheduled_date__lte=end_date
    ).select_related('vendor__party', 'scheduled_truck').prefetch_related('lines')

    scheduled_orders = wrap_orders(list(scheduled_sales) + list(scheduled_purchases))

    unscheduled_sales = SalesOrder.objects.filter(
        scheduled_date__isnull=True
    ).select_related('customer__party').prefetch_related('lines')

    unscheduled_purchases = PurchaseOrder.objects.filter(
        scheduled_date__isnull=True
    ).select_related('vendor__party').prefetch_related('lines')

    unscheduled_orders = wrap_orders(list(unscheduled_sales) + list(unscheduled_purchases))

    trucks = Truck.objects.filter(is_active=True).order_by('name')

    context = {
        'today': date.today(),
        'anchor_date': anchor_date,
        'weeks': weeks,
        'scheduled_orders': scheduled_orders,
        'unscheduled_orders': unscheduled_orders,
        'trucks': trucks,
    }
    return render(request, 'scheduling/schedulizer_dashboard.html', context)


@login_required
@require_http_methods(["POST"])
def schedule_update(request, order_id):
    """HTMX: Handles drag-and-drop updates via POST."""

    new_date_str = request.POST.get('new_date')
    new_truck_id = request.POST.get('new_truck_id')
    order_type = request.POST.get('order_type')

    if order_type == 'SO':
        order = get_object_or_404(SalesOrder, pk=order_id)
    else:
        order = get_object_or_404(PurchaseOrder, pk=order_id)

    # Update Date
    if new_date_str and new_date_str != 'null':
        order.scheduled_date = date.fromisoformat(new_date_str)
    else:
        order.scheduled_date = None

    # Update Truck
    if new_truck_id and new_truck_id not in ('null', 'None', ''):
        order.scheduled_truck_id = int(new_truck_id)
    else:
        order.scheduled_truck = None

    order.save()

    wrapped = OrderWrapper(order)
    response = render(request, 'scheduling/partials/order_card.html', {'order': wrapped})
    response['HX-Trigger'] = 'historyChanged'
    return response


@login_required
@require_http_methods(["POST"])
def update_order_status(request, order_type, order_id):
    """HTMX: Updates status and forces a clean re-render of the card."""
    if order_type == 'SO':
        Model = SalesOrder
    else:
        Model = PurchaseOrder

    order = get_object_or_404(Model, pk=order_id)
    new_status = request.POST.get('status')

    if new_status:
        order.status = new_status
        order.save()

    # Fetch fresh instance
    updated_order = Model.objects.get(pk=order.pk)
    wrapped = OrderWrapper(updated_order)

    response = render(request, 'scheduling/partials/order_card.html', {'order': wrapped})
    response['HX-Trigger'] = 'historyChanged'
    return response


@login_required
@require_http_methods(["POST"])
def update_order_note(request, order_type, order_id):
    """HTMX: Autosave notes."""
    if order_type == 'SO':
        Model = SalesOrder
    else:
        Model = PurchaseOrder

    order = get_object_or_404(Model, pk=order_id)
    order.notes = request.POST.get('notes')
    order.save()
    return HttpResponse("")


@login_required
@require_http_methods(["GET"])
def get_side_panel(request, order_type, order_id):
    """HTMX: Fetches side panel content."""
    if order_type == 'SO':
        Model = SalesOrder
    else:
        Model = PurchaseOrder

    order = get_object_or_404(Model, pk=order_id)
    history_records = order.history.all().order_by('-history_date')[:20]

    wrapped = OrderWrapper(order)

    context = {
        'order': wrapped,
        'history_records': history_records,
    }
    return render(request, 'scheduling/partials/side_panel.html', context)


@login_required
@require_http_methods(["GET"])
def get_global_history(request):
    """HTMX: Global activity feed."""
    sales_history = SalesOrder.history.select_related('history_user', 'customer__party').all()
    po_history = PurchaseOrder.history.select_related('history_user', 'vendor__party').all()

    combined_history = sorted(
        chain(sales_history, po_history),
        key=attrgetter('history_date'),
        reverse=True
    )[:50]

    return render(request, 'scheduling/partials/global_history.html', {'history_records': combined_history})
