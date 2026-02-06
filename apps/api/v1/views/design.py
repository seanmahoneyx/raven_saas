"""
ViewSets for Design module: DesignRequest.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.design.models import DesignRequest
from apps.design.services import DesignService
from apps.items.models import UnitOfMeasure
from apps.api.v1.serializers.design import (
    DesignRequestListSerializer,
    DesignRequestSerializer,
    DesignRequestWriteSerializer,
    PromoteDesignSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['design'], summary='List design requests'),
    retrieve=extend_schema(tags=['design'], summary='Get design request details'),
    create=extend_schema(tags=['design'], summary='Create a design request'),
    update=extend_schema(tags=['design'], summary='Update a design request'),
    partial_update=extend_schema(tags=['design'], summary='Partially update a design request'),
    destroy=extend_schema(tags=['design'], summary='Delete a design request'),
)
class DesignRequestViewSet(viewsets.ModelViewSet):
    """ViewSet for DesignRequest model."""
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'customer', 'assigned_to']
    search_fields = ['file_number', 'ident', 'style', 'customer__display_name']
    ordering_fields = ['file_number', 'created_at', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        return DesignRequest.objects.select_related(
            'customer', 'requested_by', 'assigned_to', 'generated_item'
        ).all()

    def get_serializer_class(self):
        if self.action == 'list':
            return DesignRequestListSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return DesignRequestWriteSerializer
        return DesignRequestSerializer

    @extend_schema(
        tags=['design'],
        summary='Promote design request to item',
        request=PromoteDesignSerializer,
        responses={201: DesignRequestSerializer}
    )
    @action(detail=True, methods=['post'])
    def promote(self, request, pk=None):
        """Promote an approved design request into an Item."""
        design_request = self.get_object()

        serializer = PromoteDesignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Resolve the UOM
        try:
            base_uom = UnitOfMeasure.objects.get(
                id=serializer.validated_data['base_uom'],
                tenant=request.tenant
            )
        except UnitOfMeasure.DoesNotExist:
            return Response(
                {'error': 'Unit of measure not found'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Build overrides from optional fields
        overrides = {}
        if 'name' in serializer.validated_data:
            overrides['name'] = serializer.validated_data['name']
        if 'description' in serializer.validated_data:
            overrides['description'] = serializer.validated_data['description']

        svc = DesignService(tenant=request.tenant, user=request.user)
        try:
            svc.promote_to_item(
                design_request=design_request,
                sku=serializer.validated_data['sku'],
                base_uom=base_uom,
                **overrides
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Return the refreshed design request
        return Response(
            DesignRequestSerializer(design_request, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )
