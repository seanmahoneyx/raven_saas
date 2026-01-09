# apps/items/models.py
"""
Item models for product catalog management.

Models:
- UnitOfMeasure: Units for measuring items (EACH, CASE, PALLET, ROLL)
- Item: Product catalog - items that can be bought/sold
- ItemUOM: UOM conversions for items (e.g., 1 CASE = 12 EACH)
"""
from django.db import models
from shared.models import TenantMixin, TimestampMixin


class UnitOfMeasure(TenantMixin, TimestampMixin):
    """
    Units for measuring items.

    Standard UOMs:
    - EACH (ea) - Base unit
    - CASE (cs) - Carton/case
    - PALLET (plt) - Full pallet
    - ROLL (rl) - Roll (for fabric/paper)

    IMPORTANT: code is unique per tenant only, not globally.
    Multiple tenants can have "ea" as a code.
    """
    code = models.CharField(
        max_length=10,
        help_text="Short code (e.g., 'ea', 'cs', 'plt')"
    )
    name = models.CharField(
        max_length=50,
        help_text="Full name (e.g., 'Each', 'Case', 'Pallet')"
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional description"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive UOMs are hidden from selections"
    )

    class Meta:
        verbose_name = "Unit of Measure"
        verbose_name_plural = "Units of Measure"
        unique_together = [('tenant', 'code')]
        indexes = [
            models.Index(fields=['tenant', 'code']),
            models.Index(fields=['tenant', 'is_active']),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class Item(TenantMixin, TimestampMixin):
    """
    Product catalog - items that can be bought/sold.

    Each item has a base UOM (typically EACH) and can have
    multiple UOM conversions via ItemUOM.
    """
    sku = models.CharField(
        max_length=100,
        help_text="Stock Keeping Unit (unique per tenant)"
    )
    name = models.CharField(
        max_length=255,
        help_text="Item name"
    )
    description = models.TextField(
        blank=True,
        help_text="Detailed description"
    )
    base_uom = models.ForeignKey(
        UnitOfMeasure,
        on_delete=models.PROTECT,
        related_name='items',
        help_text="Base unit of measure (typically EACH)"
    )
    is_inventory = models.BooleanField(
        default=True,
        help_text="Is this a stocked/inventoried item?"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive items are hidden from selections"
    )

    class Meta:
        unique_together = [('tenant', 'sku')]
        indexes = [
            models.Index(fields=['tenant', 'sku']),
            models.Index(fields=['tenant', 'name']),
            models.Index(fields=['tenant', 'is_active']),
        ]

    def __str__(self):
        return f"{self.sku} - {self.name}"

    def get_uom_multiplier(self, uom):
        """
        Get the multiplier to convert from given UOM to base UOM (EACH).

        Args:
            uom: UnitOfMeasure instance

        Returns:
            int: Multiplier (e.g., 12 for CASE if 1 case = 12 each)
            Returns 1 if UOM is the base UOM or no conversion found.
        """
        if uom == self.base_uom:
            return 1
        try:
            item_uom = self.uom_conversions.get(uom=uom)
            return item_uom.multiplier_to_base
        except ItemUOM.DoesNotExist:
            return 1


class ItemUOM(TenantMixin, TimestampMixin):
    """
    UOM conversions for items.

    Defines how many base units are in each alternate UOM.

    Examples:
    - Item: "Widget ABC", UOM: CASE, Multiplier: 12 (1 case = 12 each)
    - Item: "Widget ABC", UOM: PALLET, Multiplier: 480 (1 pallet = 480 each)
    """
    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name='uom_conversions',
        help_text="The item this conversion applies to"
    )
    uom = models.ForeignKey(
        UnitOfMeasure,
        on_delete=models.PROTECT,
        related_name='item_conversions',
        help_text="The alternate UOM"
    )
    multiplier_to_base = models.PositiveIntegerField(
        help_text="How many base units in this UOM (e.g., 12 for CASE)"
    )

    class Meta:
        verbose_name = "Item UOM Conversion"
        verbose_name_plural = "Item UOM Conversions"
        unique_together = [('tenant', 'item', 'uom')]
        indexes = [
            models.Index(fields=['tenant', 'item', 'uom']),
        ]

    def __str__(self):
        return f"{self.item.sku}: 1 {self.uom.code} = {self.multiplier_to_base} {self.item.base_uom.code}"

    def convert_to_base(self, quantity):
        """Convert quantity in this UOM to base UOM."""
        return quantity * self.multiplier_to_base

    def convert_from_base(self, quantity):
        """Convert quantity from base UOM to this UOM."""
        return quantity / self.multiplier_to_base
