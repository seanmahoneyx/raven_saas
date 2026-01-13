# apps/api/v1/serializers/parties.py
"""
Serializers for Party-related models: Party, Customer, Vendor, Location, Truck.
"""
from rest_framework import serializers
from apps.parties.models import Party, Customer, Vendor, Location, Truck
from .base import TenantModelSerializer


class LocationSerializer(TenantModelSerializer):
    """Serializer for Location model."""
    full_address = serializers.CharField(read_only=True)

    class Meta:
        model = Location
        fields = [
            'id', 'party', 'location_type', 'name', 'code',
            'address_line1', 'address_line2', 'city', 'state',
            'postal_code', 'country', 'phone', 'email',
            'loading_dock_hours', 'special_instructions',
            'is_default', 'is_active', 'full_address',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class CustomerSerializer(TenantModelSerializer):
    """Serializer for Customer model."""
    party_display_name = serializers.CharField(source='party.display_name', read_only=True)
    party_code = serializers.CharField(source='party.code', read_only=True)

    class Meta:
        model = Customer
        fields = [
            'id', 'party', 'party_display_name', 'party_code',
            'payment_terms', 'default_ship_to', 'default_bill_to',
            'sales_rep', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class VendorSerializer(TenantModelSerializer):
    """Serializer for Vendor model."""
    party_display_name = serializers.CharField(source='party.display_name', read_only=True)
    party_code = serializers.CharField(source='party.code', read_only=True)

    class Meta:
        model = Vendor
        fields = [
            'id', 'party', 'party_display_name', 'party_code',
            'payment_terms', 'default_ship_from', 'buyer',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class PartyListSerializer(TenantModelSerializer):
    """Lightweight serializer for Party list views."""
    is_customer = serializers.BooleanField(read_only=True)
    is_vendor = serializers.BooleanField(read_only=True)

    class Meta:
        model = Party
        fields = [
            'id', 'party_type', 'code', 'display_name',
            'is_active', 'is_customer', 'is_vendor',
        ]


class PartySerializer(TenantModelSerializer):
    """Standard serializer for Party model."""
    is_customer = serializers.BooleanField(read_only=True)
    is_vendor = serializers.BooleanField(read_only=True)

    class Meta:
        model = Party
        fields = [
            'id', 'party_type', 'code', 'display_name', 'legal_name',
            'is_active', 'notes', 'is_customer', 'is_vendor',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class PartyDetailSerializer(TenantModelSerializer):
    """Detailed serializer for Party with nested customer/vendor/locations."""
    is_customer = serializers.BooleanField(read_only=True)
    is_vendor = serializers.BooleanField(read_only=True)
    customer = CustomerSerializer(read_only=True)
    vendor = VendorSerializer(read_only=True)
    locations = LocationSerializer(many=True, read_only=True)

    class Meta:
        model = Party
        fields = [
            'id', 'party_type', 'code', 'display_name', 'legal_name',
            'is_active', 'notes', 'is_customer', 'is_vendor',
            'customer', 'vendor', 'locations',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class TruckSerializer(TenantModelSerializer):
    """Serializer for Truck model."""

    class Meta:
        model = Truck
        fields = [
            'id', 'name', 'license_plate', 'capacity_pallets',
            'is_active', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
