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

from apps.warehousing.models import (
    WarehouseLocation, Lot, StockQuant, StockMoveLog,
    CycleCount, CycleCountLine,
)
from apps.warehousing.services import StockMoveService, CycleCountService
from apps.items.models import Item
from apps.api.v1.serializers.warehouse import (
    WarehouseLocationSerializer,
    LotSerializer,
    StockQuantSerializer,
    StockMoveSerializer,
    StockMoveLogSerializer,
    CycleCountListSerializer,
    CycleCountDetailSerializer,
    CycleCountLineSerializer,
    RecordCountSerializer,
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


class ScannerLocationLookupView(APIView):
    """GET /warehouse/scanner/location/?barcode=... - Lookup location by barcode for scanner."""

    @extend_schema(
        tags=['warehouse'],
        summary='Lookup location by barcode (scanner)',
        responses={200: {'type': 'object'}},
    )
    def get(self, request):
        barcode = request.query_params.get('barcode', '').strip()
        if not barcode:
            return Response({'detail': 'barcode parameter required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            loc = WarehouseLocation.objects.select_related('warehouse').get(
                tenant=request.tenant, barcode=barcode, is_active=True,
            )
        except WarehouseLocation.DoesNotExist:
            return Response({'detail': f'No location found for barcode: {barcode}'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'id': loc.id,
            'name': loc.name,
            'barcode': loc.barcode,
            'warehouse_code': loc.warehouse.code,
            'type': loc.type,
        })


class ScannerItemLookupView(APIView):
    """GET /warehouse/scanner/item/?sku=... - Lookup item by SKU for scanner."""

    @extend_schema(
        tags=['warehouse'],
        summary='Lookup item by SKU (scanner)',
        responses={200: {'type': 'object'}},
    )
    def get(self, request):
        sku = request.query_params.get('sku', '').strip()
        if not sku:
            return Response({'detail': 'sku parameter required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            item = Item.objects.get(tenant=request.tenant, sku=sku)
        except Item.DoesNotExist:
            return Response({'detail': f'No item found for SKU: {sku}'}, status=status.HTTP_404_NOT_FOUND)

        lots = Lot.objects.filter(tenant=request.tenant, item=item).order_by('-created_at')[:20]

        return Response({
            'id': item.id,
            'sku': item.sku,
            'name': item.name,
            'lots': LotSerializer(lots, many=True, context={'request': request}).data,
        })


@extend_schema_view(
    list=extend_schema(tags=['warehouse'], summary='List cycle counts'),
    retrieve=extend_schema(tags=['warehouse'], summary='Get cycle count details'),
    create=extend_schema(tags=['warehouse'], summary='Create a cycle count'),
)
class CycleCountViewSet(viewsets.ModelViewSet):
    """
    ViewSet for CycleCount model.

    Supports creating, starting, recording counts, and finalizing.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['warehouse', 'status']
    search_fields = ['count_number']
    ordering_fields = ['count_number', 'created_at', 'status']
    ordering = ['-created_at']
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        from django.db.models import Count, Q
        return CycleCount.objects.select_related(
            'warehouse', 'zone', 'counted_by'
        ).annotate(
            total_lines=Count('lines'),
            counted_lines=Count('lines', filter=Q(lines__is_counted=True)),
        ).all()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return CycleCountDetailSerializer
        return CycleCountListSerializer

    def perform_create(self, serializer):
        svc = CycleCountService(self.request.tenant, self.request.user)
        count = svc.create_count(
            warehouse=serializer.validated_data['warehouse'],
            zone=serializer.validated_data.get('zone'),
            notes=serializer.validated_data.get('notes', ''),
        )
        serializer.instance = count

    @extend_schema(tags=['warehouse'], summary='Start a cycle count (snapshot quantities)')
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Transition from draft to in_progress, snapshot expected quantities."""
        cycle_count = self.get_object()
        svc = CycleCountService(request.tenant, request.user)
        try:
            cycle_count = svc.start_count(cycle_count)
        except DjangoValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(CycleCountDetailSerializer(cycle_count, context={'request': request}).data)

    @extend_schema(
        tags=['warehouse'],
        summary='Record a counted quantity',
        request=RecordCountSerializer,
    )
    @action(detail=True, methods=['post'], url_path='record')
    def record(self, request, pk=None):
        """Record a counted quantity for a single line."""
        cycle_count = self.get_object()
        serializer = RecordCountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        svc = CycleCountService(request.tenant, request.user)
        try:
            line = svc.record_count(
                line_id=serializer.validated_data['line_id'],
                counted_quantity=serializer.validated_data['counted_quantity'],
                cycle_count_id=cycle_count.id,
            )
        except (CycleCountLine.DoesNotExist, DjangoValidationError) as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(CycleCountLineSerializer(line, context={'request': request}).data)

    @extend_schema(tags=['warehouse'], summary='Finalize cycle count and generate adjustments')
    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        """Finalize count: generate adjustment moves for variances."""
        cycle_count = self.get_object()
        svc = CycleCountService(request.tenant, request.user)
        try:
            cycle_count = svc.finalize_count(cycle_count)
        except DjangoValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(CycleCountDetailSerializer(cycle_count, context={'request': request}).data)
