# apps/approvals/tests/test_approvals.py
"""
Comprehensive tests for the approval system.

Covers:
- ApprovalService: configurable thresholds, po_send, price_list, expired approvals
- ApprovalRequestViewSet API: my-pending, my-all, approve, reject
- Token views: one-click approve/reject, invalid token
"""
import uuid
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.tenants.models import Tenant, TenantSettings
from apps.parties.models import Party, Customer, Vendor, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import PurchaseOrder, PurchaseOrderLine, SalesOrder, SalesOrderLine
from apps.approvals.models import ApprovalRequest
from apps.approvals.services import ApprovalService
from apps.pricing.models import PriceListHead
from shared.managers import set_current_tenant
from users.models import User


class ApprovalTestBase(TestCase):
    """Shared fixtures for all approval tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Threshold Co', subdomain='test-thresh')
        cls.user = User.objects.create_user(username='thresh_user', password='pass')
        cls.approver = User.objects.create_user(username='thresh_approver', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea2', name='Each2')

        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='TC1', display_name='Threshold Customer',
        )
        cls.cust_location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Ship To', address_line1='1 Main', city='Chicago', state='IL', postal_code='60601',
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant, party=cls.cust_party, credit_limit=Decimal('10000.00'),
        )

        cls.vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='TV1', display_name='Threshold Vendor',
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.vend_party)

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='THRESH-001', name='Threshold Widget', base_uom=cls.uom,
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.svc = ApprovalService(self.tenant, self.user)
        # Ensure tenant settings exist with defaults
        TenantSettings.objects.get_or_create(
            tenant=self.tenant,
            defaults={
                'approval_po_amount_threshold': Decimal('5000.00'),
                'approval_so_margin_threshold': Decimal('0.1500'),
                'approval_price_list_enabled': False,
                'approval_po_send_enabled': False,
            }
        )

    def _make_po(self, unit_cost=Decimal('100.00'), qty=10):
        po = PurchaseOrder.objects.create(
            tenant=self.tenant, vendor=self.vendor,
            po_number=f'PO-THRESH-{PurchaseOrder.objects.count() + 1:06d}',
            order_date=timezone.now().date(), status='draft',
            ship_to=self.cust_location,
        )
        PurchaseOrderLine.objects.create(
            tenant=self.tenant, purchase_order=po, line_number=10,
            item=self.item, quantity_ordered=qty, uom=self.uom,
            unit_cost=unit_cost,
        )
        return po

    def _make_so(self, unit_price=Decimal('10.00'), qty=50):
        so = SalesOrder.objects.create(
            tenant=self.tenant, customer=self.customer,
            order_number=f'SO-THRESH-{SalesOrder.objects.count() + 1:06d}',
            order_date=timezone.now().date(), status='draft',
            ship_to=self.cust_location,
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=10,
            item=self.item, quantity_ordered=qty, uom=self.uom,
            unit_price=unit_price,
        )
        return so

    def _make_pending_po_approval(self):
        po = self._make_po(unit_cost=Decimal('600.00'), qty=10)  # 6000 > 5000
        _, approvals = self.svc.submit_for_approval(po)
        return po, approvals[0]


# ---------------------------------------------------------------------------
# Service Tests
# ---------------------------------------------------------------------------

class ApprovalServiceTests(ApprovalTestBase):
    """Tests for ApprovalService business logic."""

    # --- PO threshold ---

    def test_po_below_threshold_no_approval(self):
        """PO under threshold does not trigger approval."""
        po = self._make_po(unit_cost=Decimal('10.00'), qty=10)  # 100 < 5000
        needs, approvals = self.svc.submit_for_approval(po)
        self.assertFalse(needs)
        self.assertEqual(len(approvals), 0)
        po.refresh_from_db()
        self.assertNotEqual(po.status, 'pending_approval')

    def test_po_above_threshold_triggers_approval(self):
        """PO over threshold creates ApprovalRequest and sets order to pending_approval."""
        po = self._make_po(unit_cost=Decimal('600.00'), qty=10)  # 6000 > 5000
        needs, approvals = self.svc.submit_for_approval(po)
        self.assertTrue(needs)
        self.assertEqual(len(approvals), 1)
        self.assertEqual(approvals[0].status, 'pending')
        self.assertEqual(approvals[0].rule_code, 'po_amount_threshold')
        po.refresh_from_db()
        self.assertEqual(po.status, 'pending_approval')

    # --- SO margin ---

    @patch('apps.notifications.services.notify_user')
    def test_so_low_margin_triggers_approval(self, mock_notify):
        """SO with margin below threshold triggers approval.

        We need a PO line for item cost so the service can compute margin.
        The SO sells at $10/unit with item cost $9/unit => margin ~10% < 15%.
        """
        # Establish item cost via a PO line
        cost_po = self._make_po(unit_cost=Decimal('9.00'), qty=10)

        so = self._make_so(unit_price=Decimal('10.00'), qty=50)  # margin ~10%
        needs, approvals = self.svc.submit_for_approval(so)
        self.assertTrue(needs)
        codes = [a.rule_code for a in approvals]
        self.assertIn('so_low_margin', codes)

    @patch('apps.notifications.services.notify_user')
    def test_so_above_margin_no_approval(self, mock_notify):
        """SO with healthy margin does not trigger margin approval."""
        # Item cost via PO line: $1/unit, SO price $10/unit => 90% margin
        cost_po = self._make_po(unit_cost=Decimal('1.00'), qty=10)

        self.customer.credit_limit = Decimal('999999.00')
        self.customer.save()

        so = self._make_so(unit_price=Decimal('10.00'), qty=10)
        rules = self.svc.check_order_needs_approval(so)
        codes = [r['rule_code'] for r in rules]
        self.assertNotIn('so_low_margin', codes)

    def test_credit_limit_exceeded_triggers_approval(self):
        """SO that pushes customer over credit limit triggers credit_limit_exceeded rule."""
        self.customer.credit_limit = Decimal('100.00')
        self.customer.save()
        so = self._make_so(unit_price=Decimal('10.00'), qty=50)  # 500 > 100
        rules = self.svc.check_order_needs_approval(so)
        codes = [r['rule_code'] for r in rules]
        self.assertIn('credit_limit_exceeded', codes)

    # --- approve/reject lifecycle ---

    @patch('apps.notifications.services.notify_user')
    def test_approve_sets_status_approved(self, mock_notify):
        """Approving sets status to approved and records decided_at."""
        po, approval = self._make_pending_po_approval()
        result = self.svc.approve(approval_id=approval.id, user=self.approver)
        self.assertEqual(result.status, 'approved')
        self.assertIsNotNone(result.decided_at)

    @patch('apps.notifications.services.notify_user')
    def test_approve_all_confirms_order(self, mock_notify):
        """When all approvals for an order are approved, order moves to confirmed."""
        po, approval = self._make_pending_po_approval()
        self.svc.approve(approval_id=approval.id, user=self.approver)
        po.refresh_from_db()
        self.assertEqual(po.status, 'confirmed')

    @patch('apps.notifications.services.notify_user')
    def test_reject_sets_order_back_to_draft(self, mock_notify):
        """Rejecting an approval sets the order back to draft."""
        po, approval = self._make_pending_po_approval()
        self.svc.reject(approval_id=approval.id, user=self.approver, note='Too costly')
        po.refresh_from_db()
        self.assertEqual(po.status, 'draft')
        approval.refresh_from_db()
        self.assertEqual(approval.status, 'rejected')
        self.assertEqual(approval.decision_note, 'Too costly')

    def test_expired_approval_cannot_be_approved(self):
        """Approving an expired approval raises ValidationError."""
        po, approval = self._make_pending_po_approval()
        # Force expiry
        approval.expires_at = timezone.now() - timedelta(hours=1)
        approval.save(update_fields=['expires_at'])

        with self.assertRaises(ValidationError):
            self.svc.approve(approval_id=approval.id, user=self.approver)

        approval.refresh_from_db()
        self.assertEqual(approval.status, 'expired')

    def test_duplicate_approval_not_created(self):
        """Calling submit_for_approval twice for the same rule/order reuses the existing pending."""
        po = self._make_po(unit_cost=Decimal('600.00'), qty=10)
        _, approvals1 = self.svc.submit_for_approval(po)
        _, approvals2 = self.svc.submit_for_approval(po)
        self.assertEqual(approvals1[0].pk, approvals2[0].pk)
        self.assertEqual(
            ApprovalRequest.objects.filter(
                object_id=po.pk, rule_code='po_amount_threshold', status='pending'
            ).count(),
            1,
        )

    # --- Configurable thresholds ---

    def test_configurable_threshold_from_settings(self):
        """Custom threshold from TenantSettings is used instead of default."""
        settings = self.tenant.settings
        settings.approval_po_amount_threshold = Decimal('1000.00')
        settings.save()

        try:
            po = self._make_po(unit_cost=Decimal('200.00'), qty=10)  # 2000 > 1000
            rules = self.svc.check_order_needs_approval(po)
            codes = [r['rule_code'] for r in rules]
            self.assertIn('po_amount_threshold', codes)
        finally:
            settings.approval_po_amount_threshold = Decimal('5000.00')
            settings.save()

    def test_disabled_threshold_skips_check(self):
        """Null threshold disables the PO amount rule entirely."""
        settings = self.tenant.settings
        settings.approval_po_amount_threshold = None
        settings.save()

        try:
            po = self._make_po(unit_cost=Decimal('1000.00'), qty=100)  # 100000, would normally trigger
            rules = self.svc.check_order_needs_approval(po)
            codes = [r['rule_code'] for r in rules]
            self.assertNotIn('po_amount_threshold', codes)
        finally:
            settings.approval_po_amount_threshold = Decimal('5000.00')
            settings.save()

    # --- PO send approval ---

    def test_po_send_approval_when_enabled(self):
        """check_po_send_needs_approval creates approval when setting is enabled."""
        settings = self.tenant.settings
        settings.approval_po_send_enabled = True
        settings.save()

        try:
            po = self._make_po(unit_cost=Decimal('100.00'), qty=5)
            needs, approvals = self.svc.check_po_send_needs_approval(po)
            self.assertTrue(needs)
            self.assertEqual(len(approvals), 1)
            self.assertEqual(approvals[0].rule_code, 'po_send_approval')
        finally:
            settings.approval_po_send_enabled = False
            settings.save()

    def test_po_send_approval_when_disabled(self):
        """check_po_send_needs_approval skips approval when setting is disabled."""
        settings = self.tenant.settings
        settings.approval_po_send_enabled = False
        settings.save()

        po = self._make_po(unit_cost=Decimal('100.00'), qty=5)
        needs, approvals = self.svc.check_po_send_needs_approval(po)
        self.assertFalse(needs)
        self.assertEqual(len(approvals), 0)

    # --- Price list approval ---

    def test_price_list_approval_when_enabled(self):
        """check_price_list_needs_approval creates approval when setting is enabled."""
        settings = self.tenant.settings
        settings.approval_price_list_enabled = True
        settings.save()

        price_list = PriceListHead.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            item=self.item,
            begin_date=timezone.now().date(),
        )

        try:
            needs, approvals = self.svc.check_price_list_needs_approval(price_list)
            self.assertTrue(needs)
            self.assertEqual(len(approvals), 1)
            self.assertEqual(approvals[0].rule_code, 'price_list_approval')
        finally:
            settings.approval_price_list_enabled = False
            settings.save()
            price_list.delete()


# ---------------------------------------------------------------------------
# API Tests
# ---------------------------------------------------------------------------

class ApprovalAPITestBase(ApprovalTestBase):
    """Base with authenticated API client.

    Sets is_default=True on the test tenant so TenantMiddleware resolves it
    via Strategy 3 (default tenant fallback), matching the pattern used by
    other API test cases (e.g. RFQTestCase).
    """

    def setUp(self):
        super().setUp()
        self.tenant.is_default = True
        self.tenant.save(update_fields=['is_default'])
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        self.tenant.is_default = False
        self.tenant.save(update_fields=['is_default'])
        super().tearDown()


class ApprovalAPITests(ApprovalAPITestBase):
    """Tests for ApprovalRequestViewSet endpoints."""

    @patch('apps.notifications.services.notify_user')
    def test_my_pending_returns_only_pending(self, mock_notify):
        """GET /api/v1/approvals/my-pending/ returns only pending approvals."""
        po, approval = self._make_pending_po_approval()

        # Create and approve a second one so it no longer shows as pending
        po2, approval2 = self._make_pending_po_approval()
        self.svc.approve(approval_id=approval2.id, user=self.approver)

        response = self.client.get('/api/v1/approvals/my-pending/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        returned_ids = [item['id'] for item in response.data]
        self.assertIn(approval.id, returned_ids)
        self.assertNotIn(approval2.id, returned_ids)

    @patch('apps.notifications.services.notify_user')
    def test_my_all_returns_all_statuses(self, mock_notify):
        """GET /api/v1/approvals/my-all/ returns approvals of all statuses."""
        po, approval_pending = self._make_pending_po_approval()
        po2, approval_approved = self._make_pending_po_approval()
        self.svc.approve(approval_id=approval_approved.id, user=self.approver)

        response = self.client.get('/api/v1/approvals/my-all/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        returned_ids = [item['id'] for item in response.data]
        self.assertIn(approval_pending.id, returned_ids)
        self.assertIn(approval_approved.id, returned_ids)

    @patch('apps.notifications.services.notify_user')
    def test_my_all_with_status_filter(self, mock_notify):
        """GET /api/v1/approvals/my-all/?status=approved returns only approved."""
        po, approval_pending = self._make_pending_po_approval()
        po2, approval_approved = self._make_pending_po_approval()
        self.svc.approve(approval_id=approval_approved.id, user=self.approver)

        response = self.client.get('/api/v1/approvals/my-all/?status=approved')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        returned_ids = [item['id'] for item in response.data]
        self.assertIn(approval_approved.id, returned_ids)
        self.assertNotIn(approval_pending.id, returned_ids)

    @patch('apps.notifications.services.notify_user')
    def test_approve_via_api(self, mock_notify):
        """POST /api/v1/approvals/{id}/approve/ approves the request."""
        po, approval = self._make_pending_po_approval()

        response = self.client.post(
            f'/api/v1/approvals/{approval.id}/approve/',
            {'note': 'API approved'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'approved')

        approval.refresh_from_db()
        self.assertEqual(approval.status, 'approved')

    @patch('apps.notifications.services.notify_user')
    def test_reject_via_api(self, mock_notify):
        """POST /api/v1/approvals/{id}/reject/ rejects with note."""
        po, approval = self._make_pending_po_approval()

        response = self.client.post(
            f'/api/v1/approvals/{approval.id}/reject/',
            {'note': 'Not justified'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'rejected')

        approval.refresh_from_db()
        self.assertEqual(approval.status, 'rejected')
        self.assertEqual(approval.decision_note, 'Not justified')

    @patch('apps.notifications.services.notify_user')
    def test_approve_already_approved_returns_400(self, mock_notify):
        """POST approve on already-approved approval returns 400."""
        po, approval = self._make_pending_po_approval()
        # Approve once via service
        self.svc.approve(approval_id=approval.id, user=self.approver)

        response = self.client.post(
            f'/api/v1/approvals/{approval.id}/approve/',
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class TokenApprovalAPITests(ApprovalTestBase):
    """Tests for token-based one-click approve/reject views (unauthenticated)."""

    def setUp(self):
        super().setUp()
        # Token views use AllowAny but TenantMiddleware still runs.
        # Set is_default=True so the middleware resolves this tenant via Strategy 3.
        self.tenant.is_default = True
        self.tenant.save(update_fields=['is_default'])
        self.client = APIClient()

    def tearDown(self):
        self.tenant.is_default = False
        self.tenant.save(update_fields=['is_default'])
        super().tearDown()

    @patch('apps.notifications.services.notify_user')
    def test_token_approve(self, mock_notify):
        """GET /api/v1/approvals/token/{uuid}/approve/ returns HTML success."""
        po, approval = self._make_pending_po_approval()

        response = self.client.get(
            f'/api/v1/approvals/token/{approval.token}/approve/'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/html', response['Content-Type'])
        self.assertIn(b'Approved', response.content)

        approval.refresh_from_db()
        self.assertEqual(approval.status, 'approved')

    @patch('apps.notifications.services.notify_user')
    def test_token_reject(self, mock_notify):
        """GET /api/v1/approvals/token/{uuid}/reject/ returns HTML success."""
        po, approval = self._make_pending_po_approval()

        response = self.client.get(
            f'/api/v1/approvals/token/{approval.token}/reject/'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/html', response['Content-Type'])
        self.assertIn(b'Rejected', response.content)

        approval.refresh_from_db()
        self.assertEqual(approval.status, 'rejected')

    def test_invalid_token_returns_404(self):
        """GET with an invalid UUID token returns 404 HTML."""
        fake_token = uuid.uuid4()
        response = self.client.get(
            f'/api/v1/approvals/token/{fake_token}/approve/'
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn('text/html', response['Content-Type'])

    def test_invalid_token_reject_returns_404(self):
        """GET reject with an invalid UUID token returns 404 HTML."""
        fake_token = uuid.uuid4()
        response = self.client.get(
            f'/api/v1/approvals/token/{fake_token}/reject/'
        )
        self.assertEqual(response.status_code, 404)
