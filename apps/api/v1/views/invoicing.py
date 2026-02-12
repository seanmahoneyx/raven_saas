# apps/api/v1/views/invoicing.py
"""
ViewSets for Invoicing models: Invoice, InvoiceLine, Payment.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.invoicing.models import Invoice, InvoiceLine, Payment
from apps.invoicing.services import DunningService
from apps.documents.pdf import PDFService
from apps.api.v1.serializers.invoicing import (
    InvoiceSerializer, InvoiceListSerializer, InvoiceDetailSerializer,
    InvoiceLineSerializer, PaymentSerializer,
)
from apps.api.v1.views.documents import PDFActionMixin


@extend_schema_view(
    list=extend_schema(tags=['invoicing'], summary='List all invoices'),
    retrieve=extend_schema(tags=['invoicing'], summary='Get invoice details'),
    create=extend_schema(tags=['invoicing'], summary='Create a new invoice'),
    update=extend_schema(tags=['invoicing'], summary='Update an invoice'),
    partial_update=extend_schema(tags=['invoicing'], summary='Partially update an invoice'),
    destroy=extend_schema(tags=['invoicing'], summary='Delete an invoice'),
)
class InvoiceViewSet(PDFActionMixin, viewsets.ModelViewSet):
    """
    ViewSet for Invoice model.

    Provides CRUD operations for invoices.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def _get_pdf_bytes(self, obj):
        return PDFService.render_invoice(obj)

    def _get_pdf_filename(self, obj):
        return f'Invoice_{obj.invoice_number}.pdf'

    def get_queryset(self):
        return Invoice.objects.select_related(
            'customer__party', 'sales_order', 'shipment'
        ).prefetch_related('lines__item', 'lines__uom', 'payments').all()
    filterset_fields = ['status', 'customer', 'payment_terms']
    search_fields = ['invoice_number', 'customer__party__display_name', 'customer_po']
    ordering_fields = ['invoice_number', 'invoice_date', 'due_date', 'total_amount', 'created_at']
    ordering = ['-invoice_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return InvoiceListSerializer
        if self.action == 'retrieve':
            return InvoiceDetailSerializer
        return InvoiceSerializer

    @extend_schema(
        tags=['invoicing'],
        summary='List lines for an invoice',
        responses={200: InvoiceLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all lines on this invoice."""
        invoice = self.get_object()
        lines = invoice.lines.select_related('item', 'uom').all()
        serializer = InvoiceLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['invoicing'],
        summary='Add line to invoice',
        request=InvoiceLineSerializer,
        responses={201: InvoiceLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a line to this invoice."""
        invoice = self.get_object()
        if invoice.status not in ['draft']:
            return Response(
                {'error': 'Cannot modify lines on non-draft invoice'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = InvoiceLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # Auto-generate line number
        max_line = invoice.lines.order_by('-line_number').first()
        line_number = (max_line.line_number + 10) if max_line else 10

        serializer.save(invoice=invoice, tenant=request.tenant, line_number=line_number)

        # Recalculate totals
        invoice.calculate_totals()
        invoice.save()

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['invoicing'],
        summary='List payments for an invoice',
        responses={200: PaymentSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def payments(self, request, pk=None):
        """List all payments on this invoice."""
        invoice = self.get_object()
        payments = invoice.payments.all()
        serializer = PaymentSerializer(payments, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['invoicing'],
        summary='Record a payment',
        request=PaymentSerializer,
        responses={201: PaymentSerializer}
    )
    @payments.mapping.post
    def record_payment(self, request, pk=None):
        """Record a payment against this invoice."""
        invoice = self.get_object()
        if invoice.status in ['void', 'written_off', 'paid']:
            return Response(
                {'error': f'Cannot record payment on invoice with status: {invoice.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = PaymentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(invoice=invoice, tenant=request.tenant, recorded_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['invoicing'], summary='Send a draft invoice')
    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """Mark invoice as sent."""
        invoice = self.get_object()
        if invoice.status != 'draft':
            return Response(
                {'error': f'Cannot send invoice with status: {invoice.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        invoice.status = 'sent'
        invoice.save()
        return Response(InvoiceSerializer(invoice, context={'request': request}).data)

    @extend_schema(tags=['invoicing'], summary='Void an invoice')
    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        """Void an invoice."""
        invoice = self.get_object()
        if invoice.amount_paid > 0:
            return Response(
                {'error': 'Cannot void an invoice with payments. Refund first.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        invoice.status = 'void'
        invoice.save()
        return Response(InvoiceSerializer(invoice, context={'request': request}).data)

    @extend_schema(tags=['invoicing'], summary='List overdue invoices')
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Return overdue invoices."""
        from django.utils import timezone
        queryset = self.filter_queryset(
            self.get_queryset().filter(
                due_date__lt=timezone.now().date()
            ).exclude(status__in=['paid', 'void', 'written_off'])
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = InvoiceListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = InvoiceListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(tags=['invoicing'], summary='Send dunning notice for overdue invoice')
    @action(detail=True, methods=['post'], url_path='send-dunning')
    def send_dunning(self, request, pk=None):
        """Send a dunning notice for this invoice."""
        invoice = self.get_object()
        escalation_level = request.data.get('escalation_level')

        svc = DunningService(request.tenant, request.user)
        result = svc.send_dunning_notice(invoice, escalation_level=escalation_level)
        return Response(result)


@extend_schema_view(
    list=extend_schema(tags=['invoicing'], summary='List all payments'),
    retrieve=extend_schema(tags=['invoicing'], summary='Get payment details'),
    create=extend_schema(tags=['invoicing'], summary='Record a new payment'),
)
class PaymentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Payment model.

    Provides operations for payment records.
    """
    serializer_class = PaymentSerializer

    def get_queryset(self):
        return Payment.objects.select_related('invoice__customer__party', 'recorded_by').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['invoice', 'payment_method', 'payment_date']
    search_fields = ['reference_number', 'invoice__invoice_number']
    ordering_fields = ['payment_date', 'amount', 'created_at']
    ordering = ['-payment_date']
    http_method_names = ['get', 'post', 'head', 'options']  # No updates/deletes on payments


class DunningCandidatesView(APIView):
    """List invoices eligible for dunning."""

    @extend_schema(
        tags=['invoicing'],
        summary='Get dunning candidates',
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        min_days = request.query_params.get('min_days_overdue')
        svc = DunningService(request.tenant, request.user)
        candidates = svc.get_dunning_candidates(
            min_days_overdue=int(min_days) if min_days else None
        )
        return Response({
            'count': len(candidates),
            'candidates': candidates,
        })


class DunningSummaryView(APIView):
    """Get dunning summary."""

    @extend_schema(
        tags=['invoicing'],
        summary='Get dunning summary',
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        svc = DunningService(request.tenant, request.user)
        summary = svc.get_dunning_summary()
        return Response(summary)
