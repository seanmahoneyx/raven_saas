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
        Execute a report synchronously with the given filters.

        Creates a SavedReport, runs the report generator, and returns
        the completed report with results. For async execution (Celery),
        this can be extended later.
        """
        from apps.reporting.services import ReportingService

        report_def = self.get_object()
        filters = request.data.get('filters', {})
        output_format = request.data.get('output_format', report_def.default_format)

        service = ReportingService(request.tenant, request.user)
        saved_report = service.run_report(report_def, filters=filters, output_format=output_format)

        serializer = SavedReportSerializer(saved_report, context={'request': request})
        http_status = status.HTTP_201_CREATED if saved_report.status == 'COMPLETED' else status.HTTP_200_OK
        return Response(serializer.data, status=http_status)


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
    Requires authenticated staff or superuser.
    """
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        u = request.user
        return bool(u and (u.is_superuser or u.is_staff))


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


def _parse_aging_params(request):
    """Parse shared aging query params: date, interval, through, and optionally customer/vendor.

    Returns (as_of_date, interval, through, party_id, error_response).
    error_response is non-None only when validation fails.
    """
    as_of = request.query_params.get('date')
    if as_of:
        try:
            as_of_date = datetime.strptime(as_of, '%Y-%m-%d').date()
        except ValueError:
            return None, None, None, None, Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        as_of_date = date.today()

    try:
        interval = int(request.query_params.get('interval', 30))
        through = int(request.query_params.get('through', 90))
    except ValueError:
        return None, None, None, None, Response(
            {'error': 'interval and through must be integers.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not (1 <= interval <= 365):
        return None, None, None, None, Response(
            {'error': 'interval must be between 1 and 365.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not (interval <= through <= 3650):
        return None, None, None, None, Response(
            {'error': 'through must be between interval and 3650.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    party_raw = request.query_params.get('customer') or request.query_params.get('vendor')
    party_id = None
    if party_raw is not None:
        try:
            party_id = int(party_raw)
        except ValueError:
            return None, None, None, None, Response(
                {'error': 'customer/vendor must be an integer id.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    return as_of_date, interval, through, party_id, None


class ARAgingView(APIView):
    """GET /api/v1/reports/ar-aging/?date=YYYY-MM-DD&interval=30&through=90&customer=<id>"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Generate A/R Aging Report',
        parameters=[
            {'name': 'date', 'in': 'query', 'required': False,
             'schema': {'type': 'string', 'format': 'date'},
             'description': 'As-of date (defaults to today)'},
            {'name': 'interval', 'in': 'query', 'required': False,
             'schema': {'type': 'integer', 'default': 30},
             'description': 'Bucket width in days (1-365)'},
            {'name': 'through', 'in': 'query', 'required': False,
             'schema': {'type': 'integer', 'default': 90},
             'description': 'Max days before Over bucket (interval-3650)'},
            {'name': 'customer', 'in': 'query', 'required': False,
             'schema': {'type': 'integer'},
             'description': 'Filter by customer id'},
        ],
        responses={200: ARAgingSerializer}
    )
    def get(self, request):
        as_of_date, interval, through, customer_id, err = _parse_aging_params(request)
        if err:
            return err
        result = FinancialReportService.get_ar_aging(
            request.tenant, as_of_date, interval=interval, through=through,
            customer_id=customer_id,
        )
        return Response(result)


class ItemQuickReportView(APIView):
    """GET /api/v1/reports/item-quick-report/<item_id>/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Generate Item QuickReport',
        parameters=[
            {
                'name': 'start_date', 'in': 'query', 'required': False,
                'schema': {'type': 'string', 'format': 'date'},
                'description': 'Period start date (defaults to 2000-01-01)',
            },
            {
                'name': 'end_date', 'in': 'query', 'required': False,
                'schema': {'type': 'string', 'format': 'date'},
                'description': 'Period end date (defaults to today)',
            },
        ],
        responses={200: dict}
    )
    def get(self, request, item_id):
        start = request.query_params.get('start_date')
        end = request.query_params.get('end_date')

        try:
            start_date = datetime.strptime(start, '%Y-%m-%d').date() if start else date(2000, 1, 1)
            end_date = datetime.strptime(end, '%Y-%m-%d').date() if end else date.today()
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

        try:
            start_date = datetime.strptime(start, '%Y-%m-%d').date() if start else date(2000, 1, 1)
            end_date = datetime.strptime(end, '%Y-%m-%d').date() if end else date.today()
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


class TrialBalancePDFView(APIView):
    """GET /api/v1/reports/trial-balance/pdf/?date=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(tags=['financial-reports'], summary='Download Trial Balance PDF')
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

        from apps.documents.pdf import PDFService
        from django.http import HttpResponse

        pdf = PDFService.render_trial_balance(request.tenant, as_of_date)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="trial-balance-{as_of_date.isoformat()}.pdf"'
        return response


class IncomeStatementPDFView(APIView):
    """GET /api/v1/reports/income-statement/pdf/?start=YYYY-MM-DD&end=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(tags=['financial-reports'], summary='Download Income Statement PDF')
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

        from apps.documents.pdf import PDFService
        from django.http import HttpResponse

        pdf = PDFService.render_income_statement(request.tenant, start_date, end_date)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="income-statement-{start_date.isoformat()}-{end_date.isoformat()}.pdf"'
        )
        return response


class BalanceSheetPDFView(APIView):
    """GET /api/v1/reports/balance-sheet/pdf/?date=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(tags=['financial-reports'], summary='Download Balance Sheet PDF')
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

        from apps.documents.pdf import PDFService
        from django.http import HttpResponse

        pdf = PDFService.render_balance_sheet(request.tenant, as_of_date)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="balance-sheet-{as_of_date.isoformat()}.pdf"'
        return response


class CashFlowStatementPDFView(APIView):
    """GET /api/v1/reports/cash-flow/pdf/?start=YYYY-MM-DD&end=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(tags=['financial-reports'], summary='Download Cash Flow Statement PDF')
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

        from apps.documents.pdf import PDFService
        from django.http import HttpResponse

        pdf = PDFService.render_cash_flow_statement(request.tenant, start_date, end_date)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="cash-flow-{start_date.isoformat()}-{end_date.isoformat()}.pdf"'
        )
        return response


class APAgingView(APIView):
    """GET /api/v1/reports/ap-aging/?date=YYYY-MM-DD&interval=30&through=90&vendor=<id>"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Generate A/P Aging Report',
        parameters=[
            {'name': 'date', 'in': 'query', 'required': False,
             'schema': {'type': 'string', 'format': 'date'},
             'description': 'As-of date (defaults to today)'},
            {'name': 'interval', 'in': 'query', 'required': False,
             'schema': {'type': 'integer', 'default': 30},
             'description': 'Bucket width in days (1-365)'},
            {'name': 'through', 'in': 'query', 'required': False,
             'schema': {'type': 'integer', 'default': 90},
             'description': 'Max days before Over bucket (interval-3650)'},
            {'name': 'vendor', 'in': 'query', 'required': False,
             'schema': {'type': 'integer'},
             'description': 'Filter by vendor id'},
        ],
    )
    def get(self, request):
        as_of_date, interval, through, vendor_id, err = _parse_aging_params(request)
        if err:
            return err
        result = FinancialReportService.get_ap_aging(
            request.tenant, as_of_date, interval=interval, through=through,
            vendor_id=vendor_id,
        )
        return Response(result)


class ARAgingPDFView(APIView):
    """GET /api/v1/reports/ar-aging/pdf/?date=YYYY-MM-DD&interval=30&through=90&customer=<id>"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Download A/R Aging Report as PDF',
        parameters=[
            {'name': 'date', 'in': 'query', 'required': False,
             'schema': {'type': 'string', 'format': 'date'},
             'description': 'As-of date (defaults to today)'},
            {'name': 'interval', 'in': 'query', 'required': False,
             'schema': {'type': 'integer', 'default': 30}},
            {'name': 'through', 'in': 'query', 'required': False,
             'schema': {'type': 'integer', 'default': 90}},
            {'name': 'customer', 'in': 'query', 'required': False,
             'schema': {'type': 'integer'}},
        ],
    )
    def get(self, request):
        from apps.documents.pdf import PDFService
        from django.http import HttpResponse

        as_of_date, interval, through, customer_id, err = _parse_aging_params(request)
        if err:
            return err

        pdf_bytes = PDFService.render_ar_aging(
            request.tenant, as_of_date, interval=interval, through=through,
            customer_id=customer_id,
        )
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="ar-aging-{as_of_date}.pdf"'
        return response


class APAgingPDFView(APIView):
    """GET /api/v1/reports/ap-aging/pdf/?date=YYYY-MM-DD&interval=30&through=90&vendor=<id>"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Download A/P Aging Report as PDF',
        parameters=[
            {'name': 'date', 'in': 'query', 'required': False,
             'schema': {'type': 'string', 'format': 'date'},
             'description': 'As-of date (defaults to today)'},
            {'name': 'interval', 'in': 'query', 'required': False,
             'schema': {'type': 'integer', 'default': 30}},
            {'name': 'through', 'in': 'query', 'required': False,
             'schema': {'type': 'integer', 'default': 90}},
            {'name': 'vendor', 'in': 'query', 'required': False,
             'schema': {'type': 'integer'}},
        ],
    )
    def get(self, request):
        from apps.documents.pdf import PDFService
        from django.http import HttpResponse

        as_of_date, interval, through, vendor_id, err = _parse_aging_params(request)
        if err:
            return err

        pdf_bytes = PDFService.render_ap_aging(
            request.tenant, as_of_date, interval=interval, through=through,
            vendor_id=vendor_id,
        )
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="ap-aging-{as_of_date}.pdf"'
        return response


class CashFlowStatementView(APIView):
    """GET /api/v1/reports/cash-flow/?start=YYYY-MM-DD&end=YYYY-MM-DD"""
    permission_classes = [FinancialReportPermission]

    @extend_schema(
        tags=['financial-reports'],
        summary='Generate Cash Flow Statement',
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

        result = FinancialReportService.get_cash_flow_statement(request.tenant, start_date, end_date)
        return Response(result)


class ReorderAlertsView(APIView):
    """Get items below reorder point."""

    @extend_schema(
        tags=['inventory'],
        summary='Get inventory reorder alerts',
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        from apps.inventory.services import ReorderService
        svc = ReorderService(request.tenant, request.user)
        alerts = svc.get_reorder_alerts()
        return Response({
            'count': len(alerts),
            'alerts': alerts,
        })


class GrossMarginView(APIView):
    """Gross margin report by customer and item."""

    @extend_schema(
        tags=['reports'],
        summary='Get gross margin report',
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        from apps.reporting.services import FinancialReportService
        svc = FinancialReportService(request.tenant)

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        customer_id = request.query_params.get('customer')
        item_id = request.query_params.get('item')

        result = svc.get_gross_margin(
            date_from=date_from,
            date_to=date_to,
            customer_id=int(customer_id) if customer_id else None,
            item_id=int(item_id) if item_id else None,
        )
        return Response(result)


class OrdersVsInventoryView(APIView):
    """Open orders vs inventory coverage report."""

    @extend_schema(tags=['reports'], summary='Get orders vs inventory report')
    def get(self, request):
        from apps.reporting.services import FinancialReportService
        svc = FinancialReportService(request.tenant)
        data = svc.get_orders_vs_inventory()
        return Response({'count': len(data), 'items': data})


class SalesCommissionView(APIView):
    """Sales commission report by rep."""

    @extend_schema(tags=['reports'], summary='Get sales commission report')
    def get(self, request):
        from apps.reporting.services import FinancialReportService
        svc = FinancialReportService(request.tenant)
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        commission_rate = request.query_params.get('commission_rate')
        data = svc.get_sales_commission(
            date_from=date_from,
            date_to=date_to,
            commission_rate=float(commission_rate) if commission_rate else None,
        )
        return Response(data)


class ContractUtilizationView(APIView):
    """Contract utilization report."""

    @extend_schema(tags=['reports'], summary='Get contract utilization report')
    def get(self, request):
        from apps.reporting.services import FinancialReportService
        svc = FinancialReportService(request.tenant)
        data = svc.get_contract_utilization()
        return Response({'count': len(data), 'contracts': data})


class VendorScorecardView(APIView):
    """Vendor performance scorecard."""

    @extend_schema(tags=['reports'], summary='Get vendor scorecard')
    def get(self, request):
        from apps.reporting.services import FinancialReportService
        svc = FinancialReportService(request.tenant)
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        data = svc.get_vendor_scorecard(date_from=date_from, date_to=date_to)
        return Response({'count': len(data), 'vendors': data})


class GrossMarginPDFView(APIView):
    """GET /api/v1/reports/gross-margin/pdf/"""

    @extend_schema(tags=['reports'], summary='Download Gross Margin PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from django.http import HttpResponse

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        customer_id = request.query_params.get('customer')
        item_id = request.query_params.get('item')

        pdf = PDFService.render_gross_margin(
            request.tenant,
            date_from=date_from,
            date_to=date_to,
            customer_id=int(customer_id) if customer_id else None,
            item_id=int(item_id) if item_id else None,
        )

        from_part = date_from or 'all'
        to_part = date_to or 'time'
        filename = f'gross-margin-{from_part}-{to_part}.pdf'
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class ContractUtilizationPDFView(APIView):
    """GET /api/v1/reports/contract-utilization/pdf/"""

    @extend_schema(tags=['reports'], summary='Download Contract Utilization PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from django.http import HttpResponse
        from datetime import date

        pdf = PDFService.render_contract_utilization(request.tenant)
        today = date.today().isoformat()
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="contract-utilization-{today}.pdf"'
        return response


class VendorScorecardPDFView(APIView):
    """GET /api/v1/reports/vendor-scorecard/pdf/"""

    @extend_schema(tags=['reports'], summary='Download Vendor Scorecard PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from django.http import HttpResponse
        from datetime import date

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        pdf = PDFService.render_vendor_scorecard(
            request.tenant,
            date_from=date_from,
            date_to=date_to,
        )

        from_part = date_from or date.today().isoformat()
        to_part = date_to or date.today().isoformat()
        filename = f'vendor-scorecard-{from_part}-{to_part}.pdf'
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class SalesCommissionPDFView(APIView):
    """GET /api/v1/reports/sales-commission/pdf/"""

    @extend_schema(tags=['reports'], summary='Download Sales Commission PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from django.http import HttpResponse
        from datetime import date

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        commission_rate = request.query_params.get('commission_rate')

        pdf = PDFService.render_sales_commission(
            request.tenant,
            date_from=date_from,
            date_to=date_to,
            commission_rate=float(commission_rate) if commission_rate else None,
        )

        from_part = date_from or date.today().isoformat()
        to_part = date_to or date.today().isoformat()
        filename = f'sales-commission-{from_part}-{to_part}.pdf'
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class OrdersVsInventoryPDFView(APIView):
    """GET /api/v1/reports/orders-vs-inventory/pdf/"""

    @extend_schema(tags=['reports'], summary='Download Orders vs Inventory PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from django.http import HttpResponse
        from datetime import date

        pdf = PDFService.render_orders_vs_inventory(request.tenant)
        today = date.today().isoformat()
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="orders-vs-inventory-{today}.pdf"'
        return response
