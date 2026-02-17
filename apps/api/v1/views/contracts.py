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

        serializer = CreateReleaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Get contract line
        line_id = serializer.validated_data['contract_line_id']
        try:
            contract_line = contract.lines.get(id=line_id)
        except ContractLine.DoesNotExist:
            return Response(
                {'error': 'Contract line not found'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Resolve ship_to if provided
        ship_to = None
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

        from apps.contracts.services import ContractService
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            service = ContractService(request.tenant, request.user)
            sales_order, release, warning = service.create_release(
                contract_line=contract_line,
                quantity=serializer.validated_data['quantity'],
                ship_to=ship_to,
                unit_price=serializer.validated_data.get('unit_price'),
                scheduled_date=serializer.validated_data.get('scheduled_date'),
                notes=serializer.validated_data.get('notes', ''),
            )
        except DjangoValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else e)},
                status=status.HTTP_400_BAD_REQUEST
            )

        data = ContractReleaseSerializer(release, context={'request': request}).data
        if warning:
            data['warning'] = warning
        return Response(data, status=status.HTTP_201_CREATED)

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

    @extend_schema(tags=['contracts'], summary='Revert a contract to draft')
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Revert an active contract back to draft status."""
        contract = self.get_object()
        if contract.status != 'active':
            return Response(
                {'error': f'Cannot deactivate contract with status: {contract.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        contract.status = 'draft'
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
