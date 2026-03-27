# apps/items/tests/test_packaging.py
"""
Tests for PackagingItem model and API endpoints.
"""
from django.test import TestCase
from rest_framework.test import APITestCase
from rest_framework import status

from apps.tenants.models import Tenant
from apps.items.models import (
    UnitOfMeasure, Item, PackagingItem,
    PACKAGING_SUB_TYPES,
)
from shared.managers import set_current_tenant
from users.models import User


class PackagingItemModelTests(TestCase):
    """Tests for the PackagingItem model."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Pkg Test Co', subdomain='test-pkg')
        cls.user = User.objects.create_user(username='pkguser', password='pass')
        set_current_tenant(cls.tenant)
        cls.uom_each = UnitOfMeasure.objects.create(
            tenant=cls.tenant, code='ea', name='Each',
        )
        cls.uom_roll = UnitOfMeasure.objects.create(
            tenant=cls.tenant, code='rl', name='Roll',
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    def test_create_bags_item(self):
        """Create a Bags packaging item with basic fields."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Poly Bag 12x15',
            base_uom=self.uom_each,
            sub_type='bags',
            material_type='LDPE',
            color='Clear',
            thickness=2,
            thickness_unit='mil',
            length=12,
            width=15,
            lip_style='open',
            pieces_per_case=1000,
        )
        self.assertEqual(item.division, 'packaging')
        self.assertEqual(item.sub_type, 'bags')
        self.assertEqual(item.material_type, 'LDPE')
        self.assertEqual(item.lip_style, 'open')
        self.assertEqual(item.pieces_per_case, 1000)
        self.assertIn('MSPN-', item.sku)

    def test_division_forced_to_packaging(self):
        """Saving a PackagingItem always sets division='packaging'."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Test Override',
            base_uom=self.uom_each,
            sub_type='tape',
            division='misc',  # Try to set non-packaging division
        )
        self.assertEqual(item.division, 'packaging')

    def test_create_tape_item(self):
        """Create a Tape packaging item with tape-specific fields."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Packing Tape 2" x 110yd',
            base_uom=self.uom_roll,
            sub_type='tape',
            material_type='Poly',
            color='Clear',
            thickness=2,
            thickness_unit='mil',
            roll_length=330,
            roll_width=2,
            rolls_per_case=36,
            core_diameter=3,
            tape_type='packing',
            adhesive_type='acrylic',
        )
        self.assertEqual(item.sub_type, 'tape')
        self.assertEqual(item.tape_type, 'packing')
        self.assertEqual(item.adhesive_type, 'acrylic')
        self.assertEqual(item.rolls_per_case, 36)

    def test_create_stretch_item(self):
        """Create a Stretch wrap item with stretch-specific fields."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Stretch Wrap 18" x 1500ft',
            base_uom=self.uom_roll,
            sub_type='stretch',
            material_type='Cast',
            color='Clear',
            thickness=80,
            thickness_unit='gauge',
            roll_length=1500,
            roll_width=18,
            rolls_per_case=4,
            core_diameter=3,
            stretch_pct=200,
        )
        self.assertEqual(item.sub_type, 'stretch')
        self.assertEqual(item.stretch_pct, 200)
        self.assertEqual(item.thickness_unit, 'gauge')

    def test_create_bubble_item(self):
        """Create a Bubble wrap item with bubble-specific fields."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Bubble Wrap 12" x 175ft',
            base_uom=self.uom_roll,
            sub_type='bubble',
            material_type='Standard',
            bubble_size='3/16',
            perforated=True,
            perforation_interval='every 12 inches',
            roll_length=175,
            roll_width=12,
            rolls_per_case=4,
        )
        self.assertEqual(item.bubble_size, '3/16')
        self.assertTrue(item.perforated)
        self.assertEqual(item.perforation_interval, 'every 12 inches')

    def test_create_partitions_item(self):
        """Create a Partitions item with grid fields."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Chipboard Partition 6x4',
            base_uom=self.uom_each,
            sub_type='partitions',
            material_type='Chipboard',
            length=24,
            width=18,
            height=6,
            cells_x=6,
            cells_y=4,
            pieces_per_case=50,
        )
        self.assertEqual(item.cells_x, 6)
        self.assertEqual(item.cells_y, 4)

    def test_create_labels_item(self):
        """Create a Labels item with label-specific fields."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Thermal Label 4x6',
            base_uom=self.uom_roll,
            sub_type='labels',
            length=6,
            width=4,
            label_type='direct_thermal',
            labels_per_roll=500,
            adhesive_type='acrylic',
        )
        self.assertEqual(item.label_type, 'direct_thermal')
        self.assertEqual(item.labels_per_roll, 500)

    def test_create_plastic_containers_item(self):
        """Create a Plastic Containers item with lid flag."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='16oz Deli Container',
            base_uom=self.uom_each,
            sub_type='plastic_containers',
            material_type='PP',
            diameter=5,
            height=3,
            lid_included=True,
            pieces_per_case=240,
        )
        self.assertTrue(item.lid_included)

    def test_create_strapping_item(self):
        """Create a Strapping item with break strength."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Poly Strapping 1/2"',
            base_uom=self.uom_roll,
            sub_type='strapping',
            material_type='Polyester',
            roll_length=5800,
            roll_width=0.5,
            break_strength_lbs=600,
            core_diameter=8,
        )
        self.assertEqual(item.break_strength_lbs, 600)

    def test_create_tube_item(self):
        """Create a Tube item with inner diameter."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Kraft Tube 3x24',
            base_uom=self.uom_each,
            sub_type='tube',
            material_type='Kraft',
            diameter=3,
            height=24,
            inner_diameter=2.75,
            pieces_per_case=25,
        )
        self.assertEqual(item.inner_diameter, 2.75)

    def test_create_foam_item(self):
        """Create a Foam item with density."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='PE Foam Sheet 24x48',
            base_uom=self.uom_each,
            sub_type='foam',
            material_type='Polyethylene',
            length=48,
            width=24,
            thickness=1,
            thickness_unit='inches',
            density=2,
            sheets_per_bundle=10,
        )
        self.assertEqual(item.density, 2)

    def test_nullable_fields_default_blank(self):
        """Sub-type-specific fields should be null/blank by default."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Minimal Item',
            base_uom=self.uom_each,
            sub_type='pkg_misc',
        )
        self.assertIsNone(item.thickness)
        self.assertIsNone(item.length)
        self.assertEqual(item.bubble_size, '')
        self.assertFalse(item.perforated)
        self.assertFalse(item.lid_included)
        self.assertIsNone(item.cells_x)

    def test_multi_table_inheritance(self):
        """PackagingItem is accessible via Item base."""
        pkg = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Inheritance Test',
            base_uom=self.uom_each,
            sub_type='bags',
        )
        # Should appear in Item.objects.all()
        base_item = Item.objects.get(pk=pkg.pk)
        self.assertEqual(base_item.name, 'Inheritance Test')
        self.assertEqual(base_item.division, 'packaging')
        # And be accessible via reverse relation
        self.assertTrue(hasattr(base_item, 'packagingitem'))
        self.assertEqual(base_item.packagingitem.sub_type, 'bags')

    def test_all_sub_types_valid(self):
        """All defined sub-types can be used to create items."""
        for code, label in PACKAGING_SUB_TYPES:
            item = PackagingItem.objects.create(
                tenant=self.tenant,
                name=f'Test {label}',
                base_uom=self.uom_each,
                sub_type=code,
            )
            self.assertEqual(item.sub_type, code)
            self.assertEqual(item.division, 'packaging')


class PackagingItemAPITests(APITestCase):
    """Tests for the /api/v1/packaging-items/ endpoint."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='API Pkg Co', subdomain='test-pkg-api', is_default=True,
        )
        cls.user = User.objects.create_user(username='pkgapiuser', password='pass')
        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant, code='ea', name='Each',
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.client.force_authenticate(user=self.user)
        # Set tenant header
        self.client.defaults['HTTP_X_TENANT'] = str(self.tenant.subdomain)

    def test_create_packaging_item(self):
        """POST /api/v1/packaging-items/ creates a packaging item."""
        payload = {
            'name': 'API Test Tape',
            'base_uom': self.uom.id,
            'sub_type': 'tape',
            'material_type': 'Poly',
            'color': 'Clear',
            'thickness': '2.0000',
            'thickness_unit': 'mil',
            'roll_length': '110.00',
            'roll_width': '2.0000',
            'rolls_per_case': 36,
            'tape_type': 'packing',
            'adhesive_type': 'acrylic',
        }
        response = self.client.post('/api/v1/packaging-items/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data['sub_type'], 'tape')
        self.assertEqual(data['division'], 'packaging')
        self.assertEqual(data['tape_type'], 'packing')
        self.assertEqual(data['rolls_per_case'], 36)

    def test_list_packaging_items(self):
        """GET /api/v1/packaging-items/ returns packaging items."""
        PackagingItem.objects.create(
            tenant=self.tenant, name='Bag 1', base_uom=self.uom, sub_type='bags',
        )
        PackagingItem.objects.create(
            tenant=self.tenant, name='Tape 1', base_uom=self.uom, sub_type='tape',
        )
        response = self.client.get('/api/v1/packaging-items/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['count'], 2)

    def test_filter_by_sub_type(self):
        """GET /api/v1/packaging-items/?sub_type=bags filters correctly."""
        PackagingItem.objects.create(
            tenant=self.tenant, name='Bag', base_uom=self.uom, sub_type='bags',
        )
        PackagingItem.objects.create(
            tenant=self.tenant, name='Tape', base_uom=self.uom, sub_type='tape',
        )
        response = self.client.get('/api/v1/packaging-items/?sub_type=bags')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.json()['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['sub_type'], 'bags')

    def test_retrieve_packaging_item(self):
        """GET /api/v1/packaging-items/{id}/ returns detail with all fields."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Detail Test',
            base_uom=self.uom,
            sub_type='stretch',
            stretch_pct=200,
            roll_length=1500,
        )
        response = self.client.get(f'/api/v1/packaging-items/{item.pk}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['sub_type'], 'stretch')
        self.assertEqual(data['stretch_pct'], 200)
        self.assertEqual(data['roll_length'], '1500.00')

    def test_update_packaging_item(self):
        """PATCH /api/v1/packaging-items/{id}/ updates fields."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Update Test',
            base_uom=self.uom,
            sub_type='bags',
            lip_style='open',
        )
        response = self.client.patch(
            f'/api/v1/packaging-items/{item.pk}/',
            {'lip_style': 'ziplock', 'pieces_per_case': 500},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['lip_style'], 'ziplock')
        self.assertEqual(data['pieces_per_case'], 500)

    def test_delete_packaging_item(self):
        """DELETE /api/v1/packaging-items/{id}/ removes the item."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='Delete Test',
            base_uom=self.uom,
            sub_type='foam',
        )
        response = self.client.delete(f'/api/v1/packaging-items/{item.pk}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PackagingItem.objects.filter(pk=item.pk).exists())

    def test_search_packaging_items(self):
        """GET /api/v1/packaging-items/?search=poly finds by material."""
        PackagingItem.objects.create(
            tenant=self.tenant, name='Poly Bag', base_uom=self.uom,
            sub_type='bags', material_type='LDPE',
        )
        response = self.client.get('/api/v1/packaging-items/?search=Poly')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['count'], 1)

    def test_division_read_only(self):
        """Division cannot be changed via API - always packaging."""
        item = PackagingItem.objects.create(
            tenant=self.tenant,
            name='ReadOnly Test',
            base_uom=self.uom,
            sub_type='tape',
        )
        response = self.client.patch(
            f'/api/v1/packaging-items/{item.pk}/',
            {'division': 'corrugated'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Division should still be packaging (read_only in serializer)
        self.assertEqual(response.json()['division'], 'packaging')
