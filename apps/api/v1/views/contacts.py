from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from apps.contacts.models import Contact
from apps.api.v1.serializers.contacts import ContactSerializer


class ContactViewSet(viewsets.ModelViewSet):
    """CRUD for Contact records, filterable by party."""
    serializer_class = ContactSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['party', 'is_primary', 'is_active']
    search_fields = ['first_name', 'last_name', 'email', 'title']
    ordering_fields = ['last_name', 'first_name', 'created_at']
    ordering = ['-is_primary', 'last_name']

    def get_queryset(self):
        return Contact.objects.select_related('party').all()
