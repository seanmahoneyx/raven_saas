# apps/api/v1/views/scheduling.py
"""
ViewSets for Scheduling/Calendar functionality.

Provides REST API endpoints for the Schedulizer calendar interface.
"""
from datetime import date, timedelta, datetime
from collections import defaultdict

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiParameter

from apps.orders.models import SalesOrder, PurchaseOrder
from apps.parties.models import Truck
from apps.api.v1.serializers.scheduling import (
    CalendarOrderSerializer, ScheduleUpdateSerializer,
    CalendarDaySerializer, TruckCalendarSerializer,
)
from apps.api.v1.serializers.parties import TruckSerializer


def order_to_calendar_dict(order, order_type):
    """Convert an order model to calendar order dict."""
    if order_type == 'SO':
        party_name = order.customer.party.display_name
        number = order.order_number
    else:
        party_name = order.vendor.party.display_name
        number = order.po_number

    return {
        'id': order.id,
        'order_type': order_type,
        'number': number,
        'status': order.status,
        'party_name': party_name,
        'scheduled_date': order.scheduled_date,
        'scheduled_truck_id': order.scheduled_truck_id,
        'scheduled_truck_name': order.scheduled_truck.name if order.scheduled_truck else None,
        'num_lines': order.lines.count(),
        'total_quantity': sum(line.quantity_ordered for line in order.lines.all()),
        'priority': order.priority,
        'notes': order.notes,
    }


class CalendarViewSet(viewsets.ViewSet):
    """
    ViewSet for calendar/scheduling operations.

    Provides calendar data and schedule update endpoints.
    """

    @extend_schema(
        tags=['scheduling'],
        summary='Get calendar data for date range',
        parameters=[
            OpenApiParameter('start_date', str, description='Start date (YYYY-MM-DD)'),
            OpenApiParameter('end_date', str, description='End date (YYYY-MM-DD)'),
            OpenApiParameter('group_by', str, description='Group by: date, truck', required=False),
        ],
        responses={200: TruckCalendarSerializer(many=True)}
    )
    @action(detail=False, methods=['get'])
    def range(self, request):
        """
        Get scheduled orders for a date range.

        Returns orders grouped by truck and date.
        """
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')
        group_by = request.query_params.get('group_by', 'truck')

        if not start_str or not end_str:
            return Response(
                {'error': 'start_date and end_date parameters are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Fetch orders in range
        sales_orders = SalesOrder.objects.filter(
            scheduled_date__gte=start_date,
            scheduled_date__lte=end_date
        ).select_related('customer__party', 'scheduled_truck').prefetch_related('lines')

        purchase_orders = PurchaseOrder.objects.filter(
            scheduled_date__gte=start_date,
            scheduled_date__lte=end_date
        ).select_related('vendor__party', 'scheduled_truck').prefetch_related('lines')

        # Convert to dicts
        all_orders = []
        for so in sales_orders:
            all_orders.append(order_to_calendar_dict(so, 'SO'))
        for po in purchase_orders:
            all_orders.append(order_to_calendar_dict(po, 'PO'))

        # Group by truck and date
        trucks = list(Truck.objects.filter(is_active=True).order_by('name'))
        trucks.append(None)  # For unassigned

        result = []
        for truck in trucks:
            truck_id = truck.id if truck else None
            truck_name = truck.name if truck else 'Unassigned'

            # Get orders for this truck
            truck_orders = [o for o in all_orders if o['scheduled_truck_id'] == truck_id]

            # Group by date
            days = []
            current_date = start_date
            while current_date <= end_date:
                day_orders = [o for o in truck_orders if o['scheduled_date'] == current_date]
                # Sort by priority
                day_orders.sort(key=lambda x: x['priority'])
                days.append({
                    'date': current_date,
                    'orders': day_orders,
                    'total_orders': len(day_orders),
                })
                current_date += timedelta(days=1)

            result.append({
                'truck_id': truck_id,
                'truck_name': truck_name,
                'days': days,
            })

        return Response(result)

    @extend_schema(
        tags=['scheduling'],
        summary='Get unscheduled orders',
        responses={200: CalendarOrderSerializer(many=True)}
    )
    @action(detail=False, methods=['get'])
    def unscheduled(self, request):
        """Get all unscheduled orders (no scheduled_date)."""
        sales_orders = SalesOrder.objects.filter(
            scheduled_date__isnull=True
        ).exclude(
            status__in=['complete', 'cancelled']
        ).select_related('customer__party').prefetch_related('lines')

        purchase_orders = PurchaseOrder.objects.filter(
            scheduled_date__isnull=True
        ).exclude(
            status__in=['complete', 'cancelled']
        ).select_related('vendor__party').prefetch_related('lines')

        result = []
        for so in sales_orders:
            result.append(order_to_calendar_dict(so, 'SO'))
        for po in purchase_orders:
            result.append(order_to_calendar_dict(po, 'PO'))

        # Sort by priority
        result.sort(key=lambda x: x['priority'])

        return Response(result)

    @extend_schema(
        tags=['scheduling'],
        summary='Update order schedule',
        request=ScheduleUpdateSerializer,
        responses={200: CalendarOrderSerializer}
    )
    @action(detail=False, methods=['post'], url_path='update/(?P<order_type>[A-Z]+)/(?P<order_id>[0-9]+)')
    def update_schedule(self, request, order_type=None, order_id=None):
        """
        Update the schedule for an order.

        order_type: 'SO' for sales order, 'PO' for purchase order
        """
        if order_type == 'SO':
            Model = SalesOrder
        elif order_type == 'PO':
            Model = PurchaseOrder
        else:
            return Response(
                {'error': 'Invalid order_type. Use SO or PO.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            order = Model.objects.get(pk=order_id)
        except Model.DoesNotExist:
            return Response(
                {'error': f'{order_type} with id {order_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ScheduleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if 'scheduled_date' in serializer.validated_data:
            order.scheduled_date = serializer.validated_data['scheduled_date']

        if 'scheduled_truck_id' in serializer.validated_data:
            truck_id = serializer.validated_data['scheduled_truck_id']
            if truck_id:
                try:
                    truck = Truck.objects.get(pk=truck_id)
                    order.scheduled_truck = truck
                except Truck.DoesNotExist:
                    return Response(
                        {'error': f'Truck with id {truck_id} not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            else:
                order.scheduled_truck = None

        order.save()

        return Response(order_to_calendar_dict(order, order_type))

    @extend_schema(
        tags=['scheduling'],
        summary='Get available trucks',
        responses={200: TruckSerializer(many=True)}
    )
    @action(detail=False, methods=['get'])
    def trucks(self, request):
        """Get all active trucks for scheduling."""
        trucks = Truck.objects.filter(is_active=True).order_by('name')
        serializer = TruckSerializer(trucks, many=True, context={'request': request})
        return Response(serializer.data)
