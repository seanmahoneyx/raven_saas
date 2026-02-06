"""
Design module services.

DesignService: Handles design request lifecycle and promotion to Item catalog.
"""
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
