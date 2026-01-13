# apps/api/v1/views/costing.py
"""
ViewSets for Costing models: CostListHead, CostListLine.
"""
from django.db import models
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.costing.models import CostListHead, CostListLine
from apps.api.v1.serializers.costing import (
    CostListHeadSerializer, CostListHeadListSerializer,
    CostListHeadDetailSerializer, CostListHeadWriteSerializer,
    CostListLineSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['costing'], summary='List all cost lists'),
    retrieve=extend_schema(tags=['costing'], summary='Get cost list details'),
    create=extend_schema(tags=['costing'], summary='Create a new cost list'),
    update=extend_schema(tags=['costing'], summary='Update a cost list'),
    partial_update=extend_schema(tags=['costing'], summary='Partially update a cost list'),
    destroy=extend_schema(tags=['costing'], summary='Delete a cost list'),
)
class CostListViewSet(viewsets.ModelViewSet):
    """
    ViewSet for CostListHead model.

    Provides CRUD operations for vendor cost lists with quantity breaks.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return CostListHead.objects.select_related(
            'vendor__party', 'item'
        ).prefetch_related('lines').all()
    filterset_fields = ['vendor', 'item', 'is_active']
    search_fields = ['vendor__party__code', 'vendor__party__display_name', 'item__sku', 'item__name']
    ordering_fields = ['begin_date', 'end_date', 'created_at']
    ordering = ['-begin_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return CostListHeadListSerializer
        if self.action == 'retrieve':
            return CostListHeadDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return CostListHeadWriteSerializer
        return CostListHeadSerializer

    @extend_schema(
        tags=['costing'],
        summary='List lines for a cost list',
        responses={200: CostListLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all quantity break lines for this cost list."""
        cost_list = self.get_object()
        lines = cost_list.lines.all()
        serializer = CostListLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['costing'],
        summary='Add line to cost list',
        request=CostListLineSerializer,
        responses={201: CostListLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a quantity break line to this cost list."""
        cost_list = self.get_object()
        serializer = CostListLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(cost_list=cost_list, tenant=request.tenant)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['costing'],
        summary='Get cost for vendor/item/quantity',
        responses={200: {'type': 'object', 'properties': {'unit_cost': {'type': 'number'}}}}
    )
    @action(detail=False, methods=['get'])
    def lookup(self, request):
        """
        Look up cost for a vendor/item/quantity combination.

        Query params:
        - vendor: Vendor ID
        - item: Item ID
        - quantity: Purchase quantity (default: 1)
        - date: Date to check (default: today)
        """
        from django.utils import timezone

        vendor_id = request.query_params.get('vendor')
        item_id = request.query_params.get('item')
        quantity = int(request.query_params.get('quantity', 1))
        date_str = request.query_params.get('date')

        if not vendor_id or not item_id:
            return Response(
                {'error': 'vendor and item parameters are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        check_date = timezone.now().date()
        if date_str:
            from datetime import datetime
            check_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        # Find valid cost list for this vendor/item/date
        cost_list = CostListHead.objects.filter(
            vendor_id=vendor_id,
            item_id=item_id,
            is_active=True,
            begin_date__lte=check_date,
        ).filter(
            models.Q(end_date__isnull=True) | models.Q(end_date__gte=check_date)
        ).first()

        if not cost_list:
            return Response(
                {'error': 'No active cost list found for this vendor/item/date'},
                status=status.HTTP_404_NOT_FOUND
            )

        unit_cost = cost_list.get_cost_for_quantity(quantity)
        if unit_cost is None:
            return Response(
                {'error': 'No cost tier found for this quantity'},
                status=status.HTTP_404_NOT_FOUND
            )

        return Response({
            'vendor_id': vendor_id,
            'item_id': item_id,
            'quantity': quantity,
            'date': str(check_date),
            'unit_cost': str(unit_cost),
            'cost_list_id': cost_list.id,
        })
