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

from apps.items.models import (
    UnitOfMeasure, Item, ItemUOM, ItemVendor,
    CorrugatedFeature, CorrugatedItem,
    DCItem, RSCItem, HSCItem, FOLItem, TeleItem
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
)


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
    filterset_fields = ['is_active', 'is_inventory', 'division', 'base_uom', 'customer']
    search_fields = ['sku', 'name', 'description', 'purch_desc', 'sell_desc']
    ordering_fields = ['sku', 'name', 'division', 'created_at']
    ordering = ['sku']

    def get_queryset(self):
        return Item.objects.select_related('base_uom', 'customer').all()

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
    filterset_fields = ['is_active', 'is_inventory', 'test', 'flute', 'paper', 'is_printed', 'customer']
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
    filterset_fields = ['is_active', 'is_inventory', 'test', 'flute', 'paper', 'is_printed', 'customer']
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
