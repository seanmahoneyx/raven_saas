# apps/api/v1/views/assets.py
"""
ViewSets for Fixed Asset Register: AssetCategory, FixedAsset, DepreciationRun.
"""
from decimal import Decimal
from datetime import date

from rest_framework import viewsets, filters, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from django.db import transaction

from apps.assets.models import AssetCategory, FixedAsset, DepreciationEntry, AssetTransaction
from apps.accounting.services import AccountingService
from apps.accounting.models import JournalEntry
from apps.api.v1.serializers.assets import (
    AssetCategorySerializer,
    FixedAssetListSerializer,
    FixedAssetDetailSerializer,
    DepreciationEntrySerializer,
    AssetTransactionSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['assets'], summary='List asset categories'),
    retrieve=extend_schema(tags=['assets'], summary='Get asset category details'),
    create=extend_schema(tags=['assets'], summary='Create an asset category'),
    update=extend_schema(tags=['assets'], summary='Update an asset category'),
    partial_update=extend_schema(tags=['assets'], summary='Partially update an asset category'),
    destroy=extend_schema(tags=['assets'], summary='Delete an asset category'),
)
class AssetCategoryViewSet(viewsets.ModelViewSet):
    """ViewSet for AssetCategory model."""
    serializer_class = AssetCategorySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['default_depreciation_method']
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name']
    ordering = ['code']

    def get_queryset(self):
        return AssetCategory.objects.select_related(
            'asset_account', 'depreciation_expense_account',
            'accumulated_depreciation_account',
        ).all()


@extend_schema_view(
    list=extend_schema(tags=['assets'], summary='List fixed assets'),
    retrieve=extend_schema(tags=['assets'], summary='Get fixed asset details'),
    create=extend_schema(tags=['assets'], summary='Create a fixed asset'),
    update=extend_schema(tags=['assets'], summary='Update a fixed asset'),
    partial_update=extend_schema(tags=['assets'], summary='Partially update a fixed asset'),
    destroy=extend_schema(tags=['assets'], summary='Delete a fixed asset'),
)
class FixedAssetViewSet(viewsets.ModelViewSet):
    """ViewSet for FixedAsset model with dispose and depreciation_schedule actions."""
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'category', 'depreciation_method']
    search_fields = ['asset_number', 'description', 'serial_number', 'location']
    ordering_fields = ['asset_number', 'acquisition_date', 'acquisition_cost', 'status']
    ordering = ['asset_number']

    def get_queryset(self):
        qs = FixedAsset.objects.select_related(
            'category', 'vendor__party', 'custodian',
            'asset_account', 'depreciation_expense_account',
            'accumulated_depreciation_account',
        ).all()
        if self.action == 'retrieve':
            qs = qs.prefetch_related(
                'depreciation_entries__journal_entry',
                'transactions__performed_by',
            )
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return FixedAssetListSerializer
        return FixedAssetDetailSerializer

    @extend_schema(
        tags=['assets'],
        summary='Dispose of a fixed asset',
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'disposal_date': {'type': 'string', 'format': 'date'},
                    'disposal_amount': {'type': 'string'},
                    'disposal_method': {'type': 'string', 'enum': ['sold', 'scrapped', 'donated', 'traded_in', 'stolen']},
                    'disposal_notes': {'type': 'string'},
                },
                'required': ['disposal_date', 'disposal_method'],
            }
        },
        responses={200: FixedAssetDetailSerializer},
    )
    @action(detail=True, methods=['post'])
    def dispose(self, request, pk=None):
        """Dispose of a fixed asset. Updates status to 'disposed' and records a transaction."""
        asset = self.get_object()

        if asset.status == 'disposed':
            return Response(
                {'error': 'Asset is already disposed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        disposal_date = request.data.get('disposal_date')
        disposal_amount = request.data.get('disposal_amount', '0.00')
        disposal_method = request.data.get('disposal_method')
        disposal_notes = request.data.get('disposal_notes', '')

        if not disposal_date or not disposal_method:
            return Response(
                {'error': 'disposal_date and disposal_method are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            asset.status = 'disposed'
            asset.disposal_date = disposal_date
            asset.disposal_amount = Decimal(str(disposal_amount))
            asset.disposal_method = disposal_method
            asset.disposal_notes = disposal_notes
            asset.save()

            # Record the disposal transaction
            AssetTransaction.objects.create(
                tenant=asset.tenant,
                asset=asset,
                transaction_type='disposal',
                transaction_date=disposal_date,
                amount=Decimal(str(disposal_amount)),
                description=f"Disposed via {disposal_method}. {disposal_notes}".strip(),
                performed_by=request.user,
            )

        serializer = FixedAssetDetailSerializer(asset, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['assets'],
        summary='Get projected depreciation schedule',
        responses={200: {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'period': {'type': 'string', 'format': 'date'},
                    'depreciation': {'type': 'string'},
                    'accumulated': {'type': 'string'},
                    'net_book_value': {'type': 'string'},
                },
            },
        }},
    )
    @action(detail=True, methods=['get'])
    def depreciation_schedule(self, request, pk=None):
        """Return projected monthly depreciation schedule until fully depreciated."""
        asset = self.get_object()

        if asset.status != 'active':
            return Response(
                {'error': 'Depreciation schedule only available for active assets.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule = []
        simulated_accumulated = asset.accumulated_depreciation
        depreciable = asset.depreciable_amount

        from dateutil.relativedelta import relativedelta

        # Determine the next period to project
        last_entry = asset.depreciation_entries.order_by('-period_date').first()
        if last_entry:
            current_period = last_entry.period_date + relativedelta(months=1)
        else:
            current_period = asset.depreciation_start_date.replace(day=1)

        # Project forward
        max_periods = asset.useful_life_months + 12  # safety cap
        for _ in range(max_periods):
            if simulated_accumulated >= depreciable:
                break

            # Calculate based on method (simplified projection uses straight-line logic)
            remaining_depreciable = depreciable - simulated_accumulated
            if asset.depreciation_method == 'straight_line':
                if asset.useful_life_months == 0:
                    break
                monthly = (depreciable / asset.useful_life_months).quantize(Decimal('0.01'))
            elif asset.depreciation_method == 'declining_balance':
                nbv = asset.acquisition_cost - simulated_accumulated
                rate = Decimal('1') / asset.useful_life_months
                monthly = (nbv * rate).quantize(Decimal('0.01'))
            elif asset.depreciation_method == 'double_declining':
                nbv = asset.acquisition_cost - simulated_accumulated
                rate = Decimal('2') / asset.useful_life_months
                monthly = (nbv * rate).quantize(Decimal('0.01'))
                remaining_to_salvage = nbv - asset.salvage_value
                monthly = min(monthly, max(remaining_to_salvage, Decimal('0.00'))).quantize(Decimal('0.01'))
            else:
                if asset.useful_life_months == 0:
                    break
                monthly = (depreciable / asset.useful_life_months).quantize(Decimal('0.01'))

            monthly = min(monthly, remaining_depreciable).quantize(Decimal('0.01'))
            if monthly <= 0:
                break

            simulated_accumulated += monthly
            nbv_after = asset.acquisition_cost - simulated_accumulated

            schedule.append({
                'period': current_period.isoformat(),
                'depreciation': str(monthly),
                'accumulated': str(simulated_accumulated),
                'net_book_value': str(nbv_after),
            })

            current_period += relativedelta(months=1)

        return Response(schedule)


class DepreciationRunView(APIView):
    """
    Run monthly depreciation for all active, non-fully-depreciated assets.

    POST with {"period_date": "YYYY-MM-01"}
    """

    @extend_schema(
        tags=['assets'],
        summary='Run monthly depreciation',
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'period_date': {'type': 'string', 'format': 'date', 'description': 'First of the month (YYYY-MM-01)'},
                },
                'required': ['period_date'],
            }
        },
        responses={200: {
            'type': 'object',
            'properties': {
                'assets_processed': {'type': 'integer'},
                'total_depreciation': {'type': 'string'},
                'entries_created': {'type': 'integer'},
            },
        }},
    )
    def post(self, request):
        period_date_str = request.data.get('period_date')
        if not period_date_str:
            return Response(
                {'error': 'period_date is required (YYYY-MM-DD, first of month).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            period_date = date.fromisoformat(period_date_str)
        except (ValueError, TypeError):
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if period_date.day != 1:
            return Response(
                {'error': 'period_date must be the first of the month.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = request.tenant
        service = AccountingService(tenant)

        assets = FixedAsset.objects.filter(
            tenant=tenant,
            status='active',
            depreciation_start_date__lte=period_date,
        ).select_related('category')

        total_depreciation = Decimal('0.00')
        entries_created = 0
        assets_processed = 0

        with transaction.atomic():
            for asset in assets:
                # Skip if already depreciated for this period
                if DepreciationEntry.objects.filter(
                    tenant=tenant, asset=asset, period_date=period_date
                ).exists():
                    continue

                # Skip fully depreciated
                if asset.is_fully_depreciated:
                    continue

                monthly_amount = asset.calculate_monthly_depreciation()
                if monthly_amount <= 0:
                    continue

                assets_processed += 1

                # Create journal entry: DEBIT expense, CREDIT accumulated depreciation
                expense_account = asset.get_depreciation_expense_account()
                accum_account = asset.get_accumulated_depreciation_account()

                je = service.create_entry(
                    entry_date=period_date,
                    memo=f"Depreciation - {asset.asset_number} - {asset.description}",
                    lines=[
                        {
                            'account_code': expense_account.code,
                            'description': f"Depreciation expense - {asset.asset_number}",
                            'debit': monthly_amount,
                        },
                        {
                            'account_code': accum_account.code,
                            'description': f"Accumulated depreciation - {asset.asset_number}",
                            'credit': monthly_amount,
                        },
                    ],
                    reference_number=f"DEPR-{period_date.strftime('%Y%m')}",
                    entry_type=JournalEntry.EntryType.STANDARD,
                    created_by=request.user,
                    auto_post=True,
                )

                # Update asset accumulated depreciation
                new_accumulated = asset.accumulated_depreciation + monthly_amount
                asset.accumulated_depreciation = new_accumulated
                nbv_after = asset.acquisition_cost - new_accumulated

                # Auto-update status if fully depreciated
                if new_accumulated >= asset.depreciable_amount:
                    asset.status = 'fully_depreciated'

                asset.save()

                # Create depreciation entry record
                DepreciationEntry.objects.create(
                    tenant=tenant,
                    asset=asset,
                    period_date=period_date,
                    amount=monthly_amount,
                    accumulated_after=new_accumulated,
                    net_book_value_after=nbv_after,
                    journal_entry=je,
                )

                total_depreciation += monthly_amount
                entries_created += 1

        return Response({
            'assets_processed': assets_processed,
            'total_depreciation': str(total_depreciation),
            'entries_created': entries_created,
        })
