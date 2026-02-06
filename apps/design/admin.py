from django.contrib import admin
from .models import DesignRequest


@admin.register(DesignRequest)
class DesignRequestAdmin(admin.ModelAdmin):
    list_display = ['file_number', 'ident', 'customer', 'status', 'assigned_to', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['file_number', 'ident']
    readonly_fields = ['file_number', 'created_at', 'updated_at']
