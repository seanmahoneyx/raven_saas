# apps/pricing/services.py
"""
Pricing service for calculating customer prices with quantity breaks.

PricingService:
- Finds active price list for customer+item on a given date
- Calculates unit price based on quantity breaks
- Returns None if no pricing found (no pricing = user must set manually)
"""
from decimal import Decimal
from django.utils import timezone
from .models import PriceListHead


class PricingService:
    """
    Service for calculating customer prices.

    Usage:
        service = PricingService(tenant)
        price = service.get_price(customer, item, quantity=100)
        # Returns Decimal('9.00') based on quantity break

        # Or with specific date:
        price = service.get_price(customer, item, quantity=100, date=some_date)
    """

    def __init__(self, tenant):
        """
        Initialize pricing service for a tenant.

        Args:
            tenant: Tenant instance to scope queries
        """
        self.tenant = tenant

    def get_price(self, customer, item, quantity, date=None):
        """
        Get the unit price for a customer/item/quantity combination.

        Finds the active price list for the customer+item that is valid
        for the given date, then looks up the price based on quantity breaks.

        Args:
            customer: Customer instance
            item: Item instance
            quantity: Order quantity (for quantity break calculation)
            date: Date to check validity (defaults to today)

        Returns:
            Decimal: Unit price, or None if no valid price list found
        """
        if date is None:
            date = timezone.now().date()

        price_list = self._find_active_price_list(customer, item, date)
        if not price_list:
            return None

        return price_list.get_price_for_quantity(quantity)

    def _find_active_price_list(self, customer, item, date):
        """
        Find the active price list for customer+item valid on the given date.

        Args:
            customer: Customer instance
            item: Item instance
            date: Date to check

        Returns:
            PriceListHead or None
        """
        return PriceListHead.objects.filter(
            tenant=self.tenant,
            customer=customer,
            item=item,
            is_active=True,
            begin_date__lte=date,
        ).filter(
            # end_date is null (ongoing) OR end_date >= date
            **{'end_date__gte': date}
        ).first() or PriceListHead.objects.filter(
            tenant=self.tenant,
            customer=customer,
            item=item,
            is_active=True,
            begin_date__lte=date,
            end_date__isnull=True,
        ).first()

    def get_price_list(self, customer, item, date=None):
        """
        Get the active price list (header) for customer+item.

        Useful when you need access to all quantity breaks, not just the
        calculated price.

        Args:
            customer: Customer instance
            item: Item instance
            date: Date to check validity (defaults to today)

        Returns:
            PriceListHead or None
        """
        if date is None:
            date = timezone.now().date()

        return self._find_active_price_list(customer, item, date)

    def get_all_quantity_breaks(self, customer, item, date=None):
        """
        Get all quantity break tiers for a customer+item.

        Args:
            customer: Customer instance
            item: Item instance
            date: Date to check validity (defaults to today)

        Returns:
            List of dicts: [{'min_quantity': 1, 'unit_price': Decimal('10.00')}, ...]
            Returns empty list if no valid price list found.
        """
        if date is None:
            date = timezone.now().date()

        price_list = self._find_active_price_list(customer, item, date)
        if not price_list:
            return []

        return [
            {
                'min_quantity': line.min_quantity,
                'unit_price': line.unit_price,
            }
            for line in price_list.lines.all()
        ]

    def calculate_line_total(self, customer, item, quantity, date=None):
        """
        Calculate the total price for a line (quantity * unit_price).

        Args:
            customer: Customer instance
            item: Item instance
            quantity: Order quantity
            date: Date to check validity (defaults to today)

        Returns:
            Decimal: Line total, or None if no pricing found
        """
        unit_price = self.get_price(customer, item, quantity, date)
        if unit_price is None:
            return None

        return Decimal(str(quantity)) * unit_price
