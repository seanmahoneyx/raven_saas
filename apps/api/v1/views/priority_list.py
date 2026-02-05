# apps/api/v1/views/priority_list.py
"""
ViewSet for Priority List feature.

Provides REST API endpoints for managing production priority of open PO lines
by vendor, with configurable daily kick allotments.
"""
from datetime import datetime
from collections import defaultdict

from django.db import models, transaction
from django.db.models import Q, F
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiParameter

from apps.orders.models import PurchaseOrder, PurchaseOrderLine
from apps.parties.models import Vendor
from apps.scheduling.models import (
    PriorityLinePriority,
    VendorKickAllotment,
    DailyKickOverride,
    BOX_TYPE_CHOICES,
)
from apps.scheduling.utils import get_box_type_for_item, get_effective_allotment
from apps.api.v1.serializers.priority_list import (
    PriorityLinePrioritySerializer,
    VendorKickAllotmentSerializer,
    DailyKickOverrideSerializer,
    PriorityListResponseSerializer,
    ReorderLinesSerializer,
    MoveLineSerializer,
    VendorAllotmentCreateSerializer,
    DailyOverrideCreateSerializer,
    ClearOverrideSerializer,
)
from apps.api.broadcasts import broadcast_order_update, broadcast_priority_update


def _get_box_type_display(code):
    """Get display name for a box type code."""
    for choice_code, display in BOX_TYPE_CHOICES:
        if choice_code == code:
            return display
    return code


class PriorityListViewSet(viewsets.ViewSet):
    """
    ViewSet for priority list operations.

    Provides endpoints for viewing and managing PO line priorities,
    grouped by vendor, date, and box type.
    """

    @extend_schema(
        tags=['priority-list'],
        summary='Get priority list data',
        parameters=[
            OpenApiParameter('start_date', str, description='Start date (YYYY-MM-DD)', required=True),
            OpenApiParameter('end_date', str, description='End date (YYYY-MM-DD)', required=True),
            OpenApiParameter('vendor_id', int, description='Filter by vendor ID', required=False),
        ],
        responses={200: PriorityListResponseSerializer}
    )
    def list(self, request):
        """
        Get grouped priority list data for a date range.

        Returns PO lines grouped by Vendor -> Date -> Box Type, with
        kick allotments and remaining capacity.
        """
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')
        vendor_id = request.query_params.get('vendor_id')

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

        tenant = request.tenant

        # Fetch priority entries with related data
        queryset = PriorityLinePriority.objects.filter(
            scheduled_date__gte=start_date,
            scheduled_date__lte=end_date
        ).select_related(
            'purchase_order_line__purchase_order',
            'purchase_order_line__item',
            'vendor__party'
        ).order_by('vendor', 'scheduled_date', 'box_type', 'sequence')

        if vendor_id:
            queryset = queryset.filter(vendor_id=vendor_id)

        # Group data: vendor -> date -> box_type -> lines
        vendor_data = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
        vendor_names = {}

        for entry in queryset:
            v_id = entry.vendor_id
            vendor_names[v_id] = entry.vendor.party.display_name
            date_str = str(entry.scheduled_date)
            box_type = entry.box_type

            po = entry.purchase_order_line.purchase_order
            vendor_data[v_id][date_str][box_type].append({
                'id': entry.id,
                'po_line_id': entry.purchase_order_line_id,
                'po_number': po.po_number,
                'item_sku': entry.purchase_order_line.item.sku,
                'item_name': entry.purchase_order_line.item.name,
                'quantity_ordered': entry.purchase_order_line.quantity_ordered,
                'sequence': entry.sequence,
                'customer_request_date': str(po.expected_date) if po.expected_date else None,
            })

        # Build response structure with allotments
        result = {'vendors': []}

        for v_id in sorted(vendor_data.keys(), key=lambda x: vendor_names.get(x, '')):
            vendor_obj = Vendor.objects.get(pk=v_id)
            vendor_section = {
                'vendor_id': v_id,
                'vendor_name': vendor_names[v_id],
                'dates': []
            }

            for date_str in sorted(vendor_data[v_id].keys()):
                date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
                date_section = {
                    'date': date_str,
                    'box_types': []
                }

                for box_type in sorted(vendor_data[v_id][date_str].keys()):
                    lines = vendor_data[v_id][date_str][box_type]

                    # Get allotment for this vendor/box_type/date
                    allotment, is_override = get_effective_allotment(
                        vendor_obj, box_type, date_obj, tenant
                    )

                    # Calculate scheduled quantity
                    scheduled_qty = sum(line['quantity_ordered'] for line in lines)
                    remaining = max(0, allotment - scheduled_qty)

                    date_section['box_types'].append({
                        'box_type': box_type,
                        'box_type_display': _get_box_type_display(box_type),
                        'allotment': allotment,
                        'is_override': is_override,
                        'scheduled_qty': scheduled_qty,
                        'remaining_kicks': remaining,
                        'lines': lines,
                    })

                vendor_section['dates'].append(date_section)

            result['vendors'].append(vendor_section)

        return Response(result)

    @extend_schema(
        tags=['priority-list'],
        summary='Reorder lines within a bin',
        request=ReorderLinesSerializer,
        responses={200: {'description': 'Lines reordered successfully'}}
    )
    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """
        Reorder lines within a vendor/date/box-type bin.

        The line_ids list represents the new order (first item = sequence 0).
        """
        serializer = ReorderLinesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vendor_id = serializer.validated_data['vendor_id']
        date = serializer.validated_data['date']
        box_type = serializer.validated_data['box_type']
        line_ids = serializer.validated_data['line_ids']

        tenant = request.tenant

        with transaction.atomic():
            # Verify all lines exist and belong to the correct bin
            entries = PriorityLinePriority.objects.filter(
                tenant=tenant,
                id__in=line_ids,
                vendor_id=vendor_id,
                scheduled_date=date,
                box_type=box_type
            )

            if entries.count() != len(line_ids):
                return Response(
                    {'error': 'One or more line IDs are invalid or do not belong to this bin'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Update sequences
            for idx, line_id in enumerate(line_ids):
                PriorityLinePriority.objects.filter(
                    tenant=tenant,
                    id=line_id
                ).update(sequence=idx)

        # Broadcast priority update
        broadcast_priority_update(
            vendor_id=vendor_id,
            date=str(date),
            action='reordered',
            data={'line_ids': line_ids, 'box_type': box_type},
            tenant_id=tenant.id
        )

        return Response({'status': 'success', 'message': 'Lines reordered successfully'})

    @extend_schema(
        tags=['priority-list'],
        summary='Move line to different date',
        request=MoveLineSerializer,
        responses={200: PriorityLinePrioritySerializer}
    )
    @action(detail=False, methods=['post'])
    def move(self, request):
        """
        Move a line to a different date.

        Also updates the parent PurchaseOrder's scheduled_date.
        """
        serializer = MoveLineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        line_id = serializer.validated_data['line_id']
        target_date = serializer.validated_data['target_date']
        insert_at = serializer.validated_data.get('insert_at_sequence', 0)

        tenant = request.tenant

        try:
            entry = PriorityLinePriority.objects.select_related(
                'purchase_order_line__purchase_order'
            ).get(tenant=tenant, id=line_id)
        except PriorityLinePriority.DoesNotExist:
            return Response(
                {'error': f'Priority line with id {line_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        old_date = entry.scheduled_date
        old_vendor = entry.vendor_id
        old_box_type = entry.box_type

        with transaction.atomic():
            # If moving to a different date
            if old_date != target_date:
                # Shift sequences in the new bin to make room
                PriorityLinePriority.objects.filter(
                    tenant=tenant,
                    vendor_id=old_vendor,
                    scheduled_date=target_date,
                    box_type=old_box_type,
                    sequence__gte=insert_at
                ).update(sequence=F('sequence') + 1)

                # Update the entry
                entry.scheduled_date = target_date
                entry.sequence = insert_at
                entry.save()

                # Resequence the old bin (fill the gap)
                old_bin_entries = PriorityLinePriority.objects.filter(
                    tenant=tenant,
                    vendor_id=old_vendor,
                    scheduled_date=old_date,
                    box_type=old_box_type
                ).order_by('sequence')

                for idx, e in enumerate(old_bin_entries):
                    if e.sequence != idx:
                        e.sequence = idx
                        e.save(update_fields=['sequence'])

                # Update parent PO's scheduled_date
                po = entry.purchase_order_line.purchase_order
                po.scheduled_date = target_date
                po.save(update_fields=['scheduled_date'])

                # Broadcast order update
                broadcast_order_update(
                    po.id,
                    'updated',
                    {
                        'id': po.id,
                        'order_type': 'PO',
                        'number': po.po_number,
                        'scheduled_date': str(target_date),
                    },
                    tenant_id=tenant.id
                )

                # Broadcast priority updates for both old and new dates
                broadcast_priority_update(
                    vendor_id=old_vendor,
                    date=str(old_date),
                    action='moved',
                    data={'line_id': line_id, 'box_type': old_box_type, 'direction': 'from'},
                    tenant_id=tenant.id
                )
                broadcast_priority_update(
                    vendor_id=old_vendor,
                    date=str(target_date),
                    action='moved',
                    data={'line_id': line_id, 'box_type': old_box_type, 'direction': 'to', 'sequence': insert_at},
                    tenant_id=tenant.id
                )

        # Return updated entry
        return Response(PriorityLinePrioritySerializer(entry).data)

    @extend_schema(
        tags=['priority-list'],
        summary='Sync PO lines to priority list',
        responses={200: {'description': 'Sync completed'}}
    )
    @action(detail=False, methods=['post'])
    def sync(self, request):
        """
        Sync open PO lines to the priority list.

        Creates PriorityLinePriority entries for PO lines that don't have one,
        and removes entries for lines that no longer exist or are complete.
        """
        tenant = request.tenant

        with transaction.atomic():
            # Get all open PO lines (on POs that are not complete/cancelled and have a scheduled date)
            open_po_lines = PurchaseOrderLine.objects.filter(
                tenant=tenant,
                purchase_order__scheduled_date__isnull=False
            ).exclude(
                purchase_order__status__in=['complete', 'cancelled']
            ).select_related('purchase_order', 'item')

            created_count = 0
            for po_line in open_po_lines:
                # Check if entry already exists
                if not PriorityLinePriority.objects.filter(
                    tenant=tenant,
                    purchase_order_line=po_line
                ).exists():
                    # Derive box type from item
                    box_type = get_box_type_for_item(po_line.item)

                    # Get next sequence for this bin
                    max_seq = PriorityLinePriority.objects.filter(
                        tenant=tenant,
                        vendor=po_line.purchase_order.vendor,
                        scheduled_date=po_line.purchase_order.scheduled_date,
                        box_type=box_type
                    ).order_by('-sequence').values_list('sequence', flat=True).first()

                    next_seq = (max_seq or 0) + 1

                    PriorityLinePriority.objects.create(
                        tenant=tenant,
                        purchase_order_line=po_line,
                        vendor=po_line.purchase_order.vendor,
                        scheduled_date=po_line.purchase_order.scheduled_date,
                        box_type=box_type,
                        sequence=next_seq
                    )
                    created_count += 1

            # Remove entries for lines that are complete/cancelled
            deleted_count, _ = PriorityLinePriority.objects.filter(
                tenant=tenant,
                purchase_order_line__purchase_order__status__in=['complete', 'cancelled']
            ).delete()

        # Broadcast sync completed (general notification)
        if created_count > 0 or deleted_count > 0:
            broadcast_priority_update(
                vendor_id=0,  # 0 indicates all vendors
                date='',  # empty indicates all dates
                action='synced',
                data={'created': created_count, 'deleted': deleted_count},
                tenant_id=tenant.id
            )

        return Response({
            'status': 'success',
            'created': created_count,
            'deleted': deleted_count
        })


class VendorKickAllotmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing vendor kick allotments.
    """
    serializer_class = VendorKickAllotmentSerializer

    def get_queryset(self):
        return VendorKickAllotment.objects.select_related('vendor__party').all()

    @extend_schema(tags=['priority-list'])
    def list(self, request, *args, **kwargs):
        """List all vendor kick allotments."""
        vendor_id = request.query_params.get('vendor_id')
        queryset = self.get_queryset()

        if vendor_id:
            queryset = queryset.filter(vendor_id=vendor_id)

        queryset = queryset.order_by('vendor', 'box_type')
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @extend_schema(tags=['priority-list'])
    def create(self, request, *args, **kwargs):
        """Create or update a vendor kick allotment."""
        serializer = VendorAllotmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vendor_id = serializer.validated_data['vendor_id']
        box_type = serializer.validated_data['box_type']
        daily_allotment = serializer.validated_data['daily_allotment']

        tenant = request.tenant

        try:
            vendor = Vendor.objects.get(pk=vendor_id)
        except Vendor.DoesNotExist:
            return Response(
                {'error': f'Vendor with id {vendor_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        allotment, created = VendorKickAllotment.objects.update_or_create(
            tenant=tenant,
            vendor=vendor,
            box_type=box_type,
            defaults={'daily_allotment': daily_allotment}
        )

        return Response(
            VendorKickAllotmentSerializer(allotment).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    @extend_schema(tags=['priority-list'])
    def destroy(self, request, *args, **kwargs):
        """Delete a vendor kick allotment."""
        return super().destroy(request, *args, **kwargs)


class DailyKickOverrideViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing daily kick overrides.
    """
    serializer_class = DailyKickOverrideSerializer

    def get_queryset(self):
        return DailyKickOverride.objects.select_related('vendor__party').all()

    @extend_schema(tags=['priority-list'])
    def list(self, request, *args, **kwargs):
        """List daily kick overrides."""
        vendor_id = request.query_params.get('vendor_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        queryset = self.get_queryset()

        if vendor_id:
            queryset = queryset.filter(vendor_id=vendor_id)
        if start_date:
            try:
                start = datetime.strptime(start_date, '%Y-%m-%d').date()
                queryset = queryset.filter(date__gte=start)
            except ValueError:
                pass
        if end_date:
            try:
                end = datetime.strptime(end_date, '%Y-%m-%d').date()
                queryset = queryset.filter(date__lte=end)
            except ValueError:
                pass

        queryset = queryset.order_by('vendor', 'date', 'box_type')
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @extend_schema(tags=['priority-list'])
    def create(self, request, *args, **kwargs):
        """Create or update a daily kick override."""
        serializer = DailyOverrideCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vendor_id = serializer.validated_data['vendor_id']
        box_type = serializer.validated_data['box_type']
        date = serializer.validated_data['date']
        allotment = serializer.validated_data['allotment']

        tenant = request.tenant

        try:
            vendor = Vendor.objects.get(pk=vendor_id)
        except Vendor.DoesNotExist:
            return Response(
                {'error': f'Vendor with id {vendor_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        override, created = DailyKickOverride.objects.update_or_create(
            tenant=tenant,
            vendor=vendor,
            box_type=box_type,
            date=date,
            defaults={'allotment': allotment}
        )

        return Response(
            DailyKickOverrideSerializer(override).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    @extend_schema(
        tags=['priority-list'],
        summary='Clear a daily override',
        request=ClearOverrideSerializer
    )
    @action(detail=False, methods=['post'], url_path='clear')
    def clear_override(self, request):
        """Clear (delete) a daily override, reverting to the default allotment."""
        serializer = ClearOverrideSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vendor_id = serializer.validated_data['vendor_id']
        box_type = serializer.validated_data['box_type']
        date = serializer.validated_data['date']

        tenant = request.tenant

        deleted, _ = DailyKickOverride.objects.filter(
            tenant=tenant,
            vendor_id=vendor_id,
            box_type=box_type,
            date=date
        ).delete()

        if deleted:
            return Response({'status': 'success', 'message': 'Override cleared'})
        else:
            return Response(
                {'status': 'not_found', 'message': 'No override found to clear'},
                status=status.HTTP_404_NOT_FOUND
            )
