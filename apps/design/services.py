"""
Design module services.

DesignService: Handles design request lifecycle and promotion to Item catalog.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone


class DesignService:
    """Service for design request operations."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    @transaction.atomic
    def promote_to_item(self, design_request, sku, base_uom, **overrides):
        """
        Promote an approved DesignRequest into a real Item.

        Creates the appropriate Item subtype (RSCItem, DCItem, etc.) based on
        the design's style field, copies spec fields, and links back.

        Args:
            design_request: DesignRequest instance (must be status='approved')
            sku: SKU for the new item
            base_uom: UnitOfMeasure instance
            **overrides: Additional Item field overrides

        Returns:
            The created Item (or subtype) instance

        Raises:
            ValueError: If design is not approved or already promoted
        """
        from apps.design.models import DesignRequest
        from apps.items.models import Item, CorrugatedItem, DCItem, RSCItem, HSCItem, FOLItem, TeleItem

        if design_request.status != 'approved':
            raise ValueError(f'Design request must be approved to promote (current: {design_request.status})')

        if design_request.generated_item is not None:
            raise ValueError(f'Design request {design_request.file_number} has already been promoted')

        # Determine which Item subtype to create based on style
        style = (design_request.style or '').upper().strip()

        # Common fields for all item types
        common = {
            'tenant': self.tenant,
            'sku': sku,
            'name': design_request.ident or design_request.file_number,
            'division': 'corrugated',
            'description': design_request.notes or '',
            'base_uom': base_uom,
            'customer': design_request.customer,
            'is_inventory': True,
            'is_active': True,
        }
        common.update(overrides)

        # Corrugated spec fields
        corr_fields = {
            'test': design_request.test or '',
            'flute': design_request.flute or '',
            'paper': design_request.paper or '',
        }

        # Dimension fields
        dims = {}
        if design_request.length:
            dims['length'] = design_request.length
        if design_request.width:
            dims['width'] = design_request.width

        # Create the right subtype
        if style == 'DC':
            item = DCItem.objects.create(**common, **corr_fields, **dims)
        elif style == 'RSC':
            height_dims = {**dims}
            if design_request.depth:
                height_dims['height'] = design_request.depth
            item = RSCItem.objects.create(**common, **corr_fields, **height_dims)
        elif style == 'HSC':
            height_dims = {**dims}
            if design_request.depth:
                height_dims['height'] = design_request.depth
            item = HSCItem.objects.create(**common, **corr_fields, **height_dims)
        elif style == 'FOL':
            height_dims = {**dims}
            if design_request.depth:
                height_dims['height'] = design_request.depth
            item = FOLItem.objects.create(**common, **corr_fields, **height_dims)
        elif style == 'TELE':
            height_dims = {**dims}
            if design_request.depth:
                height_dims['height'] = design_request.depth
            item = TeleItem.objects.create(**common, **corr_fields, **height_dims)
        else:
            # Generic corrugated item (no specific box dimensions)
            item = CorrugatedItem.objects.create(**common, **corr_fields)

        # Link design request to the generated item and mark completed
        # Use filter().update() pattern to avoid triggering any save() side effects
        DesignRequest.objects.filter(pk=design_request.pk).update(
            generated_item=item,
            status='completed',
        )

        # Refresh the instance so caller sees updated fields
        design_request.refresh_from_db()

        return item

    @transaction.atomic
    def create_estimate_from_design(self, design_request, customer=None, quantity=1, unit_price=None, notes=''):
        """
        Create an Estimate from a completed/approved DesignRequest.

        The design must have a generated_item (i.e., already promoted to item).
        Creates an estimate with a single line for the item.

        Args:
            design_request: DesignRequest instance (must have generated_item)
            customer: Customer instance (defaults to design_request.customer)
            quantity: Quantity for the estimate line
            unit_price: Unit price (defaults to '0.00' if not set)
            notes: Additional notes

        Returns:
            Estimate instance

        Raises:
            ValueError: If design has no generated item
        """
        from apps.orders.models import Estimate, EstimateLine
        from apps.items.models import UnitOfMeasure
        import re

        if not design_request.generated_item:
            raise ValueError(
                f"Design request {design_request.file_number} has not been promoted to an item yet. "
                "Promote the design first, then create an estimate."
            )

        item = design_request.generated_item
        resolved_customer = customer or design_request.customer

        if not resolved_customer:
            raise ValueError("No customer specified and design request has no customer.")

        # Generate estimate number
        estimate_numbers = Estimate.objects.filter(tenant=self.tenant).values_list('estimate_number', flat=True)
        max_num = 0
        for num in estimate_numbers:
            match = re.search(r'(\d+)', num or '')
            if match:
                val = int(match.group(1))
                if val > max_num:
                    max_num = val
        estimate_number = f"EST-{str(max_num + 1).zfill(6)}"

        # Resolve ship_to from customer
        from apps.parties.models import Location
        ship_to = None
        if resolved_customer and hasattr(resolved_customer, 'party'):
            ship_to = Location.objects.filter(
                party=resolved_customer.party,
                location_type='SHIP_TO',
                is_active=True
            ).first()

        estimate = Estimate.objects.create(
            tenant=self.tenant,
            estimate_number=estimate_number,
            customer=resolved_customer,
            status='draft',
            date=timezone.now().date(),
            ship_to=ship_to,
            notes=notes or f"Generated from design request {design_request.file_number}",
            design_request=design_request,
        )

        EstimateLine.objects.create(
            tenant=self.tenant,
            estimate=estimate,
            line_number=10,
            item=item,
            quantity=quantity,
            uom=item.base_uom,
            unit_price=unit_price or Decimal('0.00'),
            notes=f"Item from design {design_request.file_number}",
        )

        return estimate
