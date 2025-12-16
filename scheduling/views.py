# scheduling/views.py
from django.shortcuts import render, get_object_or_404, redirect
from django.http import HttpResponseBadRequest, HttpResponse
from django.views.decorators.http import require_http_methods
from datetime import date, timedelta, datetime
from itertools import chain
from operator import attrgetter

from .models import ReleaseOrder, PurchaseOrder
from warehousing.models import Truck

def schedulizer_dashboard(request):
    """
    Renders the Schedulizer Dashboard (Mon-Fri View).
    Defaults to 2 weeks past + 6 weeks future.
    """
    anchor_date = date.today()
    if request.GET.get('date'):
        try:
            anchor_date = datetime.strptime(request.GET.get('date'), '%Y-%m-%d').date()
        except ValueError:
            pass

    # 1. Anchor to the Sunday of 2 weeks ago to align the grid
    days_since_sunday = (anchor_date.weekday() + 1) % 7
    sunday_of_current_week = anchor_date - timedelta(days=days_since_sunday)
    start_date = sunday_of_current_week - timedelta(weeks=2)
    
    # 2. Generate 8 Weeks, filtering for Mon-Fri (Days 1-5)
    weeks = []
    for w in range(8): 
        week_days = []
        for d in range(1, 6): # 1=Mon ... 5=Fri
            day_offset = (w * 7) + d
            week_days.append(start_date + timedelta(days=day_offset))
        weeks.append(week_days)

    # 3. Fetch Data
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
    """HTMX: Handles drag-and-drop updates."""
    new_date_str = request.PUT.get('new_date')
    new_truck_id = request.PUT.get('new_truck_id')
    order_type = request.PUT.get('order_type')
    
    if order_type == 'REL':
        OrderModel = ReleaseOrder
    else:
        OrderModel = PurchaseOrder

    order = get_object_or_404(OrderModel, pk=order_id)

    # Update Date
    if new_date_str and new_date_str != 'null':
        order.scheduled_date = date.fromisoformat(new_date_str)
    else:
        order.scheduled_date = None
    
    # Update Truck (Rel Only)
    if hasattr(order, 'scheduled_truck'):
        if new_truck_id and new_truck_id != 'null':
            order.scheduled_truck_id = int(new_truck_id)
        else:
            order.scheduled_truck = None
    
    order.save()
    
    response = render(request, 'scheduling/partials/order_card.html', {'order': order})
    response['HX-Trigger'] = 'historyChanged' 
    return response


@require_http_methods(["POST"])
def update_order_status(request, order_type, order_id):
    """HTMX: Updates status and forces a clean re-render of the card."""
    if order_type == 'REL':
        Model = ReleaseOrder
    else:
        Model = PurchaseOrder
    
    order = get_object_or_404(Model, pk=order_id)
    new_status = request.POST.get('status')
    
    if new_status:
        print(f"Updating Status: {order.number} -> {new_status}")
        order.status = new_status
        order.save()
        
    # CRITICAL: Fetch a brand new instance to bypass cache/memory
    updated_order = Model.objects.get(pk=order.pk)
        
    return render(request, 'scheduling/partials/order_card.html', {'order': updated_order})


@require_http_methods(["POST"])
def update_order_note(request, order_type, order_id):
    """HTMX: Autosave notes."""
    if order_type == 'REL':
        Model = ReleaseOrder
    else:
        Model = PurchaseOrder
        
    order = get_object_or_404(Model, pk=order_id)
    order.notes = request.POST.get('notes')
    order.save()
    return HttpResponse("")


@require_http_methods(["GET"])
def get_side_panel(request, order_type, order_id):
    """HTMX: Fetches side panel content."""
    if order_type == 'REL':
        Model = ReleaseOrder
    else:
        Model = PurchaseOrder

    order = get_object_or_404(Model, pk=order_id)
    history_records = order.history.all().order_by('-history_date')[:20]

    context = {
        'order': order,
        'history_records': history_records,
    }
    return render(request, 'scheduling/partials/side_panel.html', context)


@require_http_methods(["GET"])
def get_global_history(request):
    """HTMX: Global activity feed."""
    rel_history = ReleaseOrder.history.select_related('history_user', 'customer').all()
    po_history = PurchaseOrder.history.select_related('history_user', 'vendor').all()
    
    combined_history = sorted(
        chain(rel_history, po_history),
        key=attrgetter('history_date'),
        reverse=True
    )[:50] 

    return render(request, 'scheduling/partials/global_history.html', {'history_records': combined_history})