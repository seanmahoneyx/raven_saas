# apps/api/v1/views/accounting.py
"""
ViewSets for Accounting models: Account, JournalEntry.
"""
from rest_framework import viewsets, filters, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.db.models import Count

from apps.accounting.models import Account, JournalEntry, JournalEntryLine
from apps.accounting.services import AccountingService
from apps.api.v1.serializers.accounting import (
    AccountSerializer, AccountListSerializer,
    JournalEntrySerializer, JournalEntryDetailSerializer,
    JournalEntryCreateSerializer, JournalEntryLineSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['accounting'], summary='List all accounts'),
    retrieve=extend_schema(tags=['accounting'], summary='Get account details'),
    create=extend_schema(tags=['accounting'], summary='Create a new account'),
    update=extend_schema(tags=['accounting'], summary='Update an account'),
    partial_update=extend_schema(tags=['accounting'], summary='Partially update an account'),
    destroy=extend_schema(tags=['accounting'], summary='Delete an account'),
)
class AccountViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Account model (Chart of Accounts).

    Provides CRUD operations for general ledger accounts.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['account_type', 'is_active', 'is_system', 'parent']
    search_fields = ['code', 'name', 'description']
    ordering_fields = ['code', 'name', 'account_type']
    ordering = ['code']

    def get_queryset(self):
        queryset = Account.objects.select_related('parent').all()

        # For list action, annotate with children count
        if self.action == 'list':
            queryset = queryset.annotate(children_count=Count('children'))

        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return AccountListSerializer
        return AccountSerializer


@extend_schema_view(
    list=extend_schema(tags=['accounting'], summary='List all journal entries'),
    retrieve=extend_schema(tags=['accounting'], summary='Get journal entry details'),
    create=extend_schema(tags=['accounting'], summary='Create a new journal entry'),
    update=extend_schema(tags=['accounting'], summary='Update a journal entry'),
    partial_update=extend_schema(tags=['accounting'], summary='Partially update a journal entry'),
    destroy=extend_schema(tags=['accounting'], summary='Delete a journal entry'),
)
class JournalEntryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for JournalEntry model.

    Provides CRUD operations for journal entries with posting and reversal actions.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'entry_type', 'date']
    search_fields = ['entry_number', 'memo', 'reference_number']
    ordering_fields = ['entry_number', 'date', 'status']
    ordering = ['-date', '-entry_number']

    def get_queryset(self):
        return JournalEntry.objects.select_related(
            'fiscal_period', 'posted_by', 'created_by'
        ).prefetch_related('lines__account').all()

    def get_serializer_class(self):
        if self.action == 'list':
            return JournalEntrySerializer
        if self.action == 'retrieve':
            return JournalEntryDetailSerializer
        if self.action == 'create':
            return JournalEntryCreateSerializer
        return JournalEntrySerializer

    @extend_schema(
        tags=['accounting'],
        summary='Post a draft journal entry',
        request=None,
        responses={200: JournalEntryDetailSerializer}
    )
    @action(detail=True, methods=['post'])
    def post(self, request, pk=None):
        """Post a draft journal entry, making it immutable."""
        entry = self.get_object()

        if entry.status != JournalEntry.EntryStatus.DRAFT:
            return Response(
                {'error': f'Cannot post entry with status: {entry.status}. Only draft entries can be posted.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            service = AccountingService(request.tenant)
            posted_entry = service.post_entry(entry.id, posted_by=request.user)
            serializer = JournalEntryDetailSerializer(posted_entry, context={'request': request})
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @extend_schema(
        tags=['accounting'],
        summary='Reverse a posted journal entry',
        request=serializers.Serializer,
        responses={201: JournalEntryDetailSerializer}
    )
    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        """Create a reversing entry for a posted journal entry."""
        entry = self.get_object()

        if entry.status != JournalEntry.EntryStatus.POSTED:
            return Response(
                {'error': 'Only posted entries can be reversed.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Extract optional parameters from request
        reversal_date = request.data.get('reversal_date')
        memo = request.data.get('memo', '')

        try:
            service = AccountingService(request.tenant)
            reversing_entry = service.reverse_entry(
                entry_id=entry.id,
                reversal_date=reversal_date,
                memo=memo,
                created_by=request.user
            )
            serializer = JournalEntryDetailSerializer(reversing_entry, context={'request': request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @extend_schema(
        tags=['accounting'],
        summary='List lines for a journal entry',
        responses={200: JournalEntryLineSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List all lines on this journal entry."""
        entry = self.get_object()
        lines = entry.lines.select_related('account').all()
        serializer = JournalEntryLineSerializer(lines, many=True, context={'request': request})
        return Response(serializer.data)
