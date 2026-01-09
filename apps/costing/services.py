# apps/costing/services.py
"""
Costing service for calculating vendor costs with quantity breaks.

CostingService:
- Finds active cost list for vendor+item on a given date
- Calculates unit cost based on quantity breaks
- Returns None if no costing found
"""
from decimal import Decimal
from django.utils import timezone
from .models import CostListHead


class CostingService:
    """
    Service for calculating vendor costs.

    Usage:
        service = CostingService(tenant)
        cost = service.get_cost(vendor, item, quantity=100)
        # Returns Decimal('4.50') based on quantity break

        # Or with specific date:
        cost = service.get_cost(vendor, item, quantity=100, date=some_date)
    """

    def __init__(self, tenant):
        """
        Initialize costing service for a tenant.

        Args:
            tenant: Tenant instance to scope queries
        """
        self.tenant = tenant

    def get_cost(self, vendor, item, quantity, date=None):
        """
        Get the unit cost for a vendor/item/quantity combination.

        Finds the active cost list for the vendor+item that is valid
        for the given date, then looks up the cost based on quantity breaks.

        Args:
            vendor: Vendor instance
            item: Item instance
            quantity: Purchase quantity (for quantity break calculation)
            date: Date to check validity (defaults to today)

        Returns:
            Decimal: Unit cost, or None if no valid cost list found
        """
        if date is None:
            date = timezone.now().date()

        cost_list = self._find_active_cost_list(vendor, item, date)
        if not cost_list:
            return None

        return cost_list.get_cost_for_quantity(quantity)

    def _find_active_cost_list(self, vendor, item, date):
        """
        Find the active cost list for vendor+item valid on the given date.

        Args:
            vendor: Vendor instance
            item: Item instance
            date: Date to check

        Returns:
            CostListHead or None
        """
        return CostListHead.objects.filter(
            tenant=self.tenant,
            vendor=vendor,
            item=item,
            is_active=True,
            begin_date__lte=date,
        ).filter(
            # end_date is null (ongoing) OR end_date >= date
            **{'end_date__gte': date}
        ).first() or CostListHead.objects.filter(
            tenant=self.tenant,
            vendor=vendor,
            item=item,
            is_active=True,
            begin_date__lte=date,
            end_date__isnull=True,
        ).first()

    def get_cost_list(self, vendor, item, date=None):
        """
        Get the active cost list (header) for vendor+item.

        Useful when you need access to all quantity breaks, not just the
        calculated cost.

        Args:
            vendor: Vendor instance
            item: Item instance
            date: Date to check validity (defaults to today)

        Returns:
            CostListHead or None
        """
        if date is None:
            date = timezone.now().date()

        return self._find_active_cost_list(vendor, item, date)

    def get_all_quantity_breaks(self, vendor, item, date=None):
        """
        Get all quantity break tiers for a vendor+item.

        Args:
            vendor: Vendor instance
            item: Item instance
            date: Date to check validity (defaults to today)

        Returns:
            List of dicts: [{'min_quantity': 1, 'unit_cost': Decimal('5.00')}, ...]
            Returns empty list if no valid cost list found.
        """
        if date is None:
            date = timezone.now().date()

        cost_list = self._find_active_cost_list(vendor, item, date)
        if not cost_list:
            return []

        return [
            {
                'min_quantity': line.min_quantity,
                'unit_cost': line.unit_cost,
            }
            for line in cost_list.lines.all()
        ]

    def calculate_line_total(self, vendor, item, quantity, date=None):
        """
        Calculate the total cost for a line (quantity * unit_cost).

        Args:
            vendor: Vendor instance
            item: Item instance
            quantity: Purchase quantity
            date: Date to check validity (defaults to today)

        Returns:
            Decimal: Line total, or None if no costing found
        """
        unit_cost = self.get_cost(vendor, item, quantity, date)
        if unit_cost is None:
            return None

        return Decimal(str(quantity)) * unit_cost

    def get_best_vendor_cost(self, item, quantity, date=None):
        """
        Find the vendor with the best (lowest) cost for an item.

        Useful for sourcing decisions.

        Args:
            item: Item instance
            quantity: Purchase quantity
            date: Date to check validity (defaults to today)

        Returns:
            Dict with 'vendor', 'unit_cost', 'cost_list' keys, or None
        """
        if date is None:
            date = timezone.now().date()

        # Find all active cost lists for this item
        cost_lists = CostListHead.objects.filter(
            tenant=self.tenant,
            item=item,
            is_active=True,
            begin_date__lte=date,
        ).filter(
            **{'end_date__gte': date}
        ) | CostListHead.objects.filter(
            tenant=self.tenant,
            item=item,
            is_active=True,
            begin_date__lte=date,
            end_date__isnull=True,
        )

        best = None
        for cost_list in cost_lists:
            unit_cost = cost_list.get_cost_for_quantity(quantity)
            if unit_cost is not None:
                if best is None or unit_cost < best['unit_cost']:
                    best = {
                        'vendor': cost_list.vendor,
                        'unit_cost': unit_cost,
                        'cost_list': cost_list,
                    }

        return best
