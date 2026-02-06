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


# ==================== Financial Statement Serializers ====================

class AccountBalanceSerializer(serializers.Serializer):
    """Account with balance for trial balance / financial statements."""
    account_id = serializers.IntegerField()
    account_code = serializers.CharField()
    account_name = serializers.CharField()
    account_type = serializers.CharField()
    balance = serializers.DecimalField(max_digits=20, decimal_places=2, required=False)
    total_debit = serializers.DecimalField(max_digits=20, decimal_places=2, required=False)
    total_credit = serializers.DecimalField(max_digits=20, decimal_places=2, required=False)
    net_balance = serializers.DecimalField(max_digits=20, decimal_places=2, required=False)


class SectionSerializer(serializers.Serializer):
    """Section of a financial statement (e.g., Assets, Revenue)."""
    label = serializers.CharField()
    accounts = AccountBalanceSerializer(many=True)
    contra_accounts = AccountBalanceSerializer(many=True, required=False)
    total = serializers.DecimalField(max_digits=20, decimal_places=2)
    retained_earnings = serializers.DecimalField(max_digits=20, decimal_places=2, required=False)


class TrialBalanceSerializer(serializers.Serializer):
    """Trial Balance response."""
    as_of_date = serializers.CharField()
    accounts = AccountBalanceSerializer(many=True)
    total_debits = serializers.DecimalField(max_digits=20, decimal_places=2)
    total_credits = serializers.DecimalField(max_digits=20, decimal_places=2)


class IncomeStatementSerializer(serializers.Serializer):
    """Income Statement (P&L) response."""
    start_date = serializers.CharField()
    end_date = serializers.CharField()
    sections = serializers.DictField()
    net_income = serializers.DecimalField(max_digits=20, decimal_places=2)


class BalanceSheetSerializer(serializers.Serializer):
    """Balance Sheet response."""
    as_of_date = serializers.CharField()
    sections = serializers.DictField()
    total_assets = serializers.DecimalField(max_digits=20, decimal_places=2)
    total_liabilities_and_equity = serializers.DecimalField(max_digits=20, decimal_places=2)
    is_balanced = serializers.BooleanField()
    variance = serializers.DecimalField(max_digits=20, decimal_places=2)


class AgingInvoiceSerializer(serializers.Serializer):
    """Individual invoice in aging report."""
    invoice_id = serializers.IntegerField()
    invoice_number = serializers.CharField()
    invoice_date = serializers.CharField()
    due_date = serializers.CharField()
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2)
    days_overdue = serializers.IntegerField()
    bucket = serializers.CharField()


class AgingCustomerSerializer(serializers.Serializer):
    """Customer summary in aging report."""
    customer_id = serializers.IntegerField()
    customer_name = serializers.CharField()
    current = serializers.DecimalField(max_digits=20, decimal_places=2)
    days_1_30 = serializers.DecimalField(max_digits=20, decimal_places=2)
    days_31_60 = serializers.DecimalField(max_digits=20, decimal_places=2)
    days_61_90 = serializers.DecimalField(max_digits=20, decimal_places=2)
    days_over_90 = serializers.DecimalField(max_digits=20, decimal_places=2)
    total = serializers.DecimalField(max_digits=20, decimal_places=2)
    invoices = AgingInvoiceSerializer(many=True)


class AgingTotalsSerializer(serializers.Serializer):
    """Grand totals for aging report."""
    current = serializers.DecimalField(max_digits=20, decimal_places=2)
    days_1_30 = serializers.DecimalField(max_digits=20, decimal_places=2)
    days_31_60 = serializers.DecimalField(max_digits=20, decimal_places=2)
    days_61_90 = serializers.DecimalField(max_digits=20, decimal_places=2)
    days_over_90 = serializers.DecimalField(max_digits=20, decimal_places=2)
    total = serializers.DecimalField(max_digits=20, decimal_places=2)


class ARAgingSerializer(serializers.Serializer):
    """A/R Aging report response."""
    as_of_date = serializers.CharField()
    customers = AgingCustomerSerializer(many=True)
    totals = AgingTotalsSerializer()
