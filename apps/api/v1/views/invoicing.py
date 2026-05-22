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

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Max

from apps.invoicing.models import (
    Invoice, InvoiceLine, Payment, TaxZone, TaxRule,
    VendorBill, VendorBillLine, BillPayment,
)
from apps.invoicing.services import DunningService, VendorBillService
from apps.documents.pdf import PDFService
from apps.api.v1.serializers.invoicing import (
    InvoiceSerializer, InvoiceListSerializer, InvoiceDetailSerializer,
    InvoiceLineSerializer, PaymentSerializer,
    TaxZoneSerializer, TaxRuleSerializer,
    VendorBillSerializer, VendorBillListSerializer, VendorBillDetailSerializer,
    VendorBillLineSerializer, BillPaymentSerializer,
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


@extend_schema_view(
    list=extend_schema(tags=['invoicing'], summary='List tax zones'),
    retrieve=extend_schema(tags=['invoicing'], summary='Get tax zone details'),
    create=extend_schema(tags=['invoicing'], summary='Create a tax zone'),
    update=extend_schema(tags=['invoicing'], summary='Update a tax zone'),
    partial_update=extend_schema(tags=['invoicing'], summary='Partially update a tax zone'),
    destroy=extend_schema(tags=['invoicing'], summary='Delete a tax zone'),
)
class TaxZoneViewSet(viewsets.ModelViewSet):
    """
    ViewSet for TaxZone model.

    Manages tax zones with their associated rules.
    """
    serializer_class = TaxZoneSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name']
    ordering_fields = ['name', 'rate', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        return TaxZone.objects.select_related('gl_account').prefetch_related('rules').all()

    @extend_schema(
        tags=['invoicing'],
        summary='List rules for a tax zone',
        responses={200: TaxRuleSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def rules(self, request, pk=None):
        """List all rules for this tax zone."""
        zone = self.get_object()
        rules = zone.rules.all()
        serializer = TaxRuleSerializer(rules, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['invoicing'],
        summary='Add rule to tax zone',
        request=TaxRuleSerializer,
        responses={201: TaxRuleSerializer}
    )
    @rules.mapping.post
    def add_rule(self, request, pk=None):
        """Add a postal code rule to this tax zone."""
        zone = self.get_object()
        serializer = TaxRuleSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(tax_zone=zone, tenant=request.tenant)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    list=extend_schema(tags=['invoicing'], summary='List tax rules'),
    retrieve=extend_schema(tags=['invoicing'], summary='Get tax rule details'),
    create=extend_schema(tags=['invoicing'], summary='Create a tax rule'),
    update=extend_schema(tags=['invoicing'], summary='Update a tax rule'),
    destroy=extend_schema(tags=['invoicing'], summary='Delete a tax rule'),
)
class TaxRuleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for TaxRule model.

    Maps postal codes to tax zones.
    """
    serializer_class = TaxRuleSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['tax_zone']
    search_fields = ['postal_code']
    ordering_fields = ['postal_code', 'created_at']
    ordering = ['postal_code']

    def get_queryset(self):
        return TaxRule.objects.select_related('tax_zone').all()


# ─── Vendor Bill (AP) ViewSets ───────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(tags=['invoicing'], summary='List all vendor bills (AP)'),
    retrieve=extend_schema(tags=['invoicing'], summary='Get vendor bill details'),
    create=extend_schema(tags=['invoicing'], summary='Create a new vendor bill'),
    update=extend_schema(tags=['invoicing'], summary='Update a vendor bill'),
    partial_update=extend_schema(tags=['invoicing'], summary='Partially update a vendor bill'),
    destroy=extend_schema(tags=['invoicing'], summary='Delete a vendor bill'),
)
class VendorBillViewSet(viewsets.ModelViewSet):
    """
    ViewSet for VendorBill model (AP).

    Mirrors InvoiceViewSet (AR). Provides CRUD plus custom actions for
    posting, voiding, adding lines, and recording payments.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'vendor', 'purchase_order']
    search_fields = [
        'bill_number', 'vendor_invoice_number',
        'vendor__party__display_name', 'vendor__party__code',
    ]
    ordering_fields = ['bill_number', 'bill_date', 'due_date', 'total_amount', 'created_at']
    ordering = ['-bill_date']

    def get_queryset(self):
        return VendorBill.objects.select_related(
            'vendor__party', 'purchase_order', 'journal_entry', 'ap_account',
        ).prefetch_related('lines__item', 'lines__expense_account', 'payments').all()

    def get_serializer_class(self):
        if self.action == 'list':
            return VendorBillListSerializer
        if self.action == 'retrieve':
            return VendorBillDetailSerializer
        return VendorBillSerializer

    def perform_create(self, serializer):
        """Auto-generate bill_number on create using VendorBillService helper."""
        request = self.request
        svc = VendorBillService(request.tenant, request.user)
        bill_number = serializer.validated_data.get('bill_number') or svc._generate_bill_number()
        serializer.save(tenant=request.tenant, bill_number=bill_number)

    @extend_schema(
        tags=['invoicing'],
        summary='List lines for a vendor bill',
        responses={200: VendorBillLineSerializer(many=True)},
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        bill = self.get_object()
        lines = bill.lines.select_related('item', 'expense_account').all()
        serializer = VendorBillLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['invoicing'],
        summary='Add line to vendor bill',
        request=VendorBillLineSerializer,
        responses={201: VendorBillLineSerializer},
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        bill = self.get_object()
        if bill.status != 'draft':
            return Response(
                {'error': 'Cannot modify lines on non-draft bill'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = VendorBillLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        max_line = bill.lines.aggregate(m=Max('line_number'))['m'] or 0
        line_number = max_line + 10

        serializer.save(bill=bill, tenant=request.tenant, line_number=line_number)

        if hasattr(bill, '_prefetched_objects_cache'):
            bill._prefetched_objects_cache.pop('lines', None)
        bill.calculate_totals()
        bill.save()

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['invoicing'],
        summary='Update or delete an individual line on a draft vendor bill',
        request=VendorBillLineSerializer,
        responses={
            200: VendorBillLineSerializer,
            204: None,
        },
    )
    @action(
        detail=True,
        methods=['patch', 'delete'],
        url_path=r'lines/(?P<line_pk>\d+)',
    )
    def line_detail(self, request, pk=None, line_pk=None):
        """Edit or remove a single line on a draft bill."""
        bill = self.get_object()
        if bill.status != 'draft':
            return Response(
                {'error': 'Cannot modify lines on non-draft bill'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            line = bill.lines.get(pk=line_pk)
        except VendorBillLine.DoesNotExist:
            return Response(
                {'error': 'Line not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if request.method == 'DELETE':
            line.delete()
            # The viewset prefetches 'lines', so the cache holds the deleted
            # line. Drop it so calculate_totals() re-queries.
            if hasattr(bill, '_prefetched_objects_cache'):
                bill._prefetched_objects_cache.pop('lines', None)
            bill.calculate_totals()
            bill.save()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # PATCH
        serializer = VendorBillLineSerializer(
            line, data=request.data, partial=True, context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if hasattr(bill, '_prefetched_objects_cache'):
            bill._prefetched_objects_cache.pop('lines', None)
        bill.calculate_totals()
        bill.save()
        return Response(serializer.data)

    @extend_schema(
        tags=['invoicing'],
        summary='List payments for a vendor bill',
        responses={200: BillPaymentSerializer(many=True)},
    )
    @action(detail=True, methods=['get'])
    def payments(self, request, pk=None):
        bill = self.get_object()
        payments = bill.payments.all()
        serializer = BillPaymentSerializer(payments, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['invoicing'],
        summary='Record a payment against a vendor bill',
        request=BillPaymentSerializer,
        responses={201: BillPaymentSerializer},
    )
    @payments.mapping.post
    def record_payment(self, request, pk=None):
        bill = self.get_object()
        if bill.status in ('draft', 'void', 'paid'):
            return Response(
                {'error': f'Cannot record payment on bill with status: {bill.status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Inject bill PK into the payload so the FK validates without the
        # caller having to repeat the parent ID in the body.
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        data['bill'] = bill.pk

        serializer = BillPaymentSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(tenant=request.tenant, recorded_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['invoicing'], summary='Post a draft vendor bill to the GL')
    @action(detail=True, methods=['post'])
    def post(self, request, pk=None):
        """Post a draft vendor bill (creates the journal entry)."""
        bill = self.get_object()
        try:
            svc = VendorBillService(request.tenant, request.user)
            svc.post_vendor_bill(bill)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, 'messages') and e.messages else str(e)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)
        bill.refresh_from_db()
        serializer = VendorBillDetailSerializer(bill, context={'request': request})
        return Response(serializer.data)

    @extend_schema(tags=['invoicing'], summary='Void a vendor bill')
    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        """
        Void a vendor bill.

        TODO: Wire to VendorBillService.void_vendor_bill once it exists in
        services.py (it currently does not; mirrors InvoiceViewSet.void
        behavior which directly toggles status when no payments are present).
        """
        bill = self.get_object()
        if bill.amount_paid > 0:
            return Response(
                {'error': 'Cannot void a bill with payments. Reverse payments first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if bill.status == 'void':
            return Response(
                {'error': 'Bill is already void.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Reverse the journal entry if one exists (mirrors invoice void pattern).
            je = bill.journal_entry
            if je is not None:
                # Create a reversing entry by negating debits/credits.
                from apps.accounting.models import JournalEntry, JournalEntryLine
                from django.utils import timezone as tz
                rev = JournalEntry.objects.create(
                    tenant=request.tenant,
                    entry_number=f"{je.entry_number}-VOID",
                    date=tz.now().date(),
                    memo=f"VOID of {je.memo}",
                    reference_number=je.reference_number,
                    entry_type='standard',
                    status='posted',
                    posted_at=tz.now(),
                    posted_by=request.user,
                    created_by=request.user,
                )
                ln = 10
                for line in je.lines.all():
                    JournalEntryLine.objects.create(
                        tenant=request.tenant,
                        entry=rev,
                        line_number=ln,
                        account=line.account,
                        description=f"VOID: {line.description}",
                        debit=line.credit,
                        credit=line.debit,
                    )
                    ln += 10

            VendorBill.objects.filter(pk=bill.pk).update(status='void')
            bill.refresh_from_db()

        serializer = VendorBillDetailSerializer(bill, context={'request': request})
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['invoicing'], summary='List all bill payments'),
    retrieve=extend_schema(tags=['invoicing'], summary='Get bill payment details'),
    create=extend_schema(tags=['invoicing'], summary='Record a new bill payment'),
)
class BillPaymentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for BillPayment model (AP).

    Mirrors PaymentViewSet (AR). Read-mostly: no updates or deletes.
    """
    serializer_class = BillPaymentSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['bill', 'payment_method', 'payment_date']
    search_fields = ['reference_number', 'bill__bill_number']
    ordering_fields = ['payment_date', 'amount', 'created_at']
    ordering = ['-payment_date']
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        return BillPayment.objects.select_related(
            'bill__vendor__party', 'recorded_by',
        ).all()
