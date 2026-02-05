# apps/scheduling/utils.py
"""
Utility functions for scheduling.
"""


def get_box_type_for_item(item):
    """
    Derive box type from Item model's multi-table inheritance.

    Checks if the item is a corrugated item and determines the specific
    box type (RSC, DC, HSC, FOL, TELE) based on which subclass it belongs to.

    Args:
        item: An Item instance (or subclass)

    Returns:
        str: Box type code ('RSC', 'DC', 'HSC', 'FOL', 'TELE', or 'OTHER')
    """
    # Check if item has corrugated attributes via multi-table inheritance
    if hasattr(item, 'corrugateditem'):
        corrugated = item.corrugateditem

        # Check each box type subclass
        if hasattr(corrugated, 'rscitem'):
            return 'RSC'
        if hasattr(corrugated, 'dcitem'):
            return 'DC'
        if hasattr(corrugated, 'hscitem'):
            return 'HSC'
        if hasattr(corrugated, 'folitem'):
            return 'FOL'
        if hasattr(corrugated, 'teleitem'):
            return 'TELE'

        # Corrugated but no specific box type
        return 'OTHER'

    # Not a corrugated item
    return 'OTHER'


def get_effective_allotment(vendor, box_type, date, tenant):
    """
    Get the effective kick allotment for a vendor/box-type on a specific date.

    Checks for a daily override first, falls back to the default allotment.

    Args:
        vendor: Vendor instance
        box_type: Box type code (e.g., 'RSC', 'DC')
        date: Date to check
        tenant: Tenant instance

    Returns:
        tuple: (allotment: int, is_override: bool)
    """
    from .models import VendorKickAllotment, DailyKickOverride

    # Check for daily override first
    try:
        override = DailyKickOverride.objects.get(
            tenant=tenant,
            vendor=vendor,
            box_type=box_type,
            date=date
        )
        return (override.allotment, True)
    except DailyKickOverride.DoesNotExist:
        pass

    # Fall back to default allotment
    try:
        default = VendorKickAllotment.objects.get(
            tenant=tenant,
            vendor=vendor,
            box_type=box_type
        )
        return (default.daily_allotment, False)
    except VendorKickAllotment.DoesNotExist:
        return (0, False)


def calculate_scheduled_quantity(vendor, box_type, date, tenant):
    """
    Calculate the total quantity scheduled for a vendor/box-type/date bin.

    Args:
        vendor: Vendor instance
        box_type: Box type code
        date: Date to check
        tenant: Tenant instance

    Returns:
        int: Total quantity ordered across all lines in the bin
    """
    from .models import PriorityLinePriority

    lines = PriorityLinePriority.objects.filter(
        tenant=tenant,
        vendor=vendor,
        box_type=box_type,
        scheduled_date=date
    ).select_related('purchase_order_line')

    total = 0
    for priority_entry in lines:
        total += priority_entry.purchase_order_line.quantity_ordered
    return total
