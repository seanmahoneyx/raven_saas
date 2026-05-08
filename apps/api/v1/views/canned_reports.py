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
        from datetime import datetime as _dt

        status_filter = request.query_params.get('status') or None
        customer_raw = request.query_params.get('customer')
        start_raw = request.query_params.get('start_date')
        end_raw = request.query_params.get('end_date')

        customer_id = None
        if customer_raw is not None:
            try:
                customer_id = int(customer_raw)
            except ValueError:
                return Response({'error': 'customer must be an integer id.'}, status=status.HTTP_400_BAD_REQUEST)

        start_date = None
        end_date = None
        try:
            if start_raw:
                start_date = _dt.strptime(start_raw, '%Y-%m-%d').date()
            if end_raw:
                end_date = _dt.strptime(end_raw, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        rows = open_order_detail(
            request.tenant,
            status=status_filter,
            customer_id=customer_id,
            start_date=start_date,
            end_date=end_date,
        )

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(rows, self.report_name)
        return Response({'rows': rows})


# ==================== PURCHASING REPORTS ====================

class OpenPOReportView(BaseReportView):
    report_name = 'open-po-report'

    @extend_schema(tags=['canned-reports'], summary='Open PO Report')
    def get(self, request):
        from apps.reporting.queries import open_po_report
        from datetime import datetime as _dt

        status_filter = request.query_params.get('status') or None
        vendor_raw = request.query_params.get('vendor')
        start_raw = request.query_params.get('start_date')
        end_raw = request.query_params.get('end_date')

        vendor_id = None
        if vendor_raw is not None:
            try:
                vendor_id = int(vendor_raw)
            except ValueError:
                return Response({'error': 'vendor must be an integer id.'}, status=status.HTTP_400_BAD_REQUEST)

        start_date = None
        end_date = None
        try:
            if start_raw:
                start_date = _dt.strptime(start_raw, '%Y-%m-%d').date()
            if end_raw:
                end_date = _dt.strptime(end_raw, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        rows = open_po_report(
            request.tenant,
            status=status_filter,
            vendor_id=vendor_id,
            start_date=start_date,
            end_date=end_date,
        )

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

        if request.query_params.get('format') == 'csv':
            return self.to_csv_response(data['rows'], self.report_name)
        return Response({**data, 'start_date': str(start_date), 'end_date': str(end_date)})


class GrossMarginDetailPDFView(BaseReportView):
    @extend_schema(tags=['canned-reports'], summary='Gross Margin Detail PDF')
    def get(self, request):
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err
        from apps.documents.pdf import PDFService
        pdf = PDFService.render_gross_margin_detail(request.tenant, start_date, end_date)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="gross-margin-detail-{start_date}-{end_date}.pdf"'
        return response


# ==================== PDF REPORT VIEWS ====================

class OpenSalesOrdersPDFView(BaseReportView):
    report_name = 'open-sales-orders'

    @extend_schema(tags=['canned-reports'], summary='Open Sales Orders PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from datetime import date as date_cls, datetime as _dt

        status_filter = request.query_params.get('status') or None
        customer_raw = request.query_params.get('customer')
        start_raw = request.query_params.get('start_date')
        end_raw = request.query_params.get('end_date')

        customer_id = None
        if customer_raw is not None:
            try:
                customer_id = int(customer_raw)
            except ValueError:
                return Response({'error': 'customer must be an integer id.'}, status=status.HTTP_400_BAD_REQUEST)

        start_date = None
        end_date = None
        try:
            if start_raw:
                start_date = _dt.strptime(start_raw, '%Y-%m-%d').date()
            if end_raw:
                end_date = _dt.strptime(end_raw, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        pdf_bytes = PDFService.render_open_sales_orders(
            request.tenant,
            status=status_filter,
            customer_id=customer_id,
            start_date=start_date,
            end_date=end_date,
        )
        today = date_cls.today()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="open-sales-orders-{today}.pdf"'
        return response


class OpenPurchaseOrdersPDFView(BaseReportView):
    report_name = 'open-purchase-orders'

    @extend_schema(tags=['canned-reports'], summary='Open Purchase Orders PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from datetime import date as date_cls, datetime as _dt

        status_filter = request.query_params.get('status') or None
        vendor_raw = request.query_params.get('vendor')
        start_raw = request.query_params.get('start_date')
        end_raw = request.query_params.get('end_date')

        vendor_id = None
        if vendor_raw is not None:
            try:
                vendor_id = int(vendor_raw)
            except ValueError:
                return Response({'error': 'vendor must be an integer id.'}, status=status.HTTP_400_BAD_REQUEST)

        start_date = None
        end_date = None
        try:
            if start_raw:
                start_date = _dt.strptime(start_raw, '%Y-%m-%d').date()
            if end_raw:
                end_date = _dt.strptime(end_raw, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        pdf_bytes = PDFService.render_open_purchase_orders(
            request.tenant,
            status=status_filter,
            vendor_id=vendor_id,
            start_date=start_date,
            end_date=end_date,
        )
        today = date_cls.today()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="open-purchase-orders-{today}.pdf"'
        return response


class InventoryValuationPDFView(BaseReportView):
    report_name = 'inventory-valuation'

    @extend_schema(tags=['canned-reports'], summary='Inventory Valuation PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from datetime import date as date_cls
        pdf_bytes = PDFService.render_inventory_valuation(request.tenant)
        today = date_cls.today()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="inventory-valuation-{today}.pdf"'
        return response


class StockStatusPDFView(BaseReportView):
    report_name = 'stock-status'

    @extend_schema(tags=['canned-reports'], summary='Stock Status PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from datetime import date as date_cls
        pdf_bytes = PDFService.render_stock_status(request.tenant)
        today = date_cls.today()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="stock-status-{today}.pdf"'
        return response


class SalesByCustomerPDFView(BaseReportView):
    report_name = 'sales-by-customer'

    @extend_schema(tags=['canned-reports'], summary='Sales by Customer PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err
        pdf_bytes = PDFService.render_sales_by_customer(request.tenant, start_date, end_date)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="sales-by-customer-{start_date}-{end_date}.pdf"'
        )
        return response


class SalesByItemPDFView(BaseReportView):
    report_name = 'sales-by-item'

    @extend_schema(tags=['canned-reports'], summary='Sales by Item PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err
        pdf_bytes = PDFService.render_sales_by_item(request.tenant, start_date, end_date)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="sales-by-item-{start_date}-{end_date}.pdf"'
        )
        return response


class VendorPerformancePDFView(BaseReportView):
    report_name = 'vendor-performance'

    @extend_schema(tags=['canned-reports'], summary='Vendor Performance PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err
        pdf_bytes = PDFService.render_vendor_performance(request.tenant, start_date, end_date)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="vendor-performance-{start_date}-{end_date}.pdf"'
        )
        return response


class PurchaseHistoryPDFView(BaseReportView):
    report_name = 'purchase-history'

    @extend_schema(tags=['canned-reports'], summary='Purchase History PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err
        pdf_bytes = PDFService.render_purchase_history(request.tenant, start_date, end_date)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="purchase-history-{start_date}-{end_date}.pdf"'
        )
        return response


class SalesTaxLiabilityPDFView(BaseReportView):
    report_name = 'sales-tax-liability'

    @extend_schema(tags=['canned-reports'], summary='Sales Tax Liability PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        start_date, end_date, err = self.parse_dates(request)
        if err:
            return err
        pdf_bytes = PDFService.render_sales_tax_liability(request.tenant, start_date, end_date)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="sales-tax-liability-{start_date}-{end_date}.pdf"'
        )
        return response


class BackorderReportPDFView(BaseReportView):
    report_name = 'backorder-report'

    @extend_schema(tags=['canned-reports'], summary='Backorder Report PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from datetime import date as date_cls
        pdf_bytes = PDFService.render_backorder_report(request.tenant)
        today = date_cls.today()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="backorder-report-{today}.pdf"'
        return response


class LowStockAlertPDFView(BaseReportView):
    report_name = 'low-stock-alert'

    @extend_schema(tags=['canned-reports'], summary='Low Stock Alert PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from datetime import date as date_cls
        pdf_bytes = PDFService.render_low_stock_alert(request.tenant)
        today = date_cls.today()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="low-stock-alert-{today}.pdf"'
        return response


class DeadStockPDFView(BaseReportView):
    report_name = 'dead-stock'

    @extend_schema(tags=['canned-reports'], summary='Dead Stock PDF')
    def get(self, request):
        from apps.documents.pdf import PDFService
        from datetime import date as date_cls
        try:
            days = int(request.query_params.get('days', 180))
        except ValueError:
            return HttpResponse({'error': 'days must be an integer.'}, status=400)
        pdf_bytes = PDFService.render_dead_stock(request.tenant, days=days)
        today = date_cls.today()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="dead-stock-{today}.pdf"'
        return response
