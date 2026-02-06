# apps/inventory/services.py
"""
Inventory service for managing stock movements.

InventoryService handles:
- Receiving inventory (creating lots, pallets, transactions)
- Allocating inventory for orders
- Issuing inventory (shipments)
- Adjustments and transfers
- Balance recalculation

All operations are atomic and create audit trail transactions.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.models import ContentType
import uuid

from .models import InventoryLot, InventoryPallet, InventoryBalance, InventoryTransaction, InventoryLayer
from apps.accounting.models import AccountingSettings, JournalEntry, JournalEntryLine


class InventoryService:
    """
    Service for managing inventory operations.

    All operations create InventoryTransaction records for audit trail
    and update InventoryBalance for fast lookups.

    Usage:
        service = InventoryService(tenant, user)

        # Receive inventory
        lot, pallets = service.receive_inventory(
            item=item,
            warehouse=warehouse,
            quantity=1000,
            unit_cost=Decimal('5.00'),
            vendor=vendor,
            purchase_order=po,
            pallet_quantities=[250, 250, 250, 250],  # Optional breakdown
        )

        # Allocate for order
        service.allocate_inventory(item, warehouse, quantity=100, sales_order=so)

        # Issue (ship)
        service.issue_inventory(item, warehouse, quantity=100, sales_order=so)
    """

    def __init__(self, tenant, user=None):
        """
        Initialize inventory service.

        Args:
            tenant: Tenant instance to scope operations
            user: User performing operations (for audit trail)
        """
        self.tenant = tenant
        self.user = user

    # ===== RECEIVING =====

    def receive_inventory(
        self,
        item,
        warehouse,
        quantity,
        unit_cost,
        vendor=None,
        purchase_order=None,
        lot_number=None,
        pallet_quantities=None,
        received_date=None,
        notes='',
    ):
        """
        Receive inventory into a warehouse.

        Creates a lot with one or more pallets, updates balance,
        and creates RECEIPT transaction.

        Args:
            item: Item instance
            warehouse: Warehouse instance
            quantity: Total quantity in base units
            unit_cost: Cost per base unit
            vendor: Optional Vendor instance
            purchase_order: Optional PurchaseOrder instance
            lot_number: Optional lot number (auto-generated if not provided)
            pallet_quantities: Optional list of quantities per pallet
                               If not provided, creates single pallet
            received_date: Optional date (defaults to today)
            notes: Optional notes

        Returns:
            tuple: (InventoryLot, list of InventoryPallet)
        """
        if received_date is None:
            received_date = timezone.now().date()

        if lot_number is None:
            lot_number = self._generate_lot_number()

        if pallet_quantities is None:
            pallet_quantities = [quantity]
        elif sum(pallet_quantities) != quantity:
            raise ValidationError(
                f"Pallet quantities ({sum(pallet_quantities)}) must equal total ({quantity})"
            )

        with transaction.atomic():
            # Create lot
            lot = InventoryLot.objects.create(
                tenant=self.tenant,
                item=item,
                warehouse=warehouse,
                vendor=vendor,
                purchase_order=purchase_order,
                lot_number=lot_number,
                received_date=received_date,
                unit_cost=unit_cost,
                total_quantity=quantity,
                notes=notes,
            )

            # Create pallets
            pallets = []
            for i, pallet_qty in enumerate(pallet_quantities, start=1):
                pallet = InventoryPallet.objects.create(
                    tenant=self.tenant,
                    lot=lot,
                    pallet_number=i,
                    license_plate=f"LP-{uuid.uuid4().hex[:12].upper()}",
                    quantity_received=pallet_qty,
                    quantity_on_hand=pallet_qty,
                    status='AVAILABLE',
                )
                pallets.append(pallet)

            # Update balance
            balance = self._get_or_create_balance(item, warehouse)
            balance.on_hand += quantity
            balance.save()

            # Create transaction
            self._create_transaction(
                transaction_type='RECEIPT',
                item=item,
                warehouse=warehouse,
                lot=lot,
                quantity=quantity,
                reference_type='PO' if purchase_order else 'RECEIPT',
                reference_id=purchase_order.pk if purchase_order else None,
                reference_number=purchase_order.po_number if purchase_order else lot_number,
                notes=f"Received {quantity} units",
                balance=balance,
            )

            return lot, pallets

    def receive_stock(
        self,
        item,
        warehouse,
        quantity,
        unit_cost,
        source_document=None,
        credit_account=None,
        vendor=None,
        purchase_order=None,
        lot_number=None,
        pallet_quantities=None,
        received_date=None,
        notes='',
    ):
        """
        Receive stock with full financial tracking (FIFO layer + GL entry).

        Combines physical receiving (lot/pallets/balance) with:
        1. FIFO cost layer creation
        2. GL journal entry (DEBIT Inventory Asset, CREDIT source account)

        Args:
            item: Item instance
            warehouse: Warehouse instance
            quantity: Quantity in base units
            unit_cost: Cost per unit (Decimal)
            source_document: Source doc (VendorBill, adjustment, etc.)
            credit_account: Account to credit (A/P clearing, adjustment expense, etc.)
                           Falls back to tenant default_ap_account
            vendor: Optional Vendor
            purchase_order: Optional PurchaseOrder
            lot_number: Optional (auto-generated)
            pallet_quantities: Optional list per pallet
            received_date: Optional (defaults to now)
            notes: Optional

        Returns:
            tuple: (InventoryLot, list[InventoryPallet], InventoryLayer)
        """
        if received_date is None:
            received_date = timezone.now().date()

        acct_settings = AccountingSettings.get_for_tenant(self.tenant)

        # Resolve inventory asset account
        asset_account = (
            item.asset_account
            or acct_settings.default_inventory_account
        )
        if not asset_account:
            raise ValidationError(
                f"No inventory asset account for Item '{item.name}' (SKU: {item.sku}). "
                "Set it on the item or in Accounting Settings."
            )

        # Resolve credit account (what we're crediting — usually A/P or adjustment)
        if not credit_account:
            credit_account = acct_settings.default_ap_account
        if not credit_account:
            raise ValidationError(
                "No credit account specified and no default A/P configured in Accounting Settings."
            )

        total_cost = Decimal(str(quantity)) * unit_cost

        with transaction.atomic():
            # 1. Physical receiving (existing logic)
            lot, pallets = self.receive_inventory(
                item=item,
                warehouse=warehouse,
                quantity=quantity,
                unit_cost=unit_cost,
                vendor=vendor,
                purchase_order=purchase_order,
                lot_number=lot_number,
                pallet_quantities=pallet_quantities,
                received_date=received_date,
                notes=notes,
            )

            # 2. Create FIFO cost layer
            layer = InventoryLayer.objects.create(
                tenant=self.tenant,
                item=item,
                warehouse=warehouse,
                quantity_original=Decimal(str(quantity)),
                quantity_remaining=Decimal(str(quantity)),
                unit_cost=unit_cost,
                date_received=timezone.now(),
                source_type=ContentType.objects.get_for_model(source_document) if source_document else None,
                source_id=source_document.pk if source_document else None,
                lot=lot,
            )

            # 3. GL Journal Entry: DEBIT Inventory Asset, CREDIT source
            je_number = self._generate_inv_je_number()
            je = JournalEntry.objects.create(
                tenant=self.tenant,
                entry_number=je_number,
                date=received_date,
                memo=f"Inventory receipt: {item.sku} x{quantity} @ ${unit_cost}",
                reference_number=lot.lot_number,
                entry_type='standard',
                status='posted',
                source_type=ContentType.objects.get_for_model(InventoryLayer),
                source_id=layer.pk,
                posted_at=timezone.now(),
                posted_by=self.user,
                created_by=self.user,
            )

            # DEBIT: Inventory Asset (asset increases)
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=10,
                account=asset_account,
                description=f"Inventory receipt - {item.sku} x{quantity}",
                debit=total_cost,
                credit=Decimal('0.00'),
            )

            # CREDIT: Source account (A/P or adjustment)
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=20,
                account=credit_account,
                description=f"Inventory receipt - {item.sku} x{quantity}",
                debit=Decimal('0.00'),
                credit=total_cost,
            )

            return lot, pallets, layer

    # ===== ALLOCATION =====

    def allocate_inventory(
        self,
        item,
        warehouse,
        quantity,
        sales_order=None,
        reference='',
    ):
        """
        Allocate inventory for a pending order.

        Increases allocated quantity without changing on_hand.

        Args:
            item: Item instance
            warehouse: Warehouse instance
            quantity: Quantity to allocate
            sales_order: Optional SalesOrder instance
            reference: Optional reference string

        Returns:
            InventoryBalance: Updated balance

        Raises:
            ValidationError: If insufficient available inventory
        """
        with transaction.atomic():
            balance = self._get_or_create_balance(item, warehouse)

            if balance.available < quantity:
                raise ValidationError(
                    f"Insufficient available inventory. "
                    f"Available: {balance.available}, Requested: {quantity}"
                )

            balance.allocated += quantity
            balance.save()

            self._create_transaction(
                transaction_type='ALLOCATE',
                item=item,
                warehouse=warehouse,
                quantity=quantity,
                reference_type='SO' if sales_order else 'ALLOC',
                reference_id=sales_order.pk if sales_order else None,
                reference_number=sales_order.order_number if sales_order else reference,
                notes=f"Allocated {quantity} units",
                balance=balance,
            )

            return balance

    def deallocate_inventory(
        self,
        item,
        warehouse,
        quantity,
        sales_order=None,
        reference='',
    ):
        """
        Remove allocation (e.g., order cancelled).

        Decreases allocated quantity without changing on_hand.

        Args:
            item: Item instance
            warehouse: Warehouse instance
            quantity: Quantity to deallocate
            sales_order: Optional SalesOrder instance
            reference: Optional reference string

        Returns:
            InventoryBalance: Updated balance
        """
        with transaction.atomic():
            balance = self._get_or_create_balance(item, warehouse)

            # Allow deallocating even if it goes below zero (correction)
            balance.allocated = max(0, balance.allocated - quantity)
            balance.save()

            self._create_transaction(
                transaction_type='DEALLOCATE',
                item=item,
                warehouse=warehouse,
                quantity=-quantity,
                reference_type='SO' if sales_order else 'DEALLOC',
                reference_id=sales_order.pk if sales_order else None,
                reference_number=sales_order.order_number if sales_order else reference,
                notes=f"Deallocated {quantity} units",
                balance=balance,
            )

            return balance

    # ===== ISSUE =====

    def issue_inventory(
        self,
        item,
        warehouse,
        quantity,
        sales_order=None,
        reference='',
        reduce_allocation=True,
    ):
        """
        Issue inventory (shipment or consumption).

        Decreases on_hand and optionally allocated.

        Args:
            item: Item instance
            warehouse: Warehouse instance
            quantity: Quantity to issue
            sales_order: Optional SalesOrder instance
            reference: Optional reference string
            reduce_allocation: Whether to also reduce allocated (default True)

        Returns:
            InventoryBalance: Updated balance

        Raises:
            ValidationError: If insufficient on_hand inventory
        """
        with transaction.atomic():
            balance = self._get_or_create_balance(item, warehouse)

            if balance.on_hand < quantity:
                raise ValidationError(
                    f"Insufficient on-hand inventory. "
                    f"On hand: {balance.on_hand}, Requested: {quantity}"
                )

            balance.on_hand -= quantity
            if reduce_allocation:
                balance.allocated = max(0, balance.allocated - quantity)
            balance.save()

            self._create_transaction(
                transaction_type='ISSUE',
                item=item,
                warehouse=warehouse,
                quantity=-quantity,
                reference_type='SO' if sales_order else 'ISSUE',
                reference_id=sales_order.pk if sales_order else None,
                reference_number=sales_order.order_number if sales_order else reference,
                notes=f"Issued {quantity} units",
                balance=balance,
            )

            return balance

    # ===== ADJUSTMENTS =====

    def adjust_inventory(
        self,
        item,
        warehouse,
        quantity_change,
        reason='',
        reference='',
    ):
        """
        Manual inventory adjustment.

        Can be positive (found inventory) or negative (shrinkage/damage).

        Args:
            item: Item instance
            warehouse: Warehouse instance
            quantity_change: Positive or negative quantity change
            reason: Reason for adjustment
            reference: Optional reference string

        Returns:
            InventoryBalance: Updated balance
        """
        with transaction.atomic():
            balance = self._get_or_create_balance(item, warehouse)

            new_on_hand = balance.on_hand + quantity_change
            if new_on_hand < 0:
                raise ValidationError(
                    f"Adjustment would result in negative inventory. "
                    f"Current: {balance.on_hand}, Change: {quantity_change}"
                )

            balance.on_hand = new_on_hand
            balance.save()

            self._create_transaction(
                transaction_type='ADJUST',
                item=item,
                warehouse=warehouse,
                quantity=quantity_change,
                reference_type='ADJ',
                reference_number=reference or f"ADJ-{timezone.now().strftime('%Y%m%d%H%M%S')}",
                notes=reason or f"Manual adjustment: {quantity_change:+d}",
                balance=balance,
            )

            return balance

    # ===== ON ORDER =====

    def add_on_order(self, item, warehouse, quantity, purchase_order=None):
        """
        Increase on_order quantity when PO is placed.

        Args:
            item: Item instance
            warehouse: Warehouse instance
            quantity: Quantity ordered
            purchase_order: Optional PurchaseOrder instance

        Returns:
            InventoryBalance: Updated balance
        """
        with transaction.atomic():
            balance = self._get_or_create_balance(item, warehouse)
            balance.on_order += quantity
            balance.save()
            return balance

    def remove_on_order(self, item, warehouse, quantity, purchase_order=None):
        """
        Decrease on_order quantity when PO is received or cancelled.

        Args:
            item: Item instance
            warehouse: Warehouse instance
            quantity: Quantity to remove from on_order
            purchase_order: Optional PurchaseOrder instance

        Returns:
            InventoryBalance: Updated balance
        """
        with transaction.atomic():
            balance = self._get_or_create_balance(item, warehouse)
            balance.on_order = max(0, balance.on_order - quantity)
            balance.save()
            return balance

    # ===== FIFO SHIPMENT (FINANCIAL) =====

    def ship_stock(
        self,
        item,
        warehouse,
        quantity,
        sales_order=None,
        reference='',
    ):
        """
        Ship stock using FIFO costing and create COGS journal entry.

        Consumes inventory from the oldest cost layers first.
        Creates a GL entry: DEBIT COGS, CREDIT Inventory Asset.

        Args:
            item: Item instance
            warehouse: Warehouse instance
            quantity: Quantity to ship (integer, base units)
            sales_order: Optional SalesOrder for reference
            reference: Optional reference string

        Returns:
            dict: {
                'layers_consumed': [(layer, qty_taken, cost)],
                'total_cogs': Decimal,
                'journal_entry': JournalEntry,
            }

        Raises:
            ValidationError: If insufficient FIFO layers or missing GL accounts
        """
        acct_settings = AccountingSettings.get_for_tenant(self.tenant)

        # Resolve accounts
        asset_account = (
            item.asset_account
            or acct_settings.default_inventory_account
        )
        if not asset_account:
            raise ValidationError(
                f"No inventory asset account for Item '{item.name}' (SKU: {item.sku}). "
                "Set it on the item or in Accounting Settings."
            )

        cogs_account = (
            item.expense_account
            or acct_settings.default_cogs_account
        )
        if not cogs_account:
            raise ValidationError(
                f"No COGS account for Item '{item.name}' (SKU: {item.sku}). "
                "Set it on the item or in Accounting Settings."
            )

        quantity_remaining = Decimal(str(quantity))
        layers_consumed = []
        total_cogs = Decimal('0.00')

        with transaction.atomic():
            # Find oldest layers with remaining stock (FIFO order)
            available_layers = InventoryLayer.objects.filter(
                tenant=self.tenant,
                item=item,
                warehouse=warehouse,
                quantity_remaining__gt=0,
            ).order_by('date_received').select_for_update()

            for layer in available_layers:
                if quantity_remaining <= 0:
                    break

                # Take what we need or what's available
                qty_to_take = min(quantity_remaining, layer.quantity_remaining)
                layer_cost = qty_to_take * layer.unit_cost

                # Deplete the layer
                layer.quantity_remaining -= qty_to_take
                layer.save(update_fields=['quantity_remaining'])

                layers_consumed.append((layer, qty_to_take, layer_cost))
                total_cogs += layer_cost
                quantity_remaining -= qty_to_take

            # Check if we satisfied the full quantity
            if quantity_remaining > 0:
                raise ValidationError(
                    f"Insufficient FIFO layers for {item.sku}. "
                    f"Requested: {quantity}, Short: {quantity_remaining}. "
                    "Receive stock before shipping."
                )

            # Physical issue (existing logic)
            self.issue_inventory(
                item=item,
                warehouse=warehouse,
                quantity=quantity,
                sales_order=sales_order,
                reference=reference,
            )

            # GL Journal Entry: DEBIT COGS, CREDIT Inventory Asset
            je_number = self._generate_cogs_je_number()
            je = JournalEntry.objects.create(
                tenant=self.tenant,
                entry_number=je_number,
                date=timezone.now().date(),
                memo=f"COGS: {item.sku} x{quantity} shipped",
                reference_number=sales_order.order_number if sales_order else reference,
                entry_type='standard',
                status='posted',
                posted_at=timezone.now(),
                posted_by=self.user,
                created_by=self.user,
            )

            # DEBIT: COGS (expense increases)
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=10,
                account=cogs_account,
                description=f"COGS - {item.sku} x{quantity} (FIFO)",
                debit=total_cogs,
                credit=Decimal('0.00'),
            )

            # CREDIT: Inventory Asset (asset decreases)
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=20,
                account=asset_account,
                description=f"Inventory issued - {item.sku} x{quantity}",
                debit=Decimal('0.00'),
                credit=total_cogs,
            )

            return {
                'layers_consumed': layers_consumed,
                'total_cogs': total_cogs,
                'journal_entry': je,
            }

    # ===== QUERIES =====

    def get_balance(self, item, warehouse):
        """Get inventory balance for item/warehouse."""
        return InventoryBalance.objects.filter(
            tenant=self.tenant,
            item=item,
            warehouse=warehouse,
        ).first()

    def get_available(self, item, warehouse):
        """Get available quantity (on_hand - allocated)."""
        balance = self.get_balance(item, warehouse)
        return balance.available if balance else 0

    def get_all_balances(self, item):
        """Get balances for an item across all warehouses."""
        return InventoryBalance.objects.filter(
            tenant=self.tenant,
            item=item,
        ).select_related('warehouse')

    def get_lots_for_item(self, item, warehouse=None, available_only=True):
        """
        Get lots for an item, optionally filtered by warehouse.

        Args:
            item: Item instance
            warehouse: Optional Warehouse instance
            available_only: Only return lots with quantity on hand

        Returns:
            QuerySet of InventoryLot
        """
        lots = InventoryLot.objects.filter(
            tenant=self.tenant,
            item=item,
        ).select_related('warehouse', 'vendor')

        if warehouse:
            lots = lots.filter(warehouse=warehouse)

        if available_only:
            lots = lots.filter(pallets__quantity_on_hand__gt=0).distinct()

        return lots.order_by('received_date')

    def recalculate_balance(self, item, warehouse):
        """
        Recalculate balance from transactions (reconciliation).

        Use when balance may be out of sync with transactions.

        Returns:
            InventoryBalance: Recalculated balance
        """
        with transaction.atomic():
            balance = self._get_or_create_balance(item, warehouse)

            # Sum all transactions
            transactions = InventoryTransaction.objects.filter(
                tenant=self.tenant,
                item=item,
                warehouse=warehouse,
            )

            # Calculate on_hand from RECEIPT, ISSUE, ADJUST
            on_hand = 0
            allocated = 0

            for txn in transactions:
                if txn.transaction_type in ('RECEIPT', 'ADJUST', 'TRANSFER_IN'):
                    on_hand += txn.quantity
                elif txn.transaction_type in ('ISSUE', 'TRANSFER_OUT'):
                    on_hand += txn.quantity  # quantity is negative
                elif txn.transaction_type == 'ALLOCATE':
                    allocated += txn.quantity
                elif txn.transaction_type == 'DEALLOCATE':
                    allocated += txn.quantity  # quantity is negative

            balance.on_hand = max(0, on_hand)
            balance.allocated = max(0, allocated)
            balance.save()

            return balance

    # ===== HELPERS =====

    def _get_or_create_balance(self, item, warehouse):
        """Get or create inventory balance record."""
        balance, _ = InventoryBalance.objects.get_or_create(
            tenant=self.tenant,
            item=item,
            warehouse=warehouse,
            defaults={'on_hand': 0, 'allocated': 0, 'on_order': 0},
        )
        return balance

    def _create_transaction(
        self,
        transaction_type,
        item,
        warehouse,
        quantity,
        lot=None,
        pallet=None,
        reference_type='',
        reference_id=None,
        reference_number='',
        notes='',
        balance=None,
    ):
        """Create inventory transaction record."""
        return InventoryTransaction.objects.create(
            tenant=self.tenant,
            transaction_type=transaction_type,
            item=item,
            warehouse=warehouse,
            lot=lot,
            pallet=pallet,
            quantity=quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            reference_number=reference_number,
            user=self.user,
            notes=notes,
            balance_on_hand=balance.on_hand if balance else None,
            balance_allocated=balance.allocated if balance else None,
        )

    def _generate_lot_number(self):
        """Generate unique lot number."""
        date_part = timezone.now().strftime('%Y%m%d')
        seq = InventoryLot.objects.filter(
            tenant=self.tenant,
            lot_number__startswith=f"LOT-{date_part}",
        ).count() + 1
        return f"LOT-{date_part}-{seq:04d}"

    def _generate_inv_je_number(self):
        """Generate unique journal entry number for inventory receipts."""
        date_part = timezone.now().strftime('%Y%m')
        count = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith=f"INV-RCV-{date_part}",
        ).count() + 1
        return f"INV-RCV-{date_part}-{count:05d}"

    def _generate_cogs_je_number(self):
        """Generate unique journal entry number for COGS entries."""
        date_part = timezone.now().strftime('%Y%m')
        count = JournalEntry.objects.filter(
            tenant=self.tenant,
            entry_number__startswith=f"COGS-{date_part}",
        ).count() + 1
        return f"COGS-{date_part}-{count:05d}"
