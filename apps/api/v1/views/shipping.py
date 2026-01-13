# apps/api/v1/views/shipping.py
"""
ViewSets for Shipping models: Shipment, ShipmentLine, BillOfLading, BOLLine.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.shipping.models import Shipment, ShipmentLine, BillOfLading, BOLLine
from apps.api.v1.serializers.shipping import (
    ShipmentSerializer, ShipmentListSerializer, ShipmentDetailSerializer,
    ShipmentLineSerializer, BillOfLadingSerializer, BillOfLadingListSerializer,
    BillOfLadingDetailSerializer, BOLLineSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['shipping'], summary='List all shipments'),
    retrieve=extend_schema(tags=['shipping'], summary='Get shipment details'),
    create=extend_schema(tags=['shipping'], summary='Create a new shipment'),
    update=extend_schema(tags=['shipping'], summary='Update a shipment'),
    partial_update=extend_schema(tags=['shipping'], summary='Partially update a shipment'),
    destroy=extend_schema(tags=['shipping'], summary='Delete a shipment'),
)
class ShipmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Shipment model.

    Provides CRUD operations for shipments.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return Shipment.objects.select_related('truck').prefetch_related(
            'lines__sales_order__customer__party', 'lines__sales_order__ship_to'
        ).all()
    filterset_fields = ['status', 'truck', 'ship_date']
    search_fields = ['shipment_number', 'driver_name']
    ordering_fields = ['shipment_number', 'ship_date', 'created_at']
    ordering = ['-ship_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return ShipmentListSerializer
        if self.action == 'retrieve':
            return ShipmentDetailSerializer
        return ShipmentSerializer

    @extend_schema(
        tags=['shipping'],
        summary='List lines for a shipment',
        responses={200: ShipmentLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all orders in this shipment."""
        shipment = self.get_object()
        lines = shipment.lines.select_related(
            'sales_order__customer__party', 'sales_order__ship_to'
        ).all()
        serializer = ShipmentLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['shipping'],
        summary='Add order to shipment',
        request=ShipmentLineSerializer,
        responses={201: ShipmentLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a sales order to this shipment."""
        shipment = self.get_object()
        serializer = ShipmentLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(shipment=shipment, tenant=request.tenant)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['shipping'], summary='Mark shipment as in transit')
    @action(detail=True, methods=['post'])
    def depart(self, request, pk=None):
        """Mark shipment as departed/in transit."""
        from django.utils import timezone
        shipment = self.get_object()
        if shipment.status not in ['planned', 'loading']:
            return Response(
                {'error': f'Cannot depart shipment with status: {shipment.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        shipment.status = 'in_transit'
        shipment.departure_time = timezone.now()
        shipment.save()
        return Response(ShipmentSerializer(shipment, context={'request': request}).data)

    @extend_schema(tags=['shipping'], summary='Mark shipment as delivered')
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark shipment as delivered/complete."""
        from django.utils import timezone
        shipment = self.get_object()
        if shipment.status != 'in_transit':
            return Response(
                {'error': f'Cannot complete shipment with status: {shipment.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        shipment.status = 'delivered'
        shipment.arrival_time = timezone.now()
        shipment.save()
        return Response(ShipmentSerializer(shipment, context={'request': request}).data)


@extend_schema_view(
    list=extend_schema(tags=['shipping'], summary='List all bills of lading'),
    retrieve=extend_schema(tags=['shipping'], summary='Get BOL details'),
    create=extend_schema(tags=['shipping'], summary='Create a new BOL'),
    update=extend_schema(tags=['shipping'], summary='Update a BOL'),
    partial_update=extend_schema(tags=['shipping'], summary='Partially update a BOL'),
    destroy=extend_schema(tags=['shipping'], summary='Delete a BOL'),
)
class BillOfLadingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for BillOfLading model.

    Provides CRUD operations for bills of lading.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return BillOfLading.objects.select_related('shipment').prefetch_related(
            'lines__item', 'lines__uom'
        ).all()
    filterset_fields = ['status', 'shipment', 'issue_date']
    search_fields = ['bol_number', 'carrier_name', 'shipper_name']
    ordering_fields = ['bol_number', 'issue_date', 'created_at']
    ordering = ['-issue_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return BillOfLadingListSerializer
        if self.action == 'retrieve':
            return BillOfLadingDetailSerializer
        return BillOfLadingSerializer

    @extend_schema(
        tags=['shipping'],
        summary='List lines for a BOL',
        responses={200: BOLLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all lines on this BOL."""
        bol = self.get_object()
        lines = bol.lines.select_related('item', 'uom').all()
        serializer = BOLLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(tags=['shipping'], summary='Issue a draft BOL')
    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        """Issue a draft BOL."""
        bol = self.get_object()
        if bol.status != 'draft':
            return Response(
                {'error': f'Cannot issue BOL with status: {bol.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        bol.status = 'issued'
        bol.save()
        return Response(BillOfLadingSerializer(bol, context={'request': request}).data)

    @extend_schema(tags=['shipping'], summary='Void a BOL')
    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        """Void a BOL."""
        bol = self.get_object()
        if bol.status == 'void':
            return Response(
                {'error': 'BOL is already void'},
                status=status.HTTP_400_BAD_REQUEST
            )
        bol.status = 'void'
        bol.save()
        return Response(BillOfLadingSerializer(bol, context={'request': request}).data)
