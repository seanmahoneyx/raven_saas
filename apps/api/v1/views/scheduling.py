# apps/api/v1/views/scheduling.py
"""
ViewSets for Scheduling/Calendar functionality.

Provides REST API endpoints for the Schedulizer calendar interface.
"""
import math
from datetime import timedelta, datetime
from operator import attrgetter

from django.db import models, transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiParameter

from apps.orders.models import SalesOrder, PurchaseOrder
from apps.parties.models import Truck
from apps.scheduling.models import DeliveryRun, SchedulerNote  # app label: new_scheduling
from apps.contracts.models import ContractRelease
from apps.api.v1.serializers.scheduling import (
    CalendarOrderSerializer, ScheduleUpdateSerializer,
    CalendarDaySerializer, TruckCalendarSerializer,
    DeliveryRunSerializer, DeliveryRunCreateSerializer,
    SchedulerNoteSerializer, SchedulerNoteCreateSerializer,
)
from apps.api.v1.serializers.parties import TruckSerializer
from apps.api.broadcasts import broadcast_order_update, broadcast_run_update, broadcast_note_update


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

    # Get contract reference for sales orders
    contract_id = None
    contract_number = None
    if order_type == 'SO':
        # Check first line for contract release
        first_line = order.lines.first()
        if first_line:
            try:
                release = first_line.contract_release
                contract = release.contract_line.contract
                contract_id = contract.id
                contract_number = contract.contract_number
            except ContractRelease.DoesNotExist:
                pass

    # Calculate total pallets from line items
    # Each line's pallets = ceil(quantity_ordered / item.units_per_pallet) if units_per_pallet > 0
    total_pallets = 0
    for line in order.lines.all():
        item = line.item
        units_per_pallet = getattr(item, 'units_per_pallet', None)
        if units_per_pallet and units_per_pallet > 0:
            total_pallets += math.ceil(line.quantity_ordered / units_per_pallet)
        else:
            # Fallback: treat each line as 1 pallet if no unitizing info
            total_pallets += 1

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
        'total_pallets': total_pallets,
        'priority': order.priority,
        'scheduler_sequence': order.scheduler_sequence,
        'notes': order.notes,
        'contract_id': contract_id,
        'contract_number': contract_number,
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
        ).select_related('customer__party', 'scheduled_truck', 'delivery_run').prefetch_related('lines__item')

        purchase_orders = PurchaseOrder.objects.filter(
            scheduled_date__gte=start_date,
            scheduled_date__lte=end_date
        ).select_related('vendor__party', 'scheduled_truck', 'delivery_run').prefetch_related('lines__item')

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
                # Sort by scheduler_sequence (for user-defined order), then priority as fallback
                day_orders.sort(key=lambda x: (x['scheduler_sequence'], x['priority']))
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
        ).select_related('customer__party', 'delivery_run').prefetch_related('lines__item')

        purchase_orders = PurchaseOrder.objects.filter(
            scheduled_date__isnull=True
        ).exclude(
            status__in=['complete', 'cancelled']
        ).select_related('vendor__party', 'delivery_run').prefetch_related('lines__item')

        result = []
        for so in sales_orders:
            result.append(order_to_calendar_dict(so, 'SO'))
        for po in purchase_orders:
            result.append(order_to_calendar_dict(po, 'PO'))

        # Sort by scheduler_sequence, then priority as fallback
        result.sort(key=lambda x: (x['scheduler_sequence'], x['priority']))

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
            # SECURITY: Explicit tenant filtering to prevent IDOR
            order = Model.objects.filter(tenant=request.tenant).get(pk=order_id)
        except Model.DoesNotExist:
            return Response(
                {'error': f'{order_type} with id {order_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ScheduleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # POs cannot be assigned to trucks or delivery runs - they are inbound only
        if order_type == 'PO':
            if serializer.validated_data.get('scheduled_truck_id'):
                return Response(
                    {'error': 'Purchase Orders cannot be assigned to trucks. They belong to the Inbound row only.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if serializer.validated_data.get('delivery_run_id'):
                return Response(
                    {'error': 'Purchase Orders cannot be assigned to delivery runs.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

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

        if 'scheduler_sequence' in serializer.validated_data:
            order.scheduler_sequence = serializer.validated_data['scheduler_sequence']

        order.save()

        # NOTE: Auto-delete of empty runs is DISABLED to prevent "disappearing run" bug
        # during drag operations. The frontend should explicitly delete empty runs via
        # the delete_run endpoint when the user confirms deletion.
        # The old auto-cleanup logic caused race conditions where the run would vanish
        # while dnd-kit was still calculating the drop position.

        # Broadcast the order update to all connected WebSocket clients
        order_data = order_to_calendar_dict(order, order_type)
        broadcast_order_update(order.id, 'updated', order_data, tenant_id=request.tenant.id)

        return Response(order_data)

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
        try:
            limit = min(int(request.query_params.get('limit', 50)), 500)  # Cap at 500 to prevent DoS
        except (ValueError, TypeError):
            limit = 50

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

            # Get changed fields with old/new values
            changed_fields = []
            changes_detail = []
            if record.history_type == '~':  # Changed
                if record.prev_record:
                    delta = record.diff_against(record.prev_record)
                    changed_fields = [c.field for c in delta.changes]
                    for change in delta.changes:
                        old_val = change.old
                        new_val = change.new
                        field_name = change.field

                        # Resolve truck IDs to truck names
                        if field_name == 'scheduled_truck_id' or field_name == 'scheduled_truck':
                            field_name = 'scheduled_truck'
                            if old_val:
                                try:
                                    old_truck = Truck.objects.get(pk=old_val)
                                    old_val = old_truck.name
                                except Truck.DoesNotExist:
                                    old_val = f'Truck #{old_val}'
                            if new_val:
                                try:
                                    new_truck = Truck.objects.get(pk=new_val)
                                    new_val = new_truck.name
                                except Truck.DoesNotExist:
                                    new_val = f'Truck #{new_val}'

                        # Format dates nicely
                        if hasattr(old_val, 'strftime'):
                            old_val = old_val.strftime('%a %m/%d')
                        if hasattr(new_val, 'strftime'):
                            new_val = new_val.strftime('%a %m/%d')
                        # Convert None to readable string
                        if old_val is None:
                            old_val = 'None'
                        if new_val is None:
                            new_val = 'None'
                        changes_detail.append({
                            'field': field_name,
                            'old': str(old_val),
                            'new': str(new_val),
                        })

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
                'changes': changes_detail,
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
                return Response(
                    {'error': 'Invalid start_date format. Use YYYY-MM-DD'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        if end_str:
            try:
                end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
                queryset = queryset.filter(scheduled_date__lte=end_date)
            except ValueError:
                return Response(
                    {'error': 'Invalid end_date format. Use YYYY-MM-DD'},
                    status=status.HTTP_400_BAD_REQUEST
                )

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

        run_data = {
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
        }

        # Broadcast the run creation to all connected WebSocket clients
        broadcast_run_update(run.id, 'created', run_data, tenant_id=request.tenant.id)

        return Response(run_data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['scheduling'],
        summary='Update a delivery run',
        responses={200: DeliveryRunSerializer}
    )
    @action(detail=False, methods=['patch'], url_path='runs/(?P<run_id>[0-9]+)')
    def update_run(self, request, run_id=None):
        """Update a delivery run."""
        try:
            # SECURITY: Explicit tenant filtering to prevent IDOR
            run = DeliveryRun.objects.filter(tenant=request.tenant).select_related('truck').get(pk=run_id)
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
        if 'scheduled_date' in request.data:
            run.scheduled_date = request.data['scheduled_date']
        if 'truck_id' in request.data:
            truck_id = request.data['truck_id']
            try:
                truck = Truck.objects.get(pk=truck_id)
                run.truck = truck
            except Truck.DoesNotExist:
                return Response(
                    {'error': f'Truck with id {truck_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        # Wrap save and cascading updates in a transaction for consistency
        with transaction.atomic():
            run.save()

            # If date or truck changed, update all orders in this run to match
            # Use individual saves instead of bulk update to trigger django-simple-history
            if 'scheduled_date' in request.data or 'truck_id' in request.data:
                for order in SalesOrder.objects.filter(delivery_run=run):
                    order.scheduled_date = run.scheduled_date
                    order.scheduled_truck = run.truck
                    order.save(update_fields=['scheduled_date', 'scheduled_truck'])
                for order in PurchaseOrder.objects.filter(delivery_run=run):
                    order.scheduled_date = run.scheduled_date
                    order.scheduled_truck = run.truck
                    order.save(update_fields=['scheduled_date', 'scheduled_truck'])

        run_data = {
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
        }

        # Broadcast the run update to all connected WebSocket clients
        broadcast_run_update(run.id, 'updated', run_data, tenant_id=request.tenant.id)

        return Response(run_data)

    @extend_schema(
        tags=['scheduling'],
        summary='Delete a delivery run',
        responses={204: None}
    )
    @action(detail=False, methods=['delete'], url_path='runs/(?P<run_id>[0-9]+)/delete')
    def delete_run(self, request, run_id=None):
        """Delete a delivery run. Orders in this run will have their delivery_run cleared."""
        try:
            # SECURITY: Explicit tenant filtering to prevent IDOR
            run = DeliveryRun.objects.filter(tenant=request.tenant).get(pk=run_id)
        except DeliveryRun.DoesNotExist:
            return Response(
                {'error': f'DeliveryRun with id {run_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Clear delivery_run from orders before deleting
        # Use individual saves instead of bulk update to trigger django-simple-history
        for order in SalesOrder.objects.filter(delivery_run=run):
            order.delivery_run = None
            order.save(update_fields=['delivery_run'])
        for order in PurchaseOrder.objects.filter(delivery_run=run):
            order.delivery_run = None
            order.save(update_fields=['delivery_run'])

        # Broadcast the run deletion before actually deleting
        broadcast_run_update(run.id, 'deleted', {'id': run.id}, tenant_id=request.tenant.id)

        run.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ==================== SCHEDULER NOTES ====================

    @extend_schema(
        tags=['scheduling'],
        summary='Get scheduler notes for a date range',
        parameters=[
            OpenApiParameter('start_date', str, description='Start date (YYYY-MM-DD)'),
            OpenApiParameter('end_date', str, description='End date (YYYY-MM-DD)'),
        ],
        responses={200: SchedulerNoteSerializer(many=True)}
    )
    @action(detail=False, methods=['get'], url_path='notes')
    def scheduler_notes(self, request):
        """Get scheduler notes for a date range."""
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')

        queryset = SchedulerNote.objects.select_related(
            'truck', 'delivery_run', 'sales_order', 'purchase_order', 'created_by'
        )

        if start_str:
            try:
                start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
                queryset = queryset.filter(
                    models.Q(scheduled_date__gte=start_date) |
                    models.Q(scheduled_date__isnull=True)
                )
            except ValueError:
                return Response(
                    {'error': 'Invalid start_date format. Use YYYY-MM-DD'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        if end_str:
            try:
                end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
                queryset = queryset.filter(
                    models.Q(scheduled_date__lte=end_date) |
                    models.Q(scheduled_date__isnull=True)
                )
            except ValueError:
                return Response(
                    {'error': 'Invalid end_date format. Use YYYY-MM-DD'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        queryset = queryset.order_by('-is_pinned', '-created_at')

        result = []
        for note in queryset:
            result.append({
                'id': note.id,
                'content': note.content,
                'color': note.color,
                'scheduled_date': note.scheduled_date,
                'truck_id': note.truck_id,
                'delivery_run_id': note.delivery_run_id,
                'sales_order_id': note.sales_order_id,
                'purchase_order_id': note.purchase_order_id,
                'created_by': note.created_by_id,
                'created_by_username': note.created_by.username if note.created_by else None,
                'is_pinned': note.is_pinned,
                'attachment_type': note.attachment_type,
                'created_at': note.created_at.isoformat(),
                'updated_at': note.updated_at.isoformat(),
            })

        return Response(result)

    @extend_schema(
        tags=['scheduling'],
        summary='Create a scheduler note',
        request=SchedulerNoteCreateSerializer,
        responses={201: SchedulerNoteSerializer}
    )
    @action(detail=False, methods=['post'], url_path='notes/create')
    def create_note(self, request):
        """Create a new scheduler note."""
        serializer = SchedulerNoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Get tenant from request
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response(
                {'error': 'No tenant context available'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Build note data
        note_data = {
            'tenant': tenant,
            'content': serializer.validated_data['content'],
            'color': serializer.validated_data.get('color', 'yellow'),
            'scheduled_date': serializer.validated_data.get('scheduled_date'),
            'is_pinned': serializer.validated_data.get('is_pinned', False),
            'created_by': request.user if request.user.is_authenticated else None,
        }

        # Handle foreign keys
        truck_id = serializer.validated_data.get('truck_id')
        if truck_id:
            try:
                note_data['truck'] = Truck.objects.get(pk=truck_id)
            except Truck.DoesNotExist:
                return Response(
                    {'error': f'Truck with id {truck_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        delivery_run_id = serializer.validated_data.get('delivery_run_id')
        if delivery_run_id:
            try:
                note_data['delivery_run'] = DeliveryRun.objects.get(pk=delivery_run_id)
            except DeliveryRun.DoesNotExist:
                return Response(
                    {'error': f'DeliveryRun with id {delivery_run_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        sales_order_id = serializer.validated_data.get('sales_order_id')
        if sales_order_id:
            try:
                note_data['sales_order'] = SalesOrder.objects.get(pk=sales_order_id)
            except SalesOrder.DoesNotExist:
                return Response(
                    {'error': f'SalesOrder with id {sales_order_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        purchase_order_id = serializer.validated_data.get('purchase_order_id')
        if purchase_order_id:
            try:
                note_data['purchase_order'] = PurchaseOrder.objects.get(pk=purchase_order_id)
            except PurchaseOrder.DoesNotExist:
                return Response(
                    {'error': f'PurchaseOrder with id {purchase_order_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        note = SchedulerNote.objects.create(**note_data)

        note_response = {
            'id': note.id,
            'content': note.content,
            'color': note.color,
            'scheduled_date': note.scheduled_date,
            'truck_id': note.truck_id,
            'delivery_run_id': note.delivery_run_id,
            'sales_order_id': note.sales_order_id,
            'purchase_order_id': note.purchase_order_id,
            'created_by': note.created_by_id,
            'created_by_username': note.created_by.username if note.created_by else None,
            'is_pinned': note.is_pinned,
            'attachment_type': note.attachment_type,
            'created_at': note.created_at.isoformat(),
            'updated_at': note.updated_at.isoformat(),
        }

        # Broadcast the note creation to all connected WebSocket clients
        broadcast_note_update(note.id, 'created', note_response, tenant_id=request.tenant.id)

        return Response(note_response, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['scheduling'],
        summary='Update a scheduler note',
        responses={200: SchedulerNoteSerializer}
    )
    @action(detail=False, methods=['patch'], url_path='notes/(?P<note_id>[0-9]+)')
    def update_note(self, request, note_id=None):
        """Update a scheduler note."""
        try:
            # SECURITY: Explicit tenant filtering to prevent IDOR
            note = SchedulerNote.objects.filter(tenant=request.tenant).select_related('created_by').get(pk=note_id)
        except SchedulerNote.DoesNotExist:
            return Response(
                {'error': f'SchedulerNote with id {note_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # SECURITY: Object-level permission - only creator or staff can modify
        if note.created_by and note.created_by != request.user and not request.user.is_staff:
            return Response(
                {'error': 'You do not have permission to modify this note'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Update fields if provided
        if 'content' in request.data:
            note.content = request.data['content']
        if 'color' in request.data:
            note.color = request.data['color']
        if 'is_pinned' in request.data:
            note.is_pinned = request.data['is_pinned']
        if 'scheduled_date' in request.data:
            note.scheduled_date = request.data['scheduled_date']
        if 'truck_id' in request.data:
            truck_id = request.data['truck_id']
            if truck_id:
                try:
                    note.truck = Truck.objects.get(pk=truck_id)
                except Truck.DoesNotExist:
                    return Response(
                        {'error': f'Truck with id {truck_id} not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            else:
                note.truck = None

        note.save()

        note_response = {
            'id': note.id,
            'content': note.content,
            'color': note.color,
            'scheduled_date': note.scheduled_date,
            'truck_id': note.truck_id,
            'delivery_run_id': note.delivery_run_id,
            'sales_order_id': note.sales_order_id,
            'purchase_order_id': note.purchase_order_id,
            'created_by': note.created_by_id,
            'created_by_username': note.created_by.username if note.created_by else None,
            'is_pinned': note.is_pinned,
            'attachment_type': note.attachment_type,
            'created_at': note.created_at.isoformat(),
            'updated_at': note.updated_at.isoformat(),
        }

        # Broadcast the note update to all connected WebSocket clients
        broadcast_note_update(note.id, 'updated', note_response, tenant_id=request.tenant.id)

        return Response(note_response)

    @extend_schema(
        tags=['scheduling'],
        summary='Delete a scheduler note',
        responses={204: None}
    )
    @action(detail=False, methods=['delete'], url_path='notes/(?P<note_id>[0-9]+)/delete')
    def delete_note(self, request, note_id=None):
        """Delete a scheduler note."""
        try:
            # SECURITY: Explicit tenant filtering to prevent IDOR
            note = SchedulerNote.objects.filter(tenant=request.tenant).select_related('created_by').get(pk=note_id)
        except SchedulerNote.DoesNotExist:
            return Response(
                {'error': f'SchedulerNote with id {note_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # SECURITY: Object-level permission - only creator or staff can delete
        if note.created_by and note.created_by != request.user and not request.user.is_staff:
            return Response(
                {'error': 'You do not have permission to delete this note'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Broadcast the note deletion before actually deleting
        broadcast_note_update(note.id, 'deleted', {'id': note.id}, tenant_id=request.tenant.id)

        note.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
