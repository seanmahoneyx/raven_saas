# apps/items/tests/test_services.py
"""
Tests for Item, UnitOfMeasure, ItemUOM, and CorrugatedItem models.
"""
from django.test import TestCase
from django.db import IntegrityError

from apps.tenants.models import Tenant
from apps.items.models import (
    UnitOfMeasure, Item, ItemUOM, CorrugatedItem,
    CorrugatedFeature, ItemFeature,
)
from apps.accounting.models import Account, AccountType
from shared.managers import set_current_tenant
from users.models import User


class ItemModelTestCase(TestCase):
    """Tests for Item and related models."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Item Co', subdomain='test-items')
        cls.user = User.objects.create_user(username='itemuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom_each = UnitOfMeasure.objects.create(
            tenant=cls.tenant, code='ea', name='Each',
        )
        cls.uom_case = UnitOfMeasure.objects.create(
            tenant=cls.tenant, code='cs', name='Case',
        )
        cls.income_account = Account.objects.create(
            tenant=cls.tenant, code='4000', name='Revenue',
            account_type=AccountType.REVENUE,
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    # ── 5.2a: Create an Item and verify __str__ ──────────────────────────

    def test_create_item(self):
        """Create an Item and verify SKU, name, __str__, and base_uom."""
        item = Item.objects.create(
            tenant=self.tenant,
            sku='WIDGET-001',
            name='Standard Widget',
            base_uom=self.uom_each,
            income_account=self.income_account,
        )
        self.assertEqual(item.sku, 'WIDGET-001')
        self.assertEqual(item.name, 'Standard Widget')
        self.assertEqual(str(item), 'WIDGET-001 - Standard Widget')
        self.assertEqual(item.base_uom, self.uom_each)
        self.assertTrue(item.is_active)
        self.assertTrue(item.is_inventory)

    # ── 5.2b: Duplicate SKU within same tenant raises IntegrityError ─────

    def test_duplicate_sku_same_tenant(self):
        """Duplicate SKU within the same tenant raises IntegrityError."""
        Item.objects.create(
            tenant=self.tenant, sku='DUP-SKU', name='First',
            base_uom=self.uom_each,
        )
        with self.assertRaises(IntegrityError):
            Item.objects.create(
                tenant=self.tenant, sku='DUP-SKU', name='Second',
                base_uom=self.uom_each,
            )

    # ── 5.2c: Same SKU in different tenant succeeds ──────────────────────

    def test_same_sku_different_tenant(self):
        """Same SKU in a different tenant does not conflict."""
        Item.objects.create(
            tenant=self.tenant, sku='CROSS-SKU', name='Tenant1 Item',
            base_uom=self.uom_each,
        )
        other_tenant = Tenant.objects.create(name='Other Item Co', subdomain='test-items-other')
        set_current_tenant(other_tenant)
        other_uom = UnitOfMeasure.objects.create(
            tenant=other_tenant, code='ea', name='Each',
        )
        item2 = Item.objects.create(
            tenant=other_tenant, sku='CROSS-SKU', name='Tenant2 Item',
            base_uom=other_uom,
        )
        self.assertEqual(item2.sku, 'CROSS-SKU')
        set_current_tenant(self.tenant)

    # ── 5.2d: Item hierarchy (parent/child) ──────────────────────────────

    def test_item_hierarchy(self):
        """Items can have a parent, forming a hierarchy."""
        parent = Item.objects.create(
            tenant=self.tenant, sku='PARENT-001', name='Parent Item',
            base_uom=self.uom_each,
        )
        child = Item.objects.create(
            tenant=self.tenant, sku='CHILD-001', name='Child Item',
            base_uom=self.uom_each, parent=parent,
        )
        self.assertEqual(child.parent, parent)
        self.assertIn(child, parent.children.all())

    # ── 5.2e: UOM conversion via ItemUOM ─────────────────────────────────

    def test_item_uom_conversion(self):
        """ItemUOM conversion records multiplier (e.g., 1 CASE = 12 EACH)."""
        item = Item.objects.create(
            tenant=self.tenant, sku='UOM-ITEM', name='UOM Test Item',
            base_uom=self.uom_each,
        )
        conversion = ItemUOM.objects.create(
            tenant=self.tenant,
            item=item,
            uom=self.uom_case,
            multiplier_to_base=12,
        )
        self.assertEqual(conversion.item, item)
        self.assertEqual(conversion.uom, self.uom_case)
        self.assertEqual(conversion.multiplier_to_base, 12)

    # ── 5.2f: CorrugatedItem extends Item ────────────────────────────────

    def test_corrugated_item(self):
        """CorrugatedItem extends Item with corrugated-specific attributes."""
        corr_item = CorrugatedItem.objects.create(
            tenant=self.tenant,
            sku='CORR-001',
            name='RSC Box 12x12x12',
            base_uom=self.uom_each,
            test='ect32',
            flute='c',
            paper='k',
        )
        self.assertIsInstance(corr_item, Item)
        self.assertEqual(corr_item.sku, 'CORR-001')
        # CorrugatedItem.save() forces division='corrugated'
        self.assertEqual(corr_item.division, 'corrugated')
        self.assertEqual(corr_item.test, 'ect32')
        self.assertEqual(corr_item.flute, 'c')
        self.assertEqual(corr_item.paper, 'k')

    # ── 5.2g: CorrugatedFeature M2M via ItemFeature ──────────────────────

    def test_corrugated_features(self):
        """CorrugatedFeature linked to CorrugatedItem via ItemFeature through table."""
        corr_item = CorrugatedItem.objects.create(
            tenant=self.tenant,
            sku='FEAT-001',
            name='Featured Box',
            base_uom=self.uom_each,
            test='ect29',
            flute='b',
        )
        feature1 = CorrugatedFeature.objects.create(
            tenant=self.tenant,
            code='handhole',
            name='Hand Holes',
        )
        feature2 = CorrugatedFeature.objects.create(
            tenant=self.tenant,
            code='perf',
            name='Perforations',
        )
        ItemFeature.objects.create(
            tenant=self.tenant,
            corrugated_item=corr_item,
            feature=feature1,
        )
        ItemFeature.objects.create(
            tenant=self.tenant,
            corrugated_item=corr_item,
            feature=feature2,
        )
        features = corr_item.item_features.all()
        self.assertEqual(features.count(), 2)
        feature_names = set(features.values_list('feature__name', flat=True))
        self.assertEqual(feature_names, {'Hand Holes', 'Perforations'})
