# apps/api/v1/serializers/reporting.py
"""
Serializers for Reporting models: ReportDefinition, ReportSchedule, SavedReport, ReportFavorite.
"""
from rest_framework import serializers
from apps.reporting.models import ReportDefinition, ReportSchedule, SavedReport, ReportFavorite
from .base import TenantModelSerializer


class ReportDefinitionListSerializer(TenantModelSerializer):
    """Lightweight serializer for ReportDefinition list views."""
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)

    class Meta:
        model = ReportDefinition
        fields = [
            'id', 'name', 'report_type', 'category',
            'is_system', 'is_active', 'default_format',
            'created_by', 'created_by_name',
        ]


class ReportDefinitionSerializer(TenantModelSerializer):
    """Standard serializer for ReportDefinition model."""
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)

    class Meta:
        model = ReportDefinition
        fields = [
            'id', 'name', 'description', 'report_type', 'category',
            'is_system', 'is_active', 'default_format',
            'columns_config', 'filters_config', 'default_filters',
            'default_group_by', 'default_sort_by', 'default_sort_order',
            'custom_query', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'is_system']


class ReportScheduleSerializer(TenantModelSerializer):
    """Serializer for ReportSchedule model."""
    report_name = serializers.CharField(source='report.name', read_only=True)

    class Meta:
        model = ReportSchedule
        fields = [
            'id', 'report', 'report_name', 'name', 'is_active',
            'frequency', 'day_of_week', 'day_of_month', 'run_time',
            'filter_values', 'output_format', 'email_recipients', 'email_subject',
            'last_run', 'next_run',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'last_run', 'next_run']


class SavedReportListSerializer(TenantModelSerializer):
    """Lightweight serializer for SavedReport list views."""
    report_name = serializers.CharField(source='report.name', read_only=True)
    generated_by_name = serializers.CharField(source='generated_by.username', read_only=True, allow_null=True)
    duration_seconds = serializers.FloatField(read_only=True, allow_null=True)

    class Meta:
        model = SavedReport
        fields = [
            'id', 'report', 'report_name', 'name', 'status',
            'output_format', 'row_count', 'duration_seconds',
            'generated_by', 'generated_by_name', 'created_at',
        ]


class SavedReportSerializer(TenantModelSerializer):
    """Standard serializer for SavedReport model."""
    report_name = serializers.CharField(source='report.name', read_only=True)
    generated_by_name = serializers.CharField(source='generated_by.username', read_only=True, allow_null=True)
    duration_seconds = serializers.FloatField(read_only=True, allow_null=True)

    class Meta:
        model = SavedReport
        fields = [
            'id', 'report', 'report_name', 'schedule', 'name', 'status',
            'filter_values', 'output_format',
            'row_count', 'result_data', 'file_path',
            'started_at', 'completed_at', 'error_message', 'duration_seconds',
            'generated_by', 'generated_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'status', 'row_count', 'result_data',
            'file_path', 'started_at', 'completed_at', 'error_message',
        ]


class ReportFavoriteSerializer(TenantModelSerializer):
    """Serializer for ReportFavorite model."""
    report_name = serializers.CharField(source='report.name', read_only=True)
    report_type = serializers.CharField(source='report.report_type', read_only=True)
    report_category = serializers.CharField(source='report.category', read_only=True)

    class Meta:
        model = ReportFavorite
        fields = [
            'id', 'user', 'report', 'report_name', 'report_type', 'report_category',
            'display_order', 'saved_filters',
        ]
