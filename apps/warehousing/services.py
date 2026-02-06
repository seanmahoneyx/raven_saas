# apps/warehousing/services.py
"""
Service layer for warehouse stock movements.

Provides transactional stock movement operations with full audit trail
and concurrency safety.
"""
from decimal import Decimal
from django.db import transaction, models
from django.core.exceptions import ValidationError
from .models import WarehouseLocation, Lot, StockQuant, StockMoveLog


class StockMoveService:
    """Service for executing warehouse stock moves with full audit trail."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    def execute_stock_move(self, item, qty, source_loc, dest_loc, lot=None, reference=''):
        """
        Move stock from source location to destination location.

        Args:
            item: Item instance
            qty: Decimal quantity to move (must be > 0)
            source_loc: WarehouseLocation instance (source)
            dest_loc: WarehouseLocation instance (destination)
            lot: Optional Lot instance
            reference: Optional reference string

        Returns:
            StockMoveLog: The audit record

        Raises:
            ValidationError: If insufficient stock at source or invalid qty
        """
        qty = Decimal(str(qty))
        if qty <= 0:
            raise ValidationError("Move quantity must be positive.")

        with transaction.atomic():
            # 1. Validate source has enough
            source_quant = StockQuant.objects.select_for_update().filter(
                tenant=self.tenant,
                item=item,
                location=source_loc,
                lot=lot,
            ).first()

            if not source_quant or source_quant.quantity < qty:
                available = source_quant.quantity if source_quant else Decimal('0')
                raise ValidationError(
                    f"Insufficient stock at {source_loc.name}. "
                    f"Available: {available}, Requested: {qty}"
                )

            # 2. Debit source
            source_quant.quantity -= qty
            if source_quant.quantity == 0:
                source_quant.delete()
            else:
                source_quant.save(update_fields=['quantity', 'updated_at'])

            # 3. Credit destination (get_or_create)
            dest_quant, created = StockQuant.objects.select_for_update().get_or_create(
                tenant=self.tenant,
                item=item,
                location=dest_loc,
                lot=lot,
                defaults={'quantity': Decimal('0')},
            )
            dest_quant.quantity += qty
            dest_quant.save(update_fields=['quantity', 'updated_at'])

            # 4. Audit log
            move_log = StockMoveLog.objects.create(
                tenant=self.tenant,
                item=item,
                source_location=source_loc,
                destination_location=dest_loc,
                lot=lot,
                quantity=qty,
                moved_by=self.user,
                reference=reference,
            )

            return move_log

    def get_stock_by_location(self, item):
        """Get all StockQuants for an item, grouped by location."""
        return StockQuant.objects.filter(
            tenant=self.tenant,
            item=item,
            quantity__gt=0,
        ).select_related('location', 'location__warehouse', 'lot').order_by('location__name')

    def get_picking_list(self, item, qty_needed, warehouse=None):
        """
        Generate a pick list using FEFO (First Expired, First Out) strategy.
        Falls back to FIFO by lot creation date for items without expiry.

        Returns list of dicts: [{'quant': StockQuant, 'pick_qty': Decimal}, ...]
        """
        qty_needed = Decimal(str(qty_needed))
        quants = StockQuant.objects.filter(
            tenant=self.tenant,
            item=item,
            quantity__gt=0,
            location__type__in=['STORAGE', 'PICKING'],
        ).select_related('location', 'lot')

        if warehouse:
            quants = quants.filter(location__warehouse=warehouse)

        # Order: lots with expiry first (soonest first), then by location name for efficient path
        quants = quants.order_by(
            models.F('lot__expiry_date').asc(nulls_last=True),
            'lot__created_at',
            'location__name',
        )

        picks = []
        remaining = qty_needed
        for quant in quants:
            if remaining <= 0:
                break
            pick_qty = min(remaining, quant.quantity)
            picks.append({'quant': quant, 'pick_qty': pick_qty})
            remaining -= pick_qty

        if remaining > 0:
            raise ValidationError(
                f"Insufficient pickable stock for {item.sku}. "
                f"Needed: {qty_needed}, Short: {remaining}"
            )

        return picks

    def create_putaway_quant(self, item, qty, receiving_loc, lot=None, reference=''):
        """
        Place received goods into a receiving dock location (creates/increments StockQuant).
        Used during PO receiving to land goods at the dock before putaway.

        Returns the StockQuant.
        """
        qty = Decimal(str(qty))
        if qty <= 0:
            raise ValidationError("Quantity must be positive.")

        with transaction.atomic():
            quant, created = StockQuant.objects.get_or_create(
                tenant=self.tenant,
                item=item,
                location=receiving_loc,
                lot=lot,
                defaults={'quantity': Decimal('0')},
            )
            quant.quantity += qty
            quant.save(update_fields=['quantity', 'updated_at'])
            return quant
