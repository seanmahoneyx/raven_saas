# apps/api/v1/views/inventory.py
"""
ViewSets for Inventory models: InventoryLot, InventoryPallet, InventoryBalance,
InventoryTransaction, ItemReceipt.
"""
from decimal import Decimal

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from django.db.models import Sum
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.views import APIView

from apps.inventory.models import (
    InventoryLot, InventoryPallet, InventoryBalance, InventoryTransaction,
    ItemReceipt, ItemReceiptLine,
)
from apps.inventory.services import ReceivingService
from apps.invoicing.services import VendorBillService
from apps.warehousing.models import Warehouse
from apps.api.v1.serializers.inventory import (
    InventoryLotSerializer, InventoryLotListSerializer, InventoryLotDetailSerializer,
    InventoryPalletSerializer, InventoryBalanceSerializer, InventoryTransactionSerializer,
    ItemReceiptListSerializer, ItemReceiptDetailSerializer,
)
from apps.api.v1.serializers.invoicing import VendorBillDetailSerializer


@extend_schema_view(
    list=extend_schema(tags=['inventory'], summary='List all inventory lots'),
    retrieve=extend_schema(tags=['inventory'], summary='Get inventory lot details'),
    create=extend_schema(tags=['inventory'], summary='Create a new inventory lot'),
    update=extend_schema(tags=['inventory'], summary='Update an inventory lot'),
    partial_update=extend_schema(tags=['inventory'], summary='Partially update an inventory lot'),
    destroy=extend_schema(tags=['inventory'], summary='Delete an inventory lot'),
)
class InventoryLotViewSet(viewsets.ModelViewSet):
    """
    ViewSet for InventoryLot model.

    Provides CRUD operations for inventory lots.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return InventoryLot.objects.select_related(
            'item', 'warehouse', 'vendor__party', 'purchase_order'
        ).prefetch_related('pallets').all()
    filterset_fields = ['item', 'warehouse', 'vendor', 'purchase_order']
    search_fields = ['lot_number', 'item__sku', 'item__name']
    ordering_fields = ['lot_number', 'received_date', 'created_at']
    ordering = ['-received_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return InventoryLotListSerializer
        if self.action == 'retrieve':
            return InventoryLotDetailSerializer
        return InventoryLotSerializer

    @extend_schema(
        tags=['inventory'],
        summary='List pallets for a lot',
        responses={200: InventoryPalletSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def pallets(self, request, pk=None):
        """List all pallets in this lot."""
        lot = self.get_object()
        pallets = lot.pallets.select_related('bin').all()
        serializer = InventoryPalletSerializer(pallets, many=True, context={'request': request})
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['inventory'], summary='List all inventory pallets'),
    retrieve=extend_schema(tags=['inventory'], summary='Get inventory pallet details'),
    create=extend_schema(tags=['inventory'], summary='Create a new inventory pallet'),
    update=extend_schema(tags=['inventory'], summary='Update an inventory pallet'),
    partial_update=extend_schema(tags=['inventory'], summary='Partially update an inventory pallet'),
    destroy=extend_schema(tags=['inventory'], summary='Delete an inventory pallet'),
)
class InventoryPalletViewSet(viewsets.ModelViewSet):
    """
    ViewSet for InventoryPallet model.

    Provides CRUD operations for inventory pallets.
    """
    serializer_class = InventoryPalletSerializer

    def get_queryset(self):
        return InventoryPallet.objects.select_related('lot__item', 'lot__warehouse', 'bin').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['lot', 'bin', 'status']
    search_fields = ['license_plate', 'lot__lot_number', 'lot__item__sku']
    ordering_fields = ['license_plate', 'created_at']
    ordering = ['lot', 'pallet_number']

    @extend_schema(tags=['inventory'], summary='Look up pallet by license plate')
    @action(detail=False, methods=['get'])
    def lookup(self, request):
        """Look up a pallet by license plate."""
        license_plate = request.query_params.get('license_plate')
        if not license_plate:
            return Response(
                {'error': 'license_plate parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            pallet = self.get_queryset().get(license_plate=license_plate)
            serializer = self.get_serializer(pallet)
            return Response(serializer.data)
        except InventoryPallet.DoesNotExist:
            return Response(
                {'error': f'Pallet with license plate {license_plate} not found'},
                status=status.HTTP_404_NOT_FOUND
            )


@extend_schema_view(
    list=extend_schema(tags=['inventory'], summary='List all inventory balances'),
    retrieve=extend_schema(tags=['inventory'], summary='Get inventory balance details'),
)
class InventoryBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for InventoryBalance model.

    Read-only - balances are updated via transactions.
    """
    serializer_class = InventoryBalanceSerializer

    def get_queryset(self):
        return InventoryBalance.objects.select_related('item', 'warehouse').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['item', 'warehouse']
    search_fields = ['item__sku', 'item__name', 'warehouse__code']
    ordering_fields = ['item__sku', 'warehouse__code', 'on_hand', 'last_updated']
    ordering = ['item__sku', 'warehouse__code']

    @extend_schema(
        tags=['inventory'],
        summary='Get balance for item/warehouse',
        responses={200: InventoryBalanceSerializer}
    )
    @action(detail=False, methods=['get'])
    def lookup(self, request):
        """Look up balance for a specific item/warehouse."""
        item_id = request.query_params.get('item')
        warehouse_id = request.query_params.get('warehouse')

        if not item_id:
            return Response(
                {'error': 'item parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = self.get_queryset().filter(item_id=item_id)
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['inventory'], summary='List all inventory transactions'),
    retrieve=extend_schema(tags=['inventory'], summary='Get inventory transaction details'),
    create=extend_schema(tags=['inventory'], summary='Create a new inventory transaction'),
)
class InventoryTransactionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for InventoryTransaction model.

    Transactions should normally be created through service layer,
    but direct creation is allowed for adjustments and corrections.
    """
    serializer_class = InventoryTransactionSerializer

    def get_queryset(self):
        return InventoryTransaction.objects.select_related(
            'item', 'warehouse', 'lot', 'pallet', 'user'
        ).all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['transaction_type', 'item', 'warehouse', 'lot', 'reference_type']
    search_fields = ['reference_number', 'item__sku', 'lot__lot_number']
    ordering_fields = ['transaction_date', 'created_at']
    ordering = ['-transaction_date']
    http_method_names = ['get', 'post', 'head', 'options']  # No updates/deletes on transactions


@extend_schema_view(
    list=extend_schema(tags=['inventory'], summary='List item receipts'),
    retrieve=extend_schema(tags=['inventory'], summary='Get receipt details'),
)
class ItemReceiptViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet for ItemReceipt.

    Receipts are created via the PurchaseOrder.receive endpoint (which calls
    OrderService.receive_purchase_order → ReceivingService internally) or
    via the `direct` action below for receipts not tied to a PO. They cannot
    be edited or deleted once posted — the underlying ledger entries are
    immutable.
    """
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'vendor', 'purchase_order', 'warehouse']
    search_fields = [
        'receipt_number', 'vendor__party__display_name',
        'purchase_order__po_number',
    ]
    ordering_fields = ['receipt_number', 'received_date', 'created_at']
    ordering = ['-received_date', '-id']

    def get_queryset(self):
        return ItemReceipt.objects.select_related(
            'vendor__party', 'warehouse', 'purchase_order', 'received_by', 'journal_entry',
        ).prefetch_related('lines__item', 'lines__purchase_order_line').all()

    def get_serializer_class(self):
        if self.action in ('retrieve', 'create_bill', 'create_multi_bill'):
            return ItemReceiptDetailSerializer
        return ItemReceiptListSerializer

    @extend_schema(
        tags=['inventory'],
        summary='Create a direct item receipt (no PO)',
        request=None,
        responses={201: ItemReceiptDetailSerializer},
    )
    @action(detail=False, methods=['post'], url_path='direct')
    def direct(self, request):
        """
        Create a receipt without a PO. The vendor delivered stock directly
        and we're recording it for inventory + GR/IR accrual purposes.

        Request body:
            vendor: int (Vendor PK)
            warehouse: int (Location PK)
            received_date: 'YYYY-MM-DD' (optional)
            notes: str (optional)
            lines: [{item: int, quantity: int, unit_cost: str, notes: str}, ...]
        """
        from apps.parties.models import Vendor, Location
        from apps.items.models import Item

        data = request.data
        try:
            vendor = Vendor.objects.get(pk=data['vendor'])
            warehouse = Location.objects.get(pk=data['warehouse'])
        except (KeyError, Vendor.DoesNotExist, Location.DoesNotExist) as e:
            return Response({'error': f'Invalid vendor or warehouse: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        raw_lines = data.get('lines') or []
        if not raw_lines:
            return Response({'error': 'At least one line is required'}, status=status.HTTP_400_BAD_REQUEST)

        line_dicts = []
        for ln in raw_lines:
            try:
                item = Item.objects.get(pk=ln['item'])
            except (KeyError, Item.DoesNotExist):
                return Response({'error': f'Invalid item: {ln.get("item")}'}, status=status.HTTP_400_BAD_REQUEST)
            line_dicts.append({
                'item': item,
                'quantity': int(ln['quantity']),
                'unit_cost': Decimal(str(ln['unit_cost'])),
                'notes': ln.get('notes', ''),
            })

        svc = ReceivingService(request.tenant, request.user)
        try:
            receipt = svc.create_and_post_receipt(
                vendor=vendor,
                warehouse=warehouse,
                lines=line_dicts,
                purchase_order=None,
                received_date=data.get('received_date'),
                notes=data.get('notes', ''),
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, 'messages') and e.messages else str(e)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ItemReceiptDetailSerializer(receipt, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['inventory'],
        summary='Create a draft vendor bill from this receipt',
        responses={201: VendorBillDetailSerializer},
    )
    @action(detail=True, methods=['post'], url_path='create-bill')
    def create_bill(self, request, pk=None):
        """
        Convenience action: roll every unbilled line on this receipt into a
        new draft VendorBill linked back via item_receipt_line. Body may
        include vendor_invoice_number / due_date / notes overrides.
        """
        receipt = self.get_object()

        # Build receipt_lines payload from all unbilled lines.
        receipt_lines = [
            {'receipt_line': rl, 'quantity': rl.quantity_remaining_to_bill, 'unit_price': rl.unit_cost}
            for rl in receipt.lines.all()
            if rl.quantity_remaining_to_bill > 0
        ]
        if not receipt_lines:
            return Response(
                {'detail': 'This receipt has no unbilled lines remaining.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.utils import timezone as tz
        from datetime import timedelta

        body = request.data or {}
        bill_svc = VendorBillService(request.tenant, request.user)
        try:
            bill = bill_svc.create_bill_from_receipts(
                vendor=receipt.vendor,
                receipt_lines=receipt_lines,
                vendor_invoice_number=body.get('vendor_invoice_number') or receipt.receipt_number,
                due_date=body.get('due_date') or (tz.now().date() + timedelta(days=30)),
                bill_date=body.get('bill_date') or tz.now().date(),
                notes=body.get('notes') or f'Created from receipt {receipt.receipt_number}',
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, 'messages') and e.messages else str(e)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = VendorBillDetailSerializer(bill, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=['inventory'],
        summary='Create a draft vendor bill rolling up multiple receipts',
        responses={201: VendorBillDetailSerializer},
    )
    @action(detail=False, methods=['post'], url_path='create-multi-bill')
    def create_multi_bill(self, request):
        """
        Roll multiple ItemReceiptLines into one consolidated draft VendorBill.

        Request body:
            vendor: int (Vendor PK)
            vendor_invoice_number: str (optional)
            due_date: 'YYYY-MM-DD' (optional)
            bill_date: 'YYYY-MM-DD' (optional)
            notes: str (optional)
            lines: [{receipt_line: int, quantity: int (optional), unit_price: str (optional)}]
        """
        from apps.parties.models import Vendor
        from django.utils import timezone as tz
        from datetime import timedelta

        data = request.data
        try:
            vendor = Vendor.objects.get(pk=data['vendor'])
        except (KeyError, Vendor.DoesNotExist) as e:
            return Response({'error': f'Invalid vendor: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        raw_lines = data.get('lines') or []
        if not raw_lines:
            return Response({'error': 'At least one line is required'}, status=status.HTTP_400_BAD_REQUEST)

        receipt_lines = []
        for ln in raw_lines:
            try:
                rl = ItemReceiptLine.objects.select_related(
                    'receipt__vendor__party', 'item', 'purchase_order_line',
                ).get(pk=ln['receipt_line'])
            except (KeyError, ItemReceiptLine.DoesNotExist):
                return Response(
                    {'error': f'Invalid receipt line: {ln.get("receipt_line")}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            entry = {'receipt_line': rl}
            if 'quantity' in ln:
                entry['quantity'] = int(ln['quantity'])
            if 'unit_price' in ln:
                entry['unit_price'] = Decimal(str(ln['unit_price']))
            receipt_lines.append(entry)

        bill_svc = VendorBillService(request.tenant, request.user)
        try:
            bill = bill_svc.create_bill_from_receipts(
                vendor=vendor,
                receipt_lines=receipt_lines,
                vendor_invoice_number=data.get('vendor_invoice_number') or 'MULTI-RECEIPT',
                due_date=data.get('due_date') or (tz.now().date() + timedelta(days=30)),
                bill_date=data.get('bill_date') or tz.now().date(),
                notes=data.get('notes', ''),
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, 'messages') and e.messages else str(e)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = VendorBillDetailSerializer(bill, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WarehousePalletSummaryView(APIView):
    """GET /inventory/warehouse-pallet-summary/ - Pallets in inventory vs total capacity."""

    @extend_schema(tags=['inventory'], summary='Get warehouse pallet summary')
    def get(self, request):
        pallets_in_inventory = InventoryPallet.objects.filter(
            lot__tenant=request.tenant,
            quantity_on_hand__gt=0,
        ).count()

        total_capacity = Warehouse.objects.filter(
            tenant=request.tenant,
            is_active=True,
        ).aggregate(total=Sum('pallet_capacity'))['total'] or 0

        return Response({
            'pallets_in_inventory': pallets_in_inventory,
            'total_capacity': total_capacity,
        })
