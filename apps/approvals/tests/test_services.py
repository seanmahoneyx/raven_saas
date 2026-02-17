# apps/approvals/tests/test_services.py
"""
Tests for ApprovalService: check rules, submit_for_approval, approve, reject.
"""
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import PurchaseOrder, PurchaseOrderLine, SalesOrder, SalesOrderLine
from apps.approvals.models import ApprovalRequest
from apps.approvals.services import ApprovalService
from shared.managers import set_current_tenant
from users.models import User


class ApprovalBaseTestCase(TestCase):
    """Base test case for approval tests."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Appr Co', subdomain='test-approvals')
        cls.user = User.objects.create_user(username='appruser', password='pass')
        cls.approver = User.objects.create_user(username='approver', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')

        # Customer
        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='AC1', display_name='Approval Customer',
        )
        cls.cust_location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Ship', address_line1='1 Main', city='Chicago', state='IL', postal_code='60601',
        )
        cls.customer = Customer.objects.create(
            tenant=cls.tenant, party=cls.cust_party, credit_limit=Decimal('10000.00'),
        )

        # Vendor
        cls.vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR', code='AV1', display_name='Approval Vendor',
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=cls.vend_party)

        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='APPR-001', name='Approvable Widget', base_uom=cls.uom,
        )

    def setUp(self):
        set_current_tenant(self.tenant)
        self.svc = ApprovalService(self.tenant, self.user)

    def _make_po(self, unit_cost=Decimal('100.00'), qty=10):
        po = PurchaseOrder.objects.create(
            tenant=self.tenant, vendor=self.vendor,
            po_number=f'PO-{PurchaseOrder.objects.count() + 1:06d}',
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
            order_number=f'SO-{SalesOrder.objects.count() + 1:06d}',
            order_date=timezone.now().date(), status='draft',
            ship_to=self.cust_location,
        )
        SalesOrderLine.objects.create(
            tenant=self.tenant, sales_order=so, line_number=10,
            item=self.item, quantity_ordered=qty, uom=self.uom,
            unit_price=unit_price,
        )
        return so


class CheckPORulesTest(ApprovalBaseTestCase):
    """Tests for PO amount threshold rule."""

    def test_po_below_threshold_no_rules(self):
        po = self._make_po(unit_cost=Decimal('10.00'), qty=10)  # 100 < 5000
        rules = self.svc.check_order_needs_approval(po)
        self.assertEqual(len(rules), 0)

    def test_po_above_threshold_triggers_rule(self):
        po = self._make_po(unit_cost=Decimal('600.00'), qty=10)  # 6000 > 5000
        rules = self.svc.check_order_needs_approval(po)
        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0]['rule_code'], 'po_amount_threshold')

    def test_po_at_threshold_no_rule(self):
        po = self._make_po(unit_cost=Decimal('500.00'), qty=10)  # 5000 == 5000
        rules = self.svc.check_order_needs_approval(po)
        self.assertEqual(len(rules), 0)


class CheckSORulesTest(ApprovalBaseTestCase):
    """Tests for SO margin and credit limit rules."""

    def test_so_credit_limit_exceeded(self):
        # Set low credit limit
        self.customer.credit_limit = Decimal('100.00')
        self.customer.save()
        so = self._make_so(unit_price=Decimal('10.00'), qty=50)  # 500 > 100
        rules = self.svc.check_order_needs_approval(so)
        codes = [r['rule_code'] for r in rules]
        self.assertIn('credit_limit_exceeded', codes)

    def test_so_within_credit_limit(self):
        self.customer.credit_limit = Decimal('100000.00')
        self.customer.save()
        so = self._make_so(unit_price=Decimal('10.00'), qty=10)  # 100 < 100000
        rules = self.svc.check_order_needs_approval(so)
        codes = [r['rule_code'] for r in rules]
        self.assertNotIn('credit_limit_exceeded', codes)

    def test_so_no_credit_limit_skips_check(self):
        self.customer.credit_limit = None
        self.customer.save()
        so = self._make_so(unit_price=Decimal('10.00'), qty=50)
        rules = self.svc.check_order_needs_approval(so)
        codes = [r['rule_code'] for r in rules]
        self.assertNotIn('credit_limit_exceeded', codes)


class SubmitForApprovalTest(ApprovalBaseTestCase):
    """Tests for submit_for_approval."""

    def test_submit_no_rules_triggered(self):
        po = self._make_po(unit_cost=Decimal('10.00'), qty=5)  # 50 < 5000
        needs_approval, approvals = self.svc.submit_for_approval(po)
        self.assertFalse(needs_approval)
        self.assertEqual(len(approvals), 0)

    def test_submit_creates_approval_request(self):
        po = self._make_po(unit_cost=Decimal('600.00'), qty=10)  # 6000 > 5000
        needs_approval, approvals = self.svc.submit_for_approval(po)
        self.assertTrue(needs_approval)
        self.assertEqual(len(approvals), 1)
        self.assertEqual(approvals[0].status, 'pending')
        po.refresh_from_db()
        self.assertEqual(po.status, 'pending_approval')

    def test_submit_idempotent(self):
        po = self._make_po(unit_cost=Decimal('600.00'), qty=10)
        _, approvals1 = self.svc.submit_for_approval(po)
        _, approvals2 = self.svc.submit_for_approval(po)
        # Should reuse existing pending approval
        self.assertEqual(approvals1[0].pk, approvals2[0].pk)


class ApproveRejectTest(ApprovalBaseTestCase):
    """Tests for approve and reject."""

    def _make_pending_approval(self):
        po = self._make_po(unit_cost=Decimal('600.00'), qty=10)
        _, approvals = self.svc.submit_for_approval(po)
        return po, approvals[0]

    @patch('apps.notifications.services.notify_user')
    def test_approve_by_id(self, mock_notify):
        po, approval = self._make_pending_approval()
        result = self.svc.approve(approval_id=approval.id, user=self.approver, note='Looks good')
        self.assertEqual(result.status, 'approved')
        self.assertEqual(result.approver, self.approver)
        self.assertIsNotNone(result.decided_at)

    @patch('apps.notifications.services.notify_user')
    def test_approve_by_token(self, mock_notify):
        po, approval = self._make_pending_approval()
        result = self.svc.approve(token=approval.token, user=self.approver)
        self.assertEqual(result.status, 'approved')

    @patch('apps.notifications.services.notify_user')
    def test_approve_confirms_order(self, mock_notify):
        po, approval = self._make_pending_approval()
        self.svc.approve(approval_id=approval.id, user=self.approver)
        po.refresh_from_db()
        self.assertEqual(po.status, 'confirmed')

    @patch('apps.notifications.services.notify_user')
    def test_reject_by_id(self, mock_notify):
        po, approval = self._make_pending_approval()
        result = self.svc.reject(approval_id=approval.id, user=self.approver, note='Too expensive')
        self.assertEqual(result.status, 'rejected')
        self.assertEqual(result.decision_note, 'Too expensive')

    @patch('apps.notifications.services.notify_user')
    def test_reject_reverts_order_to_draft(self, mock_notify):
        po, approval = self._make_pending_approval()
        self.svc.reject(approval_id=approval.id, user=self.approver)
        po.refresh_from_db()
        self.assertEqual(po.status, 'draft')

    @patch('apps.notifications.services.notify_user')
    def test_approve_already_approved_raises(self, mock_notify):
        po, approval = self._make_pending_approval()
        self.svc.approve(approval_id=approval.id, user=self.approver)
        with self.assertRaises(ValidationError):
            self.svc.approve(approval_id=approval.id, user=self.approver)

    def test_approve_invalid_token_raises(self):
        import uuid
        with self.assertRaises(ValidationError):
            self.svc.approve(token=uuid.uuid4())

    def test_approve_no_id_or_token_raises(self):
        with self.assertRaises(ValidationError):
            self.svc.approve()


class GetPendingApprovalsTest(ApprovalBaseTestCase):
    """Tests for get_pending_approvals classmethod."""

    def test_get_pending_returns_pending(self):
        po = self._make_po(unit_cost=Decimal('600.00'), qty=10)
        self.svc.submit_for_approval(po)
        pending = ApprovalService.get_pending_approvals(self.tenant, self.user)
        self.assertTrue(pending.count() >= 1)

    @patch('apps.notifications.services.notify_user')
    def test_get_pending_excludes_approved(self, mock_notify):
        po = self._make_po(unit_cost=Decimal('600.00'), qty=10)
        _, approvals = self.svc.submit_for_approval(po)
        self.svc.approve(approval_id=approvals[0].id, user=self.approver)
        pending = ApprovalService.get_pending_approvals(self.tenant, self.user)
        ids = list(pending.values_list('id', flat=True))
        self.assertNotIn(approvals[0].id, ids)
