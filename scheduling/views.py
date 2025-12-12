from django.shortcuts import render, get_object_or_404
from django.http import HttpResponseBadRequest
from django.views.decorators.http import require_http_methods
from datetime import date, timedelta
from itertools import chain
from operator import attrgetter

# Import your models
from .models import ReleaseOrder, PurchaseOrder
from warehousing.models import Truck

def schedulizer_dashboard(request):
    """
    Renders the main Schedulizer dashboard with the Unscheduled Pool and Calendar Grid data.
    """
    today = date.today()
    # Show 4 weeks out
    end_date = today + timedelta(weeks=4)
    
    # 1. Fetch Scheduled Orders (in range)
    scheduled_releases = ReleaseOrder.objects.filter(scheduled_date__gte=today, scheduled_date__lte=end_date)
    scheduled_pos = PurchaseOrder.objects.filter(scheduled_date__gte=today, scheduled_date__lte=end_date)
    
    # Combine them for the template to iterate easily
    scheduled_orders = list(scheduled_releases) + list(scheduled_pos)
    
    # 2. Fetch Unscheduled Pool (Left Panel)
    unscheduled_releases = ReleaseOrder.objects.filter(scheduled_date__isnull=True)
    unscheduled_pos = PurchaseOrder.objects.filter(scheduled_date__isnull=True)
    
    unscheduled_orders = list(unscheduled_releases) + list(unscheduled_pos)

    # 3. Fetch Trucks (Resources)
    trucks = Truck.objects.filter(is_active=True).order_by('name')
    
    # 4. Generate Date Objects for the Header
    week_range = [today + timedelta(days=i) for i in range((end_date - today).days + 1)]

    context = {
        'today': today,
        'scheduled_orders': scheduled_orders,
        'unscheduled_orders': unscheduled_orders,
        'trucks': trucks,
        'week_range': week_range,
    }
    
    return render(request, 'scheduling/schedulizer_dashboard.html', context)


@require_http_methods(["PUT"])
def schedule_update(request, order_id):
    """
    HTMX: Handles drag-and-drop updates.
    Updates the date/truck and triggers a history refresh.
    """
    # 1. Extract data from the PUT request
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

    # 3. Fetch and Update
    order = get_object_or_404(OrderModel, pk=order_id)

    # Handle Date ("null" string from JS becomes Python None)
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
    
    order.save() # This automatically creates a history record via simple_history
    
    # 4. Return the updated card HTML
    response = render(request, 'scheduling/partials/order_card.html', {'order': order})
    
    # 5. Trigger the Frontend Event to reload the history panel
    response['HX-Trigger'] = 'historyChanged' 
    return response


@require_http_methods(["GET"])
def get_global_history(request):
    """
    HTMX: Fetches combined history for the right-hand panel.
    Triggered by page load AND 'historyChanged' event.
    """
    # 1. Fetch history from both models (using select_related for performance)
    rel_history = ReleaseOrder.history.select_related('history_user', 'customer').all()
    po_history = PurchaseOrder.history.select_related('history_user', 'vendor').all()
    
    # 2. Merge and Sort (Newest first)
    combined_history = sorted(
        chain(rel_history, po_history),
        key=attrgetter('history_date'),
        reverse=True
    )[:50] # Limit to last 50 actions

    context = {
        'history_records': combined_history,
    }
    return render(request, 'scheduling/partials/global_history.html', context)