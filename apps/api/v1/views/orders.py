# apps/api/v1/views/orders.py
"""
ViewSets for Order models: PurchaseOrder, SalesOrder, and their lines.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.orders.models import (
    PurchaseOrder, PurchaseOrderLine,
    SalesOrder, SalesOrderLine,
    Estimate, EstimateLine,
    RFQ, RFQLine,
)
from apps.documents.pdf import PDFService
from apps.api.v1.serializers.orders import (
    PurchaseOrderSerializer, PurchaseOrderListSerializer,
    PurchaseOrderDetailSerializer, PurchaseOrderWriteSerializer,
    PurchaseOrderLineSerializer,
    SalesOrderSerializer, SalesOrderListSerializer,
    SalesOrderDetailSerializer, SalesOrderWriteSerializer,
    SalesOrderLineSerializer,
    EstimateSerializer, EstimateListSerializer,
    EstimateDetailSerializer, EstimateWriteSerializer,
    EstimateLineSerializer,
    RFQSerializer, RFQListSerializer,
    RFQDetailSerializer, RFQWriteSerializer,
    RFQLineSerializer,
)
from apps.api.v1.views.documents import PDFActionMixin


@extend_schema_view(
    list=extend_schema(tags=['orders'], summary='List all purchase orders'),
    retrieve=extend_schema(tags=['orders'], summary='Get purchase order details'),
    create=extend_schema(tags=['orders'], summary='Create a new purchase order'),
    update=extend_schema(tags=['orders'], summary='Update a purchase order'),
    partial_update=extend_schema(tags=['orders'], summary='Partially update a purchase order'),
    destroy=extend_schema(tags=['orders'], summary='Delete a purchase order'),
)
class PurchaseOrderViewSet(PDFActionMixin, viewsets.ModelViewSet):
    """
    ViewSet for PurchaseOrder model.

    Provides CRUD operations for purchase orders (inbound from vendors).
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def _get_pdf_bytes(self, obj):
        return PDFService.render_purchase_order(obj)

    def _get_pdf_filename(self, obj):
        return f'PO_{obj.po_number}.pdf'

    def get_queryset(self):
        return PurchaseOrder.objects.select_related(
            'vendor__party', 'ship_to', 'scheduled_truck'
        ).prefetch_related('lines__item', 'lines__uom').all()
    filterset_fields = ['status', 'vendor', 'scheduled_date', 'scheduled_truck']
    search_fields = ['po_number', 'vendor__party__display_name', 'notes']
    ordering_fields = ['po_number', 'order_date', 'scheduled_date', 'created_at']
    ordering = ['-order_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return PurchaseOrderListSerializer
        if self.action == 'retrieve':
            return PurchaseOrderDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return PurchaseOrderWriteSerializer
        return PurchaseOrderSerializer

    @extend_schema(
        tags=['orders'],
        summary='List lines for a purchase order',
        responses={200: PurchaseOrderLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all lines for this purchase order."""
        po = self.get_object()
        lines = po.lines.select_related('item', 'uom').all()
        serializer = PurchaseOrderLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['orders'],
        summary='Add line to purchase order',
        request=PurchaseOrderLineSerializer,
        responses={201: PurchaseOrderLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a line to this purchase order."""
        po = self.get_object()
        if not po.is_editable:
            return Response(
                {'error': 'Cannot modify lines on this order - order is not editable'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = PurchaseOrderLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # Auto-generate line number if not provided
        line_number = serializer.validated_data.get('line_number')
        if not line_number:
            max_line = po.lines.order_by('-line_number').first()
            line_number = (max_line.line_number + 10) if max_line else 10

        serializer.save(
            purchase_order=po,
            tenant=request.tenant,
            line_number=line_number
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['orders'], summary='Confirm a draft purchase order')
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm a draft purchase order."""
        po = self.get_object()
        from apps.orders.services import OrderService
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            service = OrderService(request.tenant, request.user)
            po = service.confirm_purchase_order(po)
        except DjangoValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(PurchaseOrderSerializer(po, context={'request': request}).data)

    @extend_schema(tags=['orders'], summary='Cancel a purchase order')
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a purchase order."""
        po = self.get_object()
        from apps.orders.services import OrderService
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            service = OrderService(request.tenant, request.user)
            po = service.cancel_purchase_order(po)
        except DjangoValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(PurchaseOrderSerializer(po, context={'request': request}).data)

    @extend_schema(tags=['orders'], summary='Receive goods against a purchase order')
    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        """Receive goods against this PO, creating inventory and GL entries."""
        po = self.get_object()
        from apps.orders.services import OrderService
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            service = OrderService(request.tenant, request.user)
            result = service.receive_purchase_order(
                po,
                line_receipts=request.data.get('lines'),
            )
        except DjangoValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response({
            'message': 'PO received successfully',
            'lots_created': len(result['lots_created']),
            'po_status': result['po_status'],
        })

    @extend_schema(tags=['orders'], summary='List unscheduled purchase orders')
    @action(detail=False, methods=['get'])
    def unscheduled(self, request):
        """Return purchase orders with no scheduled date."""
        queryset = self.filter_queryset(
            self.get_queryset().filter(scheduled_date__isnull=True)
        ).exclude(status__in=['complete', 'cancelled'])
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = PurchaseOrderListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = PurchaseOrderListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['orders'], summary='List all sales orders'),
    retrieve=extend_schema(tags=['orders'], summary='Get sales order details'),
    create=extend_schema(tags=['orders'], summary='Create a new sales order'),
    update=extend_schema(tags=['orders'], summary='Update a sales order'),
    partial_update=extend_schema(tags=['orders'], summary='Partially update a sales order'),
    destroy=extend_schema(tags=['orders'], summary='Delete a sales order'),
)
class SalesOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for SalesOrder model.

    Provides CRUD operations for sales orders (outbound to customers).
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return SalesOrder.objects.select_related(
            'customer__party', 'ship_to', 'bill_to', 'scheduled_truck'
        ).prefetch_related('lines__item', 'lines__uom').all()
    filterset_fields = ['status', 'customer', 'scheduled_date', 'scheduled_truck']
    search_fields = ['order_number', 'customer__party__display_name', 'customer_po', 'notes']
    ordering_fields = ['order_number', 'order_date', 'scheduled_date', 'created_at']
    ordering = ['-order_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return SalesOrderListSerializer
        if self.action == 'retrieve':
            return SalesOrderDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return SalesOrderWriteSerializer
        return SalesOrderSerializer

    @extend_schema(
        tags=['orders'],
        summary='List lines for a sales order',
        responses={200: SalesOrderLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all lines for this sales order."""
        so = self.get_object()
        lines = so.lines.select_related('item', 'uom').all()
        serializer = SalesOrderLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['orders'],
        summary='Add line to sales order',
        request=SalesOrderLineSerializer,
        responses={201: SalesOrderLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a line to this sales order."""
        so = self.get_object()
        if not so.is_editable:
            return Response(
                {'error': 'Cannot modify lines on this order - order is not editable'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = SalesOrderLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # Auto-generate line number if not provided
        line_number = serializer.validated_data.get('line_number')
        if not line_number:
            max_line = so.lines.order_by('-line_number').first()
            line_number = (max_line.line_number + 10) if max_line else 10

        serializer.save(
            sales_order=so,
            tenant=request.tenant,
            line_number=line_number
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['orders'], summary='Confirm a draft sales order')
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm a draft sales order."""
        so = self.get_object()
        from apps.orders.services import OrderService
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            service = OrderService(request.tenant, request.user)
            so = service.confirm_sales_order(so)
        except DjangoValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(SalesOrderSerializer(so, context={'request': request}).data)

    @extend_schema(tags=['orders'], summary='Cancel a sales order')
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a sales order."""
        so = self.get_object()
        from apps.orders.services import OrderService
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            service = OrderService(request.tenant, request.user)
            so = service.cancel_sales_order(so)
        except DjangoValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(SalesOrderSerializer(so, context={'request': request}).data)

    @extend_schema(tags=['orders'], summary='Duplicate a sales order (Save As Copy)')
    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Create a draft copy of this sales order with all lines."""
        so = self.get_object()
        original_lines = list(so.lines.all())

        # Clone the order
        so.pk = None
        so.order_number = f"{self.get_object().order_number}-COPY"
        so.status = 'draft'
        so.scheduled_date = None
        so.scheduled_truck = None
        so.save()

        # Clone lines
        for line in original_lines:
            line.pk = None
            line.sales_order = so
            line.save()

        return Response(
            SalesOrderSerializer(so, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(tags=['orders'], summary='List unscheduled sales orders')
    @action(detail=False, methods=['get'])
    def unscheduled(self, request):
        """Return sales orders with no scheduled date."""
        queryset = self.filter_queryset(
            self.get_queryset().filter(scheduled_date__isnull=True)
        ).exclude(status__in=['complete', 'cancelled'])
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = SalesOrderListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = SalesOrderListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['orders'], summary='List all estimates'),
    retrieve=extend_schema(tags=['orders'], summary='Get estimate details'),
    create=extend_schema(tags=['orders'], summary='Create a new estimate'),
    update=extend_schema(tags=['orders'], summary='Update an estimate'),
    partial_update=extend_schema(tags=['orders'], summary='Partially update an estimate'),
    destroy=extend_schema(tags=['orders'], summary='Delete an estimate'),
)
class EstimateViewSet(PDFActionMixin, viewsets.ModelViewSet):
    """
    ViewSet for Estimate model.

    Provides CRUD + convert/send actions for customer estimates/quotes.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'customer', 'date']
    search_fields = ['estimate_number', 'customer__party__display_name', 'customer_po', 'notes']
    ordering_fields = ['estimate_number', 'date', 'expiration_date', 'total_amount', 'created_at']
    ordering = ['-date']

    def _get_pdf_bytes(self, obj):
        return PDFService.render_estimate(obj)

    def _get_pdf_filename(self, obj):
        return f'Estimate_{obj.estimate_number}.pdf'

    def get_queryset(self):
        return Estimate.objects.select_related(
            'customer__party', 'ship_to', 'bill_to', 'design_request'
        ).prefetch_related('lines__item', 'lines__uom').all()

    def get_serializer_class(self):
        if self.action == 'list':
            return EstimateListSerializer
        if self.action == 'retrieve':
            return EstimateDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return EstimateWriteSerializer
        return EstimateSerializer

    @extend_schema(
        tags=['orders'],
        summary='Convert estimate to sales order',
        responses={201: SalesOrderSerializer}
    )
    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        """Convert this estimate into a Sales Order."""
        estimate = self.get_object()

        from apps.orders.services import convert_estimate_to_order
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            sales_order = convert_estimate_to_order(
                estimate=estimate,
                tenant=request.tenant,
                user=request.user,
            )
        except DjangoValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            SalesOrderSerializer(sales_order, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(tags=['orders'], summary='Send estimate PDF to customer')
    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        """Generate estimate PDF and email it to the customer."""
        estimate = self.get_object()

        # Get customer email
        customer_party = estimate.customer.party
        to_email = request.data.get('email') or getattr(customer_party, 'email', None)
        if not to_email:
            return Response(
                {'error': 'No email address provided or found for this customer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.documents.pdf import PDFService
        from apps.documents.email import EmailService
        from django.template.loader import render_to_string

        pdf_bytes = PDFService.render_estimate(estimate)
        tenant_name = estimate.tenant.settings.company_name or estimate.tenant.name
        subject = f'Estimate {estimate.estimate_number} from {tenant_name}'

        html_body = render_to_string('documents/email/estimate_email.html', {
            'estimate': estimate,
            'company_name': tenant_name,
        })

        EmailService.send_email(
            to=to_email,
            subject=subject,
            html_body=html_body,
            attachments=[(
                f'Estimate_{estimate.estimate_number}.pdf',
                pdf_bytes,
                'application/pdf',
            )],
        )

        # Update status to sent if still draft
        if estimate.status == 'draft':
            estimate.status = 'sent'
            estimate.save()

        return Response({'status': 'sent', 'email': to_email})

    @extend_schema(
        tags=['orders'],
        summary='List lines for an estimate',
        responses={200: EstimateLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all lines on this estimate."""
        estimate = self.get_object()
        lines = estimate.lines.select_related('item', 'uom').all()
        serializer = EstimateLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['orders'],
        summary='Add line to estimate',
        request=EstimateLineSerializer,
        responses={201: EstimateLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a line to this estimate."""
        estimate = self.get_object()
        if not estimate.is_editable:
            return Response(
                {'error': 'Cannot modify lines on a non-draft estimate'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = EstimateLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        max_line = estimate.lines.order_by('-line_number').first()
        line_number = (max_line.line_number + 10) if max_line else 10

        serializer.save(
            estimate=estimate,
            tenant=request.tenant,
            line_number=line_number,
        )

        estimate.calculate_totals()
        estimate.save()

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['orders'], summary='Accept an estimate')
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """Mark estimate as accepted."""
        estimate = self.get_object()
        if estimate.status not in ('draft', 'sent'):
            return Response(
                {'error': f'Cannot accept estimate with status: {estimate.status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        estimate.status = 'accepted'
        estimate.save()
        return Response(EstimateSerializer(estimate, context={'request': request}).data)

    @extend_schema(tags=['orders'], summary='Reject an estimate')
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Mark estimate as rejected."""
        estimate = self.get_object()
        if estimate.status in ('converted',):
            return Response(
                {'error': 'Cannot reject a converted estimate'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        estimate.status = 'rejected'
        estimate.save()
        return Response(EstimateSerializer(estimate, context={'request': request}).data)


@extend_schema_view(
    list=extend_schema(tags=['procurement'], summary='List all RFQs'),
    retrieve=extend_schema(tags=['procurement'], summary='Get RFQ details'),
    create=extend_schema(tags=['procurement'], summary='Create a new RFQ'),
    update=extend_schema(tags=['procurement'], summary='Update an RFQ'),
    partial_update=extend_schema(tags=['procurement'], summary='Partially update an RFQ'),
    destroy=extend_schema(tags=['procurement'], summary='Delete an RFQ'),
)
class RFQViewSet(PDFActionMixin, viewsets.ModelViewSet):
    """
    ViewSet for RFQ model.

    Provides CRUD + convert/send actions for vendor quotation requests.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'vendor', 'date']
    search_fields = ['rfq_number', 'vendor__party__display_name', 'notes']
    ordering_fields = ['rfq_number', 'date', 'expected_date', 'created_at']
    ordering = ['-date']

    def _get_pdf_bytes(self, obj):
        return PDFService.render_rfq(obj)

    def _get_pdf_filename(self, obj):
        return f'RFQ_{obj.rfq_number}.pdf'

    def get_queryset(self):
        return RFQ.objects.select_related(
            'vendor__party', 'ship_to'
        ).prefetch_related('lines__item', 'lines__uom').all()

    def get_serializer_class(self):
        if self.action == 'list':
            return RFQListSerializer
        if self.action == 'retrieve':
            return RFQDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return RFQWriteSerializer
        return RFQSerializer

    @extend_schema(
        tags=['procurement'],
        summary='Convert RFQ to purchase order',
        responses={201: PurchaseOrderSerializer}
    )
    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        """Convert this RFQ into a Purchase Order."""
        rfq = self.get_object()

        from apps.orders.services import convert_rfq_to_po
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            purchase_order = convert_rfq_to_po(
                rfq=rfq,
                tenant=request.tenant,
                user=request.user,
            )
        except DjangoValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            PurchaseOrderSerializer(purchase_order, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(tags=['procurement'], summary='Send RFQ PDF to vendor')
    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        """Generate RFQ PDF and email it to the vendor."""
        rfq = self.get_object()

        vendor_party = rfq.vendor.party
        to_email = request.data.get('email') or getattr(vendor_party, 'email', None)
        if not to_email:
            return Response(
                {'error': 'No email address provided or found for this vendor.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.documents.pdf import PDFService
        from apps.documents.email import EmailService
        from django.template.loader import render_to_string

        pdf_bytes = PDFService.render_rfq(rfq)
        tenant_name = rfq.tenant.settings.company_name or rfq.tenant.name
        subject = f'Request for Quotation {rfq.rfq_number} from {tenant_name}'

        html_body = render_to_string('documents/email/rfq_email.html', {
            'rfq': rfq,
            'company_name': tenant_name,
        })

        EmailService.send_email(
            to=to_email,
            subject=subject,
            html_body=html_body,
            attachments=[(
                f'RFQ_{rfq.rfq_number}.pdf',
                pdf_bytes,
                'application/pdf',
            )],
        )

        if rfq.status == 'draft':
            rfq.status = 'sent'
            rfq.save()

        return Response({'status': 'sent', 'email': to_email})

    @extend_schema(
        tags=['procurement'],
        summary='List lines for an RFQ',
        responses={200: RFQLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all lines on this RFQ."""
        rfq = self.get_object()
        lines = rfq.lines.select_related('item', 'uom').all()
        serializer = RFQLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['procurement'],
        summary='Add line to RFQ',
        request=RFQLineSerializer,
        responses={201: RFQLineSerializer}
    )
    @lines.mapping.post
    def add_line(self, request, pk=None):
        """Add a line to this RFQ."""
        rfq = self.get_object()
        if not rfq.is_editable:
            return Response(
                {'error': 'Cannot modify lines on a non-draft RFQ'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RFQLineSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        max_line = rfq.lines.order_by('-line_number').first()
        line_number = (max_line.line_number + 10) if max_line else 10

        serializer.save(
            rfq=rfq,
            tenant=request.tenant,
            line_number=line_number,
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=['procurement'], summary='Record vendor quote on RFQ lines')
    @action(detail=True, methods=['post'], url_path='record-quotes')
    def record_quotes(self, request, pk=None):
        """
        Record vendor quoted prices on RFQ lines.

        Expects: {"quotes": [{"line_id": 1, "quoted_price": "12.50"}, ...]}
        """
        rfq = self.get_object()
        if rfq.status not in ('sent', 'received'):
            return Response(
                {'error': f'Cannot record quotes on RFQ with status: {rfq.status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quotes = request.data.get('quotes', [])
        if not quotes:
            return Response(
                {'error': 'No quotes provided. Expected {"quotes": [{"line_id": ..., "quoted_price": ...}]}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from decimal import Decimal, InvalidOperation
        updated = 0
        for quote in quotes:
            line_id = quote.get('line_id')
            price = quote.get('quoted_price')
            if line_id and price is not None:
                try:
                    price = Decimal(str(price))
                except (InvalidOperation, ValueError):
                    continue
                rfq.lines.filter(id=line_id).update(quoted_price=price)
                updated += 1

        # Update status to received if still sent
        if rfq.status == 'sent':
            rfq.status = 'received'
            rfq.save()

        return Response({'status': 'quotes_recorded', 'lines_updated': updated})

    @extend_schema(tags=['procurement'], summary='Cancel an RFQ')
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel an RFQ."""
        rfq = self.get_object()
        if rfq.status == 'converted':
            return Response(
                {'error': 'Cannot cancel a converted RFQ'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rfq.status = 'cancelled'
        rfq.save()
        return Response(RFQSerializer(rfq, context={'request': request}).data)
