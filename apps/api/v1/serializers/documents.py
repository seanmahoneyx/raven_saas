# apps/api/v1/serializers/documents.py
"""
Serializers for Document & Attachment models.
"""
from rest_framework import serializers
from django.contrib.contenttypes.models import ContentType
from apps.documents.models import Attachment, DocumentLink
from .base import TenantModelSerializer


# Common "number"/name fields used to build a friendly label for a linked
# document, tried in order. Falls back to str(obj) when none are present.
_LABEL_FIELDS = (
    'estimate_number', 'order_number', 'po_number', 'rfq_number',
    'contract_number', 'pick_number', 'bol_number', 'invoice_number',
    'bill_number', 'receipt_number', 'shipment_number', 'reference_number',
    'name', 'display_name', 'number',
)


def _document_label(obj, content_type):
    """Build a human label like 'Estimate EST-1001' for a linked document."""
    model_label = content_type.model_class()._meta.verbose_name.title() if content_type.model_class() else content_type.model.title()
    if obj is None:
        return model_label
    for field in _LABEL_FIELDS:
        value = getattr(obj, field, None)
        if value:
            return f"{model_label} {value}"
    return f"{model_label} #{obj.pk}"


class AttachmentSerializer(TenantModelSerializer):
    """Serializer for Attachment model."""
    uploaded_by_name = serializers.CharField(
        source='uploaded_by.username', read_only=True, allow_null=True
    )
    content_type_name = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            'id', 'content_type', 'content_type_name', 'object_id',
            'file', 'filename', 'mime_type', 'file_size', 'category',
            'uploaded_by', 'uploaded_by_name', 'description',
            'download_url', 'created_at', 'updated_at',
        ]
        read_only_fields = ['file_size', 'created_at', 'updated_at', 'uploaded_by']

    def get_content_type_name(self, obj):
        return f"{obj.content_type.app_label}.{obj.content_type.model}"

    def get_download_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class AttachmentUploadSerializer(TenantModelSerializer):
    """Serializer for uploading attachments with content_type resolution."""
    content_type_app = serializers.CharField(
        write_only=True,
        help_text="App label (e.g., 'invoicing')"
    )
    content_type_model = serializers.CharField(
        write_only=True,
        help_text="Model name (e.g., 'invoice')"
    )

    class Meta:
        model = Attachment
        fields = [
            'id', 'content_type_app', 'content_type_model', 'object_id',
            'file', 'filename', 'mime_type', 'category', 'description',
            'file_size', 'uploaded_by', 'created_at',
        ]
        read_only_fields = ['file_size', 'uploaded_by', 'created_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        app_label = attrs.pop('content_type_app')
        model_name = attrs.pop('content_type_model')
        try:
            ct = ContentType.objects.get(app_label=app_label, model=model_name)
        except ContentType.DoesNotExist:
            raise serializers.ValidationError({
                'content_type_app': f"No model found: {app_label}.{model_name}"
            })
        attrs['content_type'] = ct
        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        if request:
            validated_data['uploaded_by'] = request.user
        return super().create(validated_data)


class DocumentLinkSerializer(TenantModelSerializer):
    """Serializer for DocumentLink lineage edges.

    Exposes both ends (type + id), the relation, a human label for each end,
    and audit metadata so the UI can render the full document chain.
    """
    relation_display = serializers.CharField(source='get_relation_display', read_only=True)

    source_type = serializers.SerializerMethodField()
    source_label = serializers.SerializerMethodField()
    target_type = serializers.SerializerMethodField()
    target_label = serializers.SerializerMethodField()

    created_by_name = serializers.CharField(
        source='created_by.username', read_only=True, allow_null=True
    )

    class Meta:
        model = DocumentLink
        fields = [
            'id', 'relation', 'relation_display',
            'source_content_type', 'source_object_id', 'source_type', 'source_label',
            'target_content_type', 'target_object_id', 'target_type', 'target_label',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = fields

    def get_source_type(self, obj):
        return f"{obj.source_content_type.app_label}.{obj.source_content_type.model}"

    def get_target_type(self, obj):
        return f"{obj.target_content_type.app_label}.{obj.target_content_type.model}"

    def get_source_label(self, obj):
        return _document_label(obj.source, obj.source_content_type)

    def get_target_label(self, obj):
        return _document_label(obj.target, obj.target_content_type)


class GeneratePDFSerializer(serializers.Serializer):
    """Serializer for PDF generation requests."""
    email_to = serializers.EmailField(
        required=False,
        help_text="If provided, email the PDF to this address"
    )
    email_cc = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        default=[],
        help_text="CC addresses"
    )
    save_attachment = serializers.BooleanField(
        default=True,
        help_text="Save the generated PDF as an attachment"
    )
