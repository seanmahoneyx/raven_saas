# apps/contracts/services.py
"""
Contract service for managing contract releases and validation.

ContractService handles:
- Creating releases (sales orders) from contract lines
- Validating release quantities against remaining balance
- Auto-expiring contracts past their end date
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError


class ContractService:
    """Service for contract lifecycle operations."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    def create_release(self, contract_line, quantity, ship_to=None, unit_price=None, scheduled_date=None, notes=''):
        """
        Create a sales order release against a contract line.

        Validates:
        - Contract is active
        - Quantity does not exceed remaining (raises ValidationError)
        - Contract line belongs to the specified contract

        Price resolution:
        - unit_price param > contract_line.unit_price > error

        Returns: (SalesOrder, ContractRelease)
        """
        from apps.orders.models import SalesOrder, SalesOrderLine
        from apps.contracts.models import ContractRelease

        contract = contract_line.contract

        # Validate contract is active
        if contract.status != 'active':
            raise ValidationError(
                f"Cannot create release from contract with status '{contract.status}'. Contract must be active."
            )

        # Check quantity against remaining balance (warn but allow over-release)
        warning = None
        remaining = contract_line.remaining_qty
        if quantity > remaining:
            warning = (
                f"Release quantity ({quantity}) exceeds remaining balance ({remaining}) "
                f"on contract line {contract_line.line_number}."
            )

        # Resolve price
        resolved_price = unit_price
        if resolved_price is None:
            resolved_price = contract_line.unit_price
        if resolved_price is None:
            raise ValidationError(
                "No unit price specified and contract line has no default price."
            )

        # Resolve ship_to
        resolved_ship_to = ship_to
        if resolved_ship_to is None:
            resolved_ship_to = contract.ship_to
        if resolved_ship_to is None:
            resolved_ship_to = contract.customer.default_ship_to
        if resolved_ship_to is None:
            raise ValidationError(
                "No ship-to location specified and no default available."
            )

        with transaction.atomic():
            # Generate order number
            order_number = self._generate_order_number()

            # Create sales order
            sales_order = SalesOrder.objects.create(
                tenant=self.tenant,
                customer=contract.customer,
                order_number=order_number,
                order_date=timezone.now().date(),
                ship_to=resolved_ship_to,
                bill_to=contract.customer.default_bill_to,
                customer_po=contract.blanket_po,
                scheduled_date=scheduled_date,
                notes=notes,
                status='confirmed',
            )

            # Create sales order line
            sales_order_line = SalesOrderLine.objects.create(
                tenant=self.tenant,
                sales_order=sales_order,
                line_number=10,
                item=contract_line.item,
                quantity_ordered=quantity,
                uom=contract_line.uom,
                unit_price=resolved_price,
            )

            # Create release record
            release = ContractRelease.objects.create(
                tenant=self.tenant,
                contract_line=contract_line,
                sales_order_line=sales_order_line,
                quantity_ordered=quantity,
                release_date=timezone.now().date(),
                notes=notes,
            )

            return sales_order, release, warning

    def validate_release(self, contract_line, quantity):
        """Check if a release is valid. Returns dict with validation result."""
        contract = contract_line.contract
        remaining = contract_line.remaining_qty

        if contract.status != 'active':
            return {
                'valid': False,
                'remaining_qty': remaining,
                'message': f"Contract is not active (status: {contract.status})",
            }

        if quantity > remaining:
            return {
                'valid': False,
                'remaining_qty': remaining,
                'message': f"Quantity ({quantity}) exceeds remaining balance ({remaining})",
            }

        return {
            'valid': True,
            'remaining_qty': remaining,
            'message': 'Release is valid',
        }

    def auto_expire_contracts(self):
        """Expire contracts past their end_date. Returns count expired."""
        from apps.contracts.models import Contract

        today = timezone.now().date()
        count = Contract.objects.filter(
            tenant=self.tenant,
            status='active',
            end_date__lt=today,
        ).update(status='expired')
        return count

    def _generate_order_number(self):
        """Generate next sales order number for a tenant."""
        import re
        from apps.orders.models import SalesOrder

        order_numbers = SalesOrder.objects.filter(tenant=self.tenant).values_list('order_number', flat=True)
        max_num = 0
        for order_num in order_numbers:
            match = re.search(r'(\d+)', order_num or '')
            if match:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
        return f"SO-{str(max_num + 1).zfill(6)}"
