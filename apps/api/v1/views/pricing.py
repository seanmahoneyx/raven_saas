# apps/api/v1/views/pricing.py
"""
ViewSets for Pricing models: PriceListHead, PriceListLine.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.db import models

from apps.pricing.models import PriceListHead, PriceListLine
from apps.api.v1.serializers.pricing import (
    PriceListHeadSerializer, PriceListHeadListSerializer,
    PriceListHeadDetailSerializer, PriceListHeadWriteSerializer,
    PriceListLineSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['pricing'], summary='List all price lists'),
    retrieve=extend_schema(tags=['pricing'], summary='Get price list details'),
    create=extend_schema(tags=['pricing'], summary='Create a new price list'),
    update=extend_schema(tags=['pricing'], summary='Update a price list'),
    partial_update=extend_schema(tags=['pricing'], summary='Partially update a price list'),
    destroy=extend_schema(tags=['pricing'], summary='Delete a price list'),
)
class PriceListViewSet(viewsets.ModelViewSet):
    """
    ViewSet for PriceListHead model.

    Provides CRUD operations for customer price lists with quantity breaks.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return PriceListHead.objects.select_related(
            'customer__party', 'item'
        ).prefetch_related('lines').all()
    filterset_fields = ['customer', 'item', 'is_active']
    search_fields = ['customer__party__code', 'customer__party__display_name', 'item__sku', 'item__name']
    ordering_fields = ['begin_date', 'end_date', 'created_at']
    ordering = ['-begin_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return PriceListHeadListSerializer
        if self.action == 'retrieve':
            return PriceListHeadDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return PriceListHeadWriteSerializer
        return PriceListHeadSerializer

    @extend_schema(
        tags=['pricing'],
        summary='List lines for a price list',
        responses={200: PriceListLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all quantity break lines for this price list."""
        price_list = self.get_object()
        lines = price_list.lines.all()
        serializer = PriceListLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['pricing'],
        summary='Add line to price list',
        request=PriceListLineSerializer,
        responses={201: PriceListLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a quantity break line to this price list."""
        price_list = self.get_object()
        serializer = PriceListLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(price_list=price_list, tenant=request.tenant)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['pricing'],
        summary='Get price for customer/item/quantity',
        responses={200: {'type': 'object', 'properties': {'unit_price': {'type': 'number'}}}}
    )
    @action(detail=False, methods=['get'])
    def lookup(self, request):
        """
        Look up price for a customer/item/quantity combination.

        Query params:
        - customer: Customer ID
        - item: Item ID
        - quantity: Order quantity (default: 1)
        - date: Date to check (default: today)
        """
        from django.utils import timezone

        customer_id = request.query_params.get('customer')
        item_id = request.query_params.get('item')
        quantity = int(request.query_params.get('quantity', 1))
        date_str = request.query_params.get('date')

        if not customer_id or not item_id:
            return Response(
                {'error': 'customer and item parameters are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        check_date = timezone.now().date()
        if date_str:
            from datetime import datetime
            check_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        # Find valid price list for this customer/item/date
        price_list = PriceListHead.objects.filter(
            customer_id=customer_id,
            item_id=item_id,
            is_active=True,
            begin_date__lte=check_date,
        ).filter(
            models.Q(end_date__isnull=True) | models.Q(end_date__gte=check_date)
        ).first()

        if not price_list:
            # Fallback: check for active contract price
            from apps.contracts.models import ContractLine
            contract_line = ContractLine.objects.filter(
                contract__customer_id=customer_id,
                item_id=item_id,
                contract__status='active',
                contract__start_date__lte=check_date,
            ).filter(
                models.Q(contract__end_date__isnull=True) | models.Q(contract__end_date__gte=check_date)
            ).select_related('contract').first()

            if contract_line and contract_line.unit_price:
                return Response({
                    'customer_id': customer_id,
                    'item_id': item_id,
                    'quantity': quantity,
                    'date': str(check_date),
                    'unit_price': str(contract_line.unit_price),
                    'price_list_id': None,
                    'contract_id': contract_line.contract_id,
                    'source': 'contract',
                })

            return Response(
                {'error': 'No active price list or contract found for this customer/item/date'},
                status=status.HTTP_404_NOT_FOUND
            )

        unit_price = price_list.get_price_for_quantity(quantity)
        if unit_price is None:
            return Response(
                {'error': 'No price tier found for this quantity'},
                status=status.HTTP_404_NOT_FOUND
            )

        return Response({
            'customer_id': customer_id,
            'item_id': item_id,
            'quantity': quantity,
            'date': str(check_date),
            'unit_price': str(unit_price),
            'price_list_id': price_list.id,
            'source': 'price_list',
        })
