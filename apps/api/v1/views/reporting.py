# apps/api/v1/views/reporting.py
"""
ViewSets for Reporting models: ReportDefinition, ReportSchedule, SavedReport, ReportFavorite.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.reporting.models import ReportDefinition, ReportSchedule, SavedReport, ReportFavorite
from apps.api.v1.serializers.reporting import (
    ReportDefinitionSerializer, ReportDefinitionListSerializer,
    ReportScheduleSerializer, SavedReportSerializer, SavedReportListSerializer,
    ReportFavoriteSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['reporting'], summary='List all report definitions'),
    retrieve=extend_schema(tags=['reporting'], summary='Get report definition details'),
    create=extend_schema(tags=['reporting'], summary='Create a new report definition'),
    update=extend_schema(tags=['reporting'], summary='Update a report definition'),
    partial_update=extend_schema(tags=['reporting'], summary='Partially update a report definition'),
    destroy=extend_schema(tags=['reporting'], summary='Delete a report definition'),
)
class ReportDefinitionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ReportDefinition model.

    Provides CRUD operations for report definitions.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return ReportDefinition.objects.select_related('created_by').all()
    filterset_fields = ['report_type', 'category', 'is_system', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'category', 'created_at']
    ordering = ['category', 'name']

    def get_serializer_class(self):
        if self.action == 'list':
            return ReportDefinitionListSerializer
        return ReportDefinitionSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @extend_schema(tags=['reporting'], summary='List available report types')
    @action(detail=False, methods=['get'])
    def types(self, request):
        """List all available report types."""
        return Response([
            {'value': choice[0], 'label': choice[1]}
            for choice in ReportDefinition.REPORT_TYPES
        ])

    @extend_schema(tags=['reporting'], summary='List report categories')
    @action(detail=False, methods=['get'])
    def categories(self, request):
        """List all report categories."""
        return Response([
            {'value': choice[0], 'label': choice[1]}
            for choice in ReportDefinition.CATEGORY_CHOICES
        ])

    @extend_schema(
        tags=['reporting'],
        summary='Execute a report',
        request={'application/json': {'type': 'object', 'properties': {'filters': {'type': 'object'}}}},
        responses={201: SavedReportSerializer}
    )
    @action(detail=True, methods=['post'])
    def execute(self, request, pk=None):
        """
        Execute a report with the given filters.

        This creates a SavedReport record and (in production) would
        trigger async report generation.
        """
        from django.utils import timezone

        report_def = self.get_object()
        filters = request.data.get('filters', {})
        output_format = request.data.get('output_format', report_def.default_format)

        saved_report = SavedReport.objects.create(
            tenant=request.tenant,
            report=report_def,
            name=f"{report_def.name} - {timezone.now().strftime('%Y-%m-%d %H:%M')}",
            status='PENDING',
            filter_values=filters,
            output_format=output_format,
            generated_by=request.user,
        )

        # In production, you would trigger async report generation here
        # For now, just return the pending report record

        serializer = SavedReportSerializer(saved_report, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    list=extend_schema(tags=['reporting'], summary='List all report schedules'),
    retrieve=extend_schema(tags=['reporting'], summary='Get report schedule details'),
    create=extend_schema(tags=['reporting'], summary='Create a new report schedule'),
    update=extend_schema(tags=['reporting'], summary='Update a report schedule'),
    partial_update=extend_schema(tags=['reporting'], summary='Partially update a report schedule'),
    destroy=extend_schema(tags=['reporting'], summary='Delete a report schedule'),
)
class ReportScheduleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ReportSchedule model.

    Provides CRUD operations for scheduled report generation.
    """
    serializer_class = ReportScheduleSerializer

    def get_queryset(self):
        return ReportSchedule.objects.select_related('report').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['report', 'frequency', 'is_active']
    search_fields = ['name', 'report__name']
    ordering_fields = ['name', 'next_run', 'created_at']
    ordering = ['next_run']


@extend_schema_view(
    list=extend_schema(tags=['reporting'], summary='List all saved reports'),
    retrieve=extend_schema(tags=['reporting'], summary='Get saved report details'),
    destroy=extend_schema(tags=['reporting'], summary='Delete a saved report'),
)
class SavedReportViewSet(viewsets.ModelViewSet):
    """
    ViewSet for SavedReport model.

    Provides operations for saved/generated reports.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return SavedReport.objects.select_related('report', 'schedule', 'generated_by').all()
    filterset_fields = ['report', 'status', 'output_format', 'generated_by']
    search_fields = ['name', 'report__name']
    ordering_fields = ['created_at', 'completed_at']
    ordering = ['-created_at']
    http_method_names = ['get', 'delete', 'head', 'options']  # Read and delete only

    def get_serializer_class(self):
        if self.action == 'list':
            return SavedReportListSerializer
        return SavedReportSerializer

    @extend_schema(tags=['reporting'], summary='List my recent reports')
    @action(detail=False, methods=['get'])
    def mine(self, request):
        """Return reports generated by the current user."""
        queryset = self.filter_queryset(
            self.get_queryset().filter(generated_by=request.user)
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = SavedReportListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = SavedReportListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['reporting'], summary='List my favorite reports'),
    retrieve=extend_schema(tags=['reporting'], summary='Get favorite report details'),
    create=extend_schema(tags=['reporting'], summary='Add report to favorites'),
    update=extend_schema(tags=['reporting'], summary='Update favorite report'),
    destroy=extend_schema(tags=['reporting'], summary='Remove report from favorites'),
)
class ReportFavoriteViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ReportFavorite model.

    Provides operations for user's favorite reports.
    """
    serializer_class = ReportFavoriteSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['display_order']
    ordering = ['display_order']

    def get_queryset(self):
        return ReportFavorite.objects.select_related('report').filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ==================== Financial Statement Views ====================

from datetime import date, datetime
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from apps.reporting.services import FinancialReportService
from apps.api.v1.serializers.reporting import (
    TrialBalanceSerializer,
    IncomeStatementSerializer,
    BalanceSheetSerializer,
    ARAgingSerializer,
)


class FinancialReportPermission(IsAuthenticated):
    """
    Permission check for financial reports.
    Requires authenticated user. In production, add view_financials permission check.
    """
    pass


class TrialBalanceView(APIView):
    """GET /api/v1/reports/trial-balance/?date=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Generate Trial Balance',
        parameters=[{
            'name': 'date', 'in': 'query', 'required': False,
            'schema': {'type': 'string', 'format': 'date'},
            'description': 'As-of date (defaults to today)',
        }],
        responses={200: TrialBalanceSerializer}
    )
    def get(self, request):
        as_of = request.query_params.get('date')
        if as_of:
            try:
                as_of_date = datetime.strptime(as_of, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            as_of_date = date.today()

        accounts = FinancialReportService.get_trial_balance(request.tenant, as_of_date)

        result = {
            'as_of_date': str(as_of_date),
            'accounts': accounts,
            'total_debits': sum(a['total_debit'] for a in accounts),
            'total_credits': sum(a['total_credit'] for a in accounts),
        }

        return Response(result)


class IncomeStatementView(APIView):
    """GET /api/v1/reports/income-statement/?start=YYYY-MM-DD&end=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Generate Income Statement (P&L)',
        parameters=[
            {
                'name': 'start', 'in': 'query', 'required': True,
                'schema': {'type': 'string', 'format': 'date'},
                'description': 'Period start date',
            },
            {
                'name': 'end', 'in': 'query', 'required': True,
                'schema': {'type': 'string', 'format': 'date'},
                'description': 'Period end date',
            },
        ],
        responses={200: IncomeStatementSerializer}
    )
    def get(self, request):
        start = request.query_params.get('start')
        end = request.query_params.get('end')

        if not start or not end:
            return Response(
                {'error': 'Both start and end query parameters are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            start_date = datetime.strptime(start, '%Y-%m-%d').date()
            end_date = datetime.strptime(end, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if start_date > end_date:
            return Response(
                {'error': 'Start date must be before end date.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = FinancialReportService.get_income_statement(request.tenant, start_date, end_date)
        return Response(result)


class BalanceSheetView(APIView):
    """GET /api/v1/reports/balance-sheet/?date=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Generate Balance Sheet',
        parameters=[{
            'name': 'date', 'in': 'query', 'required': False,
            'schema': {'type': 'string', 'format': 'date'},
            'description': 'As-of date (defaults to today)',
        }],
        responses={200: BalanceSheetSerializer}
    )
    def get(self, request):
        as_of = request.query_params.get('date')
        if as_of:
            try:
                as_of_date = datetime.strptime(as_of, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            as_of_date = date.today()

        result = FinancialReportService.get_balance_sheet(request.tenant, as_of_date)
        return Response(result)


class ARAgingView(APIView):
    """GET /api/v1/reports/ar-aging/?date=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Generate A/R Aging Report',
        parameters=[{
            'name': 'date', 'in': 'query', 'required': False,
            'schema': {'type': 'string', 'format': 'date'},
            'description': 'As-of date (defaults to today)',
        }],
        responses={200: ARAgingSerializer}
    )
    def get(self, request):
        as_of = request.query_params.get('date')
        if as_of:
            try:
                as_of_date = datetime.strptime(as_of, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            as_of_date = date.today()

        result = FinancialReportService.get_ar_aging(request.tenant, as_of_date)
        return Response(result)


class ItemQuickReportView(APIView):
    """GET /api/v1/reports/item-quick-report/<item_id>/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Generate Item QuickReport',
        parameters=[
            {
                'name': 'start_date', 'in': 'query', 'required': True,
                'schema': {'type': 'string', 'format': 'date'},
                'description': 'Period start date',
            },
            {
                'name': 'end_date', 'in': 'query', 'required': True,
                'schema': {'type': 'string', 'format': 'date'},
                'description': 'Period end date',
            },
        ],
        responses={200: dict}
    )
    def get(self, request, item_id):
        start = request.query_params.get('start_date')
        end = request.query_params.get('end_date')

        if not start or not end:
            return Response(
                {'error': 'Both start_date and end_date query parameters are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            start_date = datetime.strptime(start, '%Y-%m-%d').date()
            end_date = datetime.strptime(end, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if start_date > end_date:
            return Response(
                {'error': 'start_date must be before end_date.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.reporting.services import ItemReportService
        result = ItemReportService.get_quick_report(request.tenant, item_id, start_date, end_date)
        return Response(result)


class ItemQuickReportPDFView(APIView):
    """GET /api/v1/reports/item-quick-report/<item_id>/pdf/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Download Item QuickReport as PDF',
    )
    def get(self, request, item_id):
        start = request.query_params.get('start_date')
        end = request.query_params.get('end_date')

        if not start or not end:
            return Response(
                {'error': 'Both start_date and end_date query parameters are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            start_date = datetime.strptime(start, '%Y-%m-%d').date()
            end_date = datetime.strptime(end, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.reporting.services import ItemReportService
        from apps.documents.pdf import PDFService
        from apps.items.models import Item
        from django.http import HttpResponse

        item = Item.objects.filter(tenant=request.tenant, id=item_id).first()
        if not item:
            return Response({'error': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

        report_data = ItemReportService.get_quick_report(request.tenant, item_id, start_date, end_date)
        pdf_bytes = PDFService.render_item_quick_report(item, report_data, start_date, end_date)

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="item-quick-report-{item.sku}.pdf"'
        return response
