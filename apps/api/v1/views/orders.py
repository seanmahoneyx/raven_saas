# apps/api/v1/views/orders.py
"""
ViewSets for Order models: PurchaseOrder, SalesOrder, and their lines.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.orders.models import (
    PurchaseOrder, PurchaseOrderLine,
    SalesOrder, SalesOrderLine,
)
from apps.api.v1.serializers.orders import (
    PurchaseOrderSerializer, PurchaseOrderListSerializer,
    PurchaseOrderDetailSerializer, PurchaseOrderWriteSerializer,
    PurchaseOrderLineSerializer,
    SalesOrderSerializer, SalesOrderListSerializer,
    SalesOrderDetailSerializer, SalesOrderWriteSerializer,
    SalesOrderLineSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['orders'], summary='List all purchase orders'),
    retrieve=extend_schema(tags=['orders'], summary='Get purchase order details'),
    create=extend_schema(tags=['orders'], summary='Create a new purchase order'),
    update=extend_schema(tags=['orders'], summary='Update a purchase order'),
    partial_update=extend_schema(tags=['orders'], summary='Partially update a purchase order'),
    destroy=extend_schema(tags=['orders'], summary='Delete a purchase order'),
)
class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for PurchaseOrder model.

    Provides CRUD operations for purchase orders (inbound from vendors).
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return PurchaseOrder.objects.select_related(
            'vendor__party', 'ship_to', 'scheduled_truck'
        ).prefetch_related('lines__item', 'lines__uom').all()
    filterset_fields = ['status', 'vendor', 'scheduled_date', 'scheduled_truck']
    search_fields = ['po_number', 'vendor__party__display_name', 'notes']
    ordering_fields = ['po_number', 'order_date', 'scheduled_date', 'created_at']
    ordering = ['-order_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return PurchaseOrderListSerializer
        if self.action == 'retrieve':
            return PurchaseOrderDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return PurchaseOrderWriteSerializer
        return PurchaseOrderSerializer

    @extend_schema(
        tags=['orders'],
        summary='List lines for a purchase order',
        responses={200: PurchaseOrderLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all lines for this purchase order."""
        po = self.get_object()
        lines = po.lines.select_related('item', 'uom').all()
        serializer = PurchaseOrderLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['orders'],
        summary='Add line to purchase order',
        request=PurchaseOrderLineSerializer,
        responses={201: PurchaseOrderLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a line to this purchase order."""
        po = self.get_object()
        if not po.is_editable:
            return Response(
                {'error': 'Cannot modify lines on this order - order is not editable'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = PurchaseOrderLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # Auto-generate line number if not provided
        line_number = serializer.validated_data.get('line_number')
        if not line_number:
            max_line = po.lines.order_by('-line_number').first()
            line_number = (max_line.line_number + 10) if max_line else 10

        serializer.save(
            purchase_order=po,
            tenant=request.tenant,
            line_number=line_number
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['orders'], summary='Confirm a draft purchase order')
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm a draft purchase order."""
        po = self.get_object()
        if po.status != 'draft':
            return Response(
                {'error': f'Cannot confirm order with status: {po.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        po.status = 'confirmed'
        po.save()
        return Response(PurchaseOrderSerializer(po, context={'request': request}).data)

    @extend_schema(tags=['orders'], summary='Cancel a purchase order')
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a purchase order."""
        po = self.get_object()
        if po.status in ['shipped', 'complete', 'cancelled']:
            return Response(
                {'error': f'Cannot cancel order with status: {po.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        po.status = 'cancelled'
        po.save()
        return Response(PurchaseOrderSerializer(po, context={'request': request}).data)

    @extend_schema(tags=['orders'], summary='List unscheduled purchase orders')
    @action(detail=False, methods=['get'])
    def unscheduled(self, request):
        """Return purchase orders with no scheduled date."""
        queryset = self.filter_queryset(
            self.get_queryset().filter(scheduled_date__isnull=True)
        ).exclude(status__in=['complete', 'cancelled'])
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = PurchaseOrderListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = PurchaseOrderListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['orders'], summary='List all sales orders'),
    retrieve=extend_schema(tags=['orders'], summary='Get sales order details'),
    create=extend_schema(tags=['orders'], summary='Create a new sales order'),
    update=extend_schema(tags=['orders'], summary='Update a sales order'),
    partial_update=extend_schema(tags=['orders'], summary='Partially update a sales order'),
    destroy=extend_schema(tags=['orders'], summary='Delete a sales order'),
)
class SalesOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for SalesOrder model.

    Provides CRUD operations for sales orders (outbound to customers).
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return SalesOrder.objects.select_related(
            'customer__party', 'ship_to', 'bill_to', 'scheduled_truck'
        ).prefetch_related('lines__item', 'lines__uom').all()
    filterset_fields = ['status', 'customer', 'scheduled_date', 'scheduled_truck']
    search_fields = ['order_number', 'customer__party__display_name', 'customer_po', 'notes']
    ordering_fields = ['order_number', 'order_date', 'scheduled_date', 'created_at']
    ordering = ['-order_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return SalesOrderListSerializer
        if self.action == 'retrieve':
            return SalesOrderDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return SalesOrderWriteSerializer
        return SalesOrderSerializer

    @extend_schema(
        tags=['orders'],
        summary='List lines for a sales order',
        responses={200: SalesOrderLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all lines for this sales order."""
        so = self.get_object()
        lines = so.lines.select_related('item', 'uom').all()
        serializer = SalesOrderLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['orders'],
        summary='Add line to sales order',
        request=SalesOrderLineSerializer,
        responses={201: SalesOrderLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a line to this sales order."""
        so = self.get_object()
        if not so.is_editable:
            return Response(
                {'error': 'Cannot modify lines on this order - order is not editable'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = SalesOrderLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # Auto-generate line number if not provided
        line_number = serializer.validated_data.get('line_number')
        if not line_number:
            max_line = so.lines.order_by('-line_number').first()
            line_number = (max_line.line_number + 10) if max_line else 10

        serializer.save(
            sales_order=so,
            tenant=request.tenant,
            line_number=line_number
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['orders'], summary='Confirm a draft sales order')
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm a draft sales order."""
        so = self.get_object()
        if so.status != 'draft':
            return Response(
                {'error': f'Cannot confirm order with status: {so.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        so.status = 'confirmed'
        so.save()
        return Response(SalesOrderSerializer(so, context={'request': request}).data)

    @extend_schema(tags=['orders'], summary='Cancel a sales order')
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a sales order."""
        so = self.get_object()
        if so.status in ['shipped', 'complete', 'cancelled']:
            return Response(
                {'error': f'Cannot cancel order with status: {so.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        so.status = 'cancelled'
        so.save()
        return Response(SalesOrderSerializer(so, context={'request': request}).data)

    @extend_schema(tags=['orders'], summary='List unscheduled sales orders')
    @action(detail=False, methods=['get'])
    def unscheduled(self, request):
        """Return sales orders with no scheduled date."""
        queryset = self.filter_queryset(
            self.get_queryset().filter(scheduled_date__isnull=True)
        ).exclude(status__in=['complete', 'cancelled'])
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = SalesOrderListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = SalesOrderListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)
