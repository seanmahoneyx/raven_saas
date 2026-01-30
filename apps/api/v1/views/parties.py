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
        """Get queryset at request time for proper tenant filtering."""
        return Customer.objects.select_related('party').all()


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
        """Get queryset at request time for proper tenant filtering."""
        return Vendor.objects.select_related('party').all()


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
