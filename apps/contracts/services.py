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

        # Validate contract date range
        today = timezone.now().date()
        if contract.start_date and today < contract.start_date:
            raise ValidationError(
                f"Contract has not started yet (start date: {contract.start_date})."
            )
        if contract.end_date and today > contract.end_date:
            raise ValidationError(
                f"Contract has expired (end date: {contract.end_date})."
            )

        # Block over-release
        remaining = contract_line.remaining_qty
        if quantity > remaining:
            raise ValidationError(
                f"Release quantity ({quantity}) exceeds remaining balance ({remaining}) "
                f"on contract line {contract_line.line_number}."
            )

        # Pre-validate release
        validation = self.validate_release(contract_line, quantity)
        if not validation['valid']:
            raise ValidationError(validation['message'])

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

            return sales_order, release

    def create_multi_line_release(self, release_lines, ship_to=None, scheduled_date=None, notes='', customer_po=''):
        """
        Create a sales order release drawing from multiple contract lines.

        Args:
            release_lines: list of dicts with keys:
                - contract_line_id: int
                - quantity: int
                - unit_price: Decimal (optional, falls back to contract line price)
            ship_to: Location instance (optional, resolved from first contract)
            scheduled_date: date (optional)
            notes: str
            customer_po: str

        Returns: SalesOrder
        """
        from apps.orders.models import SalesOrder, SalesOrderLine
        from apps.contracts.models import ContractLine, ContractRelease

        if not release_lines:
            raise ValidationError("At least one release line is required.")

        # Load and validate all contract lines
        contract_line_ids = [rl['contract_line_id'] for rl in release_lines]
        contract_lines = {
            cl.id: cl for cl in ContractLine.objects.select_related(
                'contract', 'contract__customer', 'item', 'uom'
            ).filter(id__in=contract_line_ids, tenant=self.tenant)
        }

        if len(contract_lines) != len(contract_line_ids):
            raise ValidationError("One or more contract lines not found.")

        # Validate all contracts are active and lines have sufficient qty
        customer = None
        for rl in release_lines:
            cl = contract_lines[rl['contract_line_id']]
            contract = cl.contract

            if contract.status != 'active':
                raise ValidationError(
                    f"Contract {contract.contract_number} is not active (status: {contract.status})."
                )

            today = timezone.now().date()
            if contract.start_date and today < contract.start_date:
                raise ValidationError(f"Contract {contract.contract_number} has not started yet.")
            if contract.end_date and today > contract.end_date:
                raise ValidationError(f"Contract {contract.contract_number} has expired.")

            qty = rl['quantity']
            remaining = cl.remaining_qty
            if qty > remaining:
                raise ValidationError(
                    f"Release quantity ({qty}) exceeds remaining ({remaining}) "
                    f"on contract {contract.contract_number} line {cl.line_number}."
                )

            # Ensure all lines are for the same customer
            if customer is None:
                customer = contract.customer
            elif contract.customer_id != customer.id:
                raise ValidationError("All contract lines must belong to the same customer.")

        # Resolve ship_to
        first_contract = contract_lines[release_lines[0]['contract_line_id']].contract
        resolved_ship_to = ship_to or first_contract.ship_to
        if resolved_ship_to is None:
            resolved_ship_to = customer.default_ship_to
        if resolved_ship_to is None:
            raise ValidationError("No ship-to location specified and no default available.")

        with transaction.atomic():
            order_number = self._generate_order_number()

            sales_order = SalesOrder.objects.create(
                tenant=self.tenant,
                customer=customer,
                order_number=order_number,
                order_date=timezone.now().date(),
                ship_to=resolved_ship_to,
                bill_to=customer.default_bill_to,
                customer_po=customer_po or first_contract.blanket_po,
                scheduled_date=scheduled_date,
                notes=notes,
                status='confirmed',
            )

            for idx, rl in enumerate(release_lines):
                cl = contract_lines[rl['contract_line_id']]
                resolved_price = rl.get('unit_price') or cl.unit_price
                if resolved_price is None:
                    raise ValidationError(
                        f"No price for contract line {cl.line_number} on contract {cl.contract.contract_number}."
                    )

                so_line = SalesOrderLine.objects.create(
                    tenant=self.tenant,
                    sales_order=sales_order,
                    line_number=(idx + 1) * 10,
                    item=cl.item,
                    quantity_ordered=rl['quantity'],
                    uom=cl.uom,
                    unit_price=resolved_price,
                )

                ContractRelease.objects.create(
                    tenant=self.tenant,
                    contract_line=cl,
                    sales_order_line=so_line,
                    quantity_ordered=rl['quantity'],
                    release_date=timezone.now().date(),
                    notes=notes,
                )

            return sales_order

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
