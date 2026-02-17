# apps/warehousing/tests/test_models_and_services.py
"""
Tests for WMS module models and services.

Test coverage:
- Model tests: WarehouseLocation, StockQuant, Lot, CycleCountLine
- Service tests: StockMoveService, reserve/unreserve stock, CycleCountService
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from apps.items.models import UnitOfMeasure, Item
from apps.tenants.models import Tenant
from apps.warehousing.models import (
    Warehouse,
    WarehouseLocation,
    Lot,
    StockQuant,
    StockMoveLog,
    CycleCount,
    CycleCountLine,
)
from apps.warehousing.services import StockMoveService, CycleCountService
from shared.managers import set_current_tenant

User = get_user_model()


# =============================================================================
# BASE TEST CLASS
# =============================================================================

class WMSTestCase(TestCase):
    """Base test case with shared setup for WMS tests."""

    @classmethod
    def setUpTestData(cls):
        """Create shared test data (runs once per test class)."""
        cls.tenant = Tenant.objects.create(
            name='Test Company',
            subdomain='test-wms',
            is_default=True,
        )
        cls.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123',
        )
        set_current_tenant(cls.tenant)

        # UOM
        cls.uom_each = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='ea',
            name='Each',
        )

        # Items
        cls.item = Item.objects.create(
            tenant=cls.tenant,
            sku='WIDGET-001',
            name='Test Widget',
            base_uom=cls.uom_each,
        )
        cls.item2 = Item.objects.create(
            tenant=cls.tenant,
            sku='WIDGET-002',
            name='Test Widget 2',
            base_uom=cls.uom_each,
        )

        # Warehouse
        cls.warehouse = Warehouse.objects.create(
            tenant=cls.tenant,
            name='Main Warehouse',
            code='MAIN',
        )

        # Locations
        cls.loc_source = WarehouseLocation.objects.create(
            tenant=cls.tenant,
            warehouse=cls.warehouse,
            name='A-01-01',
            barcode='LOC-A0101',
            type='STORAGE',
        )
        cls.loc_dest = WarehouseLocation.objects.create(
            tenant=cls.tenant,
            warehouse=cls.warehouse,
            name='B-01-01',
            barcode='LOC-B0101',
            type='PICKING',
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)


# =============================================================================
# 1. WarehouseLocationModelTests
# =============================================================================

class WarehouseLocationModelTests(WMSTestCase):
    """Tests for the WarehouseLocation model."""

    def test_create_location(self):
        """Basic location creation with required fields."""
        loc = WarehouseLocation.objects.create(
            tenant=self.tenant,
            warehouse=self.warehouse,
            name='C-01-01',
            barcode='LOC-C0101',
            type='STORAGE',
        )
        self.assertEqual(loc.name, 'C-01-01')
        self.assertEqual(loc.warehouse, self.warehouse)
        self.assertEqual(loc.type, 'STORAGE')
        self.assertTrue(loc.is_active)

    def test_location_str(self):
        """__str__ returns 'WAREHOUSE_CODE:NAME' format."""
        self.assertEqual(str(self.loc_source), 'MAIN:A-01-01')

    def test_location_hierarchy(self):
        """Parent-child relationship between locations."""
        parent_loc = WarehouseLocation.objects.create(
            tenant=self.tenant,
            warehouse=self.warehouse,
            name='Zone-A',
            barcode='LOC-ZONE-A',
            type='VIEW',
        )
        child_loc = WarehouseLocation.objects.create(
            tenant=self.tenant,
            warehouse=self.warehouse,
            name='Zone-A-Bin-1',
            barcode='LOC-ZONE-A-BIN1',
            type='STORAGE',
            parent=parent_loc,
        )
        self.assertEqual(child_loc.parent, parent_loc)
        self.assertIn(child_loc, parent_loc.children.all())

    def test_location_types(self):
        """All defined LOCATION_TYPES are valid choices."""
        valid_types = [
            'VIEW', 'INTERNAL', 'CUSTOMER', 'INVENTORY', 'PRODUCTION',
            'RECEIVING_DOCK', 'STORAGE', 'PICKING', 'PACKING',
            'SHIPPING_DOCK', 'SCRAP',
        ]
        for i, loc_type in enumerate(valid_types):
            loc = WarehouseLocation.objects.create(
                tenant=self.tenant,
                warehouse=self.warehouse,
                name=f'Type-Test-{loc_type}',
                barcode=f'LOC-TYPE-{i}',
                type=loc_type,
            )
            self.assertEqual(loc.type, loc_type)

    def test_unique_barcode_per_tenant(self):
        """unique_together constraint on (tenant, barcode)."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                WarehouseLocation.objects.create(
                    tenant=self.tenant,
                    warehouse=self.warehouse,
                    name='Duplicate-Barcode',
                    barcode='LOC-A0101',  # Same barcode as loc_source
                    type='STORAGE',
                )


# =============================================================================
# 2. StockQuantModelTests
# =============================================================================

class StockQuantModelTests(WMSTestCase):
    """Tests for the StockQuant model."""

    def test_create_quant(self):
        """Basic quant creation with required fields."""
        quant = StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('100.0000'),
        )
        self.assertEqual(quant.item, self.item)
        self.assertEqual(quant.location, self.loc_source)
        self.assertEqual(quant.quantity, Decimal('100.0000'))
        self.assertEqual(quant.reserved_quantity, Decimal('0'))

    def test_available_quantity_property(self):
        """available_quantity = quantity - reserved_quantity."""
        quant = StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('100.0000'),
            reserved_quantity=Decimal('30.0000'),
        )
        self.assertEqual(quant.available_quantity, Decimal('70.0000'))

    def test_unique_together_constraint(self):
        """unique_together on (tenant, item, location, lot) prevents duplicates."""
        lot = Lot.objects.create(
            tenant=self.tenant,
            item=self.item,
            lot_number='UNIQ-TEST-LOT',
        )
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            lot=lot,
            quantity=Decimal('10'),
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                StockQuant.objects.create(
                    tenant=self.tenant,
                    item=self.item,
                    location=self.loc_source,
                    lot=lot,
                    quantity=Decimal('20'),
                )

    def test_quantity_non_negative_constraint(self):
        """DB constraint prevents negative quantity."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                StockQuant.objects.create(
                    tenant=self.tenant,
                    item=self.item,
                    location=self.loc_source,
                    quantity=Decimal('-1.0000'),
                )

    def test_reserved_non_negative_constraint(self):
        """DB constraint prevents negative reserved_quantity."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                StockQuant.objects.create(
                    tenant=self.tenant,
                    item=self.item,
                    location=self.loc_source,
                    quantity=Decimal('10.0000'),
                    reserved_quantity=Decimal('-1.0000'),
                )

    def test_reserved_lte_quantity_constraint(self):
        """DB constraint prevents reserved_quantity > quantity."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                StockQuant.objects.create(
                    tenant=self.tenant,
                    item=self.item,
                    location=self.loc_source,
                    quantity=Decimal('10.0000'),
                    reserved_quantity=Decimal('20.0000'),
                )


# =============================================================================
# 3. LotModelTests
# =============================================================================

class LotModelTests(WMSTestCase):
    """Tests for the Lot model."""

    def test_create_lot(self):
        """Basic lot creation with lot_number."""
        lot = Lot.objects.create(
            tenant=self.tenant,
            item=self.item,
            lot_number='LOT-2026-001',
        )
        self.assertEqual(lot.lot_number, 'LOT-2026-001')
        self.assertEqual(lot.item, self.item)

    def test_lot_with_manufacturer_batch(self):
        """Lot with manufacturer_batch_id field."""
        lot = Lot.objects.create(
            tenant=self.tenant,
            item=self.item,
            lot_number='LOT-MFG-001',
            manufacturer_batch_id='MFG-BATCH-XYZ',
            vendor_batch='VENDOR-BATCH-123',
            expiry_date=date.today() + timedelta(days=90),
        )
        self.assertEqual(lot.manufacturer_batch_id, 'MFG-BATCH-XYZ')
        self.assertEqual(lot.vendor_batch, 'VENDOR-BATCH-123')
        self.assertIsNotNone(lot.expiry_date)

    def test_lot_str(self):
        """__str__ returns 'LOT_NUMBER (ITEM_SKU)' format."""
        lot = Lot.objects.create(
            tenant=self.tenant,
            item=self.item,
            lot_number='LOT-STR-001',
        )
        self.assertEqual(str(lot), 'LOT-STR-001 (WIDGET-001)')

    def test_unique_lot_per_item_tenant(self):
        """unique_together on (tenant, item, lot_number)."""
        Lot.objects.create(
            tenant=self.tenant,
            item=self.item,
            lot_number='LOT-UNIQUE-001',
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Lot.objects.create(
                    tenant=self.tenant,
                    item=self.item,
                    lot_number='LOT-UNIQUE-001',
                )


# =============================================================================
# 4. CycleCountLineModelTests
# =============================================================================

class CycleCountLineModelTests(WMSTestCase):
    """Tests for CycleCountLine auto-calculation on save."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.cycle_count = CycleCount.objects.create(
            tenant=cls.tenant,
            warehouse=cls.warehouse,
            count_number='CC-2026-TEST',
            status='in_progress',
        )

    def test_save_auto_calculates_variance(self):
        """When counted_quantity is set, variance = counted - expected, is_counted = True."""
        line = CycleCountLine.objects.create(
            tenant=self.tenant,
            cycle_count=self.cycle_count,
            item=self.item,
            location=self.loc_source,
            expected_quantity=Decimal('100.0000'),
            counted_quantity=Decimal('95.0000'),
        )
        self.assertEqual(line.variance, Decimal('-5.0000'))
        self.assertTrue(line.is_counted)

    def test_uncounted_line(self):
        """counted_quantity is None: variance = 0, is_counted = False."""
        line = CycleCountLine.objects.create(
            tenant=self.tenant,
            cycle_count=self.cycle_count,
            item=self.item,
            location=self.loc_source,
            expected_quantity=Decimal('100.0000'),
        )
        self.assertEqual(line.variance, Decimal('0'))
        self.assertFalse(line.is_counted)
        self.assertIsNone(line.counted_quantity)


# =============================================================================
# 5. StockMoveServiceTests
# =============================================================================

class StockMoveServiceTests(WMSTestCase):
    """Tests for StockMoveService.execute_stock_move."""

    def setUp(self):
        super().setUp()
        self.svc = StockMoveService(self.tenant, self.user)

    def _create_source_quant(self, qty, location=None, lot=None):
        """Helper to create a StockQuant at the source location."""
        return StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=location or self.loc_source,
            lot=lot,
            quantity=Decimal(str(qty)),
        )

    def test_execute_stock_move(self):
        """Move 10 from source to dest: source decremented, dest incremented, audit log created."""
        self._create_source_quant(100)

        log = self.svc.execute_stock_move(
            item=self.item,
            qty=Decimal('10'),
            source_loc=self.loc_source,
            dest_loc=self.loc_dest,
            reference='TEST-MOVE',
        )

        # Source decremented
        source_quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item, location=self.loc_source,
        )
        self.assertEqual(source_quant.quantity, Decimal('90.0000'))

        # Dest incremented
        dest_quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item, location=self.loc_dest,
        )
        self.assertEqual(dest_quant.quantity, Decimal('10.0000'))

        # Audit log
        self.assertIsInstance(log, StockMoveLog)
        self.assertEqual(log.quantity, Decimal('10'))

    def test_move_insufficient_stock(self):
        """Moving more than available raises ValidationError."""
        self._create_source_quant(5)

        with self.assertRaises(ValidationError):
            self.svc.execute_stock_move(
                item=self.item,
                qty=Decimal('10'),
                source_loc=self.loc_source,
                dest_loc=self.loc_dest,
            )

    def test_move_zero_quantity(self):
        """qty=0 raises ValidationError."""
        self._create_source_quant(10)

        with self.assertRaises(ValidationError):
            self.svc.execute_stock_move(
                item=self.item,
                qty=Decimal('0'),
                source_loc=self.loc_source,
                dest_loc=self.loc_dest,
            )

    def test_move_negative_quantity(self):
        """qty=-1 raises ValidationError."""
        self._create_source_quant(10)

        with self.assertRaises(ValidationError):
            self.svc.execute_stock_move(
                item=self.item,
                qty=Decimal('-1'),
                source_loc=self.loc_source,
                dest_loc=self.loc_dest,
            )

    def test_move_deletes_empty_source_quant(self):
        """When source goes to 0, quant is deleted."""
        self._create_source_quant(10)

        self.svc.execute_stock_move(
            item=self.item,
            qty=Decimal('10'),
            source_loc=self.loc_source,
            dest_loc=self.loc_dest,
        )

        self.assertFalse(
            StockQuant.objects.filter(
                tenant=self.tenant, item=self.item, location=self.loc_source,
            ).exists()
        )

    def test_move_creates_dest_quant(self):
        """Destination quant auto-created if it does not exist."""
        self._create_source_quant(50)

        # Confirm no dest quant exists
        self.assertFalse(
            StockQuant.objects.filter(
                tenant=self.tenant, item=self.item, location=self.loc_dest,
            ).exists()
        )

        self.svc.execute_stock_move(
            item=self.item,
            qty=Decimal('25'),
            source_loc=self.loc_source,
            dest_loc=self.loc_dest,
        )

        dest_quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item, location=self.loc_dest,
        )
        self.assertEqual(dest_quant.quantity, Decimal('25.0000'))

    def test_move_with_lot(self):
        """Move with lot tracking preserves lot association."""
        lot = Lot.objects.create(
            tenant=self.tenant,
            item=self.item,
            lot_number='LOT-MOVE-001',
        )
        self._create_source_quant(50, lot=lot)

        self.svc.execute_stock_move(
            item=self.item,
            qty=Decimal('20'),
            source_loc=self.loc_source,
            dest_loc=self.loc_dest,
            lot=lot,
        )

        dest_quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item, location=self.loc_dest, lot=lot,
        )
        self.assertEqual(dest_quant.quantity, Decimal('20.0000'))
        self.assertEqual(dest_quant.lot, lot)

    def test_move_creates_audit_log(self):
        """StockMoveLog created with correct fields."""
        self._create_source_quant(100)

        log = self.svc.execute_stock_move(
            item=self.item,
            qty=Decimal('15'),
            source_loc=self.loc_source,
            dest_loc=self.loc_dest,
            reference='AUDIT-TEST',
        )

        self.assertEqual(log.tenant, self.tenant)
        self.assertEqual(log.item, self.item)
        self.assertEqual(log.source_location, self.loc_source)
        self.assertEqual(log.destination_location, self.loc_dest)
        self.assertEqual(log.quantity, Decimal('15'))
        self.assertEqual(log.moved_by, self.user)
        self.assertEqual(log.reference, 'AUDIT-TEST')
        self.assertIsNone(log.lot)


# =============================================================================
# 6. ReserveStockTests
# =============================================================================

class ReserveStockTests(WMSTestCase):
    """Tests for StockMoveService.reserve_stock and unreserve_stock."""

    def setUp(self):
        super().setUp()
        self.svc = StockMoveService(self.tenant, self.user)

    def test_reserve_stock_basic(self):
        """Reserve 5 of 10 available, verify reserved_quantity updated."""
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('10.0000'),
        )

        reservations = self.svc.reserve_stock(self.item, Decimal('5'))
        self.assertEqual(len(reservations), 1)
        self.assertEqual(reservations[0]['reserved_qty'], Decimal('5'))

        quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item, location=self.loc_source,
        )
        self.assertEqual(quant.reserved_quantity, Decimal('5.0000'))

    def test_reserve_insufficient_stock(self):
        """Reserving more than available raises ValidationError."""
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('5.0000'),
        )

        with self.assertRaises(ValidationError):
            self.svc.reserve_stock(self.item, Decimal('10'))

    def test_reserve_fefo_ordering(self):
        """Earliest expiry date reserved first (FEFO)."""
        lot_soon = Lot.objects.create(
            tenant=self.tenant,
            item=self.item,
            lot_number='LOT-SOON',
            expiry_date=date.today() + timedelta(days=10),
        )
        lot_later = Lot.objects.create(
            tenant=self.tenant,
            item=self.item,
            lot_number='LOT-LATER',
            expiry_date=date.today() + timedelta(days=90),
        )

        # Create quants - later expiry has more stock
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            lot=lot_later,
            quantity=Decimal('50.0000'),
        )
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            lot=lot_soon,
            quantity=Decimal('20.0000'),
        )

        reservations = self.svc.reserve_stock(self.item, Decimal('15'))

        # Should reserve from lot_soon first (earliest expiry)
        self.assertEqual(len(reservations), 1)
        self.assertEqual(reservations[0]['quant'].lot, lot_soon)
        self.assertEqual(reservations[0]['reserved_qty'], Decimal('15'))

    def test_unreserve_stock(self):
        """Reserve then unreserve, verify reserved_quantity back to 0."""
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('20.0000'),
        )

        self.svc.reserve_stock(self.item, Decimal('10'))
        quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item, location=self.loc_source,
        )
        self.assertEqual(quant.reserved_quantity, Decimal('10.0000'))

        self.svc.unreserve_stock(self.item, Decimal('10'))
        quant.refresh_from_db()
        self.assertEqual(quant.reserved_quantity, Decimal('0.0000'))

    def test_reserve_across_multiple_quants(self):
        """Reserve qty spanning multiple quants."""
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('8.0000'),
        )
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_dest,
            quantity=Decimal('8.0000'),
        )

        reservations = self.svc.reserve_stock(self.item, Decimal('12'))

        # Should span both quants
        self.assertEqual(len(reservations), 2)
        total_reserved = sum(r['reserved_qty'] for r in reservations)
        self.assertEqual(total_reserved, Decimal('12'))


# =============================================================================
# 7. CycleCountServiceTests
# =============================================================================

class CycleCountServiceTests(WMSTestCase):
    """Tests for CycleCountService."""

    def setUp(self):
        super().setUp()
        self.cc_svc = CycleCountService(self.tenant, self.user)
        self.move_svc = StockMoveService(self.tenant, self.user)

    def test_create_count(self):
        """Creates with draft status and auto-generated count_number (CC-YYYY-NNN)."""
        cc = self.cc_svc.create_count(self.warehouse)
        self.assertEqual(cc.status, 'draft')
        self.assertTrue(cc.count_number.startswith('CC-'))
        # Verify format: CC-YYYY-NNN
        parts = cc.count_number.split('-')
        self.assertEqual(len(parts), 3)
        self.assertEqual(len(parts[2]), 3)  # Zero-padded to 3 digits

    def test_start_count_snapshots(self):
        """Start count creates lines from existing StockQuants with matching expected_quantity."""
        # Create stock
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('50.0000'),
        )
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item2,
            location=self.loc_dest,
            quantity=Decimal('30.0000'),
        )

        cc = self.cc_svc.create_count(self.warehouse)
        self.cc_svc.start_count(cc)
        cc.refresh_from_db()

        self.assertEqual(cc.status, 'in_progress')
        self.assertIsNotNone(cc.started_at)

        lines = cc.lines.all()
        self.assertEqual(lines.count(), 2)

        # Verify expected quantities match stock
        source_line = lines.get(item=self.item, location=self.loc_source)
        self.assertEqual(source_line.expected_quantity, Decimal('50.0000'))

        dest_line = lines.get(item=self.item2, location=self.loc_dest)
        self.assertEqual(dest_line.expected_quantity, Decimal('30.0000'))

    def test_start_non_draft_raises(self):
        """Starting a non-draft count raises ValidationError."""
        cc = CycleCount.objects.create(
            tenant=self.tenant,
            warehouse=self.warehouse,
            count_number='CC-2026-NONDRAFT',
            status='in_progress',
        )
        with self.assertRaises(ValidationError):
            self.cc_svc.start_count(cc)

    def test_record_count(self):
        """Record a quantity, verify variance calculated."""
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('100.0000'),
        )
        cc = self.cc_svc.create_count(self.warehouse)
        self.cc_svc.start_count(cc)

        line = cc.lines.first()
        updated_line = self.cc_svc.record_count(
            line_id=line.pk,
            counted_quantity=Decimal('95'),
            cycle_count_id=cc.pk,
        )

        self.assertEqual(updated_line.counted_quantity, Decimal('95'))
        self.assertEqual(updated_line.variance, Decimal('-5.0000'))
        self.assertTrue(updated_line.is_counted)

    def test_record_wrong_cycle_count(self):
        """record_count with wrong cycle_count_id raises DoesNotExist."""
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('10.0000'),
        )
        cc = self.cc_svc.create_count(self.warehouse)
        self.cc_svc.start_count(cc)
        line = cc.lines.first()

        with self.assertRaises(CycleCountLine.DoesNotExist):
            self.cc_svc.record_count(
                line_id=line.pk,
                counted_quantity=Decimal('10'),
                cycle_count_id=999999,  # Non-existent
            )

    def test_finalize_count_no_variance(self):
        """All counted = expected: status becomes completed, no moves generated."""
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('50.0000'),
        )
        cc = self.cc_svc.create_count(self.warehouse)
        self.cc_svc.start_count(cc)

        # Count the exact expected amount
        line = cc.lines.first()
        self.cc_svc.record_count(line.pk, Decimal('50'))

        move_count_before = StockMoveLog.objects.filter(tenant=self.tenant).count()
        self.cc_svc.finalize_count(cc)
        move_count_after = StockMoveLog.objects.filter(tenant=self.tenant).count()

        cc.refresh_from_db()
        self.assertEqual(cc.status, 'completed')
        self.assertIsNotNone(cc.completed_at)
        # No adjustment moves generated
        self.assertEqual(move_count_before, move_count_after)

    def test_finalize_count_with_shortage(self):
        """counted < expected: adjustment move created (stock moved to INVENTORY-ADJUSTMENT)."""
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('100.0000'),
        )
        cc = self.cc_svc.create_count(self.warehouse)
        self.cc_svc.start_count(cc)

        # Count less than expected (shortage of 10)
        line = cc.lines.first()
        self.cc_svc.record_count(line.pk, Decimal('90'))

        self.cc_svc.finalize_count(cc)
        cc.refresh_from_db()
        self.assertEqual(cc.status, 'completed')

        # Verify adjustment move log was created
        adj_moves = StockMoveLog.objects.filter(
            tenant=self.tenant,
            reference__contains=cc.count_number,
        )
        self.assertEqual(adj_moves.count(), 1)
        move = adj_moves.first()
        self.assertEqual(move.quantity, Decimal('10'))
        self.assertEqual(move.source_location, self.loc_source)
        self.assertEqual(move.destination_location.name, 'INVENTORY-ADJUSTMENT')

        # Verify source quant was decremented
        source_quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item, location=self.loc_source,
        )
        self.assertEqual(source_quant.quantity, Decimal('90.0000'))

    def test_finalize_count_with_overage(self):
        """counted > expected: stock created at adjustment loc and moved to real loc."""
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('100.0000'),
        )
        cc = self.cc_svc.create_count(self.warehouse)
        self.cc_svc.start_count(cc)

        # Count more than expected (overage of 5)
        line = cc.lines.first()
        self.cc_svc.record_count(line.pk, Decimal('105'))

        self.cc_svc.finalize_count(cc)
        cc.refresh_from_db()
        self.assertEqual(cc.status, 'completed')

        # Verify adjustment move log was created
        adj_moves = StockMoveLog.objects.filter(
            tenant=self.tenant,
            reference__contains=cc.count_number,
        )
        self.assertEqual(adj_moves.count(), 1)
        move = adj_moves.first()
        self.assertEqual(move.quantity, Decimal('5'))
        self.assertEqual(move.destination_location, self.loc_source)

        # Verify source quant was incremented
        source_quant = StockQuant.objects.get(
            tenant=self.tenant, item=self.item, location=self.loc_source,
        )
        self.assertEqual(source_quant.quantity, Decimal('105.0000'))

    def test_finalize_uncounted_lines_raises(self):
        """Finalize with uncounted lines raises ValidationError."""
        StockQuant.objects.create(
            tenant=self.tenant,
            item=self.item,
            location=self.loc_source,
            quantity=Decimal('50.0000'),
        )
        cc = self.cc_svc.create_count(self.warehouse)
        self.cc_svc.start_count(cc)

        # Do NOT record any counts
        with self.assertRaises(ValidationError):
            self.cc_svc.finalize_count(cc)

    def test_finalize_non_in_progress_raises(self):
        """Finalize draft raises ValidationError."""
        cc = self.cc_svc.create_count(self.warehouse)
        # Status is still 'draft' - not started
        with self.assertRaises(ValidationError):
            self.cc_svc.finalize_count(cc)
