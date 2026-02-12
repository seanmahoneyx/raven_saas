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

    @extend_schema(tags=['design'], summary='List/create design request attachments')
    @action(detail=True, methods=['get', 'post'])
    def attachments(self, request, pk=None):
        """List or create attachments for this design request."""
        design_request = self.get_object()
        from django.contrib.contenttypes.models import ContentType
        from apps.documents.models import Attachment

        ct = ContentType.objects.get_for_model(DesignRequest)

        if request.method == 'GET':
            atts = Attachment.objects.filter(
                content_type=ct,
                object_id=design_request.pk,
            )
            data = [{
                'id': a.id,
                'filename': a.filename,
                'mime_type': a.mime_type,
                'file_size': a.file_size,
                'category': a.category,
                'description': a.description,
                'uploaded_by': a.uploaded_by_id,
                'file_url': a.file.url if a.file else None,
                'created_at': a.created_at.isoformat(),
            } for a in atts]
            return Response(data)

        # POST - create attachment
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        attachment = Attachment.objects.create(
            tenant=design_request.tenant,
            content_type=ct,
            object_id=design_request.pk,
            file=file,
            filename=file.name,
            mime_type=file.content_type or '',
            file_size=file.size,
            category=request.data.get('category', 'document'),
            description=request.data.get('description', ''),
            uploaded_by=request.user if request.user.is_authenticated else None,
        )

        return Response({
            'id': attachment.id,
            'filename': attachment.filename,
            'mime_type': attachment.mime_type,
            'file_size': attachment.file_size,
            'category': attachment.category,
            'description': attachment.description,
            'file_url': attachment.file.url,
            'created_at': attachment.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['design'], summary='Delete a design request attachment')
    @action(detail=True, methods=['delete'], url_path='attachments/(?P<attachment_id>[0-9]+)')
    def delete_attachment(self, request, pk=None, attachment_id=None):
        """Delete an attachment for this design request."""
        design_request = self.get_object()
        from django.contrib.contenttypes.models import ContentType
        from apps.documents.models import Attachment

        ct = ContentType.objects.get_for_model(DesignRequest)
        try:
            attachment = Attachment.objects.get(
                id=attachment_id,
                content_type=ct,
                object_id=design_request.pk,
            )
            attachment.file.delete(save=False)
            attachment.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Attachment.DoesNotExist:
            return Response({'error': 'Attachment not found'}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        tags=['design'],
        summary='Create estimate from design request',
        request={
            'type': 'object',
            'properties': {
                'quantity': {'type': 'integer', 'default': 1},
                'unit_price': {'type': 'string'},
                'notes': {'type': 'string'},
            },
        },
        responses={201: {'type': 'object'}}
    )
    @action(detail=True, methods=['post'], url_path='create-estimate')
    def create_estimate(self, request, pk=None):
        """Create an estimate from this design request."""
        design_request = self.get_object()

        quantity = int(request.data.get('quantity', 1))
        unit_price = request.data.get('unit_price')
        notes = request.data.get('notes', '')

        svc = DesignService(tenant=request.tenant, user=request.user)
        try:
            estimate = svc.create_estimate_from_design(
                design_request=design_request,
                quantity=quantity,
                unit_price=unit_price,
                notes=notes,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'id': estimate.id,
            'estimate_number': estimate.estimate_number,
            'message': f'Estimate {estimate.estimate_number} created from design {design_request.file_number}',
        }, status=status.HTTP_201_CREATED)
