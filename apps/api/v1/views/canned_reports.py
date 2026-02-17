"""
API views for canned (standard) reports.

All reports support:
- Date range filtering via ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
- CSV export via ?format=csv
"""
import csv
from datetime import date, datetime
from io import StringIO
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema


class BaseReportView(APIView):
    """Base class for all canned reports with date range + CSV export."""

    report_name = 'report'

    def parse_dates(self, request):
        """Parse start_date and end_date from query params."""
        start = request.query_params.get('start_date')
        end = request.query_params.get('end_date')
        try:
            start_date = (
                datetime.strptime(start, '%Y-%m-%d').date()
                if start
                else date(date.today().year, 1, 1)
            )
            end_date = (
                datetime.strptime(end, '%Y-%m-%d').date()
                if end
                else date.today()
            )
        except ValueError:
            return None, None, Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return start_date, end_date, None

    def to_csv_response(self, rows, filename):
        """Convert list of dicts to CSV HttpResponse."""
        if not rows:
            return HttpResponse('No data', content_type='text/csv')

        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}.csv"'
        return response


# ==================== SALES REPORTS ====================

class SalesByCustomerView(BaseReportView):
    report_name = 'sales-by-customer'

    @extend_schema(tags=['canned-reports'], summary='Sales by Customer')
    def get(self, request):
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err

        from apps.reporting.queries import sales_by_customer
        rows = sales_by_customer(request.tenant, start_date, end_date)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows, 'start_date': str(start_date), 'end_date': str(end_date)})


class SalesByItemView(BaseReportView):
    report_name = 'sales-by-item'

    @extend_schema(tags=['canned-reports'], summary='Sales by Item')
    def get(self, request):
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err

        from apps.reporting.queries import sales_by_item
        rows = sales_by_item(request.tenant, start_date, end_date)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows, 'start_date': str(start_date), 'end_date': str(end_date)})


class BackorderReportView(BaseReportView):
    report_name = 'backorder-report'

    @extend_schema(tags=['canned-reports'], summary='Backorder Report')
    def get(self, request):
        from apps.reporting.queries import backorder_report
        rows = backorder_report(request.tenant)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows})


class OpenOrderDetailView(BaseReportView):
    report_name = 'open-order-detail'

    @extend_schema(tags=['canned-reports'], summary='Open Order Detail')
    def get(self, request):
        from apps.reporting.queries import open_order_detail
        rows = open_order_detail(request.tenant)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows})


# ==================== PURCHASING REPORTS ====================

class OpenPOReportView(BaseReportView):
    report_name = 'open-po-report'

    @extend_schema(tags=['canned-reports'], summary='Open PO Report')
    def get(self, request):
        from apps.reporting.queries import open_po_report
        rows = open_po_report(request.tenant)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows})


class VendorPerformanceView(BaseReportView):
    report_name = 'vendor-performance'

    @extend_schema(tags=['canned-reports'], summary='Vendor Performance')
    def get(self, request):
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err

        from apps.reporting.queries import vendor_performance
        rows = vendor_performance(request.tenant, start_date, end_date)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows, 'start_date': str(start_date), 'end_date': str(end_date)})


class PurchaseHistoryView(BaseReportView):
    report_name = 'purchase-history'

    @extend_schema(tags=['canned-reports'], summary='Purchase History')
    def get(self, request):
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err

        from apps.reporting.queries import purchase_history
        rows = purchase_history(request.tenant, start_date, end_date)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows, 'start_date': str(start_date), 'end_date': str(end_date)})


# ==================== WAREHOUSE & INVENTORY ====================

class InventoryValuationView(BaseReportView):
    report_name = 'inventory-valuation'

    @extend_schema(tags=['canned-reports'], summary='Inventory Valuation')
    def get(self, request):
        from apps.reporting.queries import inventory_valuation
        data = inventory_valuation(request.tenant)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(data['rows'], self.report_name)
        return Response(data)


class StockStatusView(BaseReportView):
    report_name = 'stock-status'

    @extend_schema(tags=['canned-reports'], summary='Stock Status')
    def get(self, request):
        from apps.reporting.queries import stock_status
        rows = stock_status(request.tenant)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows})


class LowStockAlertView(BaseReportView):
    report_name = 'low-stock-alert'

    @extend_schema(tags=['canned-reports'], summary='Low Stock Alert')
    def get(self, request):
        from apps.reporting.queries import low_stock_alert
        rows = low_stock_alert(request.tenant)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows})


class DeadStockView(BaseReportView):
    report_name = 'dead-stock'

    @extend_schema(tags=['canned-reports'], summary='Dead Stock')
    def get(self, request):
        days = int(request.query_params.get('days', 180))
        from apps.reporting.queries import dead_stock
        rows = dead_stock(request.tenant, days)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows, 'days_threshold': days})


# ==================== FINANCIAL ====================

class SalesTaxLiabilityView(BaseReportView):
    report_name = 'sales-tax-liability'

    @extend_schema(tags=['canned-reports'], summary='Sales Tax Liability')
    def get(self, request):
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err

        from apps.reporting.queries import sales_tax_liability
        rows = sales_tax_liability(request.tenant, start_date, end_date)

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows, 'start_date': str(start_date), 'end_date': str(end_date)})


class GrossMarginReportView(BaseReportView):
    report_name = 'gross-margin-detail'

    @extend_schema(tags=['canned-reports'], summary='Gross Margin Report')
    def get(self, request):
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err

        from apps.reporting.queries import gross_margin_report
        data = gross_margin_report(request.tenant, start_date, end_date)

        return Response({**data, 'start_date': str(start_date), 'end_date': str(end_date)})
