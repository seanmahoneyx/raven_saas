# apps/api/v1/views/warehousing.py
"""
ViewSets for Warehousing models: Warehouse, Bin.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.warehousing.models import Warehouse, Bin
from apps.api.v1.serializers.warehousing import (
    WarehouseSerializer, WarehouseListSerializer, WarehouseDetailSerializer,
    BinSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['warehousing'], summary='List all warehouses'),
    retrieve=extend_schema(tags=['warehousing'], summary='Get warehouse details'),
    create=extend_schema(tags=['warehousing'], summary='Create a new warehouse'),
    update=extend_schema(tags=['warehousing'], summary='Update a warehouse'),
    partial_update=extend_schema(tags=['warehousing'], summary='Partially update a warehouse'),
    destroy=extend_schema(tags=['warehousing'], summary='Delete a warehouse'),
)
class WarehouseViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Warehouse model.

    Provides CRUD operations for warehouse locations.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return Warehouse.objects.select_related('location').prefetch_related('bins').all()
    filterset_fields = ['is_active', 'is_default']
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name', 'created_at']
    ordering = ['code']

    def get_serializer_class(self):
        if self.action == 'list':
            return WarehouseListSerializer
        if self.action == 'retrieve':
            return WarehouseDetailSerializer
        return WarehouseSerializer

    @extend_schema(
        tags=['warehousing'],
        summary='List bins for a warehouse',
        responses={200: BinSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def bins(self, request, pk=None):
        """List all bins in this warehouse."""
        warehouse = self.get_object()
        bins = warehouse.bins.all()
        serializer = BinSerializer(bins, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['warehousing'],
        summary='Add bin to warehouse',
        request=BinSerializer,
        responses={201: BinSerializer}
    )
    @bins.mapping.post
    def add_bin(self, request, pk=None):
        """Add a bin to this warehouse."""
        warehouse = self.get_object()
        serializer = BinSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(warehouse=warehouse, tenant=request.tenant)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    list=extend_schema(tags=['warehousing'], summary='List all bins'),
    retrieve=extend_schema(tags=['warehousing'], summary='Get bin details'),
    create=extend_schema(tags=['warehousing'], summary='Create a new bin'),
    update=extend_schema(tags=['warehousing'], summary='Update a bin'),
    partial_update=extend_schema(tags=['warehousing'], summary='Partially update a bin'),
    destroy=extend_schema(tags=['warehousing'], summary='Delete a bin'),
)
class BinViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Bin model.

    Provides CRUD operations for storage bin locations.
    """
    serializer_class = BinSerializer

    def get_queryset(self):
        return Bin.objects.select_related('warehouse').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['warehouse', 'bin_type', 'is_active']
    search_fields = ['code', 'aisle', 'rack', 'level']
    ordering_fields = ['warehouse__code', 'code', 'created_at']
    ordering = ['warehouse__code', 'code']
