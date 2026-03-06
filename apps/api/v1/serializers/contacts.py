from rest_framework import serializers
from apps.contacts.models import Contact
from .base import TenantModelSerializer


class ContactSerializer(TenantModelSerializer):
    """Standard serializer for Contact model."""
    party_name = serializers.CharField(source='party.display_name', read_only=True)

    class Meta:
        model = Contact
        fields = [
            'id', 'party', 'party_name', 'first_name', 'last_name', 'title',
            'email', 'phone', 'mobile', 'is_primary', 'is_active', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
