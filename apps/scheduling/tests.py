# apps/scheduling/tests.py
"""
Tests for DeliveryRun and related scheduling models.
"""
from datetime import date
from django.test import TestCase
from django.db import IntegrityError

from apps.tenants.models import Tenant
from apps.parties.models import Party, Vendor, Truck
from apps.scheduling.models import DeliveryRun
from shared.managers import set_current_tenant
from users.models import User


class DeliveryRunTestCase(TestCase):
    """Tests for DeliveryRun model."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Sched Co', subdomain='test-scheduling')
        cls.user = User.objects.create_user(username='scheduser', password='pass')
        set_current_tenant(cls.tenant)

        cls.truck = Truck.objects.create(
            tenant=cls.tenant,
            name='Truck Alpha',
            is_active=True,
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    # ── 5.5a: Create a DeliveryRun ───────────────────────────────────────

    def test_create_delivery_run(self):
        """Create a DeliveryRun and verify fields and __str__."""
        run = DeliveryRun.objects.create(
            tenant=self.tenant,
            name='Morning Run',
            truck=self.truck,
            scheduled_date=date(2026, 3, 1),
            sequence=1,
        )
        self.assertEqual(run.name, 'Morning Run')
        self.assertEqual(run.truck, self.truck)
        self.assertEqual(run.scheduled_date, date(2026, 3, 1))
        self.assertEqual(run.sequence, 1)
        self.assertFalse(run.is_complete)
        expected_str = f"{self.truck.name} - 2026-03-01 - Morning Run"
        self.assertEqual(str(run), expected_str)

    # ── 5.5b: unique_together constraint ─────────────────────────────────

    def test_unique_together_constraint(self):
        """Same truck/date/sequence within tenant raises IntegrityError."""
        DeliveryRun.objects.create(
            tenant=self.tenant,
            name='Run 1',
            truck=self.truck,
            scheduled_date=date(2026, 3, 2),
            sequence=1,
        )
        with self.assertRaises(IntegrityError):
            DeliveryRun.objects.create(
                tenant=self.tenant,
                name='Run Duplicate',
                truck=self.truck,
                scheduled_date=date(2026, 3, 2),
                sequence=1,
            )

    # ── 5.5c: Multiple runs per truck per day ────────────────────────────

    def test_multiple_runs_per_day(self):
        """A truck can have multiple runs on the same day with different sequences."""
        run1 = DeliveryRun.objects.create(
            tenant=self.tenant,
            name='Morning',
            truck=self.truck,
            scheduled_date=date(2026, 3, 3),
            sequence=1,
        )
        run2 = DeliveryRun.objects.create(
            tenant=self.tenant,
            name='Afternoon',
            truck=self.truck,
            scheduled_date=date(2026, 3, 3),
            sequence=2,
        )
        runs = DeliveryRun.objects.filter(
            tenant=self.tenant,
            truck=self.truck,
            scheduled_date=date(2026, 3, 3),
        )
        self.assertEqual(runs.count(), 2)
        self.assertEqual(run1.sequence, 1)
        self.assertEqual(run2.sequence, 2)
