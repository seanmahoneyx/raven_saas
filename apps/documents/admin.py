from django.contrib import admin
from .models import Attachment

@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ['filename', 'content_type', 'object_id', 'category', 'mime_type', 'file_size', 'uploaded_by', 'created_at']
    list_filter = ['category', 'mime_type', 'content_type']
    search_fields = ['filename', 'description']
    readonly_fields = ['file_size', 'created_at', 'updated_at']
