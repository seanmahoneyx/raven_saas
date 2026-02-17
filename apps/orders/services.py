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


class OrderService:
    """Service for order lifecycle transitions with side effects."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    def _get_default_warehouse(self):
        from apps.warehousing.models import Warehouse
        return Warehouse.objects.filter(tenant=self.tenant, is_default=True).first()

    def confirm_sales_order(self, sales_order):
        """Confirm a draft SO. Attempts inventory allocation per line."""
        if sales_order.status != 'draft':
            raise ValidationError(f"Cannot confirm SO with status '{sales_order.status}'. Must be 'draft'.")

        with transaction.atomic():
            sales_order.status = 'confirmed'
            sales_order.save()

            warehouse = self._get_default_warehouse()
            if warehouse:
                from apps.inventory.services import InventoryService
                inv_svc = InventoryService(self.tenant, self.user)
                for line in sales_order.lines.select_related('item').all():
                    try:
                        inv_svc.allocate_inventory(
                            item=line.item,
                            warehouse=warehouse,
                            quantity=line.quantity_ordered,
                            sales_order=sales_order,
                            reference=f'SO confirm: {sales_order.order_number}',
                        )
                    except ValidationError:
                        pass  # Skip if insufficient - confirm without allocation

            # Broadcast order update via WebSocket
            try:
                from apps.api.ws_signals import broadcast_order_update
                broadcast_order_update(
                    tenant_id=self.tenant.pk,
                    order_type='sales_order',
                    order_id=sales_order.pk,
                    status='confirmed',
                    data={'order_number': sales_order.order_number},
                )
            except Exception:
                pass  # Never break the main flow

            return sales_order

    def cancel_sales_order(self, sales_order):
        """Cancel an SO. Deallocates inventory if previously confirmed."""
        if sales_order.status in ('shipped', 'complete', 'cancelled'):
            raise ValidationError(f"Cannot cancel SO with status '{sales_order.status}'.")

        was_confirmed = sales_order.status in ('confirmed', 'scheduled', 'picking')

        with transaction.atomic():
            if was_confirmed:
                warehouse = self._get_default_warehouse()
                if warehouse:
                    from apps.inventory.services import InventoryService
                    inv_svc = InventoryService(self.tenant, self.user)
                    for line in sales_order.lines.select_related('item').all():
                        try:
                            inv_svc.deallocate_inventory(
                                item=line.item,
                                warehouse=warehouse,
                                quantity=line.quantity_ordered,
                                sales_order=sales_order,
                                reference=f'SO cancel: {sales_order.order_number}',
                            )
                        except ValidationError:
                            pass

            sales_order.status = 'cancelled'
            sales_order.save()

            # Broadcast order update via WebSocket
            try:
                from apps.api.ws_signals import broadcast_order_update
                broadcast_order_update(
                    tenant_id=self.tenant.pk,
                    order_type='sales_order',
                    order_id=sales_order.pk,
                    status='cancelled',
                    data={'order_number': sales_order.order_number},
                )
            except Exception:
                pass  # Never break the main flow

            return sales_order

    def complete_sales_order(self, sales_order):
        """Complete a shipped SO."""
        if sales_order.status != 'shipped':
            raise ValidationError(f"Cannot complete SO with status '{sales_order.status}'. Must be 'shipped'.")

        sales_order.status = 'complete'
        sales_order.save()
        return sales_order

    def confirm_purchase_order(self, purchase_order):
        """Confirm a draft PO. Updates on_order quantities."""
        if purchase_order.status != 'draft':
            raise ValidationError(f"Cannot confirm PO with status '{purchase_order.status}'. Must be 'draft'.")

        with transaction.atomic():
            purchase_order.status = 'confirmed'
            purchase_order.save()

            warehouse = self._get_default_warehouse()
            if warehouse:
                from apps.inventory.services import InventoryService
                inv_svc = InventoryService(self.tenant, self.user)
                for line in purchase_order.lines.select_related('item').all():
                    inv_svc.add_on_order(
                        item=line.item,
                        warehouse=warehouse,
                        quantity=line.quantity_ordered,
                        purchase_order=purchase_order,
                    )

            # Broadcast order update via WebSocket
            try:
                from apps.api.ws_signals import broadcast_order_update
                broadcast_order_update(
                    tenant_id=self.tenant.pk,
                    order_type='purchase_order',
                    order_id=purchase_order.pk,
                    status='confirmed',
                    data={'order_number': purchase_order.po_number},
                )
            except Exception:
                pass  # Never break the main flow

            return purchase_order

    def cancel_purchase_order(self, purchase_order):
        """Cancel a PO. Removes on_order quantities if confirmed."""
        if purchase_order.status in ('shipped', 'complete', 'cancelled'):
            raise ValidationError(f"Cannot cancel PO with status '{purchase_order.status}'.")

        was_confirmed = purchase_order.status in ('confirmed', 'scheduled')

        with transaction.atomic():
            if was_confirmed:
                warehouse = self._get_default_warehouse()
                if warehouse:
                    from apps.inventory.services import InventoryService
                    inv_svc = InventoryService(self.tenant, self.user)
                    for line in purchase_order.lines.select_related('item').all():
                        try:
                            inv_svc.remove_on_order(
                                item=line.item,
                                warehouse=warehouse,
                                quantity=line.quantity_ordered,
                                purchase_order=purchase_order,
                            )
                        except ValidationError:
                            pass

            purchase_order.status = 'cancelled'
            purchase_order.save()
            return purchase_order

    def receive_purchase_order(self, purchase_order, line_receipts=None):
        """
        Receive goods against a PO, creating inventory lots, FIFO layers, and GL entries.

        Args:
            purchase_order: PO instance (must be confirmed or scheduled)
            line_receipts: Optional list of dicts: [{'line_id': int, 'quantity': int, 'unit_cost': Decimal}, ...]
                          If None, receives all lines at full quantity using line's unit_cost.

        Returns:
            dict with 'lots_created' count and 'po_status'
        """
        if purchase_order.status not in ('confirmed', 'scheduled'):
            raise ValidationError(
                f"Cannot receive PO with status '{purchase_order.status}'. Must be 'confirmed' or 'scheduled'."
            )

        from apps.inventory.services import InventoryService

        warehouse = self._get_default_warehouse()
        if not warehouse:
            raise ValidationError("No default warehouse configured. Cannot receive inventory.")

        inv_svc = InventoryService(self.tenant, self.user)
        lots_created = []

        with transaction.atomic():
            if line_receipts:
                # Partial / specified receive
                for receipt in line_receipts:
                    line = purchase_order.lines.get(id=receipt['line_id'])
                    qty = receipt.get('quantity', line.quantity_ordered)
                    cost = Decimal(str(receipt.get('unit_cost', line.unit_cost)))

                    lot, pallets, layer = inv_svc.receive_stock(
                        item=line.item,
                        warehouse=warehouse,
                        quantity=qty,
                        unit_cost=cost,
                        purchase_order=purchase_order,
                        vendor=purchase_order.vendor,
                        notes=f'PO receive: {purchase_order.po_number} line {line.line_number}',
                    )
                    inv_svc.remove_on_order(
                        item=line.item,
                        warehouse=warehouse,
                        quantity=qty,
                        purchase_order=purchase_order,
                    )
                    lots_created.append(lot)
            else:
                # Full receive - all lines
                for line in purchase_order.lines.select_related('item').all():
                    lot, pallets, layer = inv_svc.receive_stock(
                        item=line.item,
                        warehouse=warehouse,
                        quantity=line.quantity_ordered,
                        unit_cost=line.unit_cost,
                        purchase_order=purchase_order,
                        vendor=purchase_order.vendor,
                        notes=f'PO receive: {purchase_order.po_number} line {line.line_number}',
                    )
                    inv_svc.remove_on_order(
                        item=line.item,
                        warehouse=warehouse,
                        quantity=line.quantity_ordered,
                        purchase_order=purchase_order,
                    )
                    lots_created.append(lot)

            # Mark PO as complete
            purchase_order.status = 'complete'
            purchase_order.save()

            # Auto-create vendor bill
            vendor_bill = None
            try:
                from apps.invoicing.services import VendorBillService
                from django.utils import timezone as tz
                from datetime import timedelta

                bill_svc = VendorBillService(self.tenant, self.user)
                bill = bill_svc.create_bill(
                    vendor=purchase_order.vendor,
                    vendor_invoice_number=purchase_order.po_number,
                    due_date=tz.now().date() + timedelta(days=30),
                    bill_date=tz.now().date(),
                    purchase_order=purchase_order,
                    notes=f'Auto-created from PO receive: {purchase_order.po_number}',
                )

                # Add bill lines from PO lines
                if line_receipts:
                    for receipt in line_receipts:
                        line = purchase_order.lines.get(id=receipt['line_id'])
                        qty = receipt.get('quantity', line.quantity_ordered)
                        cost = Decimal(str(receipt.get('unit_cost', line.unit_cost)))
                        bill_svc.add_line(
                            bill=bill,
                            description=f'{line.item.name} ({line.item.sku})',
                            quantity=qty,
                            unit_price=cost,
                            item=line.item,
                            purchase_order_line=line,
                        )
                else:
                    for line in purchase_order.lines.select_related('item').all():
                        bill_svc.add_line(
                            bill=bill,
                            description=f'{line.item.name} ({line.item.sku})',
                            quantity=line.quantity_ordered,
                            unit_price=line.unit_cost,
                            item=line.item,
                            purchase_order_line=line,
                        )
                vendor_bill = bill
            except Exception:
                pass  # Don't block PO receive if bill creation fails

        # Broadcast order update via WebSocket
        try:
            from apps.api.ws_signals import broadcast_order_update
            broadcast_order_update(
                tenant_id=self.tenant.pk,
                order_type='purchase_order',
                order_id=purchase_order.pk,
                status='complete',
                data={'order_number': purchase_order.po_number},
            )
        except Exception:
            pass  # Never break the main flow

        return {
            'lots_created': lots_created,
            'po_status': purchase_order.status,
            'vendor_bill': vendor_bill,
        }
