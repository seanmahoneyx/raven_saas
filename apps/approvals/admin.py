from django.contrib import admin
from .models import ApprovalRequest


@admin.register(ApprovalRequest)
class ApprovalRequestAdmin(admin.ModelAdmin):
    list_display = ['id', 'rule_code', 'status', 'requestor', 'approver', 'created_at']
    list_filter = ['status', 'rule_code']
    search_fields = ['rule_description']
    readonly_fields = ['token', 'created_at', 'updated_at']
