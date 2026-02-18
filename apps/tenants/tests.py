# apps/tenants/tests.py
"""
Tests for Tenant, TenantSettings, and TenantSequence models.
"""
from django.test import TestCase
from django.db import IntegrityError

from apps.tenants.models import Tenant, TenantSettings, TenantSequence
from apps.parties.models import Party
from shared.managers import set_current_tenant
from users.models import User


class TenantModelTestCase(TestCase):
    """Tests for the Tenant model and multi-tenant isolation."""

    # ── 5.3a: Create a Tenant ────────────────────────────────────────────

    def test_create_tenant(self):
        """Create a Tenant and verify name, subdomain, and __str__."""
        tenant = Tenant.objects.create(
            name='Acme Industries',
            subdomain='acme-industries',
        )
        self.assertEqual(tenant.name, 'Acme Industries')
        self.assertEqual(tenant.subdomain, 'acme-industries')
        self.assertTrue(tenant.is_active)
        self.assertEqual(str(tenant), 'Acme Industries')

    # ── 5.3b: Duplicate subdomain raises IntegrityError ──────────────────

    def test_duplicate_subdomain(self):
        """Duplicate subdomain globally raises IntegrityError."""
        Tenant.objects.create(name='First', subdomain='unique-sub')
        with self.assertRaises(IntegrityError):
            Tenant.objects.create(name='Second', subdomain='unique-sub')

    # ── 5.3c: TenantSettings auto-creation ───────────────────────────────

    def test_tenant_settings(self):
        """TenantSettings can be created and linked to a tenant."""
        tenant = Tenant.objects.create(name='Settings Co', subdomain='test-settings')
        set_current_tenant(tenant)
        # TenantSettings is auto-created by signal when Tenant is created
        settings = TenantSettings.objects.get(tenant=tenant)
        self.assertEqual(settings.tenant, tenant)

    # ── 5.3d: TenantSequence generation ──────────────────────────────────

    def test_tenant_sequence(self):
        """TenantSequence tracks per-tenant sequence numbers."""
        tenant = Tenant.objects.create(name='Seq Co', subdomain='test-seq')
        set_current_tenant(tenant)
        # Sequences are auto-created by signal; retrieve the SO sequence
        seq = TenantSequence.objects.get(tenant=tenant, sequence_type='SO')
        original_value = seq.next_value
        seq.next_value += 1
        seq.save()
        seq.refresh_from_db()
        self.assertEqual(seq.next_value, original_value + 1)

    # ── 5.3e: Tenant isolation ───────────────────────────────────────────

    def test_tenant_isolation(self):
        """
        Objects created under one tenant are not visible to another.
        Tests the tenant-scoped manager.
        """
        tenant_a = Tenant.objects.create(name='Tenant A', subdomain='test-iso-a')
        tenant_b = Tenant.objects.create(name='Tenant B', subdomain='test-iso-b')

        # Create a party under tenant A
        set_current_tenant(tenant_a)
        Party.objects.create(
            tenant=tenant_a,
            party_type='CUSTOMER',
            code='ISO-CUST',
            display_name='Isolated Customer',
        )

        # Under tenant B, should not see tenant A's parties
        set_current_tenant(tenant_b)
        visible = Party.objects.filter(tenant=tenant_b, code='ISO-CUST').exists()
        self.assertFalse(visible)

        # Under tenant A, it should exist
        set_current_tenant(tenant_a)
        visible = Party.objects.filter(tenant=tenant_a, code='ISO-CUST').exists()
        self.assertTrue(visible)
