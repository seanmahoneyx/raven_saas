# apps/api/v1/views/documents.py
"""
ViewSets for Document & Attachment management.
"""
from rest_framework import viewsets, filters, status, parsers
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from django.contrib.contenttypes.models import ContentType
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.api.v1.views.base import pdf_response
from apps.documents.models import Attachment, DocumentLink
from apps.documents.pdf import PDFService
from apps.documents.email import EmailService
from apps.api.v1.serializers.documents import (
    AttachmentSerializer, AttachmentUploadSerializer, GeneratePDFSerializer,
    DocumentLinkSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['documents'], summary='List attachments'),
    retrieve=extend_schema(tags=['documents'], summary='Get attachment details'),
    create=extend_schema(tags=['documents'], summary='Upload an attachment'),
    destroy=extend_schema(tags=['documents'], summary='Delete an attachment'),
)
class AttachmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing file attachments.

    Supports upload via multipart/form-data.
    Filter by content_type and object_id to get attachments for a specific object.
    """
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['content_type', 'object_id', 'category', 'mime_type']
    search_fields = ['filename', 'description']
    ordering_fields = ['created_at', 'filename', 'file_size']
    ordering = ['-created_at']
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        return Attachment.objects.select_related(
            'content_type', 'uploaded_by'
        ).all()

    def get_serializer_class(self):
        if self.action == 'create':
            return AttachmentUploadSerializer
        return AttachmentSerializer

    @extend_schema(
        tags=['documents'],
        summary='List attachments for a specific object',
        parameters=[
            {
                'name': 'app_label',
                'in': 'query',
                'type': 'string',
                'description': "App label (e.g., 'invoicing')",
            },
            {
                'name': 'model',
                'in': 'query',
                'type': 'string',
                'description': "Model name (e.g., 'invoice')",
            },
            {
                'name': 'object_id',
                'in': 'query',
                'type': 'integer',
                'description': 'Object ID',
            },
        ],
    )
    @action(detail=False, methods=['get'], url_path='for-object')
    def for_object(self, request):
        """Get all attachments for a specific object by app_label, model, and object_id."""
        app_label = request.query_params.get('app_label')
        model_name = request.query_params.get('model')
        object_id = request.query_params.get('object_id')

        if not all([app_label, model_name, object_id]):
            return Response(
                {'error': 'app_label, model, and object_id are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ct = ContentType.objects.get(app_label=app_label, model=model_name)
        except ContentType.DoesNotExist:
            return Response(
                {'error': f'Unknown model: {app_label}.{model_name}'},
                status=status.HTTP_404_NOT_FOUND,
            )

        attachments = self.get_queryset().filter(
            content_type=ct, object_id=object_id
        )
        serializer = AttachmentSerializer(
            attachments, many=True, context={'request': request}
        )
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['documents'], summary='List document lineage links'),
    retrieve=extend_schema(tags=['documents'], summary='Get a document link'),
)
class DocumentLinkViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet exposing document lineage edges.

    Use the ``for-object`` action to fetch the whole chain for a document:
    all links where the document is either the source OR the target.
    """
    serializer_class = DocumentLinkSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['relation', 'source_content_type', 'target_content_type']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        return DocumentLink.objects.select_related(
            'source_content_type', 'target_content_type', 'created_by'
        ).all()

    @extend_schema(
        tags=['documents'],
        summary='List lineage links for a specific object (source OR target)',
        parameters=[
            {'name': 'app_label', 'in': 'query', 'type': 'string',
             'description': "App label (e.g., 'orders')"},
            {'name': 'model', 'in': 'query', 'type': 'string',
             'description': "Model name (e.g., 'salesorder')"},
            {'name': 'object_id', 'in': 'query', 'type': 'integer',
             'description': 'Object ID'},
        ],
    )
    @action(detail=False, methods=['get'], url_path='for-object')
    def for_object(self, request):
        """Return all lineage links where the object is the source OR target."""
        app_label = request.query_params.get('app_label')
        model_name = request.query_params.get('model')
        object_id = request.query_params.get('object_id')

        if not all([app_label, model_name, object_id]):
            return Response(
                {'error': 'app_label, model, and object_id are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ct = ContentType.objects.get(app_label=app_label, model=model_name)
        except ContentType.DoesNotExist:
            return Response(
                {'error': f'Unknown model: {app_label}.{model_name}'},
                status=status.HTTP_404_NOT_FOUND,
            )

        links = self.get_queryset().filter(
            Q(source_content_type=ct, source_object_id=object_id)
            | Q(target_content_type=ct, target_object_id=object_id)
        )
        serializer = self.get_serializer(links, many=True)
        return Response(serializer.data)


# ─── PDF Generation Mixin ───────────────────────────────────────────────────

class PDFActionMixin:
    """
    Mixin that adds generate_pdf and email_pdf actions to a ViewSet.
    Subclasses must implement _get_pdf_bytes(obj) and _get_pdf_filename(obj).
    """

    def _get_pdf_bytes(self, obj):
        raise NotImplementedError

    def _get_pdf_filename(self, obj):
        raise NotImplementedError

    def _get_content_type_for_model(self, obj):
        return ContentType.objects.get_for_model(obj)

    @extend_schema(tags=['documents'], summary='Generate PDF', request=GeneratePDFSerializer)
    @action(detail=True, methods=['post'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        """Generate a PDF for this object. Optionally save as attachment and/or email."""
        obj = self.get_object()
        serializer = GeneratePDFSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        pdf_bytes = self._get_pdf_bytes(obj)
        filename = self._get_pdf_filename(obj)

        # Save as attachment if requested
        if serializer.validated_data.get('save_attachment', True):
            ct = self._get_content_type_for_model(obj)
            Attachment.objects.create(
                tenant=request.tenant,
                content_type=ct,
                object_id=obj.pk,
                file=None,  # We'll handle this below
                filename=filename,
                mime_type='application/pdf',
                file_size=len(pdf_bytes),
                category='generated_pdf',
                uploaded_by=request.user,
                description=f'Generated PDF for {filename}',
            )

        # Email if requested
        email_to = serializer.validated_data.get('email_to')
        if email_to:
            EmailService.send_email(
                to=[email_to],
                subject=f'{filename}',
                html_body=f'<p>Please find the attached document: {filename}</p>',
                attachments=[(filename, pdf_bytes, 'application/pdf')],
                cc=serializer.validated_data.get('email_cc', []),
            )

        # Return PDF as download
        return pdf_response(pdf_bytes, f"{filename}", inline=False)

    @extend_schema(tags=['documents'], summary='Download PDF')
    @action(detail=True, methods=['get'], url_path='pdf')
    def download_pdf(self, request, pk=None):
        """Download a PDF for this object (no save/email, just download)."""
        obj = self.get_object()
        pdf_bytes = self._get_pdf_bytes(obj)
        filename = self._get_pdf_filename(obj)

        return pdf_response(pdf_bytes, f"{filename}", inline=False)
