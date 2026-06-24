# apps/inventory/models.py
"""
Inventory management models for tracking stock levels and movements.

Models:
- InventoryLot: Lot received from vendor (or manufactured)
- InventoryPallet: Individual pallet within a lot
- InventoryBalance: Real-time inventory balance per item/warehouse
- InventoryTransaction: Audit trail for all inventory movements

Inventory Flow:
1. Receive goods -> Create InventoryLot + InventoryPallet records
2. Transaction (RECEIPT) created -> InventoryBalance.on_hand updated
3. Order placed -> Transaction (ALLOCATE) -> InventoryBalance.allocated updated
4. Order shipped -> Transaction (ISSUE) -> on_hand and allocated reduced
"""
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from shared.models import TenantMixin, TimestampMixin
import uuid
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from simple_history.models import HistoricalRecords


class InventoryLot(TenantMixin, TimestampMixin):
    """
    Lot received from vendor or manufactured.

    A lot represents a batch of items received together. All items
    in a lot share the same cost and vendor information.

    Example:
        Lot: LOT-2024-001234
        Item: Widget-001
        Vendor: ABC Supply
        Received: 2024-01-15
        Quantity: 1000 each
        Unit Cost: $5.00
    """
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='inventory_lots',
        help_text="Item in this lot"
    )
    warehouse = models.ForeignKey(
        'new_warehousing.Warehouse',
        on_delete=models.PROTECT,
        related_name='inventory_lots',
        help_text="Warehouse where lot is stored"
    )
    vendor = models.ForeignKey(
        'parties.Vendor',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='inventory_lots',
        help_text="Vendor this lot was received from (null for transfers)"
    )
    purchase_order = models.ForeignKey(
        'orders.PurchaseOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inventory_lots',
        help_text="PO this lot was received against"
    )
    lot_number = models.CharField(
        max_length=50,
        help_text="Lot identifier (auto-generated or manual)"
    )
    received_date = models.DateField(
        default=timezone.now,
        help_text="Date lot was received"
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Cost per base unit (EACH)"
    )
    total_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Total quantity received in base units (EACH)"
    )
    notes = models.TextField(
        blank=True,
        help_text="Notes about this lot"
    )

    class Meta:
        verbose_name = "Inventory Lot"
        verbose_name_plural = "Inventory Lots"
        unique_together = [('tenant', 'lot_number')]
        indexes = [
            models.Index(fields=['tenant', 'lot_number']),
            models.Index(fields=['tenant', 'item', 'warehouse']),
            models.Index(fields=['tenant', 'received_date']),
        ]

    def __str__(self):
        return f"{self.lot_number} - {self.item.sku}"

    @property
    def total_value(self):
        """Calculate total value of this lot."""
        return self.total_quantity * self.unit_cost

    @property
    def quantity_on_hand(self):
        """Calculate current quantity on hand from pallets."""
        return sum(p.quantity_on_hand for p in self.pallets.all())


class InventoryPallet(TenantMixin, TimestampMixin):
    """
    Individual pallet within a lot.

    Each pallet has a unique license plate (barcode) for tracking.
    Pallets can be moved between bins and partially picked.

    Example:
        Lot: LOT-2024-001234
        Pallet #: 1
        License Plate: LP-A1B2C3D4
        Quantity: 250 each
        Bin: A-01-01
    """
    lot = models.ForeignKey(
        InventoryLot,
        on_delete=models.CASCADE,
        related_name='pallets',
        help_text="Lot this pallet belongs to"
    )
    pallet_number = models.PositiveIntegerField(
        help_text="Pallet number within the lot"
    )
    license_plate = models.CharField(
        max_length=64,
        unique=True,
        help_text="Unique scannable identifier (barcode)"
    )
    quantity_received = models.PositiveIntegerField(
        help_text="Original quantity received (base units)"
    )
    quantity_on_hand = models.PositiveIntegerField(
        help_text="Current quantity on hand (base units)"
    )
    bin = models.ForeignKey(
        'new_warehousing.Bin',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='pallets',
        help_text="Current bin location"
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ('AVAILABLE', 'Available'),
            ('ALLOCATED', 'Allocated'),
            ('PICKING', 'Picking'),
            ('SHIPPED', 'Shipped'),
            ('DAMAGED', 'Damaged'),
            ('CONSUMED', 'Consumed'),
        ],
        default='AVAILABLE',
        help_text="Current pallet status"
    )

    class Meta:
        verbose_name = "Inventory Pallet"
        verbose_name_plural = "Inventory Pallets"
        unique_together = [('lot', 'pallet_number')]
        ordering = ['lot', 'pallet_number']
        indexes = [
            models.Index(fields=['license_plate']),
            models.Index(fields=['lot', 'pallet_number']),
            models.Index(fields=['bin', 'status']),
        ]

    def __str__(self):
        return f"{self.license_plate} ({self.quantity_on_hand} on hand)"

    def save(self, *args, **kwargs):
        """Ensure tenant matches lot and generate license plate if needed."""
        if self.lot_id:
            self.tenant = self.lot.tenant
        if not self.license_plate:
            self.license_plate = f"LP-{uuid.uuid4().hex[:12].upper()}"
        super().save(*args, **kwargs)

    def clean(self):
        """Validate pallet data."""
        super().clean()
        if self.quantity_on_hand > self.quantity_received:
            raise ValidationError({
                'quantity_on_hand': "On hand cannot exceed quantity received."
            })


class InventoryBalance(TenantMixin):
    """
    Real-time inventory balance per item/warehouse.

    This is a denormalized table for fast balance lookups.
    Updated by InventoryTransaction inserts via service layer.

    Quantities:
    - on_hand: Total physical quantity in warehouse
    - allocated: Quantity reserved for pending sales orders
    - on_order: Quantity expected from pending purchase orders
    - available: on_hand - allocated (computed property)
    """
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.CASCADE,
        related_name='inventory_balances',
        help_text="Item"
    )
    warehouse = models.ForeignKey(
        'new_warehousing.Warehouse',
        on_delete=models.CASCADE,
        related_name='inventory_balances',
        help_text="Warehouse"
    )
    on_hand = models.IntegerField(
        default=0,
        help_text="Total physical quantity in warehouse (base units)"
    )
    allocated = models.IntegerField(
        default=0,
        help_text="Quantity reserved for pending orders (base units)"
    )
    on_order = models.IntegerField(
        default=0,
        help_text="Quantity expected from pending POs (base units)"
    )
    last_updated = models.DateTimeField(
        auto_now=True,
        help_text="Last time balance was updated"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Inventory Balance"
        verbose_name_plural = "Inventory Balances"
        unique_together = [('tenant', 'item', 'warehouse')]
        indexes = [
            models.Index(fields=['tenant', 'item', 'warehouse']),
            models.Index(fields=['tenant', 'warehouse']),
        ]

    def __str__(self):
        return f"{self.item.sku} @ {self.warehouse.code}: {self.on_hand} on hand"

    @property
    def available(self):
        """Quantity available for new orders."""
        return self.on_hand - self.allocated

    @property
    def projected(self):
        """Projected quantity including incoming orders."""
        return self.on_hand + self.on_order - self.allocated

    def clean(self):
        """Validate balance values."""
        super().clean()
        if self.allocated > self.on_hand:
            raise ValidationError({
                'allocated': "Allocated cannot exceed on hand."
            })
        if self.on_hand < 0:
            raise ValidationError({
                'on_hand': "On hand cannot be negative."
            })


class InventoryTransaction(TenantMixin):
    """
    Audit trail for all inventory movements.

    Every change to inventory creates a transaction record.
    InventoryBalance is updated based on these transactions.

    Transaction Types:
    - RECEIPT: Goods received (increases on_hand)
    - ISSUE: Goods shipped/consumed (decreases on_hand, allocated)
    - ALLOCATE: Reserved for order (increases allocated)
    - DEALLOCATE: Reservation cancelled (decreases allocated)
    - ADJUST: Manual adjustment (can be +/-)
    - TRANSFER: Movement between warehouses
    """
    TRANSACTION_TYPES = [
        ('RECEIPT', 'Receipt'),
        ('ISSUE', 'Issue'),
        ('ALLOCATE', 'Allocate'),
        ('DEALLOCATE', 'Deallocate'),
        ('ADJUST', 'Adjust'),
        ('TRANSFER_OUT', 'Transfer Out'),
        ('TRANSFER_IN', 'Transfer In'),
    ]

    transaction_type = models.CharField(
        max_length=20,
        choices=TRANSACTION_TYPES,
        help_text="Type of inventory movement"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='inventory_transactions',
        help_text="Item affected"
    )
    warehouse = models.ForeignKey(
        'new_warehousing.Warehouse',
        on_delete=models.PROTECT,
        related_name='inventory_transactions',
        help_text="Warehouse affected"
    )
    lot = models.ForeignKey(
        InventoryLot,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='transactions',
        help_text="Lot affected (if applicable)"
    )
    pallet = models.ForeignKey(
        InventoryPallet,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='transactions',
        help_text="Pallet affected (if applicable)"
    )
    quantity = models.IntegerField(
        help_text="Quantity changed (positive=increase, negative=decrease)"
    )
    transaction_date = models.DateTimeField(
        auto_now_add=True,
        help_text="When transaction occurred"
    )
    reference_type = models.CharField(
        max_length=50,
        blank=True,
        help_text="Type of reference document (PO, SO, ADJ)"
    )
    reference_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="ID of reference document"
    )
    reference_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Human-readable reference (e.g., 'PO-000123')"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='inventory_transactions',
        help_text="User who performed transaction"
    )
    notes = models.TextField(
        blank=True,
        help_text="Transaction notes"
    )

    # Snapshot of balance after this transaction
    balance_on_hand = models.IntegerField(
        null=True,
        blank=True,
        help_text="Balance on_hand after this transaction"
    )
    balance_allocated = models.IntegerField(
        null=True,
        blank=True,
        help_text="Balance allocated after this transaction"
    )

    class Meta:
        verbose_name = "Inventory Transaction"
        verbose_name_plural = "Inventory Transactions"
        ordering = ['-transaction_date']
        indexes = [
            models.Index(fields=['tenant', 'item', 'warehouse', 'transaction_date']),
            models.Index(fields=['tenant', 'transaction_date']),
            models.Index(fields=['reference_type', 'reference_id']),
        ]

    def __str__(self):
        sign = '+' if self.quantity > 0 else ''
        return f"{self.transaction_type}: {self.item.sku} {sign}{self.quantity}"


# ─── FIFO Inventory Costing Layer ─────────────────────────────────────────────

class InventoryLayer(TenantMixin, TimestampMixin):
    """
    FIFO cost layer for inventory valuation.

    Each layer represents a batch of inventory acquired at a specific cost.
    When stock is consumed (shipped/sold), the oldest layers are depleted
    first (First-In, First-Out).

    Separate from InventoryLot (physical tracking). Layers track the
    *financial* value of inventory for GL reporting and COGS calculation.

    Example:
        Layer 1: 100 units @ $5.00 (Jan 1) — 60 remaining
        Layer 2: 200 units @ $5.50 (Jan 5) — 200 remaining
        Ship 80 units → consume 60 from Layer 1 ($300) + 20 from Layer 2 ($110) = $410 COGS
    """
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='cost_layers',
        help_text="Item this layer belongs to"
    )
    warehouse = models.ForeignKey(
        'new_warehousing.Warehouse',
        on_delete=models.PROTECT,
        related_name='cost_layers',
        help_text="Warehouse where this layer is held"
    )
    quantity_original = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Original quantity received in this layer"
    )
    quantity_remaining = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Quantity still available in this layer"
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Cost per unit at time of receipt"
    )
    date_received = models.DateTimeField(
        help_text="When this layer was created (used for FIFO ordering)"
    )

    # Source document (VendorBill, InventoryAdjustment, etc.)
    source_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Type of source document"
    )
    source_id = models.PositiveIntegerField(null=True, blank=True)
    source_document = GenericForeignKey('source_type', 'source_id')

    # Link back to physical lot (optional)
    lot = models.ForeignKey(
        InventoryLot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cost_layers',
        help_text="Physical lot this layer corresponds to"
    )

    class Meta:
        verbose_name = "Inventory Layer"
        verbose_name_plural = "Inventory Layers"
        ordering = ['date_received']
        indexes = [
            models.Index(
                fields=['tenant', 'item', 'warehouse', 'date_received'],
                name='inv_layer_fifo_idx',
            ),
            models.Index(
                fields=['tenant', 'item', 'quantity_remaining'],
                name='inv_layer_remaining_idx',
            ),
            models.Index(fields=['source_type', 'source_id']),
        ]

    def __str__(self):
        return (
            f"Layer: {self.item.sku} {self.quantity_remaining}/{self.quantity_original} "
            f"@ ${self.unit_cost} ({self.date_received.date()})"
        )

    @property
    def total_value(self):
        """Current value of remaining inventory in this layer."""
        return self.quantity_remaining * self.unit_cost

    @property
    def original_value(self):
        """Original value when layer was created."""
        return self.quantity_original * self.unit_cost

    @property
    def is_depleted(self):
        """True if no inventory remains in this layer."""
        return self.quantity_remaining <= 0


# ─── Item Receipts (Goods Receipt Notes) ──────────────────────────────────────
#
# An ItemReceipt is the standing document recording a physical receipt of
# goods from a vendor — independent of, but optionally linked to, a Purchase
# Order. Receipt → Inventory lots (qty + cost) and Receipt → Bill (GR/IR
# clearing) are both downstream, but the receipt itself is the immutable
# record of what arrived.
#
# Accounting:
#   Receipt post  → Dr Inventory, Cr GR/IR (Received-Not-Billed accrual)
#   Bill   post   → Dr GR/IR,    Cr A/P
#
# A single PO can generate multiple partial Receipts. A single Receipt can be
# rolled into one Bill, or its lines can be split across multiple Bills.


class ItemReceipt(TenantMixin, TimestampMixin):
    """
    Header for a physical receipt of goods.

    Records who received what, when, and against which PO (if any). Posting
    the receipt creates inventory lots and a GR/IR accrual journal entry.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('partially_billed', 'Partially Billed'),
        ('billed', 'Billed'),
        ('void', 'Void'),
    ]

    receipt_number = models.CharField(
        max_length=50,
        help_text="Receipt number (unique per tenant). Generated via TenantSequence.",
    )
    vendor = models.ForeignKey(
        'parties.Vendor',
        on_delete=models.PROTECT,
        related_name='item_receipts',
        help_text="Vendor who supplied the goods",
    )
    purchase_order = models.ForeignKey(
        'orders.PurchaseOrder',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='item_receipts',
        help_text="Originating PO (optional — direct receipts without a PO are allowed)",
    )
    warehouse = models.ForeignKey(
        'new_warehousing.Warehouse',
        on_delete=models.PROTECT,
        related_name='item_receipts',
        help_text="Warehouse that received the goods",
    )
    received_date = models.DateField(
        default=timezone.now,
        help_text="Date goods were physically received",
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='received_item_receipts',
        help_text="User who recorded the receipt",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
    )
    journal_entry = models.ForeignKey(
        'accounting.JournalEntry',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='item_receipts',
        help_text="GR/IR accrual JE created when receipt is posted",
    )
    notes = models.TextField(blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "Item Receipt"
        verbose_name_plural = "Item Receipts"
        unique_together = [('tenant', 'receipt_number')]
        ordering = ['-received_date', '-id']
        indexes = [
            models.Index(fields=['tenant', 'receipt_number']),
            models.Index(fields=['tenant', 'vendor', 'received_date']),
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'purchase_order']),
        ]

    def __str__(self):
        return f"Receipt {self.receipt_number}"

    @property
    def subtotal(self):
        """Sum of line amounts."""
        return sum((ln.amount for ln in self.lines.all()), start=0) or 0

    @property
    def num_lines(self):
        return self.lines.count()

    @property
    def all_lines_billed(self):
        """True if every line is fully billed (quantity_billed >= quantity)."""
        return all(
            (ln.quantity_billed or 0) >= ln.quantity
            for ln in self.lines.all()
        )

    @property
    def any_line_billed(self):
        return any((ln.quantity_billed or 0) > 0 for ln in self.lines.all())

    def recompute_billing_status(self):
        """Update status based on aggregate billed quantity on lines."""
        if self.status in ('draft', 'void'):
            return
        if self.all_lines_billed:
            self.status = 'billed'
        elif self.any_line_billed:
            self.status = 'partially_billed'
        else:
            self.status = 'posted'


class ItemReceiptLine(TenantMixin, TimestampMixin):
    """
    A single line of received goods on an ItemReceipt.

    Each line is independently billable. `quantity_billed` tracks how much
    of this receipt line has already been rolled into a VendorBillLine, so
    we can prevent double-billing without locking the entire receipt.
    """
    receipt = models.ForeignKey(
        ItemReceipt,
        on_delete=models.CASCADE,
        related_name='lines',
    )
    line_number = models.PositiveIntegerField(
        help_text="Line sequence (10, 20, 30...)",
    )
    purchase_order_line = models.ForeignKey(
        'orders.PurchaseOrderLine',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='receipt_lines',
        help_text="Source PO line (null for direct receipts not against a PO)",
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='receipt_lines',
    )
    quantity = models.PositiveIntegerField(
        help_text="Quantity received (base units)",
    )
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Cost per unit at time of receipt",
    )
    quantity_billed = models.PositiveIntegerField(
        default=0,
        help_text="Quantity already rolled into vendor bills",
    )
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = "Item Receipt Line"
        verbose_name_plural = "Item Receipt Lines"
        ordering = ['receipt', 'line_number']
        unique_together = [('receipt', 'line_number')]
        indexes = [
            models.Index(fields=['tenant', 'receipt']),
            models.Index(fields=['tenant', 'purchase_order_line']),
        ]

    def __str__(self):
        return f"{self.receipt.receipt_number} L{self.line_number}: {self.item.sku} × {self.quantity}"

    @property
    def amount(self):
        return self.quantity * self.unit_cost

    @property
    def quantity_remaining_to_bill(self):
        return max(self.quantity - (self.quantity_billed or 0), 0)


# ──────────────────────────────────────────────────────────────────────────────
# Pick Ticket → Partial Invoice (AR mirror of ItemReceipt → VendorBill)
# ──────────────────────────────────────────────────────────────────────────────
#
# A PickTicket is a fulfillment document recording what was physically picked
# for a customer (optionally against a SalesOrder). Picks do NO GL or inventory
# posting — they are billing-source documents only. A pick's lines can be rolled
# into one or more partial Invoices, with per-line quantity tracking that
# prevents double-invoicing.


class PickTicket(TenantMixin, TimestampMixin):
    """
    Header for a customer fulfillment pick.

    Records who picked what, when, and against which SalesOrder (if any).
    Picks feed partial Invoices via InvoicingService.create_invoice_from_picks.
    Unlike receipts, picks post no inventory/GL — they are fulfillment +
    billing-source documents.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('partially_invoiced', 'Partially Invoiced'),
        ('invoiced', 'Invoiced'),
        ('void', 'Void'),
    ]

    pick_number = models.CharField(
        max_length=50,
        help_text="Pick ticket number (unique per tenant). Generated via TenantSequence.",
    )
    sales_order = models.ForeignKey(
        'orders.SalesOrder',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='pick_tickets',
        help_text="Originating SO (optional — direct picks without an SO are allowed)",
    )
    customer = models.ForeignKey(
        'parties.Customer',
        on_delete=models.PROTECT,
        related_name='pick_tickets',
        help_text="Customer the goods are picked for",
    )
    warehouse = models.ForeignKey(
        'new_warehousing.Warehouse',
        on_delete=models.PROTECT,
        related_name='pick_tickets',
        help_text="Warehouse the goods were picked from",
    )
    picked_date = models.DateField(
        default=timezone.now,
        help_text="Date goods were physically picked",
    )
    picked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='picked_pick_tickets',
        help_text="User who recorded the pick",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
    )
    notes = models.TextField(blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "Pick Ticket"
        verbose_name_plural = "Pick Tickets"
        unique_together = [('tenant', 'pick_number')]
        ordering = ['-picked_date', '-id']
        indexes = [
            models.Index(fields=['tenant', 'pick_number']),
            models.Index(fields=['tenant', 'customer', 'picked_date']),
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'sales_order']),
        ]

    def __str__(self):
        return f"Pick {self.pick_number}"

    @property
    def subtotal(self):
        """Sum of line amounts."""
        return sum((ln.amount for ln in self.lines.all()), start=0) or 0

    @property
    def num_lines(self):
        return self.lines.count()

    @property
    def all_lines_invoiced(self):
        """True if every line is fully invoiced (quantity_invoiced >= quantity)."""
        return all(
            (ln.quantity_invoiced or 0) >= ln.quantity
            for ln in self.lines.all()
        )

    @property
    def any_line_invoiced(self):
        return any((ln.quantity_invoiced or 0) > 0 for ln in self.lines.all())

    def recompute_invoicing_status(self):
        """Update status based on aggregate invoiced quantity on lines."""
        if self.status in ('draft', 'void'):
            return
        if self.all_lines_invoiced:
            self.status = 'invoiced'
        elif self.any_line_invoiced:
            self.status = 'partially_invoiced'
        else:
            self.status = 'posted'


class PickTicketLine(TenantMixin, TimestampMixin):
    """
    A single line of picked goods on a PickTicket.

    Each line is independently invoiceable. `quantity_invoiced` tracks how much
    of this pick line has already been rolled into an InvoiceLine, so we can
    prevent double-invoicing without locking the entire pick.
    """
    pick_ticket = models.ForeignKey(
        PickTicket,
        on_delete=models.CASCADE,
        related_name='lines',
    )
    line_number = models.PositiveIntegerField(
        help_text="Line sequence (10, 20, 30...)",
    )
    sales_order_line = models.ForeignKey(
        'orders.SalesOrderLine',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pick_lines',
        help_text="Source SO line (null for direct picks not against an SO)",
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='pick_lines',
    )
    quantity = models.PositiveIntegerField(
        help_text="Quantity picked (base units)",
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        help_text="Price per unit (for subtotal display; sourced from SO line or item)",
    )
    quantity_invoiced = models.PositiveIntegerField(
        default=0,
        help_text="Quantity already rolled into invoices",
    )
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = "Pick Ticket Line"
        verbose_name_plural = "Pick Ticket Lines"
        ordering = ['pick_ticket', 'line_number']
        unique_together = [('pick_ticket', 'line_number')]
        indexes = [
            models.Index(fields=['tenant', 'pick_ticket']),
            models.Index(fields=['tenant', 'sales_order_line']),
        ]

    def __str__(self):
        return f"{self.pick_ticket.pick_number} L{self.line_number}: {self.item.sku} × {self.quantity}"

    @property
    def amount(self):
        return self.quantity * self.unit_price

    @property
    def quantity_remaining_to_invoice(self):
        return max(self.quantity - (self.quantity_invoiced or 0), 0)
