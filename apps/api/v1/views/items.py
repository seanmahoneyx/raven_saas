# apps/api/v1/views/items.py
"""
ViewSets for Item-related models.

Models:
- UnitOfMeasure
- Item (base)
- ItemUOM (UOM conversions)
- ItemVendor (vendor links with MPN)
- CorrugatedFeature (feature master list)
- CorrugatedItem, DCItem, RSCItem, HSCItem, FOLItem, TeleItem
"""
from rest_framework import viewsets, filters, status
from rest_framework import serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.db.models import Sum, Subquery, OuterRef, IntegerField, CharField, Count
from django.db.models.functions import Coalesce
from django.contrib.contenttypes.models import ContentType
from apps.documents.models import Attachment

from apps.items.models import (
    UnitOfMeasure, Item, ItemUOM, ItemVendor,
    CorrugatedFeature, CorrugatedItem,
    DCItem, RSCItem, HSCItem, FOLItem, TeleItem,
    PackagingItem,
)
from apps.api.v1.serializers.items import (
    UnitOfMeasureSerializer,
    ItemSerializer, ItemListSerializer, ItemDetailSerializer,
    ItemUOMSerializer,
    ItemVendorSerializer, ItemVendorCreateSerializer,
    CorrugatedFeatureSerializer,
    CorrugatedItemSerializer, CorrugatedItemListSerializer, CorrugatedItemDetailSerializer,
    DCItemSerializer, DCItemDetailSerializer,
    RSCItemSerializer, RSCItemDetailSerializer,
    HSCItemSerializer, HSCItemDetailSerializer,
    FOLItemSerializer, FOLItemDetailSerializer,
    TeleItemSerializer, TeleItemDetailSerializer,
    PackagingItemSerializer, PackagingItemDetailSerializer,
)


class SimilarItemEntrySerializer(drf_serializers.Serializer):
    """Serializer for similar item entries."""
    id = drf_serializers.IntegerField()
    sku = drf_serializers.CharField()
    name = drf_serializers.CharField()
    item_type = drf_serializers.CharField()
    customer_name = drf_serializers.CharField(allow_null=True)
    length = drf_serializers.DecimalField(max_digits=10, decimal_places=4, allow_null=True)
    width = drf_serializers.DecimalField(max_digits=10, decimal_places=4, allow_null=True)
    height = drf_serializers.DecimalField(max_digits=10, decimal_places=4, allow_null=True)
    dimension_diff = drf_serializers.CharField()
    test = drf_serializers.CharField()
    flute = drf_serializers.CharField()
    paper = drf_serializers.CharField()


def _get_corrugated_details(item):
    """Resolve concrete child model and item_type from an Item instance."""
    try:
        corr = item.corrugateditem
    except CorrugatedItem.DoesNotExist:
        return None, None, None

    # Check box-type subtypes in order
    for attr, label, model in [
        ('dcitem', 'DC', DCItem),
        ('rscitem', 'RSC', RSCItem),
        ('hscitem', 'HSC', HSCItem),
        ('folitem', 'FOL', FOLItem),
        ('teleitem', 'Tele', TeleItem),
    ]:
        try:
            child = getattr(corr, attr)
            return child, label, model
        except model.DoesNotExist:
            continue

    # Generic corrugated item (no box type)
    return corr, 'Corrugated', CorrugatedItem


def _classify_dimension_match(source, candidate, dim_fields):
    """
    Classify dimension match between source and candidate.
    Returns ('exact', '') or ('close', diff_string) or (None, '').
    """
    TOLERANCE = 0.5
    diffs = []
    all_exact = True

    for field in dim_fields:
        s_val = float(getattr(source, field))
        c_val = float(getattr(candidate, field))
        diff = c_val - s_val
        if diff != 0:
            all_exact = False
        if abs(diff) > TOLERANCE:
            return None, ''
        if diff != 0:
            label = field[0].upper()  # L, W, H
            sign = '+' if diff > 0 else ''
            diffs.append(f"{label}{sign}{diff:.2g}")

    if all_exact:
        return 'exact', 'Exact'
    return 'close', ', '.join(diffs)


class ItemHistoryEntrySerializer(drf_serializers.Serializer):
    """Serializer for Item 360 transaction history entries."""
    type = drf_serializers.CharField()
    date = drf_serializers.DateField()
    document_number = drf_serializers.CharField()
    document_id = drf_serializers.IntegerField()
    party_name = drf_serializers.CharField()
    quantity = drf_serializers.IntegerField()
    price = drf_serializers.DecimalField(max_digits=12, decimal_places=4, allow_null=True)
    line_total = drf_serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    status = drf_serializers.CharField()
    status_display = drf_serializers.CharField()


# =============================================================================
# UNIT OF MEASURE
# =============================================================================

@extend_schema_view(
    list=extend_schema(tags=['items'], summary='List all units of measure'),
    retrieve=extend_schema(tags=['items'], summary='Get UOM details'),
    create=extend_schema(tags=['items'], summary='Create a new UOM'),
    update=extend_schema(tags=['items'], summary='Update a UOM'),
    partial_update=extend_schema(tags=['items'], summary='Partially update a UOM'),
    destroy=extend_schema(tags=['items'], summary='Delete a UOM'),
)
class UnitOfMeasureViewSet(viewsets.ModelViewSet):
    """
    ViewSet for UnitOfMeasure model.

    Provides CRUD operations for units of measure.
    """
    serializer_class = UnitOfMeasureSerializer

    def get_queryset(self):
        return UnitOfMeasure.objects.all()

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name', 'created_at']
    ordering = ['code']


# =============================================================================
# CORRUGATED FEATURES
# =============================================================================

@extend_schema_view(
    list=extend_schema(tags=['items'], summary='List all corrugated features'),
    retrieve=extend_schema(tags=['items'], summary='Get corrugated feature details'),
    create=extend_schema(tags=['items'], summary='Create a new corrugated feature'),
    update=extend_schema(tags=['items'], summary='Update a corrugated feature'),
    partial_update=extend_schema(tags=['items'], summary='Partially update a corrugated feature'),
    destroy=extend_schema(tags=['items'], summary='Delete a corrugated feature'),
)
class CorrugatedFeatureViewSet(viewsets.ModelViewSet):
    """
    ViewSet for CorrugatedFeature model.

    Provides CRUD operations for the corrugated feature master list.
    Features include: handholes, perforations, extra scores, wax coating, etc.
    """
    serializer_class = CorrugatedFeatureSerializer

    def get_queryset(self):
        return CorrugatedFeature.objects.all()

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'requires_details']
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name', 'created_at']
    ordering = ['code']


# =============================================================================
# ITEM VENDOR
# =============================================================================

@extend_schema_view(
    list=extend_schema(tags=['items'], summary='List all item-vendor relationships'),
    retrieve=extend_schema(tags=['items'], summary='Get item-vendor details'),
    create=extend_schema(tags=['items'], summary='Create a new item-vendor relationship'),
    update=extend_schema(tags=['items'], summary='Update an item-vendor relationship'),
    partial_update=extend_schema(tags=['items'], summary='Partially update an item-vendor relationship'),
    destroy=extend_schema(tags=['items'], summary='Delete an item-vendor relationship'),
)
class ItemVendorViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ItemVendor model.

    Provides CRUD operations for item-vendor relationships.
    Stores vendor-specific info like MPN, lead time, min order qty.
    """
    serializer_class = ItemVendorSerializer

    def get_queryset(self):
        return ItemVendor.objects.select_related('item', 'vendor').all()

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['item', 'vendor', 'is_preferred', 'is_active']
    search_fields = ['item__sku', 'item__name', 'vendor__display_name', 'mpn']
    ordering_fields = ['item__sku', 'vendor__display_name', 'created_at']
    ordering = ['item__sku']

    @action(detail=True, methods=['post'], url_path='set-preferred')
    def set_preferred(self, request, pk=None):
        """Set this vendor as the preferred vendor for the item, unsetting any others."""
        vendor_link = self.get_object()
        # Unset all other preferred vendors for this item
        ItemVendor.objects.filter(
            tenant=vendor_link.tenant,
            item=vendor_link.item,
            is_preferred=True,
        ).exclude(pk=vendor_link.pk).update(is_preferred=False)
        # Set this one as preferred
        vendor_link.is_preferred = True
        vendor_link.save(update_fields=['is_preferred'])
        return Response(self.get_serializer(vendor_link).data)


# =============================================================================
# BASE ITEM
# =============================================================================

@extend_schema_view(
    list=extend_schema(tags=['items'], summary='List all items'),
    retrieve=extend_schema(tags=['items'], summary='Get item details'),
    create=extend_schema(tags=['items'], summary='Create a new item'),
    update=extend_schema(tags=['items'], summary='Update an item'),
    partial_update=extend_schema(tags=['items'], summary='Partially update an item'),
    destroy=extend_schema(tags=['items'], summary='Delete an item'),
)
class ItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Item model (base items).

    Provides CRUD operations for product catalog items.
    For corrugated-specific items, use the corrugated item endpoints.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'item_type', 'division', 'base_uom', 'customer', 'parent', 'lifecycle_status']
    search_fields = ['sku', 'name', 'description', 'purch_desc', 'sell_desc']
    ordering_fields = ['sku', 'name', 'division', 'created_at']
    ordering = ['sku']

    def get_queryset(self):
        from apps.inventory.models import InventoryBalance
        from apps.orders.models import PurchaseOrderLine, SalesOrderLine
        from apps.items.models import ItemVendor

        # Open order statuses (not shipped/complete/cancelled)
        open_statuses = ['draft', 'pending_approval', 'confirmed', 'scheduled', 'picking', 'crossdock', 'partially_received']

        # Subquery: total on_hand across all warehouses
        qty_on_hand_sub = InventoryBalance.objects.filter(
            item=OuterRef('pk'),
            tenant=OuterRef('tenant'),
        ).values('item').annotate(total=Sum('on_hand')).values('total')

        # Subquery: total qty on open purchase orders
        qty_on_open_po_sub = PurchaseOrderLine.objects.filter(
            item=OuterRef('pk'),
            tenant=OuterRef('tenant'),
            purchase_order__status__in=open_statuses,
        ).values('item').annotate(total=Sum('quantity_ordered')).values('total')

        # Subquery: total qty on open sales orders
        qty_on_open_so_sub = SalesOrderLine.objects.filter(
            item=OuterRef('pk'),
            tenant=OuterRef('tenant'),
            sales_order__status__in=open_statuses,
        ).values('item').annotate(total=Sum('quantity_ordered')).values('total')

        # Subquery: preferred vendor display_name
        preferred_vendor_sub = ItemVendor.objects.filter(
            item=OuterRef('pk'),
            tenant=OuterRef('tenant'),
            is_preferred=True,
            is_active=True,
        ).values('vendor__display_name')[:1]

        return Item.objects.select_related(
            'base_uom', 'customer',
            'income_account', 'expense_account', 'asset_account',
        ).annotate(
            qty_on_hand=Coalesce(Subquery(qty_on_hand_sub, output_field=IntegerField()), 0),
            qty_on_open_po=Coalesce(Subquery(qty_on_open_po_sub, output_field=IntegerField()), 0),
            qty_on_open_so=Coalesce(Subquery(qty_on_open_so_sub, output_field=IntegerField()), 0),
            preferred_vendor_name=Subquery(preferred_vendor_sub, output_field=CharField()),
            attachment_count=Coalesce(Subquery(
                Attachment.objects.filter(
                    content_type=ContentType.objects.get_for_model(Item),
                    object_id=OuterRef('pk'),
                    tenant=OuterRef('tenant'),
                ).values('object_id').annotate(cnt=Count('id')).values('cnt'),
                output_field=IntegerField(),
            ), 0),
        ).all()

    def get_serializer_class(self):
        if self.action == 'list':
            return ItemListSerializer
        if self.action == 'retrieve':
            return ItemDetailSerializer
        return ItemSerializer

    @extend_schema(
        tags=['items'],
        summary='List UOM conversions for an item',
        responses={200: ItemUOMSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def uom_conversions(self, request, pk=None):
        """List all UOM conversions for this item."""
        item = self.get_object()
        conversions = item.uom_conversions.select_related('uom').all()
        serializer = ItemUOMSerializer(conversions, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['items'],
        summary='Add UOM conversion to an item',
        request=ItemUOMSerializer,
        responses={201: ItemUOMSerializer}
    )
    @uom_conversions.mapping.post
    def add_uom_conversion(self, request, pk=None):
        """Add a UOM conversion to this item."""
        item = self.get_object()
        serializer = ItemUOMSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(item=item, tenant=request.tenant)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['items'],
        summary='List vendors for an item',
        responses={200: ItemVendorSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def vendors(self, request, pk=None):
        """List all vendors for this item."""
        item = self.get_object()
        vendors = item.vendors.select_related('vendor').all()
        serializer = ItemVendorSerializer(vendors, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['items'],
        summary='Add vendor to an item',
        request=ItemVendorCreateSerializer,
        responses={201: ItemVendorSerializer}
    )
    @vendors.mapping.post
    def add_vendor(self, request, pk=None):
        """Add a vendor relationship to this item."""
        item = self.get_object()
        serializer = ItemVendorCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(item=item, tenant=request.tenant)
        # Return full serializer with vendor details
        return Response(
            ItemVendorSerializer(instance, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    @extend_schema(tags=['items'], summary='Get the next auto-generated MSPN')
    @action(detail=False, methods=['get'])
    def next_mspn(self, request):
        """Return the next auto-generated MSPN number."""
        import re
        existing = Item.objects.filter(tenant=request.tenant).values_list('sku', flat=True)
        max_num = 0
        for sku in existing:
            match = re.search(r'MSPN-(\d+)', sku or '')
            if match:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
        return Response({'next_mspn': f"MSPN-{str(max_num + 1).zfill(6)}"})

    @extend_schema(tags=['items'], summary='Generate item spec sheet PDF')
    @action(detail=True, methods=['get'])
    def spec_sheet(self, request, pk=None):
        """Generate a PDF spec sheet for this item."""
        item = self.get_object()
        from apps.documents.pdf import PDFService
        pdf_bytes = PDFService.render_item_spec(item)

        from django.http import HttpResponse
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="spec-sheet-{item.sku}.pdf"'
        return response

    @extend_schema(tags=['items'], summary='Duplicate an item (Save As Copy)')
    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Create a copy of this item with a new SKU suffix '-COPY'."""
        item = self.get_object()
        # Store original relations before cloning
        original_uom_conversions = list(item.uom_conversions.all())
        original_vendors = list(item.vendors.all())

        # Clone the item
        item.pk = None
        item.sku = f"{self.get_object().sku}-COPY"
        item.name = f"{item.name} (Copy)"
        item.save()

        # Clone UOM conversions
        for conv in original_uom_conversions:
            conv.pk = None
            conv.item = item
            conv.save()

        # Clone vendor links
        for vendor_link in original_vendors:
            vendor_link.pk = None
            vendor_link.item = item
            vendor_link.save()

        return Response(
            ItemSerializer(item, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        tags=['items'],
        summary='Find similar items by board spec and dimensions',
    )
    @action(detail=True, methods=['get'])
    def similar(self, request, pk=None):
        """Find items with matching board spec and similar dimensions."""
        item = self.get_object()
        child, item_type, model = _get_corrugated_details(item)

        if child is None:
            return Response({'exact_matches': [], 'close_matches': []})

        # Build base filter for same board spec
        base_filter = {
            'test': child.test,
            'flute': child.flute,
            'paper': child.paper,
            'is_active': True,
        }

        # Determine dimension fields and query the same model
        if model == CorrugatedItem:
            # Generic corrugated — match on board spec only, no dimensions
            candidates = CorrugatedItem.objects.filter(
                **base_filter, tenant=request.tenant,
            ).exclude(pk=child.pk).select_related('customer')[:50]
            dim_fields = []
        elif model == DCItem:
            candidates = DCItem.objects.filter(
                **base_filter, tenant=request.tenant,
            ).exclude(pk=child.pk).select_related('customer')[:50]
            dim_fields = ['length', 'width']
        else:
            # RSC, HSC, FOL, Tele — all have L×W×H
            candidates = model.objects.filter(
                **base_filter, tenant=request.tenant,
            ).exclude(pk=child.pk).select_related('customer')[:50]
            dim_fields = ['length', 'width', 'height']

        exact_matches = []
        close_matches = []

        for cand in candidates:
            if not dim_fields:
                # Generic corrugated: board-spec-only match is "exact"
                entry = {
                    'id': cand.item_ptr_id,
                    'sku': cand.sku,
                    'name': cand.name,
                    'item_type': 'Corrugated',
                    'customer_name': cand.customer.display_name if cand.customer else None,
                    'length': None,
                    'width': None,
                    'height': None,
                    'dimension_diff': 'Board spec match',
                    'test': cand.test,
                    'flute': cand.flute,
                    'paper': cand.paper,
                }
                exact_matches.append(entry)
                continue

            match_type, diff_str = _classify_dimension_match(child, cand, dim_fields)
            if match_type is None:
                continue

            entry = {
                'id': cand.item_ptr_id,
                'sku': cand.sku,
                'name': cand.name,
                'item_type': item_type,
                'customer_name': cand.customer.display_name if cand.customer else None,
                'length': cand.length,
                'width': cand.width,
                'height': getattr(cand, 'height', None),
                'dimension_diff': diff_str,
                'test': cand.test,
                'flute': cand.flute,
                'paper': cand.paper,
            }

            if match_type == 'exact':
                exact_matches.append(entry)
            else:
                close_matches.append(entry)

        return Response({
            'exact_matches': SimilarItemEntrySerializer(exact_matches, many=True).data,
            'close_matches': SimilarItemEntrySerializer(close_matches, many=True).data,
        })

    @extend_schema(
        tags=['items'],
        summary='Get item transaction history (Item 360)',
        responses={200: ItemHistoryEntrySerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """
        Item 360: Combined transaction history across Estimates, RFQs, SOs, and POs.
        Returns a unified, date-sorted list of all commercial activity for this item.
        """
        item = self.get_object()

        from apps.orders.models import (
            EstimateLine, RFQLine, SalesOrderLine, PurchaseOrderLine,
        )

        entries = []

        # Estimates
        for line in EstimateLine.objects.filter(
            item=item, tenant=request.tenant
        ).select_related('estimate__customer__party'):
            est = line.estimate
            entries.append({
                'type': 'ESTIMATE',
                'date': est.date,
                'document_number': est.estimate_number,
                'document_id': est.id,
                'party_name': est.customer.party.display_name,
                'quantity': line.quantity,
                'price': line.unit_price,
                'line_total': line.amount,
                'status': est.status,
                'status_display': est.get_status_display(),
            })

        # RFQs
        for line in RFQLine.objects.filter(
            item=item, tenant=request.tenant
        ).select_related('rfq__vendor__party'):
            rfq = line.rfq
            entries.append({
                'type': 'RFQ',
                'date': rfq.date,
                'document_number': rfq.rfq_number,
                'document_id': rfq.id,
                'party_name': rfq.vendor.party.display_name,
                'quantity': line.quantity,
                'price': line.quoted_price or line.target_price,
                'line_total': line.line_total if (line.quoted_price or line.target_price) else None,
                'status': rfq.status,
                'status_display': rfq.get_status_display(),
            })

        # Sales Orders
        for line in SalesOrderLine.objects.filter(
            item=item, tenant=request.tenant
        ).select_related('sales_order__customer__party'):
            so = line.sales_order
            entries.append({
                'type': 'SO',
                'date': so.order_date,
                'document_number': so.order_number,
                'document_id': so.id,
                'party_name': so.customer.party.display_name,
                'quantity': line.quantity_ordered,
                'price': line.unit_price,
                'line_total': line.line_total,
                'status': so.status,
                'status_display': so.get_status_display(),
            })

        # Purchase Orders
        for line in PurchaseOrderLine.objects.filter(
            item=item, tenant=request.tenant
        ).select_related('purchase_order__vendor__party'):
            po = line.purchase_order
            entries.append({
                'type': 'PO',
                'date': po.order_date,
                'document_number': po.po_number,
                'document_id': po.id,
                'party_name': po.vendor.party.display_name,
                'quantity': line.quantity_ordered,
                'price': line.unit_cost,
                'line_total': line.line_total,
                'status': po.status,
                'status_display': po.get_status_display(),
            })

        # Sort by date descending
        entries.sort(key=lambda e: e['date'], reverse=True)

        serializer = ItemHistoryEntrySerializer(entries, many=True)
        return Response(serializer.data)

    @extend_schema(
        tags=['items'],
        summary='Get item product card (pricing/costing/RFQ history)',
    )
    @action(detail=True, methods=['get'])
    def product_card(self, request, pk=None):
        """
        Aggregates all pricing, costing, and RFQ history for an item into one response.
        """
        item = self.get_object()

        from apps.pricing.models import PriceListHead
        from apps.costing.models import CostListHead
        from apps.orders.models import RFQLine, PurchaseOrderLine, SalesOrderLine, EstimateLine

        # --- Price Lists ---
        price_lists = []
        for pl in PriceListHead.objects.filter(
            item=item, tenant=request.tenant
        ).select_related('customer__party').prefetch_related('lines').order_by('-begin_date'):
            price_lists.append({
                'id': pl.id,
                'customer_name': pl.customer.party.display_name,
                'customer_code': pl.customer.party.code,
                'customer_id': pl.customer_id,
                'begin_date': pl.begin_date,
                'end_date': pl.end_date,
                'is_active': pl.is_active,
                'notes': pl.notes,
                'tiers': [
                    {'min_quantity': line.min_quantity, 'unit_price': line.unit_price}
                    for line in pl.lines.all()
                ],
            })

        # --- Cost Lists ---
        cost_lists = []
        for cl in CostListHead.objects.filter(
            item=item, tenant=request.tenant
        ).select_related('vendor__party').prefetch_related('lines').order_by('-begin_date'):
            cost_lists.append({
                'id': cl.id,
                'vendor_name': cl.vendor.party.display_name,
                'vendor_code': cl.vendor.party.code,
                'vendor_id': cl.vendor_id,
                'begin_date': cl.begin_date,
                'end_date': cl.end_date,
                'is_active': cl.is_active,
                'notes': cl.notes,
                'tiers': [
                    {'min_quantity': line.min_quantity, 'unit_cost': line.unit_cost}
                    for line in cl.lines.all()
                ],
            })

        # --- RFQ Quotes ---
        rfq_quotes = []
        for line in RFQLine.objects.filter(
            item=item, tenant=request.tenant
        ).select_related('rfq__vendor__party').order_by('-rfq__date'):
            rfq = line.rfq
            rfq_quotes.append({
                'rfq_id': rfq.id,
                'rfq_number': rfq.rfq_number,
                'vendor_name': rfq.vendor.party.display_name,
                'vendor_code': rfq.vendor.party.code,
                'vendor_id': rfq.vendor_id,
                'date': rfq.date,
                'status': rfq.status,
                'status_display': rfq.get_status_display(),
                'quantity': line.quantity,
                'target_price': line.target_price,
                'quoted_price': line.quoted_price,
                'notes': line.notes,
            })

        # --- Customer Estimates ---
        estimates = []
        for line in EstimateLine.objects.filter(
            item=item, tenant=request.tenant
        ).select_related('estimate__customer__party').order_by('-estimate__date'):
            est = line.estimate
            estimates.append({
                'estimate_id': est.id,
                'estimate_number': est.estimate_number,
                'customer_name': est.customer.party.display_name,
                'customer_code': est.customer.party.code,
                'customer_id': est.customer_id,
                'date': est.date,
                'expiration_date': est.expiration_date,
                'status': est.status,
                'status_display': est.get_status_display(),
                'quantity': line.quantity,
                'unit_price': line.unit_price,
                'notes': line.notes,
            })

        # --- Last Buy ---
        last_buy_line = PurchaseOrderLine.objects.filter(
            item=item, tenant=request.tenant
        ).select_related('purchase_order__vendor__party').order_by('-purchase_order__order_date').first()
        if last_buy_line:
            po = last_buy_line.purchase_order
            last_buy = {
                'price': last_buy_line.unit_cost,
                'date': po.order_date,
                'vendor_name': po.vendor.party.display_name,
                'po_number': po.po_number,
            }
        else:
            last_buy = None

        # --- Last Sell ---
        last_sell_line = SalesOrderLine.objects.filter(
            item=item, tenant=request.tenant
        ).select_related('sales_order__customer__party').order_by('-sales_order__order_date').first()
        if last_sell_line:
            so = last_sell_line.sales_order
            last_sell = {
                'price': last_sell_line.unit_price,
                'date': so.order_date,
                'customer_name': so.customer.party.display_name,
                'so_number': so.order_number,
            }
        else:
            last_sell = None

        # --- Vendors ---
        vendor_links = ItemVendor.objects.filter(
            item=item, tenant=request.tenant, is_active=True
        ).select_related('vendor')
        vendors = [
            {
                'vendor_id': vl.vendor_id,
                'vendor_name': vl.vendor.display_name,
                'vendor_code': vl.vendor.code,
                'mpn': vl.mpn,
                'lead_time_days': vl.lead_time_days,
                'min_order_qty': vl.min_order_qty,
                'is_preferred': vl.is_preferred,
            }
            for vl in vendor_links
        ]

        # --- Item Details ---
        customer = item.customer
        item_details = {
            'sku': item.sku,
            'name': item.name,
            'description': item.description,
            'purch_desc': item.purch_desc,
            'sell_desc': item.sell_desc,
            'division': item.division,
            'item_type': item.item_type,
            'is_active': item.is_active,
            'customer_name': customer.display_name if customer else None,
            'customer_code': customer.code if customer else None,
            'reorder_point': item.reorder_point,
            'min_stock': item.min_stock,
            'safety_stock': item.safety_stock,
            'base_uom_code': item.base_uom.code if item.base_uom else None,
            'product_card_notes': item.product_card_notes,
        }

        return Response({
            'price_lists': price_lists,
            'cost_lists': cost_lists,
            'rfq_quotes': rfq_quotes,
            'estimates': estimates,
            'last_buy': last_buy,
            'last_sell': last_sell,
            'vendors': vendors,
            'item_details': item_details,
        })

    @extend_schema(tags=['items'], summary='Transition item lifecycle status')
    @action(detail=True, methods=['post'])
    def transition(self, request, pk=None):
        """
        Transition item lifecycle status.

        Valid transitions:
        - draft → pending_design, pending_approval
        - pending_design → in_design
        - in_design → design_complete
        - design_complete → pending_approval
        - pending_approval → active, draft (rejection)

        Permissions:
        - All users can create drafts and submit for design/approval
        - can_design_item: claim design, mark design complete
        - can_approve_item: approve to active, reject back to draft
        """
        item = self.get_object()
        new_status = request.data.get('lifecycle_status')
        if not new_status:
            return Response(
                {'error': 'lifecycle_status is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        VALID_TRANSITIONS = {
            'draft': ['pending_design', 'pending_approval'],
            'pending_design': ['in_design', 'draft'],
            'in_design': ['design_complete', 'draft'],
            'design_complete': ['pending_approval', 'draft'],
            'pending_approval': ['active', 'draft'],
        }
        allowed = VALID_TRANSITIONS.get(item.lifecycle_status, [])
        if new_status not in allowed:
            return Response(
                {'error': f'Cannot transition from {item.lifecycle_status} to {new_status}. Allowed: {allowed}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Permission checks for specific transitions
        DESIGN_TRANSITIONS = {'in_design', 'design_complete'}
        APPROVAL_TRANSITIONS = {'active'}
        REJECTION_TRANSITIONS_FROM_APPROVAL = {('pending_approval', 'draft')}

        if new_status in DESIGN_TRANSITIONS:
            if not request.user.has_perm('items.can_design_item') and not request.user.is_staff:
                return Response(
                    {'error': 'You do not have permission to perform design actions'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        if new_status in APPROVAL_TRANSITIONS or (item.lifecycle_status, new_status) in REJECTION_TRANSITIONS_FROM_APPROVAL:
            if not request.user.has_perm('items.can_approve_item') and not request.user.is_staff:
                return Response(
                    {'error': 'You do not have permission to approve or reject items'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        item.lifecycle_status = new_status
        # If transitioning to active for the first time, set revision 1
        if new_status == 'active' and not item.revision:
            item.revision = 1
            item.revision_reason = 'Initial release'
            from django.utils import timezone
            item.revision_date = timezone.now()
            item.revision_changed_by = request.user
        item.save()

        # If transitioning to pending_design, auto-create a DesignRequest linked to this item
        if new_status == 'pending_design':
            from apps.design.models import DesignRequest
            # Only create if no existing design request is linked
            if not DesignRequest.objects.filter(generated_item=item, tenant=request.tenant).exists():
                # Pull corrugated specs from the item if available
                dr_kwargs = {
                    'tenant': request.tenant,
                    'customer': item.customer,
                    'requested_by': request.user,
                    'ident': item.name,
                    'generated_item': item,
                    'notes': request.data.get('design_notes', ''),
                }
                # Copy corrugated specs if this is a corrugated item
                try:
                    corr = item.corrugateditem
                    dr_kwargs.update({
                        'test': corr.test or '',
                        'flute': corr.flute or '',
                        'paper': corr.paper or '',
                    })
                    # Determine style from box type
                    for attr, style_label in [('dcitem', 'DC'), ('rscitem', 'RSC'), ('hscitem', 'HSC'), ('folitem', 'FOL'), ('teleitem', 'Tele')]:
                        if hasattr(corr, attr):
                            dr_kwargs['style'] = style_label
                            child = getattr(corr, attr)
                            dr_kwargs['length'] = child.length
                            dr_kwargs['width'] = child.width
                            if hasattr(child, 'height'):
                                dr_kwargs['depth'] = child.height
                            break
                except CorrugatedItem.DoesNotExist:
                    pass

                DesignRequest.objects.create(**dr_kwargs)

        return Response(ItemSerializer(item, context={'request': request}).data)

    @extend_schema(tags=['items'], summary='Bump item revision')
    @action(detail=True, methods=['post'], url_path='bump-revision')
    def bump_revision(self, request, pk=None):
        """
        Bump the revision number on an active item.
        Requires a reason for the revision change.
        """
        item = self.get_object()
        if item.lifecycle_status != 'active':
            return Response(
                {'error': 'Can only bump revision on active items'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not request.user.has_perm('items.can_bump_revision') and not request.user.is_staff:
            return Response(
                {'error': 'You do not have permission to bump revisions'},
                status=status.HTTP_403_FORBIDDEN,
            )

        reason = request.data.get('reason', '')
        if not reason:
            return Response(
                {'error': 'Revision reason is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item.bump_revision(reason=reason, user=request.user)
        return Response(ItemSerializer(item, context={'request': request}).data)


# =============================================================================
# CORRUGATED ITEMS
# =============================================================================

@extend_schema_view(
    list=extend_schema(tags=['corrugated'], summary='List all corrugated items'),
    retrieve=extend_schema(tags=['corrugated'], summary='Get corrugated item details'),
    create=extend_schema(tags=['corrugated'], summary='Create a new corrugated item'),
    update=extend_schema(tags=['corrugated'], summary='Update a corrugated item'),
    partial_update=extend_schema(tags=['corrugated'], summary='Partially update a corrugated item'),
    destroy=extend_schema(tags=['corrugated'], summary='Delete a corrugated item'),
)
class CorrugatedItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for CorrugatedItem model (generic corrugated items).

    For specific box types, use the dedicated endpoints:
    - /dc-items/ for Die Cut
    - /rsc-items/ for RSC
    - /hsc-items/ for HSC
    - /fol-items/ for FOL
    - /tele-items/ for Telescoping
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'item_type', 'test', 'flute', 'paper', 'is_printed', 'customer']
    search_fields = ['sku', 'name', 'description', 'purch_desc', 'sell_desc']
    ordering_fields = ['sku', 'name', 'test', 'flute', 'created_at']
    ordering = ['sku']

    def get_queryset(self):
        return CorrugatedItem.objects.select_related('base_uom', 'customer').prefetch_related('features').all()

    def get_serializer_class(self):
        if self.action == 'list':
            return CorrugatedItemListSerializer
        if self.action == 'retrieve':
            return CorrugatedItemDetailSerializer
        return CorrugatedItemSerializer


# =============================================================================
# BOX TYPE VIEWSETS
# =============================================================================

class BaseBoxViewSet(viewsets.ModelViewSet):
    """Base ViewSet for box type items with common configuration."""
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'item_type', 'test', 'flute', 'paper', 'is_printed', 'customer']
    search_fields = ['sku', 'name', 'description', 'purch_desc', 'sell_desc']
    ordering_fields = ['sku', 'name', 'length', 'width', 'created_at']
    ordering = ['sku']


@extend_schema_view(
    list=extend_schema(tags=['corrugated'], summary='List all Die Cut items'),
    retrieve=extend_schema(tags=['corrugated'], summary='Get Die Cut item details'),
    create=extend_schema(tags=['corrugated'], summary='Create a new Die Cut item'),
    update=extend_schema(tags=['corrugated'], summary='Update a Die Cut item'),
    partial_update=extend_schema(tags=['corrugated'], summary='Partially update a Die Cut item'),
    destroy=extend_schema(tags=['corrugated'], summary='Delete a Die Cut item'),
)
class DCItemViewSet(BaseBoxViewSet):
    """ViewSet for Die Cut items (L×W with blank size)."""

    def get_queryset(self):
        return DCItem.objects.select_related('base_uom', 'customer').prefetch_related('features').all()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DCItemDetailSerializer
        return DCItemSerializer


@extend_schema_view(
    list=extend_schema(tags=['corrugated'], summary='List all RSC items'),
    retrieve=extend_schema(tags=['corrugated'], summary='Get RSC item details'),
    create=extend_schema(tags=['corrugated'], summary='Create a new RSC item'),
    update=extend_schema(tags=['corrugated'], summary='Update an RSC item'),
    partial_update=extend_schema(tags=['corrugated'], summary='Partially update an RSC item'),
    destroy=extend_schema(tags=['corrugated'], summary='Delete an RSC item'),
)
class RSCItemViewSet(BaseBoxViewSet):
    """ViewSet for Regular Slotted Container items (L×W×H)."""
    ordering_fields = ['sku', 'name', 'length', 'width', 'height', 'created_at']

    def get_queryset(self):
        return RSCItem.objects.select_related('base_uom', 'customer').prefetch_related('features').all()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return RSCItemDetailSerializer
        return RSCItemSerializer


@extend_schema_view(
    list=extend_schema(tags=['corrugated'], summary='List all HSC items'),
    retrieve=extend_schema(tags=['corrugated'], summary='Get HSC item details'),
    create=extend_schema(tags=['corrugated'], summary='Create a new HSC item'),
    update=extend_schema(tags=['corrugated'], summary='Update an HSC item'),
    partial_update=extend_schema(tags=['corrugated'], summary='Partially update an HSC item'),
    destroy=extend_schema(tags=['corrugated'], summary='Delete an HSC item'),
)
class HSCItemViewSet(BaseBoxViewSet):
    """ViewSet for Half Slotted Container items (L×W×H)."""
    ordering_fields = ['sku', 'name', 'length', 'width', 'height', 'created_at']

    def get_queryset(self):
        return HSCItem.objects.select_related('base_uom', 'customer').prefetch_related('features').all()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return HSCItemDetailSerializer
        return HSCItemSerializer


@extend_schema_view(
    list=extend_schema(tags=['corrugated'], summary='List all FOL items'),
    retrieve=extend_schema(tags=['corrugated'], summary='Get FOL item details'),
    create=extend_schema(tags=['corrugated'], summary='Create a new FOL item'),
    update=extend_schema(tags=['corrugated'], summary='Update a FOL item'),
    partial_update=extend_schema(tags=['corrugated'], summary='Partially update a FOL item'),
    destroy=extend_schema(tags=['corrugated'], summary='Delete a FOL item'),
)
class FOLItemViewSet(BaseBoxViewSet):
    """ViewSet for Full Overlap items (L×W×H)."""
    ordering_fields = ['sku', 'name', 'length', 'width', 'height', 'created_at']

    def get_queryset(self):
        return FOLItem.objects.select_related('base_uom', 'customer').prefetch_related('features').all()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return FOLItemDetailSerializer
        return FOLItemSerializer


@extend_schema_view(
    list=extend_schema(tags=['corrugated'], summary='List all Telescoping items'),
    retrieve=extend_schema(tags=['corrugated'], summary='Get Telescoping item details'),
    create=extend_schema(tags=['corrugated'], summary='Create a new Telescoping item'),
    update=extend_schema(tags=['corrugated'], summary='Update a Telescoping item'),
    partial_update=extend_schema(tags=['corrugated'], summary='Partially update a Telescoping item'),
    destroy=extend_schema(tags=['corrugated'], summary='Delete a Telescoping item'),
)
class TeleItemViewSet(BaseBoxViewSet):
    """ViewSet for Telescoping items (L×W×H)."""
    ordering_fields = ['sku', 'name', 'length', 'width', 'height', 'created_at']

    def get_queryset(self):
        return TeleItem.objects.select_related('base_uom', 'customer').prefetch_related('features').all()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return TeleItemDetailSerializer
        return TeleItemSerializer


# =============================================================================
# PACKAGING ITEM
# =============================================================================

@extend_schema_view(
    list=extend_schema(tags=['packaging'], summary='List all Packaging items'),
    retrieve=extend_schema(tags=['packaging'], summary='Get Packaging item details'),
    create=extend_schema(tags=['packaging'], summary='Create a new Packaging item'),
    update=extend_schema(tags=['packaging'], summary='Update a Packaging item'),
    partial_update=extend_schema(tags=['packaging'], summary='Partially update a Packaging item'),
    destroy=extend_schema(tags=['packaging'], summary='Delete a Packaging item'),
)
class PackagingItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for PackagingItem model.

    Provides CRUD operations for packaging items (bags, bubble, tape, stretch, etc.).
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'is_active', 'item_type', 'sub_type', 'customer',
        'material_type', 'color',
    ]
    search_fields = ['sku', 'name', 'description', 'purch_desc', 'sell_desc', 'material_type']
    ordering_fields = ['sku', 'name', 'sub_type', 'material_type', 'created_at']
    ordering = ['sku']

    def get_queryset(self):
        return PackagingItem.objects.select_related('base_uom', 'customer').all()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PackagingItemDetailSerializer
        return PackagingItemSerializer
