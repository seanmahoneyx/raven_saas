# apps/api/v1/views/payments.py
"""
ViewSets for Customer Payments (Cash Receipts).
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters
from drf_spectacular.utils import extend_schema, extend_schema_view
from decimal import Decimal

from apps.payments.models import CustomerPayment
from apps.payments.services import PaymentService
from apps.parties.models import Customer
from apps.accounting.models import Account
from ..serializers.payments import (
    CustomerPaymentListSerializer,
    CustomerPaymentDetailSerializer,
    CreatePaymentSerializer,
    PostPaymentSerializer,
    OpenInvoiceSerializer,
)


@extend_schema_view(
    list=extend_schema(description="List all customer payments", tags=["Payments"]),
    retrieve=extend_schema(description="Get customer payment details", tags=["Payments"]),
    create=extend_schema(description="Create a draft customer payment", tags=["Payments"]),
    update=extend_schema(description="Update a draft customer payment", tags=["Payments"]),
    partial_update=extend_schema(description="Partially update a draft customer payment", tags=["Payments"]),
)
class CustomerPaymentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing customer payments (cash receipts).

    Supports:
    - List/retrieve payments
    - Create draft payments
    - Post payments with invoice applications
    - Void posted payments
    """
    model = CustomerPayment
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['customer', 'status', 'payment_method']
    search_fields = ['payment_number', 'reference_number']
    ordering = ['-payment_date']
    ordering_fields = ['payment_date', 'amount', 'payment_number']

    def get_queryset(self):
        """Get payments for current tenant."""
        return CustomerPayment.objects.select_related(
            'customer__party',
            'deposit_account',
            'journal_entry',
        ).prefetch_related('applications__invoice').all()

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'retrieve':
            return CustomerPaymentDetailSerializer
        elif self.action == 'create':
            return CreatePaymentSerializer
        return CustomerPaymentListSerializer

    def create(self, request, *args, **kwargs):
        """Create a draft payment."""
        serializer = CreatePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Get related objects
        customer = Customer.objects.get(
            id=serializer.validated_data['customer'],
            tenant=request.tenant
        )

        deposit_account = None
        if serializer.validated_data.get('deposit_account'):
            deposit_account = Account.objects.get(
                id=serializer.validated_data['deposit_account'],
                tenant=request.tenant
            )

        # Create payment via service
        service = PaymentService(tenant=request.tenant, user=request.user)
        payment = service.create_draft(
            customer=customer,
            amount=serializer.validated_data['amount'],
            payment_method=serializer.validated_data.get('payment_method', 'CHECK'),
            reference_number=serializer.validated_data.get('reference_number', ''),
            payment_date=serializer.validated_data.get('payment_date'),
            deposit_account=deposit_account,
            notes=serializer.validated_data.get('notes', ''),
        )

        # Return created payment
        output_serializer = CustomerPaymentDetailSerializer(
            payment,
            context={'request': request}
        )
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=PostPaymentSerializer,
        responses={200: CustomerPaymentDetailSerializer},
        description="Post a payment: apply to invoices and create GL entry",
        tags=["Payments"]
    )
    @action(detail=True, methods=['post'])
    def post_payment(self, request, pk=None):
        """Post a payment with invoice applications."""
        payment = self.get_object()

        # Validate input
        serializer = PostPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Convert to service format
        applications = [
            {
                'invoice_id': app['invoice_id'],
                'amount': app['amount']
            }
            for app in serializer.validated_data['applications']
        ]

        # Post via service
        service = PaymentService(tenant=request.tenant, user=request.user)
        payment = service.post_payment(
            payment_id=payment.id,
            applications=applications
        )

        # Return updated payment
        output_serializer = CustomerPaymentDetailSerializer(
            payment,
            context={'request': request}
        )
        return Response(output_serializer.data)

    @extend_schema(
        request=None,
        responses={200: CustomerPaymentDetailSerializer},
        description="Void a posted payment",
        tags=["Payments"]
    )
    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        """Void a posted payment."""
        payment = self.get_object()

        # Void via service
        service = PaymentService(tenant=request.tenant, user=request.user)
        payment = service.void_payment(payment_id=payment.id)

        # Return updated payment
        output_serializer = CustomerPaymentDetailSerializer(
            payment,
            context={'request': request}
        )
        return Response(output_serializer.data)


@extend_schema(
    description="Get open invoices for a customer (for payment application)",
    tags=["Payments"]
)
class OpenInvoicesView(APIView):
    """
    Get open invoices for a customer.

    Returns all invoices with a balance due, ordered by due date.
    Used for selecting invoices to apply a payment to.
    """

    def get(self, request):
        """Get open invoices for a customer."""
        customer_id = request.query_params.get('customer')

        if not customer_id:
            return Response(
                {'error': 'customer parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get open invoices via service
        service = PaymentService(tenant=request.tenant, user=request.user)
        invoices = service.get_open_invoices(customer_id=int(customer_id))

        # Serialize and return
        serializer = OpenInvoiceSerializer(invoices, many=True)
        return Response(serializer.data)
