# apps/reporting/admin.py
"""
Django admin configuration for Reporting models.
"""
from django.contrib import admin
from .models import ReportDefinition, ReportSchedule, SavedReport, ReportFavorite


class ReportScheduleInline(admin.TabularInline):
    """Inline editor for report schedules."""
    model = ReportSchedule
    extra = 0
    fields = ['name', 'is_active', 'frequency', 'run_time', 'output_format', 'last_run', 'next_run']
    readonly_fields = ['last_run', 'next_run']


@admin.register(ReportDefinition)
class ReportDefinitionAdmin(admin.ModelAdmin):
    """Admin interface for ReportDefinition."""
    list_display = [
        'name', 'report_type', 'category', 'is_system',
        'is_active', 'default_format', 'created_by'
    ]
    list_filter = ['category', 'report_type', 'is_system', 'is_active']
    search_fields = ['name', 'description']
    raw_id_fields = ['created_by']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        (None, {
            'fields': ['name', 'description', 'report_type', 'category']
        }),
        ('Status', {
            'fields': ['is_system', 'is_active']
        }),
        ('Output Settings', {
            'fields': ['default_format']
        }),
        ('Column Configuration', {
            'fields': ['columns_config'],
            'classes': ['collapse']
        }),
        ('Filter Configuration', {
            'fields': ['filters_config', 'default_filters'],
            'classes': ['collapse']
        }),
        ('Sorting', {
            'fields': ['default_group_by', 'default_sort_by', 'default_sort_order'],
            'classes': ['collapse']
        }),
        ('Custom Query', {
            'fields': ['custom_query'],
            'classes': ['collapse']
        }),
        ('Ownership', {
            'fields': ['created_by']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    inlines = [ReportScheduleInline]

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        if not change and not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for instance in instances:
            if hasattr(instance, 'tenant_id') and not instance.tenant_id:
                instance.tenant = form.instance.tenant
            instance.save()
        formset.save_m2m()


@admin.register(ReportSchedule)
class ReportScheduleAdmin(admin.ModelAdmin):
    """Admin interface for ReportSchedule."""
    list_display = [
        'name', 'report', 'is_active', 'frequency',
        'run_time', 'output_format', 'last_run', 'next_run'
    ]
    list_filter = ['is_active', 'frequency', 'output_format']
    search_fields = ['name', 'report__name']
    raw_id_fields = ['report']
    readonly_fields = ['created_at', 'updated_at', 'last_run', 'next_run']

    fieldsets = [
        (None, {
            'fields': ['report', 'name', 'is_active']
        }),
        ('Schedule', {
            'fields': ['frequency', 'day_of_week', 'day_of_month', 'run_time']
        }),
        ('Filters & Output', {
            'fields': ['filter_values', 'output_format']
        }),
        ('Email Delivery', {
            'fields': ['email_recipients', 'email_subject'],
            'classes': ['collapse']
        }),
        ('Tracking', {
            'fields': ['last_run', 'next_run'],
            'classes': ['collapse']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        super().save_model(request, obj, form, change)


@admin.register(SavedReport)
class SavedReportAdmin(admin.ModelAdmin):
    """Admin interface for SavedReport."""
    list_display = [
        'name', 'report', 'status', 'output_format',
        'row_count', 'generated_by', 'created_at', 'duration_display'
    ]
    list_filter = ['status', 'output_format', 'report']
    search_fields = ['name', 'report__name']
    raw_id_fields = ['report', 'schedule', 'generated_by']
    date_hierarchy = 'created_at'
    readonly_fields = [
        'created_at', 'updated_at', 'started_at', 'completed_at',
        'row_count', 'result_data', 'file_path', 'error_message', 'duration_display'
    ]

    fieldsets = [
        (None, {
            'fields': ['report', 'name', 'status']
        }),
        ('Source', {
            'fields': ['schedule', 'generated_by'],
            'classes': ['collapse']
        }),
        ('Parameters', {
            'fields': ['filter_values', 'output_format']
        }),
        ('Results', {
            'fields': ['row_count', 'result_data', 'file_path', 'error_message']
        }),
        ('Timing', {
            'fields': ['started_at', 'completed_at', 'duration_display']
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    def duration_display(self, obj):
        duration = obj.duration_seconds
        if duration:
            return f"{duration:.2f}s"
        return "-"
    duration_display.short_description = 'Duration'

    def has_add_permission(self, request):
        return False  # Reports are generated via service

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        super().save_model(request, obj, form, change)


@admin.register(ReportFavorite)
class ReportFavoriteAdmin(admin.ModelAdmin):
    """Admin interface for ReportFavorite."""
    list_display = ['user', 'report', 'display_order']
    list_filter = ['report']
    search_fields = ['user__username', 'report__name']
    raw_id_fields = ['user', 'report']
    ordering = ['user', 'display_order']

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and hasattr(request, 'tenant'):
            obj.tenant = request.tenant
        super().save_model(request, obj, form, change)
