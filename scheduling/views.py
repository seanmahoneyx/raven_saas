# scheduling/views.py
from django.shortcuts import render, get_object_or_404
from django.http import HttpResponseBadRequest
from django.views.decorators.http import require_http_methods
from datetime import date, timedelta, datetime
from itertools import chain
from operator import attrgetter

# Models
from .models import ReleaseOrder, PurchaseOrder
from warehousing.models import Truck


def schedulizer_dashboard(request):
    """
    Renders the Schedulizer Dashboard (Mon-Fri View).
    """
    # 1. Determine Anchor Date (Default to Today)
    anchor_date = date.today()
    if request.GET.get('date'):
        try:
            anchor_date = datetime.strptime(request.GET.get('date'), '%Y-%m-%d').date()
        except ValueError:
            pass

    # 2. Anchor to the Sunday of 2 weeks ago (to keep alignment)
    days_since_sunday = (anchor_date.weekday() + 1) % 7
    sunday_of_current_week = anchor_date - timedelta(days=days_since_sunday)
    start_date = sunday_of_current_week - timedelta(weeks=2)
    
    # 3. Generate 8 Weeks, BUT only grab Mon-Fri
    weeks = []
    for w in range(8): 
        week_days = []
        # Range(1, 6) skips 0 (Sun) and 6 (Sat)
        # 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
        for d in range(1, 6): 
            day_offset = (w * 7) + d
            week_days.append(start_date + timedelta(days=day_offset))
        weeks.append(week_days)

    # 4. Fetch Orders (Logic unchanged, covers full range)
    end_date = start_date + timedelta(weeks=8)
    
    scheduled_releases = ReleaseOrder.objects.filter(scheduled_date__gte=start_date, scheduled_date__lte=end_date)
    scheduled_pos = PurchaseOrder.objects.filter(scheduled_date__gte=start_date, scheduled_date__lte=end_date)
    scheduled_orders = list(scheduled_releases) + list(scheduled_pos)
    
    unscheduled_orders = list(ReleaseOrder.objects.filter(scheduled_date__isnull=True)) + \
                         list(PurchaseOrder.objects.filter(scheduled_date__isnull=True))
    
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


@require_http_methods(["PUT"])
def schedule_update(request, order_id):
    """
    HTMX: Handles drag-and-drop updates.
    Updates the date/truck and triggers a history refresh.
    """
    # 1. Extract data
    new_date_str = request.PUT.get('new_date')     # "2025-01-01" or "null"
    new_truck_id = request.PUT.get('new_truck_id') # "1" or "null"
    order_type = request.PUT.get('order_type')     # "REL" or "PO"
    
    # 2. Determine Model
    if order_type == 'REL':
        OrderModel = ReleaseOrder
    elif order_type == 'PO':
        OrderModel = PurchaseOrder
    else:
        return HttpResponseBadRequest("Invalid order type.")

    # 3. Update
    order = get_object_or_404(OrderModel, pk=order_id)

    # Handle Date
    if new_date_str and new_date_str != 'null':
        order.scheduled_date = date.fromisoformat(new_date_str)
    else:
        order.scheduled_date = None
    
    # Handle Truck (Only for Releases)
    if hasattr(order, 'scheduled_truck'):
        if new_truck_id and new_truck_id != 'null':
            order.scheduled_truck_id = int(new_truck_id)
        else:
            order.scheduled_truck = None
    
    order.save() 
    
    # 4. Return updated card HTML + Trigger Header
    response = render(request, 'scheduling/partials/order_card.html', {'order': order})
    response['HX-Trigger'] = 'historyChanged' 
    return response


@require_http_methods(["GET"])
def get_global_history(request):
    """
    HTMX: Fetches combined history for the right-hand panel.
    """
    # 1. Fetch history (using select_related for performance)
    rel_history = ReleaseOrder.history.select_related('history_user', 'customer').all()
    po_history = PurchaseOrder.history.select_related('history_user', 'vendor').all()
    
    # 2. Merge and Sort (Newest first)
    combined_history = sorted(
        chain(rel_history, po_history),
        key=attrgetter('history_date'),
        reverse=True
    )[:50] 

    context = {
        'history_records': combined_history,
    }
    return render(request, 'scheduling/partials/global_history.html', context)


@require_http_methods(["GET"])
def get_order_history(request, order_type, order_id):
    """
    HTMX: Fetches history for a specific order (single card click).
    """
    if order_type == 'REL':
        OrderModel = ReleaseOrder
    elif order_type == 'PO':
        OrderModel = PurchaseOrder
    else:
        return HttpResponseBadRequest("Invalid order type")

    order = get_object_or_404(OrderModel, pk=order_id)
    history_records = order.history.all().order_by('-history_date')[:20]

    context = {
        'order': order,
        'history_records': history_records,
    }
    
    return render(request, 'scheduling/partials/history_content.html', context)