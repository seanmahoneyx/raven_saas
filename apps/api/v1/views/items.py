# apps/api/v1/views/items.py
"""
ViewSets for Item-related models: UnitOfMeasure, Item, ItemUOM.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.items.models import UnitOfMeasure, Item, ItemUOM
from apps.api.v1.serializers.items import (
    UnitOfMeasureSerializer, ItemSerializer, ItemListSerializer,
    ItemDetailSerializer, ItemUOMSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['items'], summary='List all units of measure'),
    retrieve=extend_schema(tags=['items'], summary='Get UOM details'),
    create=extend_schema(tags=['items'], summary='Create a new UOM'),
    update=extend_schema(tags=['items'], summary='Update a UOM'),
    partial_update=extend_schema(tags=['items'], summary='Partially update a UOM'),
    destroy=extend_schema(tags=['items'], summary='Delete a UOM'),
)
class UnitOfMeasureViewSet(viewsets.ModelViewSet):
    """
    ViewSet for UnitOfMeasure model.

    Provides CRUD operations for units of measure.
    """
    serializer_class = UnitOfMeasureSerializer

    def get_queryset(self):
        return UnitOfMeasure.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name', 'created_at']
    ordering = ['code']


@extend_schema_view(
    list=extend_schema(tags=['items'], summary='List all items'),
    retrieve=extend_schema(tags=['items'], summary='Get item details'),
    create=extend_schema(tags=['items'], summary='Create a new item'),
    update=extend_schema(tags=['items'], summary='Update an item'),
    partial_update=extend_schema(tags=['items'], summary='Partially update an item'),
    destroy=extend_schema(tags=['items'], summary='Delete an item'),
)
class ItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Item model.

    Provides CRUD operations for product catalog items.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return Item.objects.select_related('base_uom').all()
    filterset_fields = ['is_active', 'is_inventory', 'base_uom']
    search_fields = ['sku', 'name', 'description']
    ordering_fields = ['sku', 'name', 'created_at']
    ordering = ['sku']

    def get_serializer_class(self):
        if self.action == 'list':
            return ItemListSerializer
        if self.action == 'retrieve':
            return ItemDetailSerializer
        return ItemSerializer

    @extend_schema(
        tags=['items'],
        summary='List UOM conversions for an item',
        responses={200: ItemUOMSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def uom_conversions(self, request, pk=None):
        """List all UOM conversions for this item."""
        item = self.get_object()
        conversions = item.uom_conversions.select_related('uom').all()
        serializer = ItemUOMSerializer(conversions, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['items'],
        summary='Add UOM conversion to an item',
        request=ItemUOMSerializer,
        responses={201: ItemUOMSerializer}
    )
    @uom_conversions.mapping.post
    def add_uom_conversion(self, request, pk=None):
        """Add a UOM conversion to this item."""
        item = self.get_object()
        serializer = ItemUOMSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(item=item, tenant=request.tenant)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
