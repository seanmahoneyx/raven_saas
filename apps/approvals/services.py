"""
Approval workflow rules engine.

Evaluates orders against business rules and creates approval requests
when thresholds are exceeded.
"""
import logging
from decimal import Decimal
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.utils import timezone

from .models import ApprovalRequest

logger = logging.getLogger(__name__)


class ApprovalService:
    """
    Service for evaluating approval rules and managing approval requests.

    Rules:
    1. PO Amount Threshold: PO subtotal > $5,000 requires approval
    2. SO Low Margin: SO gross margin < 15% requires approval
    3. Credit Limit: SO would push customer over credit limit
    """

    # Configurable thresholds (could be moved to DB settings later)
    PO_AMOUNT_THRESHOLD = Decimal('5000.00')
    SO_MARGIN_THRESHOLD = Decimal('0.15')  # 15%

    def __init__(self, tenant, user):
        self.tenant = tenant
        self.user = user

    def check_order_needs_approval(self, order):
        """
        Check if an order needs approval. Returns list of triggered rules.

        Each rule is a dict: {'rule_code': str, 'description': str, 'amount': Decimal}
        """
        from apps.orders.models import PurchaseOrder, SalesOrder

        triggered_rules = []

        if isinstance(order, PurchaseOrder):
            triggered_rules.extend(self._check_po_rules(order))
        elif isinstance(order, SalesOrder):
            triggered_rules.extend(self._check_so_rules(order))

        return triggered_rules

    def _check_po_rules(self, po):
        """Check purchase order rules."""
        rules = []
        subtotal = po.subtotal  # This is a @property that sums line_total

        if subtotal > self.PO_AMOUNT_THRESHOLD:
            rules.append({
                'rule_code': 'po_amount_threshold',
                'description': f'PO {po.po_number} subtotal ${subtotal:,.2f} exceeds ${self.PO_AMOUNT_THRESHOLD:,.2f} threshold',
                'amount': subtotal,
            })

        return rules

    def _check_so_rules(self, so):
        """Check sales order rules."""
        rules = []
        subtotal = so.subtotal  # @property summing line.line_total (price-based)

        # Rule: Low margin check
        # Calculate cost from PO lines or item cost
        total_cost = Decimal('0')
        for line in so.lines.select_related('item').all():
            # Use item's latest cost if available
            item_cost = self._get_item_cost(line.item)
            total_cost += item_cost * line.quantity_ordered

        if subtotal > 0:
            margin = (subtotal - total_cost) / subtotal
            if margin < self.SO_MARGIN_THRESHOLD:
                margin_pct = margin * 100
                rules.append({
                    'rule_code': 'so_low_margin',
                    'description': f'SO {so.order_number} margin {margin_pct:.1f}% is below {self.SO_MARGIN_THRESHOLD * 100:.0f}% threshold',
                    'amount': subtotal,
                })

        # Rule: Credit limit check
        customer = so.customer
        if customer.credit_limit is not None:
            outstanding = self._get_customer_outstanding(customer)
            if (outstanding + subtotal) > customer.credit_limit:
                rules.append({
                    'rule_code': 'credit_limit_exceeded',
                    'description': f'SO {so.order_number} would push {customer.party.display_name} over credit limit (${customer.credit_limit:,.2f}). Outstanding: ${outstanding:,.2f}, Order: ${subtotal:,.2f}',
                    'amount': subtotal,
                })

        return rules

    def _get_item_cost(self, item):
        """Get the latest cost for an item from cost lists or purchase order lines."""
        # Try to get from the most recent PO line
        from apps.orders.models import PurchaseOrderLine
        latest_po_line = PurchaseOrderLine.objects.filter(
            item=item
        ).order_by('-purchase_order__order_date').first()

        if latest_po_line:
            return latest_po_line.unit_cost

        # Fallback: check cost lists
        from apps.costing.models import CostListLine
        cost_line = CostListLine.objects.filter(
            item=item, cost_list__is_active=True
        ).order_by('-cost_list__effective_date').first()

        if cost_line:
            return cost_line.unit_cost

        return Decimal('0')

    def _get_customer_outstanding(self, customer):
        """Calculate total outstanding invoices for a customer."""
        from apps.invoicing.models import Invoice
        from django.db.models import Sum

        result = Invoice.objects.filter(
            customer=customer,
            status__in=['sent', 'partial', 'overdue'],
        ).aggregate(total=Sum('total_amount'))

        return result['total'] or Decimal('0')

    def create_approval_request(self, order, rule):
        """
        Create an ApprovalRequest for an order that triggered a rule.
        Sets order status to 'pending_approval'.
        """
        ct = ContentType.objects.get_for_model(order)

        # Check if there's already a pending approval for this order + rule
        existing = ApprovalRequest.objects.filter(
            content_type=ct,
            object_id=order.pk,
            rule_code=rule['rule_code'],
            status='pending',
        ).first()

        if existing:
            return existing

        approval = ApprovalRequest.objects.create(
            tenant=self.tenant,
            content_type=ct,
            object_id=order.pk,
            rule_code=rule['rule_code'],
            rule_description=rule['description'],
            requestor=self.user,
            amount=rule.get('amount'),
        )

        # Set order to pending_approval
        order.status = 'pending_approval'
        order.save(update_fields=['status'])

        logger.info('Approval request created: %s for %s', approval, order)
        return approval

    def submit_for_approval(self, order):
        """
        Main entry point: check rules and create approval requests if needed.
        Returns (needs_approval: bool, approvals: list[ApprovalRequest])
        """
        triggered_rules = self.check_order_needs_approval(order)

        if not triggered_rules:
            return False, []

        approvals = []
        for rule in triggered_rules:
            approval = self.create_approval_request(order, rule)
            approvals.append(approval)

        return True, approvals

    def approve(self, approval_id=None, token=None, user=None, note=''):
        """
        Approve an approval request (by ID or token).
        If all approvals for an order are approved, set order back to 'confirmed'.
        """
        approval = self._get_approval(approval_id, token)

        if approval.status != 'pending':
            raise ValidationError(f'Approval is already {approval.status}')

        if approval.is_expired:
            approval.status = 'expired'
            approval.save(update_fields=['status'])
            raise ValidationError('Approval has expired')

        approval.status = 'approved'
        approval.approver = user or self.user
        approval.decided_at = timezone.now()
        approval.decision_note = note
        approval.save(update_fields=['status', 'approver', 'decided_at', 'decision_note'])

        # Check if all approvals for this order are now approved
        self._check_all_approved(approval)

        # Send notification to requestor
        from apps.notifications.services import notify_user
        notify_user(
            tenant=self.tenant,
            recipient=approval.requestor,
            title='Approval Granted',
            message=f'{approval.rule_description} - Approved by {approval.approver.get_full_name() or approval.approver.username}',
            link=self._get_order_link(approval),
            notification_type='SUCCESS',
        )

        logger.info('Approval %s approved by %s', approval.id, approval.approver)
        return approval

    def reject(self, approval_id=None, token=None, user=None, note=''):
        """
        Reject an approval request (by ID or token).
        Sets order back to 'draft'.
        """
        approval = self._get_approval(approval_id, token)

        if approval.status != 'pending':
            raise ValidationError(f'Approval is already {approval.status}')

        if approval.is_expired:
            approval.status = 'expired'
            approval.save(update_fields=['status'])
            raise ValidationError('Approval has expired')

        approval.status = 'rejected'
        approval.approver = user or self.user
        approval.decided_at = timezone.now()
        approval.decision_note = note
        approval.save(update_fields=['status', 'approver', 'decided_at', 'decision_note'])

        # Set order back to draft
        order = approval.content_object
        if order and hasattr(order, 'status'):
            order.status = 'draft'
            order.save(update_fields=['status'])

        # Notify requestor
        from apps.notifications.services import notify_user
        rejector_name = approval.approver.get_full_name() or approval.approver.username
        notify_user(
            tenant=self.tenant,
            recipient=approval.requestor,
            title='Approval Rejected',
            message=f'{approval.rule_description} - Rejected by {rejector_name}' + (f': {note}' if note else ''),
            link=self._get_order_link(approval),
            notification_type='WARNING',
        )

        logger.info('Approval %s rejected by %s', approval.id, approval.approver)
        return approval

    def _get_approval(self, approval_id=None, token=None):
        """Fetch approval by ID or token."""
        if token:
            try:
                return ApprovalRequest.objects.get(token=token)
            except ApprovalRequest.DoesNotExist:
                raise ValidationError('Invalid approval token')
        elif approval_id:
            try:
                return ApprovalRequest.objects.get(pk=approval_id)
            except ApprovalRequest.DoesNotExist:
                raise ValidationError('Approval request not found')
        else:
            raise ValidationError('Must provide approval_id or token')

    def _check_all_approved(self, approval):
        """If all pending approvals for this order are approved, confirm the order."""
        pending_count = ApprovalRequest.objects.filter(
            content_type=approval.content_type,
            object_id=approval.object_id,
            status='pending',
        ).count()

        if pending_count == 0:
            order = approval.content_object
            if order and hasattr(order, 'status') and order.status == 'pending_approval':
                order.status = 'confirmed'
                order.save(update_fields=['status'])
                logger.info('All approvals cleared - order %s confirmed', order)

    def _get_order_link(self, approval):
        """Generate frontend link for the order."""
        from apps.orders.models import PurchaseOrder, SalesOrder
        order = approval.content_object
        if isinstance(order, PurchaseOrder):
            return f'/purchase-orders/{order.pk}'
        elif isinstance(order, SalesOrder):
            return f'/orders/{order.pk}'
        return ''

    @classmethod
    def get_pending_approvals(cls, tenant, user):
        """Get all pending approvals assigned to a user (or unassigned)."""
        from django.db.models import Q
        return ApprovalRequest.objects.filter(
            Q(approver=user) | Q(approver__isnull=True),
            tenant=tenant,
            status='pending',
            expires_at__gt=timezone.now(),
        ).select_related('requestor', 'content_type').order_by('-created_at')
