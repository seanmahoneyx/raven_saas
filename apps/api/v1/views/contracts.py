# apps/api/v1/views/contracts.py
"""
ViewSets for Contract models: Contract, ContractLine, ContractRelease.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.contracts.models import Contract, ContractLine, ContractRelease
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.api.v1.serializers.contracts import (
    ContractSerializer, ContractListSerializer,
    ContractDetailSerializer, ContractWriteSerializer,
    ContractLineSerializer, ContractLineDetailSerializer,
    ContractReleaseSerializer, CreateReleaseSerializer,
)


def generate_next_order_number(tenant):
    """Generate next sales order number for a tenant."""
    last_order = SalesOrder.objects.filter(tenant=tenant).order_by('-id').first()
    if last_order and last_order.order_number.isdigit():
        return str(int(last_order.order_number) + 1).zfill(5)
    return '00001'


@extend_schema_view(
    list=extend_schema(tags=['contracts'], summary='List all contracts'),
    retrieve=extend_schema(tags=['contracts'], summary='Get contract details'),
    create=extend_schema(tags=['contracts'], summary='Create a new contract'),
    update=extend_schema(tags=['contracts'], summary='Update a contract'),
    partial_update=extend_schema(tags=['contracts'], summary='Partially update a contract'),
    destroy=extend_schema(tags=['contracts'], summary='Delete a contract'),
)
class ContractViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Contract model.

    Provides CRUD operations for blanket contracts.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'customer']
    search_fields = ['contract_number', 'blanket_po', 'customer__party__display_name']
    ordering_fields = ['contract_number', 'issue_date', 'created_at']
    ordering = ['-issue_date']

    def get_queryset(self):
        return Contract.objects.select_related(
            'customer__party', 'ship_to'
        ).prefetch_related('lines__item', 'lines__uom').all()

    def get_serializer_class(self):
        if self.action == 'list':
            return ContractListSerializer
        if self.action == 'retrieve':
            return ContractDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return ContractWriteSerializer
        return ContractSerializer

    @extend_schema(
        tags=['contracts'],
        summary='List lines for a contract',
        responses={200: ContractLineDetailSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all lines for this contract with releases."""
        contract = self.get_object()
        lines = contract.lines.select_related('item', 'uom').prefetch_related(
            'releases__sales_order_line__sales_order'
        ).all()
        serializer = ContractLineDetailSerializer(
            lines, many=True, context={'request': request}
        )
        return Response(serializer.data)

    @extend_schema(
        tags=['contracts'],
        summary='Add line to contract',
        request=ContractLineSerializer,
        responses={201: ContractLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a line to this contract."""
        contract = self.get_object()
        if contract.status not in ['draft', 'active']:
            return Response(
                {'error': f'Cannot add lines to contract with status: {contract.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ContractLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # Auto-generate line number if not provided
        line_number = serializer.validated_data.get('line_number')
        if not line_number:
            max_line = contract.lines.order_by('-line_number').first()
            line_number = (max_line.line_number + 10) if max_line else 10

        serializer.save(
            contract=contract,
            tenant=request.tenant,
            line_number=line_number
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['contracts'],
        summary='Create a release from contract line',
        request=CreateReleaseSerializer,
        responses={201: ContractReleaseSerializer}
    )
    @action(detail=True, methods=['post'])
    def create_release(self, request, pk=None):
        """Create a release (sales order) from this contract."""
        contract = self.get_object()

        if contract.status != 'active':
            return Response(
                {'error': f'Cannot create release from contract with status: {contract.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = CreateReleaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Get contract line and validate
        line_id = serializer.validated_data['contract_line_id']
        try:
            contract_line = contract.lines.get(id=line_id)
        except ContractLine.DoesNotExist:
            return Response(
                {'error': 'Contract line not found'},
                status=status.HTTP_400_BAD_REQUEST
            )

        quantity = serializer.validated_data['quantity']
        remaining = contract_line.remaining_qty

        # Warn but allow over-release
        over_release_warning = None
        if quantity > remaining:
            over_release_warning = f'Warning: Releasing {quantity} exceeds remaining balance ({remaining})'

        # Get ship_to - prefer request > contract > customer default
        ship_to_id = serializer.validated_data.get('ship_to_id')
        if ship_to_id:
            from apps.parties.models import Location
            try:
                ship_to = Location.objects.get(id=ship_to_id, tenant=request.tenant)
            except Location.DoesNotExist:
                return Response(
                    {'error': 'Ship-to location not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            ship_to = contract.ship_to or contract.customer.default_ship_to

        if not ship_to:
            return Response(
                {'error': 'No ship-to location specified and no default available'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Determine unit price - use request value, fall back to contract line price
        unit_price = serializer.validated_data.get('unit_price')
        if unit_price is None:
            unit_price = contract_line.unit_price or 0

        # Generate order number
        order_number = generate_next_order_number(request.tenant)

        # Create sales order
        sales_order = SalesOrder.objects.create(
            tenant=request.tenant,
            customer=contract.customer,
            order_number=order_number,
            order_date=timezone.now().date(),
            ship_to=ship_to,
            bill_to=contract.customer.default_bill_to,
            customer_po=contract.blanket_po,
            scheduled_date=serializer.validated_data.get('scheduled_date'),
            notes=serializer.validated_data.get('notes', ''),
            status='confirmed',
        )

        # Create sales order line
        sales_order_line = SalesOrderLine.objects.create(
            tenant=request.tenant,
            sales_order=sales_order,
            line_number=10,
            item=contract_line.item,
            quantity_ordered=quantity,
            uom=contract_line.uom,
            unit_price=unit_price,
        )

        # Create release record
        release = ContractRelease.objects.create(
            tenant=request.tenant,
            contract_line=contract_line,
            sales_order_line=sales_order_line,
            quantity_ordered=quantity,
            release_date=timezone.now().date(),
            notes=serializer.validated_data.get('notes', ''),
        )

        response_data = ContractReleaseSerializer(release, context={'request': request}).data
        if over_release_warning:
            response_data['warning'] = over_release_warning

        return Response(response_data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['contracts'], summary='Activate a draft contract')
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate a draft contract."""
        contract = self.get_object()
        if contract.status != 'draft':
            return Response(
                {'error': f'Cannot activate contract with status: {contract.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not contract.lines.exists():
            return Response(
                {'error': 'Cannot activate contract with no lines'},
                status=status.HTTP_400_BAD_REQUEST
            )
        contract.status = 'active'
        contract.save()
        return Response(ContractSerializer(contract, context={'request': request}).data)

    @extend_schema(tags=['contracts'], summary='Complete a contract')
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark a contract as completed."""
        contract = self.get_object()
        if contract.status != 'active':
            return Response(
                {'error': f'Cannot complete contract with status: {contract.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        contract.status = 'complete'
        contract.save()
        return Response(ContractSerializer(contract, context={'request': request}).data)

    @extend_schema(tags=['contracts'], summary='Cancel a contract')
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a contract."""
        contract = self.get_object()
        if contract.status in ['complete', 'cancelled']:
            return Response(
                {'error': f'Cannot cancel contract with status: {contract.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        contract.status = 'cancelled'
        contract.save()
        return Response(ContractSerializer(contract, context={'request': request}).data)

    @extend_schema(tags=['contracts'], summary='Get contracts by customer')
    @action(detail=False, methods=['get'])
    def by_customer(self, request):
        """Get contracts filtered by customer."""
        customer_id = request.query_params.get('customer')
        queryset = self.filter_queryset(self.get_queryset())
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        serializer = ContractListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(tags=['contracts'], summary='Get contracts containing item')
    @action(detail=False, methods=['get'])
    def by_item(self, request):
        """Get contracts that include a specific item."""
        item_id = request.query_params.get('item')
        if not item_id:
            return Response(
                {'error': 'item query parameter required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        queryset = self.get_queryset().filter(
            lines__item_id=item_id
        ).distinct()
        serializer = ContractListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(tags=['contracts'], summary='Get active contracts')
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Return only active contracts."""
        queryset = self.filter_queryset(
            self.get_queryset().filter(status='active')
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = ContractListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = ContractListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)
