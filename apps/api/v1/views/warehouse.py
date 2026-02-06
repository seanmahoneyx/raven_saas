# apps/api/v1/views/warehouse.py
"""
API views for WMS (Warehouse Management System).

Provides endpoints for:
- Warehouse locations (CRUD)
- Lot tracking (CRUD)
- Stock queries by location
- Stock movement operations
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.warehousing.models import WarehouseLocation, Lot, StockQuant, StockMoveLog
from apps.warehousing.services import StockMoveService
from apps.items.models import Item
from apps.api.v1.serializers.warehouse import (
    WarehouseLocationSerializer,
    LotSerializer,
    StockQuantSerializer,
    StockMoveSerializer,
    StockMoveLogSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['warehouse'], summary='List warehouse locations'),
    retrieve=extend_schema(tags=['warehouse'], summary='Get warehouse location details'),
    create=extend_schema(tags=['warehouse'], summary='Create a warehouse location'),
    update=extend_schema(tags=['warehouse'], summary='Update a warehouse location'),
    partial_update=extend_schema(tags=['warehouse'], summary='Partially update a warehouse location'),
    destroy=extend_schema(tags=['warehouse'], summary='Delete a warehouse location'),
)
class WarehouseLocationViewSet(viewsets.ModelViewSet):
    serializer_class = WarehouseLocationSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['warehouse', 'type', 'is_active']
    search_fields = ['name', 'barcode', 'parent_path']
    ordering_fields = ['name', 'type', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        return WarehouseLocation.objects.select_related('warehouse').all()


@extend_schema_view(
    list=extend_schema(tags=['warehouse'], summary='List lots'),
    retrieve=extend_schema(tags=['warehouse'], summary='Get lot details'),
    create=extend_schema(tags=['warehouse'], summary='Create a lot'),
)
class LotViewSet(viewsets.ModelViewSet):
    serializer_class = LotSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['item']
    search_fields = ['lot_number', 'vendor_batch']
    ordering_fields = ['lot_number', 'created_at', 'expiry_date']
    ordering = ['-created_at']

    def get_queryset(self):
        return Lot.objects.select_related('item').all()


class StockByLocationView(APIView):
    """GET /warehouse/stock-by-location/{item_id}/ - Shows where an item is located."""

    @extend_schema(
        tags=['warehouse'],
        summary='Get stock quantities by location for an item',
        responses={200: StockQuantSerializer(many=True)},
    )
    def get(self, request, item_id):
        try:
            item = Item.objects.get(pk=item_id, tenant=request.tenant)
        except Item.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

        service = StockMoveService(request.tenant, request.user)
        quants = service.get_stock_by_location(item)
        serializer = StockQuantSerializer(quants, many=True, context={'request': request})
        return Response(serializer.data)


class StockMoveView(APIView):
    """POST /warehouse/move/ - Execute a stock move (for handheld scanners)."""

    @extend_schema(
        tags=['warehouse'],
        summary='Execute a stock move between locations',
        request=StockMoveSerializer,
        responses={201: StockMoveLogSerializer},
    )
    def post(self, request):
        serializer = StockMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Resolve FKs
        try:
            item = Item.objects.get(pk=data['item'], tenant=request.tenant)
            source_loc = WarehouseLocation.objects.get(pk=data['source_location'], tenant=request.tenant)
            dest_loc = WarehouseLocation.objects.get(pk=data['destination_location'], tenant=request.tenant)
        except (Item.DoesNotExist, WarehouseLocation.DoesNotExist) as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        lot = None
        if data.get('lot'):
            try:
                lot = Lot.objects.get(pk=data['lot'], tenant=request.tenant)
            except Lot.DoesNotExist:
                return Response({'detail': 'Lot not found.'}, status=status.HTTP_404_NOT_FOUND)

        service = StockMoveService(request.tenant, request.user)
        try:
            move_log = service.execute_stock_move(
                item=item,
                qty=data['quantity'],
                source_loc=source_loc,
                dest_loc=dest_loc,
                lot=lot,
                reference=data.get('reference', ''),
            )
        except DjangoValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)

        result = StockMoveLogSerializer(move_log, context={'request': request})
        return Response(result.data, status=status.HTTP_201_CREATED)
