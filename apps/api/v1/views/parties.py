# apps/api/v1/views/parties.py
"""
ViewSets for Party-related models: Party, Customer, Vendor, Location, Truck.

IMPORTANT: All ViewSets use get_queryset() method instead of class-level queryset
attribute to ensure proper tenant filtering at request time.
"""
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.db.models import Sum, Count, Min, Q, DecimalField, Value, F
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.parties.models import Party, Customer, Vendor, Location, Truck
from apps.api.v1.serializers.parties import (
    PartySerializer, PartyListSerializer, PartyDetailSerializer,
    CustomerSerializer, VendorSerializer, LocationSerializer, TruckSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['parties'], summary='List all parties'),
    retrieve=extend_schema(tags=['parties'], summary='Get party details'),
    create=extend_schema(tags=['parties'], summary='Create a new party'),
    update=extend_schema(tags=['parties'], summary='Update a party'),
    partial_update=extend_schema(tags=['parties'], summary='Partially update a party'),
    destroy=extend_schema(tags=['parties'], summary='Delete a party'),
)
class PartyViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Party model.

    Provides CRUD operations for parties (customers, vendors, etc.).
    All queries are automatically scoped to the current tenant.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['party_type', 'is_active']
    search_fields = ['code', 'display_name', 'legal_name']
    ordering_fields = ['code', 'display_name', 'created_at']
    ordering = ['display_name']

    def get_queryset(self):
        """Get queryset at request time for proper tenant filtering."""
        return Party.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return PartyListSerializer
        if self.action == 'retrieve':
            return PartyDetailSerializer
        return PartySerializer

    def perform_create(self, serializer):
        """
        Create Party and automatically create associated Customer/Vendor records
        based on party_type.
        """
        party = serializer.save()

        # Auto-create Customer record for CUSTOMER or BOTH party types
        if party.party_type in ('CUSTOMER', 'BOTH'):
            Customer.objects.get_or_create(
                party=party,
                defaults={'tenant': party.tenant}
            )

        # Auto-create Vendor record for VENDOR or BOTH party types
        if party.party_type in ('VENDOR', 'BOTH'):
            Vendor.objects.get_or_create(
                party=party,
                defaults={'tenant': party.tenant}
            )

    def perform_update(self, serializer):
        """
        Update Party and ensure Customer/Vendor records exist if party_type changes.
        """
        party = serializer.save()

        # Ensure Customer record exists if party_type includes CUSTOMER
        if party.party_type in ('CUSTOMER', 'BOTH'):
            Customer.objects.get_or_create(
                party=party,
                defaults={'tenant': party.tenant}
            )

        # Ensure Vendor record exists if party_type includes VENDOR
        if party.party_type in ('VENDOR', 'BOTH'):
            Vendor.objects.get_or_create(
                party=party,
                defaults={'tenant': party.tenant}
            )

    @extend_schema(tags=['parties'], summary='List customers only')
    @action(detail=False, methods=['get'])
    def customers(self, request):
        """Return only parties that have a Customer record."""
        queryset = self.filter_queryset(
            self.get_queryset().filter(customer__isnull=False)
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = PartyListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = PartyListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(tags=['parties'], summary='List vendors only')
    @action(detail=False, methods=['get'])
    def vendors(self, request):
        """Return only parties that have a Vendor record."""
        queryset = self.filter_queryset(
            self.get_queryset().filter(vendor__isnull=False)
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = PartyListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = PartyListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['parties'], summary='List all customers'),
    retrieve=extend_schema(tags=['parties'], summary='Get customer details'),
    create=extend_schema(tags=['parties'], summary='Create a new customer'),
    update=extend_schema(tags=['parties'], summary='Update a customer'),
    partial_update=extend_schema(tags=['parties'], summary='Partially update a customer'),
    destroy=extend_schema(tags=['parties'], summary='Delete a customer'),
)
class CustomerViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Customer model.

    Provides CRUD operations for customer-specific attributes.
    """
    serializer_class = CustomerSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['payment_terms', 'sales_rep']
    search_fields = ['party__code', 'party__display_name']
    ordering_fields = ['party__display_name', 'created_at']
    ordering = ['party__display_name']

    def get_queryset(self):
        """Get queryset at request time with KPI annotations."""
        active_statuses = ['confirmed', 'scheduled', 'picking']
        return Customer.objects.select_related('party').annotate(
            open_sales_total=Coalesce(
                Sum(
                    F('sales_orders__lines__unit_price') * F('sales_orders__lines__quantity_ordered'),
                    filter=Q(sales_orders__status__in=active_statuses),
                    output_field=DecimalField(),
                ),
                Value(0),
                output_field=DecimalField(),
            ),
            open_order_count=Count(
                'sales_orders',
                filter=Q(sales_orders__status__in=active_statuses),
                distinct=True,
            ),
            next_expected_delivery=Min(
                'sales_orders__scheduled_date',
                filter=Q(
                    sales_orders__status__in=['scheduled', 'picking'],
                    sales_orders__scheduled_date__gte=timezone.now().date(),
                ),
            ),
            overdue_balance=Coalesce(
                Sum(
                    F('invoices__total_amount') - F('invoices__amount_paid'),
                    filter=Q(invoices__status='overdue') | Q(
                        invoices__due_date__lt=timezone.now().date(),
                        invoices__status__in=['posted', 'sent', 'partial'],
                    ),
                    output_field=DecimalField(),
                ),
                Value(0),
                output_field=DecimalField(),
            ),
            active_estimate_count=Count(
                'estimates',
                filter=Q(estimates__status__in=['draft', 'sent']),
                distinct=True,
            ),
        )

    @extend_schema(tags=['parties'], summary='Get customer transaction timeline')
    @action(detail=True, methods=['get'])
    def timeline(self, request, pk=None):
        """
        Returns a unified timeline of all customer transactions.
        Aggregates: Sales Orders, Estimates, Invoices, Payments.
        Supports ?type= filter (order, estimate, invoice, payment).
        Returns newest first, limited to 50.
        """
        customer = self.get_object()
        events = []

        type_filter = request.query_params.get('type', None)

        # Sales Orders
        if not type_filter or type_filter == 'order':
            from apps.orders.models import SalesOrder
            for so in customer.sales_orders.select_related().order_by('-order_date')[:50]:
                events.append({
                    'id': f'so-{so.id}',
                    'type': 'order',
                    'icon': 'shopping-cart',
                    'title': f'Sales Order {so.order_number}',
                    'description': f'{so.num_lines} line(s) - ${so.subtotal}',
                    'status': so.status,
                    'date': so.order_date.isoformat(),
                    'link': '/orders?tab=sales',
                    'amount': str(so.subtotal),
                })

        # Estimates
        if not type_filter or type_filter == 'estimate':
            from apps.orders.models import Estimate
            for est in customer.estimates.order_by('-date')[:50]:
                events.append({
                    'id': f'est-{est.id}',
                    'type': 'estimate',
                    'icon': 'file-text',
                    'title': f'Estimate {est.estimate_number}',
                    'description': f'${est.total_amount}',
                    'status': est.status,
                    'date': est.date.isoformat(),
                    'link': '/estimates',
                    'amount': str(est.total_amount),
                })

        # Invoices
        if not type_filter or type_filter == 'invoice':
            from apps.invoicing.models import Invoice
            for inv in Invoice.objects.filter(customer=customer).order_by('-invoice_date')[:50]:
                events.append({
                    'id': f'inv-{inv.id}',
                    'type': 'invoice',
                    'icon': 'receipt',
                    'title': f'Invoice {inv.invoice_number}',
                    'description': f'${inv.total_amount} (Balance: ${inv.balance_due})',
                    'status': inv.status,
                    'date': inv.invoice_date.isoformat(),
                    'link': '/invoices',
                    'amount': str(inv.total_amount),
                })

        # Payments
        if not type_filter or type_filter == 'payment':
            from apps.invoicing.models import Payment
            for pmt in Payment.objects.filter(invoice__customer=customer).select_related('invoice').order_by('-payment_date')[:50]:
                events.append({
                    'id': f'pmt-{pmt.id}',
                    'type': 'payment',
                    'icon': 'credit-card',
                    'title': f'Payment on {pmt.invoice.invoice_number}',
                    'description': f'${pmt.amount} via {pmt.get_payment_method_display()}',
                    'status': 'received',
                    'date': pmt.payment_date.isoformat(),
                    'link': '/invoices',
                    'amount': str(pmt.amount),
                })

        # Sort by date descending, limit to 50
        events.sort(key=lambda e: e['date'], reverse=True)
        events = events[:50]

        return Response(events)

    @extend_schema(tags=['parties'], summary='List/create customer attachments')
    @action(detail=True, methods=['get', 'post'])
    def attachments(self, request, pk=None):
        """List or create attachments for this customer's Party."""
        customer = self.get_object()
        from django.contrib.contenttypes.models import ContentType
        from apps.documents.models import Attachment

        ct = ContentType.objects.get_for_model(customer.party)

        if request.method == 'GET':
            atts = Attachment.objects.filter(
                content_type=ct,
                object_id=customer.party.pk,
            )
            data = [{
                'id': a.id,
                'filename': a.filename,
                'mime_type': a.mime_type,
                'file_size': a.file_size,
                'category': a.category,
                'description': a.description,
                'uploaded_by': a.uploaded_by_id,
                'file_url': a.file.url if a.file else None,
                'created_at': a.created_at.isoformat(),
            } for a in atts]
            return Response(data)

        # POST - create attachment
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=400)

        attachment = Attachment.objects.create(
            tenant=customer.tenant,
            content_type=ct,
            object_id=customer.party.pk,
            file=file,
            filename=file.name,
            mime_type=file.content_type or '',
            file_size=file.size,
            category=request.data.get('category', 'document'),
            description=request.data.get('description', ''),
            uploaded_by=request.user if request.user.is_authenticated else None,
        )

        return Response({
            'id': attachment.id,
            'filename': attachment.filename,
            'mime_type': attachment.mime_type,
            'file_size': attachment.file_size,
            'category': attachment.category,
            'description': attachment.description,
            'file_url': attachment.file.url,
            'created_at': attachment.created_at.isoformat(),
        }, status=201)

    @extend_schema(tags=['parties'], summary='Delete a customer attachment')
    @action(detail=True, methods=['delete'], url_path='attachments/(?P<attachment_id>[0-9]+)')
    def delete_attachment(self, request, pk=None, attachment_id=None):
        """Delete an attachment for this customer."""
        customer = self.get_object()
        from django.contrib.contenttypes.models import ContentType
        from apps.documents.models import Attachment

        ct = ContentType.objects.get_for_model(customer.party)
        try:
            attachment = Attachment.objects.get(
                id=attachment_id,
                content_type=ct,
                object_id=customer.party.pk,
            )
            attachment.file.delete(save=False)
            attachment.delete()
            return Response(status=204)
        except Attachment.DoesNotExist:
            return Response({'error': 'Attachment not found'}, status=404)


@extend_schema_view(
    list=extend_schema(tags=['parties'], summary='List all vendors'),
    retrieve=extend_schema(tags=['parties'], summary='Get vendor details'),
    create=extend_schema(tags=['parties'], summary='Create a new vendor'),
    update=extend_schema(tags=['parties'], summary='Update a vendor'),
    partial_update=extend_schema(tags=['parties'], summary='Partially update a vendor'),
    destroy=extend_schema(tags=['parties'], summary='Delete a vendor'),
)
class VendorViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor model.

    Provides CRUD operations for vendor-specific attributes.
    """
    serializer_class = VendorSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['payment_terms', 'buyer']
    search_fields = ['party__code', 'party__display_name']
    ordering_fields = ['party__display_name', 'created_at']
    ordering = ['party__display_name']

    def get_queryset(self):
        """Get queryset at request time with KPI annotations."""
        active_statuses = ['confirmed', 'scheduled', 'shipped']
        return Vendor.objects.select_related('party').annotate(
            open_po_total=Coalesce(
                Sum(
                    F('purchase_orders__lines__unit_cost') * F('purchase_orders__lines__quantity_ordered'),
                    filter=Q(purchase_orders__status__in=active_statuses),
                    output_field=DecimalField(),
                ),
                Value(0),
                output_field=DecimalField(),
            ),
            open_po_count=Count(
                'purchase_orders',
                filter=Q(purchase_orders__status__in=active_statuses),
                distinct=True,
            ),
            next_incoming=Min(
                'purchase_orders__scheduled_date',
                filter=Q(
                    purchase_orders__status__in=['scheduled', 'shipped'],
                    purchase_orders__scheduled_date__gte=timezone.now().date(),
                ),
            ),
            overdue_bill_balance=Coalesce(
                Sum(
                    F('bills__total_amount') - F('bills__amount_paid'),
                    filter=Q(bills__status='overdue') | Q(
                        bills__due_date__lt=timezone.now().date(),
                        bills__status__in=['posted', 'partial'],
                    ),
                    output_field=DecimalField(),
                ),
                Value(0),
                output_field=DecimalField(),
            ),
            active_rfq_count=Count(
                'rfqs',
                filter=Q(rfqs__status__in=['draft', 'sent']),
                distinct=True,
            ),
        )

    @extend_schema(tags=['parties'], summary='Get vendor transaction timeline')
    @action(detail=True, methods=['get'])
    def timeline(self, request, pk=None):
        """
        Returns a unified timeline of vendor transactions.
        Aggregates: Purchase Orders, RFQs, Vendor Bills, Bill Payments.
        Supports ?type= filter (po, rfq, bill, payment).
        Returns newest first, limited to 50.
        """
        vendor = self.get_object()
        events = []
        type_filter = request.query_params.get('type', None)

        # Purchase Orders
        if not type_filter or type_filter == 'po':
            from apps.orders.models import PurchaseOrder
            for po in vendor.purchase_orders.order_by('-order_date')[:50]:
                events.append({
                    'id': f'po-{po.id}',
                    'type': 'po',
                    'icon': 'package',
                    'title': f'PO {po.po_number}',
                    'description': f'{po.num_lines} line(s) - ${po.subtotal}',
                    'status': po.status,
                    'date': po.order_date.isoformat(),
                    'link': '/orders?tab=purchase',
                    'amount': str(po.subtotal),
                })

        # RFQs
        if not type_filter or type_filter == 'rfq':
            from apps.orders.models import RFQ
            for rfq in vendor.rfqs.order_by('-date')[:50]:
                events.append({
                    'id': f'rfq-{rfq.id}',
                    'type': 'rfq',
                    'icon': 'file-question',
                    'title': f'RFQ {rfq.rfq_number}',
                    'description': f'Status: {rfq.get_status_display()}',
                    'status': rfq.status,
                    'date': rfq.date.isoformat(),
                    'link': '/rfqs',
                    'amount': '0',
                })

        # Vendor Bills
        if not type_filter or type_filter == 'bill':
            from apps.invoicing.models import VendorBill
            for bill in vendor.bills.order_by('-bill_date')[:50]:
                events.append({
                    'id': f'bill-{bill.id}',
                    'type': 'bill',
                    'icon': 'receipt',
                    'title': f'Bill {bill.bill_number}',
                    'description': f'${bill.total_amount} (Balance: ${bill.balance_due})',
                    'status': bill.status,
                    'date': bill.bill_date.isoformat(),
                    'link': '/invoices',
                    'amount': str(bill.total_amount),
                })

        # Bill Payments
        if not type_filter or type_filter == 'payment':
            from apps.invoicing.models import BillPayment
            for pmt in BillPayment.objects.filter(bill__vendor=vendor).select_related('bill').order_by('-payment_date')[:50]:
                events.append({
                    'id': f'bpmt-{pmt.id}',
                    'type': 'payment',
                    'icon': 'credit-card',
                    'title': f'Payment on {pmt.bill.bill_number}',
                    'description': f'${pmt.amount} via {pmt.get_payment_method_display()}',
                    'status': 'paid',
                    'date': pmt.payment_date.isoformat(),
                    'link': '/invoices',
                    'amount': str(pmt.amount),
                })

        events.sort(key=lambda e: e['date'], reverse=True)
        events = events[:50]
        return Response(events)

    @extend_schema(tags=['parties'], summary='List/create vendor attachments')
    @action(detail=True, methods=['get', 'post'])
    def attachments(self, request, pk=None):
        """List or create attachments for this vendor's Party."""
        vendor = self.get_object()
        from django.contrib.contenttypes.models import ContentType
        from apps.documents.models import Attachment

        ct = ContentType.objects.get_for_model(vendor.party)

        if request.method == 'GET':
            atts = Attachment.objects.filter(content_type=ct, object_id=vendor.party.pk)
            data = [{
                'id': a.id,
                'filename': a.filename,
                'mime_type': a.mime_type,
                'file_size': a.file_size,
                'category': a.category,
                'description': a.description,
                'uploaded_by': a.uploaded_by_id,
                'file_url': a.file.url if a.file else None,
                'created_at': a.created_at.isoformat(),
            } for a in atts]
            return Response(data)

        # POST - create attachment
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=400)

        attachment = Attachment.objects.create(
            tenant=vendor.tenant,
            content_type=ct,
            object_id=vendor.party.pk,
            file=file,
            filename=file.name,
            mime_type=file.content_type or '',
            file_size=file.size,
            category=request.data.get('category', 'document'),
            description=request.data.get('description', ''),
            uploaded_by=request.user if request.user.is_authenticated else None,
        )

        return Response({
            'id': attachment.id,
            'filename': attachment.filename,
            'mime_type': attachment.mime_type,
            'file_size': attachment.file_size,
            'category': attachment.category,
            'description': attachment.description,
            'file_url': attachment.file.url,
            'created_at': attachment.created_at.isoformat(),
        }, status=201)

    @extend_schema(tags=['parties'], summary='Delete a vendor attachment')
    @action(detail=True, methods=['delete'], url_path='attachments/(?P<attachment_id>[0-9]+)')
    def delete_attachment(self, request, pk=None, attachment_id=None):
        """Delete an attachment for this vendor."""
        vendor = self.get_object()
        from django.contrib.contenttypes.models import ContentType
        from apps.documents.models import Attachment

        ct = ContentType.objects.get_for_model(vendor.party)
        try:
            attachment = Attachment.objects.get(id=attachment_id, content_type=ct, object_id=vendor.party.pk)
            attachment.file.delete(save=False)
            attachment.delete()
            return Response(status=204)
        except Attachment.DoesNotExist:
            return Response({'error': 'Attachment not found'}, status=404)


@extend_schema_view(
    list=extend_schema(tags=['parties'], summary='List all locations'),
    retrieve=extend_schema(tags=['parties'], summary='Get location details'),
    create=extend_schema(tags=['parties'], summary='Create a new location'),
    update=extend_schema(tags=['parties'], summary='Update a location'),
    partial_update=extend_schema(tags=['parties'], summary='Partially update a location'),
    destroy=extend_schema(tags=['parties'], summary='Delete a location'),
)
class LocationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Location model.

    Provides CRUD operations for party locations/addresses.
    """
    serializer_class = LocationSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['party', 'location_type', 'is_active', 'is_default']
    search_fields = ['name', 'code', 'city', 'state']
    ordering_fields = ['name', 'city', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        """Get queryset at request time for proper tenant filtering."""
        return Location.objects.select_related('party').all()


@extend_schema_view(
    list=extend_schema(tags=['parties'], summary='List all trucks'),
    retrieve=extend_schema(tags=['parties'], summary='Get truck details'),
    create=extend_schema(tags=['parties'], summary='Create a new truck'),
    update=extend_schema(tags=['parties'], summary='Update a truck'),
    partial_update=extend_schema(tags=['parties'], summary='Partially update a truck'),
    destroy=extend_schema(tags=['parties'], summary='Delete a truck'),
)
class TruckViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Truck model.

    Provides CRUD operations for trucks/vehicles used in scheduling.
    """
    serializer_class = TruckSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'license_plate']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        """Get queryset at request time for proper tenant filtering."""
        return Truck.objects.all()
