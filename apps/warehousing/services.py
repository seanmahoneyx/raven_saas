# apps/warehousing/services.py
"""
Service layer for warehouse stock movements.

Provides transactional stock movement operations with full audit trail
and concurrency safety.
"""
from decimal import Decimal
from django.db import transaction, models
from django.core.exceptions import ValidationError
from django.utils import timezone
from .models import (
    WarehouseLocation, Lot, StockQuant, StockMoveLog,
    CycleCount, CycleCountLine,
)


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

            # Check reorder point
            try:
                from apps.notifications.services import notify_group
                total_on_hand = StockQuant.objects.filter(
                    tenant=self.tenant, item=item,
                ).aggregate(total=models.Sum('quantity'))['total'] or 0
                if item.reorder_point and total_on_hand <= item.reorder_point:
                    notify_group(
                        tenant=self.tenant,
                        group_name='Purchasing',
                        title=f'Reorder Alert: {item.sku}',
                        message=f'{item.name} is at {total_on_hand} (reorder point: {item.reorder_point})',
                        link=f'/items/{item.id}',
                        notification_type='WARNING',
                    )
            except Exception:
                pass

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

    def reserve_stock(self, item, qty, warehouse=None):
        """
        Reserve stock for a sales order using FEFO strategy.

        Finds available (unreserved) quants and marks them reserved.
        Does NOT move stock - just holds it so it can't be double-allocated.

        Args:
            item: Item instance
            qty: Decimal quantity to reserve
            warehouse: Optional Warehouse to restrict to

        Returns:
            list of dicts: [{'quant': StockQuant, 'reserved_qty': Decimal}, ...]

        Raises:
            ValidationError: If insufficient available stock
        """
        qty = Decimal(str(qty))
        if qty <= 0:
            raise ValidationError("Reserve quantity must be positive.")

        with transaction.atomic():
            quants = StockQuant.objects.select_for_update().filter(
                tenant=self.tenant,
                item=item,
                quantity__gt=0,
                location__type__in=['STORAGE', 'PICKING', 'INVENTORY'],
            )
            if warehouse:
                quants = quants.filter(location__warehouse=warehouse)

            # FEFO ordering
            quants = quants.order_by(
                models.F('lot__expiry_date').asc(nulls_last=True),
                'lot__created_at',
                'location__name',
            )

            reservations = []
            remaining = qty
            for quant in quants:
                if remaining <= 0:
                    break
                available = quant.quantity - quant.reserved_quantity
                if available <= 0:
                    continue
                reserve_qty = min(remaining, available)
                quant.reserved_quantity += reserve_qty
                quant.save(update_fields=['reserved_quantity', 'updated_at'])
                reservations.append({'quant': quant, 'reserved_qty': reserve_qty})
                remaining -= reserve_qty

            if remaining > 0:
                raise ValidationError(
                    f"Insufficient available stock for {item.sku}. "
                    f"Needed: {qty}, Short: {remaining}"
                )

            return reservations

    def unreserve_stock(self, item, qty, warehouse=None):
        """
        Release previously reserved stock.

        Args:
            item: Item instance
            qty: Decimal quantity to unreserve
            warehouse: Optional Warehouse to restrict to
        """
        qty = Decimal(str(qty))
        if qty <= 0:
            raise ValidationError("Unreserve quantity must be positive.")

        with transaction.atomic():
            quants = StockQuant.objects.select_for_update().filter(
                tenant=self.tenant,
                item=item,
                reserved_quantity__gt=0,
            )
            if warehouse:
                quants = quants.filter(location__warehouse=warehouse)

            remaining = qty
            for quant in quants.order_by('-reserved_quantity'):
                if remaining <= 0:
                    break
                release = min(remaining, quant.reserved_quantity)
                quant.reserved_quantity -= release
                quant.save(update_fields=['reserved_quantity', 'updated_at'])
                remaining -= release

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


class CycleCountService:
    """Service for managing inventory cycle counts (audits)."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    def _generate_count_number(self):
        """Generate next cycle count number: CC-YYYY-NNN."""
        now = timezone.now()
        prefix = f"CC-{now.year}"
        last = CycleCount.objects.filter(
            tenant=self.tenant,
            count_number__startswith=prefix,
        ).order_by('-count_number').first()
        if last:
            try:
                seq = int(last.count_number.split('-')[-1]) + 1
            except (ValueError, IndexError):
                seq = 1
        else:
            seq = 1
        return f"{prefix}-{seq:03d}"

    def create_count(self, warehouse, zone=None, notes=''):
        """
        Create a new cycle count session in DRAFT status.

        Args:
            warehouse: Warehouse to count
            zone: Optional specific WarehouseLocation (zone) to limit scope
            notes: Optional notes

        Returns:
            CycleCount instance
        """
        count = CycleCount.objects.create(
            tenant=self.tenant,
            count_number=self._generate_count_number(),
            warehouse=warehouse,
            zone=zone,
            status='draft',
            counted_by=self.user,
            notes=notes,
        )
        return count

    def start_count(self, cycle_count):
        """
        Transition from DRAFT to IN_PROGRESS.
        Snapshots current StockQuant quantities into CycleCountLines.
        """
        if cycle_count.status != 'draft':
            raise ValidationError(f"Cannot start count with status: {cycle_count.status}")

        with transaction.atomic():
            # Build location filter
            loc_filter = {
                'tenant': self.tenant,
                'location__warehouse': cycle_count.warehouse,
                'quantity__gt': 0,
            }
            if cycle_count.zone:
                # Include zone and its children
                zone_ids = [cycle_count.zone.id]
                children = WarehouseLocation.objects.filter(
                    tenant=self.tenant, parent=cycle_count.zone
                ).values_list('id', flat=True)
                zone_ids.extend(children)
                loc_filter['location_id__in'] = zone_ids

            quants = StockQuant.objects.filter(**loc_filter).select_related(
                'item', 'location', 'lot'
            )

            lines = []
            for quant in quants:
                lines.append(CycleCountLine(
                    tenant=self.tenant,
                    cycle_count=cycle_count,
                    item=quant.item,
                    location=quant.location,
                    lot=quant.lot,
                    expected_quantity=quant.quantity,
                ))
            CycleCountLine.objects.bulk_create(lines)

            cycle_count.status = 'in_progress'
            cycle_count.started_at = timezone.now()
            cycle_count.save(update_fields=['status', 'started_at', 'updated_at'])

        return cycle_count

    def record_count(self, line_id, counted_quantity, cycle_count_id=None):
        """
        Record a counted quantity for a single line.

        Args:
            line_id: CycleCountLine PK
            counted_quantity: Decimal counted by user
            cycle_count_id: Optional CycleCount PK to validate line belongs to
        """
        filter_kwargs = {
            'pk': line_id,
            'tenant': self.tenant,
        }
        if cycle_count_id is not None:
            filter_kwargs['cycle_count_id'] = cycle_count_id

        line = CycleCountLine.objects.select_related('cycle_count').get(**filter_kwargs)
        if line.cycle_count.status != 'in_progress':
            raise ValidationError("Count is not in progress.")

        line.counted_quantity = Decimal(str(counted_quantity))
        line.save()
        return line

    def finalize_count(self, cycle_count):
        """
        Finalize a cycle count: generate adjustment moves for variances.

        For each line with a variance:
        - Positive variance (overage): Create stock at a virtual ADJUSTMENT location, move to actual location
        - Negative variance (shortage): Move stock from actual location to ADJUSTMENT location

        Uses a virtual 'INVENTORY_ADJUSTMENT' location as the counterpart.
        """
        if cycle_count.status != 'in_progress':
            raise ValidationError(f"Cannot finalize count with status: {cycle_count.status}")

        uncounted = cycle_count.lines.filter(is_counted=False).count()
        if uncounted > 0:
            raise ValidationError(f"{uncounted} lines have not been counted yet.")

        move_svc = StockMoveService(self.tenant, self.user)

        with transaction.atomic():
            # Get or create the adjustment location
            adj_loc, _ = WarehouseLocation.objects.get_or_create(
                tenant=self.tenant,
                warehouse=cycle_count.warehouse,
                name='INVENTORY-ADJUSTMENT',
                defaults={
                    'barcode': f'{cycle_count.warehouse.code}-ADJ',
                    'type': 'INTERNAL',
                    'is_active': False,
                },
            )

            lines_with_variance = cycle_count.lines.filter(~models.Q(variance=0))
            for line in lines_with_variance.select_related('item', 'location', 'lot'):
                ref = f"{cycle_count.count_number} adjustment"

                if line.variance > 0:
                    # Overage: stock appeared — create at adjustment loc, move to real loc
                    move_svc.create_putaway_quant(
                        item=line.item,
                        qty=line.variance,
                        receiving_loc=adj_loc,
                        lot=line.lot,
                        reference=ref,
                    )
                    move_svc.execute_stock_move(
                        item=line.item,
                        qty=line.variance,
                        source_loc=adj_loc,
                        dest_loc=line.location,
                        lot=line.lot,
                        reference=ref,
                    )
                elif line.variance < 0:
                    # Shortage: stock missing — move from real loc to adjustment
                    shortage = abs(line.variance)
                    move_svc.execute_stock_move(
                        item=line.item,
                        qty=shortage,
                        source_loc=line.location,
                        dest_loc=adj_loc,
                        lot=line.lot,
                        reference=ref,
                    )

            cycle_count.status = 'completed'
            cycle_count.completed_at = timezone.now()
            cycle_count.save(update_fields=['status', 'completed_at', 'updated_at'])

        return cycle_count
