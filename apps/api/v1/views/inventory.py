# apps/api/v1/views/inventory.py
"""
ViewSets for Inventory models: InventoryLot, InventoryPallet, InventoryBalance, InventoryTransaction.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.inventory.models import InventoryLot, InventoryPallet, InventoryBalance, InventoryTransaction
from apps.api.v1.serializers.inventory import (
    InventoryLotSerializer, InventoryLotListSerializer, InventoryLotDetailSerializer,
    InventoryPalletSerializer, InventoryBalanceSerializer, InventoryTransactionSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['inventory'], summary='List all inventory lots'),
    retrieve=extend_schema(tags=['inventory'], summary='Get inventory lot details'),
    create=extend_schema(tags=['inventory'], summary='Create a new inventory lot'),
    update=extend_schema(tags=['inventory'], summary='Update an inventory lot'),
    partial_update=extend_schema(tags=['inventory'], summary='Partially update an inventory lot'),
    destroy=extend_schema(tags=['inventory'], summary='Delete an inventory lot'),
)
class InventoryLotViewSet(viewsets.ModelViewSet):
    """
    ViewSet for InventoryLot model.

    Provides CRUD operations for inventory lots.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return InventoryLot.objects.select_related(
            'item', 'warehouse', 'vendor__party', 'purchase_order'
        ).prefetch_related('pallets').all()
    filterset_fields = ['item', 'warehouse', 'vendor', 'purchase_order']
    search_fields = ['lot_number', 'item__sku', 'item__name']
    ordering_fields = ['lot_number', 'received_date', 'created_at']
    ordering = ['-received_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return InventoryLotListSerializer
        if self.action == 'retrieve':
            return InventoryLotDetailSerializer
        return InventoryLotSerializer

    @extend_schema(
        tags=['inventory'],
        summary='List pallets for a lot',
        responses={200: InventoryPalletSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def pallets(self, request, pk=None):
        """List all pallets in this lot."""
        lot = self.get_object()
        pallets = lot.pallets.select_related('bin').all()
        serializer = InventoryPalletSerializer(pallets, many=True, context={'request': request})
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['inventory'], summary='List all inventory pallets'),
    retrieve=extend_schema(tags=['inventory'], summary='Get inventory pallet details'),
    create=extend_schema(tags=['inventory'], summary='Create a new inventory pallet'),
    update=extend_schema(tags=['inventory'], summary='Update an inventory pallet'),
    partial_update=extend_schema(tags=['inventory'], summary='Partially update an inventory pallet'),
    destroy=extend_schema(tags=['inventory'], summary='Delete an inventory pallet'),
)
class InventoryPalletViewSet(viewsets.ModelViewSet):
    """
    ViewSet for InventoryPallet model.

    Provides CRUD operations for inventory pallets.
    """
    serializer_class = InventoryPalletSerializer

    def get_queryset(self):
        return InventoryPallet.objects.select_related('lot__item', 'lot__warehouse', 'bin').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['lot', 'bin', 'status']
    search_fields = ['license_plate', 'lot__lot_number', 'lot__item__sku']
    ordering_fields = ['license_plate', 'created_at']
    ordering = ['lot', 'pallet_number']

    @extend_schema(tags=['inventory'], summary='Look up pallet by license plate')
    @action(detail=False, methods=['get'])
    def lookup(self, request):
        """Look up a pallet by license plate."""
        license_plate = request.query_params.get('license_plate')
        if not license_plate:
            return Response(
                {'error': 'license_plate parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            pallet = self.get_queryset().get(license_plate=license_plate)
            serializer = self.get_serializer(pallet)
            return Response(serializer.data)
        except InventoryPallet.DoesNotExist:
            return Response(
                {'error': f'Pallet with license plate {license_plate} not found'},
                status=status.HTTP_404_NOT_FOUND
            )


@extend_schema_view(
    list=extend_schema(tags=['inventory'], summary='List all inventory balances'),
    retrieve=extend_schema(tags=['inventory'], summary='Get inventory balance details'),
)
class InventoryBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for InventoryBalance model.

    Read-only - balances are updated via transactions.
    """
    serializer_class = InventoryBalanceSerializer

    def get_queryset(self):
        return InventoryBalance.objects.select_related('item', 'warehouse').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['item', 'warehouse']
    search_fields = ['item__sku', 'item__name', 'warehouse__code']
    ordering_fields = ['item__sku', 'warehouse__code', 'on_hand', 'last_updated']
    ordering = ['item__sku', 'warehouse__code']

    @extend_schema(
        tags=['inventory'],
        summary='Get balance for item/warehouse',
        responses={200: InventoryBalanceSerializer}
    )
    @action(detail=False, methods=['get'])
    def lookup(self, request):
        """Look up balance for a specific item/warehouse."""
        item_id = request.query_params.get('item')
        warehouse_id = request.query_params.get('warehouse')

        if not item_id:
            return Response(
                {'error': 'item parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = self.get_queryset().filter(item_id=item_id)
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['inventory'], summary='List all inventory transactions'),
    retrieve=extend_schema(tags=['inventory'], summary='Get inventory transaction details'),
    create=extend_schema(tags=['inventory'], summary='Create a new inventory transaction'),
)
class InventoryTransactionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for InventoryTransaction model.

    Transactions should normally be created through service layer,
    but direct creation is allowed for adjustments and corrections.
    """
    serializer_class = InventoryTransactionSerializer

    def get_queryset(self):
        return InventoryTransaction.objects.select_related(
            'item', 'warehouse', 'lot', 'pallet', 'user'
        ).all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['transaction_type', 'item', 'warehouse', 'lot', 'reference_type']
    search_fields = ['reference_number', 'item__sku', 'lot__lot_number']
    ordering_fields = ['transaction_date', 'created_at']
    ordering = ['-transaction_date']
    http_method_names = ['get', 'post', 'head', 'options']  # No updates/deletes on transactions
