# apps/orders/services.py
"""
Order-related business logic services.

Services:
- convert_estimate_to_order: Convert an accepted Estimate into a SalesOrder
"""
import re
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError


def convert_estimate_to_order(estimate, tenant, user=None):
    """
    Convert an Estimate into a SalesOrder.

    Copies all line items from the estimate to create a new sales order.
    The estimate is marked as CONVERTED and linked to the new order.

    Args:
        estimate: Estimate instance to convert
        tenant: Tenant instance
        user: Optional user performing the conversion

    Returns:
        SalesOrder: The newly created sales order

    Raises:
        ValidationError: If estimate is not in a convertible state
    """
    from apps.orders.models import Estimate, SalesOrder, SalesOrderLine

    # Validation
    if estimate.status not in ('sent', 'accepted'):
        raise ValidationError(
            f"Cannot convert estimate with status '{estimate.status}'. "
            "Estimate must be 'sent' or 'accepted'."
        )

    with transaction.atomic():
        # Generate next SO number
        order_number = _generate_so_number(tenant)

        # Create the Sales Order
        sales_order = SalesOrder(
            tenant=tenant,
            customer=estimate.customer,
            order_number=order_number,
            order_date=estimate.date,
            status='draft',
            customer_po=estimate.customer_po,
            notes=f"Converted from Estimate {estimate.estimate_number}",
            source_estimate=estimate,
        )
        # Copy ship_to/bill_to if set
        if estimate.ship_to_id:
            sales_order.ship_to = estimate.ship_to
        else:
            # Fallback: use customer's first location
            first_location = estimate.customer.party.locations.first()
            if first_location:
                sales_order.ship_to = first_location
            else:
                raise ValidationError(
                    "Cannot convert: customer has no shipping location and estimate has no ship_to set."
                )
        if estimate.bill_to_id:
            sales_order.bill_to = estimate.bill_to

        sales_order.save()

        # Copy lines
        for est_line in estimate.lines.select_related('item', 'uom').all():
            SalesOrderLine.objects.create(
                tenant=tenant,
                sales_order=sales_order,
                line_number=est_line.line_number,
                item=est_line.item,
                quantity_ordered=est_line.quantity,
                uom=est_line.uom,
                unit_price=est_line.unit_price,
                notes=est_line.notes,
            )

        # Mark estimate as converted
        Estimate.objects.filter(pk=estimate.pk).update(status='converted')

        return sales_order


def _generate_so_number(tenant):
    """Generate the next SO number for a tenant."""
    from apps.orders.models import SalesOrder

    order_numbers = SalesOrder.objects.filter(tenant=tenant).values_list('order_number', flat=True)
    max_num = 0
    for order_num in order_numbers:
        match = re.search(r'(\d+)', order_num or '')
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    return f"SO-{str(max_num + 1).zfill(6)}"


def convert_rfq_to_po(rfq, tenant, user=None):
    """
    Convert an RFQ into a PurchaseOrder.

    Copies all lines that have a quoted_price set from the RFQ to create
    a new purchase order. The RFQ is marked as CONVERTED and linked.

    Args:
        rfq: RFQ instance to convert
        tenant: Tenant instance
        user: Optional user performing the conversion

    Returns:
        PurchaseOrder: The newly created purchase order

    Raises:
        ValidationError: If RFQ is not in a convertible state or has no quoted lines
    """
    from apps.orders.models import RFQ, PurchaseOrder, PurchaseOrderLine

    if rfq.status not in ('sent', 'received'):
        raise ValidationError(
            f"Cannot convert RFQ with status '{rfq.status}'. "
            "RFQ must be 'sent' or 'received'."
        )

    # Only convert lines that have quoted prices
    quoted_lines = rfq.lines.filter(quoted_price__isnull=False).select_related('item', 'uom')
    if not quoted_lines.exists():
        raise ValidationError(
            "Cannot convert RFQ: no lines have a quoted price from the vendor."
        )

    with transaction.atomic():
        po_number = _generate_po_number(tenant)

        purchase_order = PurchaseOrder(
            tenant=tenant,
            vendor=rfq.vendor,
            po_number=po_number,
            order_date=rfq.date,
            expected_date=rfq.expected_date,
            status='draft',
            notes=f"Converted from RFQ {rfq.rfq_number}",
            source_rfq=rfq,
        )
        # Ship to
        if rfq.ship_to_id:
            purchase_order.ship_to = rfq.ship_to
        else:
            # Fallback: use vendor's first location or tenant's first warehouse
            from apps.warehousing.models import Warehouse
            first_warehouse = Warehouse.objects.filter(tenant=tenant).first()
            if first_warehouse and hasattr(first_warehouse, 'location') and first_warehouse.location:
                purchase_order.ship_to = first_warehouse.location
            else:
                raise ValidationError(
                    "Cannot convert: no ship_to on RFQ and no warehouse location found."
                )

        purchase_order.save()

        # Copy quoted lines to PO lines
        for rfq_line in quoted_lines:
            PurchaseOrderLine.objects.create(
                tenant=tenant,
                purchase_order=purchase_order,
                line_number=rfq_line.line_number,
                item=rfq_line.item,
                quantity_ordered=rfq_line.quantity,
                uom=rfq_line.uom,
                unit_cost=rfq_line.quoted_price,
                notes=rfq_line.notes,
            )

        # Mark RFQ as converted
        RFQ.objects.filter(pk=rfq.pk).update(status='converted')

        return purchase_order


def _generate_po_number(tenant):
    """Generate the next PO number for a tenant."""
    import re
    from apps.orders.models import PurchaseOrder

    po_numbers = PurchaseOrder.objects.filter(tenant=tenant).values_list('po_number', flat=True)
    max_num = 0
    for po_num in po_numbers:
        match = re.search(r'(\d+)', po_num or '')
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    return f"PO-{str(max_num + 1).zfill(6)}"
