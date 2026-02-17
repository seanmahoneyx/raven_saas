# apps/api/v1/views/email.py
"""
API view for sending transactional emails with PDF attachments.
"""
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from apps.communication.services import EmailService
from apps.invoicing.models import Invoice
from apps.orders.models import PurchaseOrder


class SendEmailSerializer(serializers.Serializer):
    """Serializer for email sending requests."""
    recipient_list = serializers.ListField(
        child=serializers.EmailField(),
        min_length=1,
        help_text='List of recipient email addresses',
    )
    subject = serializers.CharField(
        required=False, default='', allow_blank=True,
        help_text='Email subject (auto-generated if empty)',
    )
    body = serializers.CharField(
        required=False, default='', allow_blank=True,
        help_text='Email body text',
    )
    cc = serializers.ListField(
        child=serializers.EmailField(),
        required=False, default=list,
        help_text='CC recipients',
    )
    attach_pdf = serializers.BooleanField(
        required=False, default=True,
        help_text='Whether to attach the PDF',
    )


class SendInvoiceEmailView(APIView):
    """Send an invoice via email with PDF attachment."""

    @extend_schema(
        tags=['communication'],
        summary='Email an invoice',
        request=SendEmailSerializer,
        responses={200: {'type': 'object'}},
    )
    def post(self, request, pk):
        serializer = SendEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            invoice = Invoice.objects.select_related(
                'customer__party', 'tenant__settings'
            ).prefetch_related('lines__item', 'lines__uom').get(pk=pk)
        except Invoice.DoesNotExist:
            return Response(
                {'error': 'Invoice not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        result = EmailService.send_transaction(
            document=invoice,
            document_type='invoice',
            **serializer.validated_data,
        )

        if result['success']:
            return Response(result)
        return Response(result, status=status.HTTP_400_BAD_REQUEST)


class SendPurchaseOrderEmailView(APIView):
    """Send a purchase order via email with PDF attachment."""

    @extend_schema(
        tags=['communication'],
        summary='Email a purchase order',
        request=SendEmailSerializer,
        responses={200: {'type': 'object'}},
    )
    def post(self, request, pk):
        serializer = SendEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            po = PurchaseOrder.objects.select_related(
                'vendor__party', 'tenant__settings'
            ).prefetch_related('lines__item', 'lines__uom').get(pk=pk)
        except PurchaseOrder.DoesNotExist:
            return Response(
                {'error': 'Purchase order not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        result = EmailService.send_transaction(
            document=po,
            document_type='purchase_order',
            **serializer.validated_data,
        )

        if result['success']:
            return Response(result)
        return Response(result, status=status.HTTP_400_BAD_REQUEST)
