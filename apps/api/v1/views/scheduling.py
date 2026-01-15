# apps/api/v1/views/scheduling.py
"""
ViewSets for Scheduling/Calendar functionality.

Provides REST API endpoints for the Schedulizer calendar interface.
"""
from datetime import date, timedelta, datetime
from collections import defaultdict
from itertools import chain
from operator import attrgetter

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiParameter

from apps.orders.models import SalesOrder, PurchaseOrder
from apps.parties.models import Truck
from apps.scheduling.models import DeliveryRun  # app label: new_scheduling
from apps.api.v1.serializers.scheduling import (
    CalendarOrderSerializer, ScheduleUpdateSerializer,
    CalendarDaySerializer, TruckCalendarSerializer,
    DeliveryRunSerializer, DeliveryRunCreateSerializer,
)
from apps.api.v1.serializers.parties import TruckSerializer


def order_to_calendar_dict(order, order_type):
    """Convert an order model to calendar order dict."""
    if order_type == 'SO':
        party_name = order.customer.party.display_name
        number = order.order_number
        # SOs use order_date as the requested date
        requested_date = order.order_date
    else:
        party_name = order.vendor.party.display_name
        number = order.po_number
        # POs use expected_date as the requested date
        requested_date = order.expected_date

    return {
        'id': order.id,
        'order_type': order_type,
        'number': number,
        'status': order.status,
        'party_name': party_name,
        'scheduled_date': order.scheduled_date,
        'scheduled_truck_id': order.scheduled_truck_id,
        'scheduled_truck_name': order.scheduled_truck.name if order.scheduled_truck else None,
        'delivery_run_id': order.delivery_run_id,
        'delivery_run_name': order.delivery_run.name if order.delivery_run else None,
        'requested_date': requested_date,
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

        # Track old run for potential cleanup
        old_run = order.delivery_run

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
                # Also clear delivery run when truck is cleared
                order.delivery_run = None

        if 'delivery_run_id' in serializer.validated_data:
            run_id = serializer.validated_data['delivery_run_id']
            if run_id:
                try:
                    run = DeliveryRun.objects.get(pk=run_id)
                    order.delivery_run = run
                    # Auto-set truck and date from the run
                    order.scheduled_truck = run.truck
                    order.scheduled_date = run.scheduled_date
                except DeliveryRun.DoesNotExist:
                    return Response(
                        {'error': f'DeliveryRun with id {run_id} not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            else:
                order.delivery_run = None

        order.save()

        # Auto-delete empty runs: if the old run is now empty, delete it
        if old_run and old_run != order.delivery_run:
            # Count remaining orders in the old run
            remaining_count = (
                old_run.salesorder_orders.count() +
                old_run.purchaseorder_orders.count()
            )
            if remaining_count == 0:
                old_run.delete()

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

    @extend_schema(
        tags=['scheduling'],
        summary='Get global activity history',
        parameters=[
            OpenApiParameter('limit', int, description='Max records to return (default 50)'),
        ],
    )
    @action(detail=False, methods=['get'])
    def history(self, request):
        """
        Get global activity history for all orders.

        Returns recent changes to sales orders and purchase orders,
        sorted by most recent first.
        """
        limit = int(request.query_params.get('limit', 50))

        # Get history from both order types, ordered by most recent first
        sales_history = list(SalesOrder.history.select_related(
            'history_user'
        ).order_by('-history_date')[:limit])

        po_history = list(PurchaseOrder.history.select_related(
            'history_user'
        ).order_by('-history_date')[:limit])

        # Combine and sort by history_date descending (most recent first)
        combined = sorted(
            sales_history + po_history,
            key=attrgetter('history_date'),
            reverse=True
        )[:limit]

        # Convert to response format
        result = []
        for record in combined:
            # Determine order type and details
            if hasattr(record, 'order_number'):
                order_type = 'SO'
                number = record.order_number
                try:
                    party_name = record.customer.party.display_name if record.customer else 'Unknown'
                except Exception:
                    party_name = 'Unknown'
            else:
                order_type = 'PO'
                number = record.po_number
                try:
                    party_name = record.vendor.party.display_name if record.vendor else 'Unknown'
                except Exception:
                    party_name = 'Unknown'

            # Get changed fields
            changed_fields = []
            if record.history_type == '~':  # Changed
                if record.prev_record:
                    delta = record.diff_against(record.prev_record)
                    changed_fields = [c.field for c in delta.changes]

            result.append({
                'id': record.history_id,
                'order_type': order_type,
                'order_id': record.id,
                'number': number,
                'party_name': party_name,
                'history_type': record.history_type,
                'history_type_display': {
                    '+': 'Created',
                    '~': 'Changed',
                    '-': 'Deleted',
                }.get(record.history_type, 'Unknown'),
                'history_date': record.history_date.isoformat(),
                'history_user': record.history_user.username if record.history_user else None,
                'status': record.status,
                'scheduled_date': str(record.scheduled_date) if record.scheduled_date else None,
                'scheduled_truck_id': record.scheduled_truck_id,
                'changed_fields': changed_fields,
            })

        return Response(result)

    @extend_schema(
        tags=['scheduling'],
        summary='Get delivery runs for a date range',
        parameters=[
            OpenApiParameter('start_date', str, description='Start date (YYYY-MM-DD)'),
            OpenApiParameter('end_date', str, description='End date (YYYY-MM-DD)'),
            OpenApiParameter('truck_id', int, description='Filter by truck ID', required=False),
        ],
        responses={200: DeliveryRunSerializer(many=True)}
    )
    @action(detail=False, methods=['get'], url_path='runs')
    def delivery_runs(self, request):
        """Get delivery runs for a date range."""
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')
        truck_id = request.query_params.get('truck_id')

        queryset = DeliveryRun.objects.select_related('truck')

        if start_str:
            try:
                start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
                queryset = queryset.filter(scheduled_date__gte=start_date)
            except ValueError:
                pass

        if end_str:
            try:
                end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
                queryset = queryset.filter(scheduled_date__lte=end_date)
            except ValueError:
                pass

        if truck_id:
            queryset = queryset.filter(truck_id=truck_id)

        queryset = queryset.order_by('scheduled_date', 'truck', 'sequence')

        # Build response with order counts
        result = []
        for run in queryset:
            result.append({
                'id': run.id,
                'name': run.name,
                'truck_id': run.truck_id,
                'truck_name': run.truck.name,
                'scheduled_date': run.scheduled_date,
                'sequence': run.sequence,
                'departure_time': run.departure_time,
                'notes': run.notes,
                'is_complete': run.is_complete,
                'order_count': run.salesorder_orders.count() + run.purchaseorder_orders.count(),
            })

        return Response(result)

    @extend_schema(
        tags=['scheduling'],
        summary='Create a new delivery run',
        request=DeliveryRunCreateSerializer,
        responses={201: DeliveryRunSerializer}
    )
    @action(detail=False, methods=['post'], url_path='runs/create')
    def create_run(self, request):
        """Create a new delivery run."""
        serializer = DeliveryRunCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        truck_id = serializer.validated_data['truck_id']
        try:
            truck = Truck.objects.get(pk=truck_id)
        except Truck.DoesNotExist:
            return Response(
                {'error': f'Truck with id {truck_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get tenant from request (set by TenantMiddleware)
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response(
                {'error': 'No tenant context available'},
                status=status.HTTP_400_BAD_REQUEST
            )

        run = DeliveryRun.objects.create(
            tenant=tenant,
            name=serializer.validated_data['name'],
            truck=truck,
            scheduled_date=serializer.validated_data['scheduled_date'],
            sequence=serializer.validated_data.get('sequence', 1),
            departure_time=serializer.validated_data.get('departure_time'),
            notes=serializer.validated_data.get('notes', ''),
        )

        return Response({
            'id': run.id,
            'name': run.name,
            'truck_id': run.truck_id,
            'truck_name': run.truck.name,
            'scheduled_date': run.scheduled_date,
            'sequence': run.sequence,
            'departure_time': run.departure_time,
            'notes': run.notes,
            'is_complete': run.is_complete,
            'order_count': 0,
        }, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['scheduling'],
        summary='Update a delivery run',
        responses={200: DeliveryRunSerializer}
    )
    @action(detail=False, methods=['patch'], url_path='runs/(?P<run_id>[0-9]+)')
    def update_run(self, request, run_id=None):
        """Update a delivery run."""
        try:
            run = DeliveryRun.objects.select_related('truck').get(pk=run_id)
        except DeliveryRun.DoesNotExist:
            return Response(
                {'error': f'DeliveryRun with id {run_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Update fields if provided
        if 'name' in request.data:
            run.name = request.data['name']
        if 'sequence' in request.data:
            run.sequence = request.data['sequence']
        if 'departure_time' in request.data:
            run.departure_time = request.data['departure_time']
        if 'notes' in request.data:
            run.notes = request.data['notes']
        if 'is_complete' in request.data:
            run.is_complete = request.data['is_complete']

        run.save()

        return Response({
            'id': run.id,
            'name': run.name,
            'truck_id': run.truck_id,
            'truck_name': run.truck.name,
            'scheduled_date': run.scheduled_date,
            'sequence': run.sequence,
            'departure_time': run.departure_time,
            'notes': run.notes,
            'is_complete': run.is_complete,
            'order_count': run.salesorder_orders.count() + run.purchaseorder_orders.count(),
        })

    @extend_schema(
        tags=['scheduling'],
        summary='Delete a delivery run',
        responses={204: None}
    )
    @action(detail=False, methods=['delete'], url_path='runs/(?P<run_id>[0-9]+)/delete')
    def delete_run(self, request, run_id=None):
        """Delete a delivery run. Orders in this run will have their delivery_run cleared."""
        try:
            run = DeliveryRun.objects.get(pk=run_id)
        except DeliveryRun.DoesNotExist:
            return Response(
                {'error': f'DeliveryRun with id {run_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Clear delivery_run from orders before deleting
        SalesOrder.objects.filter(delivery_run=run).update(delivery_run=None)
        PurchaseOrder.objects.filter(delivery_run=run).update(delivery_run=None)

        run.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
