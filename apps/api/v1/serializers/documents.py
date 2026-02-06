# apps/api/v1/serializers/documents.py
"""
Serializers for Document & Attachment models.
"""
from rest_framework import serializers
from django.contrib.contenttypes.models import ContentType
from apps.documents.models import Attachment
from .base import TenantModelSerializer


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
