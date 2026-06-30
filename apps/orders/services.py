# apps/orders/services.py
"""
Order-related business logic services.

Services:
- convert_estimate_to_order: Convert an accepted Estimate into a SalesOrder
- convert_estimate_to_contract: Convert an accepted Estimate into a Contract
"""
import re
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError


# Mapping from item_type to default fulfillment_method
_ITEM_TYPE_DEFAULT_FULFILLMENT = {
    'inventory': 'stock',
    'non_stockable': 'direct',
    'crossdock': 'crossdock',
    'other_charge': None,
}

# Allowed fulfillment methods per item_type
_ITEM_TYPE_ALLOWED_FULFILLMENT = {
    'inventory': {'stock', 'direct', 'crossdock'},
    'non_stockable': {'direct', 'crossdock'},
    'crossdock': {'crossdock'},
    'other_charge': {None},
}


def resolve_fulfillment_method(item, fulfillment_method=None):
    """
    Resolve and validate fulfillment_method for an order line.

    If fulfillment_method is not provided, returns the default for the item's
    item_type. If provided, validates it is allowed for the item_type.

    Args:
        item: Item instance
        fulfillment_method: str or None — the requested fulfillment method

    Returns:
        str or None: The resolved fulfillment_method value

    Raises:
        ValidationError: If fulfillment_method is not allowed for the item_type
    """
    item_type = getattr(item, 'item_type', 'inventory')
    default = _ITEM_TYPE_DEFAULT_FULFILLMENT.get(item_type)
    allowed = _ITEM_TYPE_ALLOWED_FULFILLMENT.get(item_type, set())

    if fulfillment_method is None:
        return default

    if fulfillment_method not in allowed:
        raise ValidationError(
            f"Fulfillment method '{fulfillment_method}' is not allowed for "
            f"item type '{item_type}'. Allowed: {sorted(m for m in allowed if m)}."
        )
    return fulfillment_method


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
                fulfillment_method=resolve_fulfillment_method(est_line.item),
                notes=est_line.notes,
            )

        # Mark estimate as converted
        Estimate.objects.filter(pk=estimate.pk).update(status='converted')

        # Record document lineage: estimate produced this sales order
        from apps.documents.models import record_link
        record_link(estimate, sales_order, 'estimate_to_sales_order', tenant, user=user)

        return sales_order


def convert_estimate_to_contract(estimate, tenant, user=None):
    """
    Convert an Estimate into a blanket Contract.

    Creates a Contract with lines matching the estimate's line items.
    The estimate is marked as CONVERTED and linked to the new contract.

    Args:
        estimate: Estimate instance to convert
        tenant: Tenant instance
        user: Optional user performing the conversion

    Returns:
        Contract: The newly created contract

    Raises:
        ValidationError: If estimate is not in a convertible state
    """
    from apps.orders.models import Estimate
    from apps.contracts.models import Contract, ContractLine

    if estimate.status not in ('sent', 'accepted'):
        raise ValidationError(
            f"Cannot convert estimate with status '{estimate.status}'. "
            "Estimate must be 'sent' or 'accepted'."
        )

    with transaction.atomic():
        contract = Contract(
            tenant=tenant,
            customer=estimate.customer,
            contract_type='blanket',
            status='draft',
            issue_date=estimate.date,
            ship_to=estimate.ship_to,
            source_estimate=estimate,
            blanket_po=estimate.customer_po or '',
            notes=estimate.notes or '',
        )
        contract.save()

        for est_line in estimate.lines.select_related('item', 'uom').all():
            ContractLine.objects.create(
                tenant=tenant,
                contract=contract,
                line_number=est_line.line_number,
                item=est_line.item,
                blanket_qty=est_line.quantity,
                uom=est_line.uom,
                unit_price=est_line.unit_price,
                notes=est_line.notes,
            )

        # Mark estimate as converted
        Estimate.objects.filter(pk=estimate.pk).update(status='converted')

        # Record document lineage: estimate produced this contract
        from apps.documents.models import record_link
        record_link(estimate, contract, 'estimate_to_contract', tenant, user=user)

        return contract


def _generate_so_number(tenant):
    """Atomically consume the next SO number for a tenant."""
    from apps.tenants.models import get_next_sequence_number
    return get_next_sequence_number(tenant, 'SO')


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
                fulfillment_method=resolve_fulfillment_method(rfq_line.item),
                notes=rfq_line.notes,
            )

        # Mark RFQ as converted
        RFQ.objects.filter(pk=rfq.pk).update(status='converted')

        # Record document lineage: RFQ produced this purchase order
        from apps.documents.models import record_link
        record_link(rfq, purchase_order, 'rfq_to_purchase_order', tenant, user=user)

        return purchase_order


def convert_rfq_to_price_lists(rfq, customer, tenant, user=None):
    """
    Convert RFQ quoted prices into PriceListHead records for a customer.

    Creates one PriceListHead per unique item that has a quoted_price,
    with a single PriceListLine using the RFQ line's quantity as min_quantity
    and quoted_price as unit_price.

    Unlike PO conversion, this does NOT mark the RFQ as converted,
    since an RFQ may be converted to both PO and price lists.

    Args:
        rfq: RFQ instance
        customer: Customer instance to create price lists for
        tenant: Tenant instance
        user: Optional user performing the conversion

    Returns:
        list[PriceListHead]: The newly created price list records

    Raises:
        ValidationError: If RFQ has no quoted lines
    """
    from apps.pricing.models import PriceListHead, PriceListLine
    from django.utils import timezone

    if rfq.status not in ('sent', 'received'):
        raise ValidationError(
            f"Cannot create price lists from RFQ with status '{rfq.status}'. "
            "RFQ must be 'sent' or 'received'."
        )

    quoted_lines = rfq.lines.filter(quoted_price__isnull=False).select_related('item', 'uom')
    if not quoted_lines.exists():
        raise ValidationError(
            "Cannot create price lists: no lines have a quoted price from the vendor."
        )

    created = []
    today = timezone.now().date()

    with transaction.atomic():
        for rfq_line in quoted_lines:
            price_list = PriceListHead.objects.create(
                tenant=tenant,
                customer=customer,
                item=rfq_line.item,
                begin_date=today,
                is_active=True,
                notes=f"Created from RFQ {rfq.rfq_number} (Vendor: {rfq.vendor.party.display_name})",
            )
            PriceListLine.objects.create(
                tenant=tenant,
                price_list=price_list,
                min_quantity=rfq_line.quantity,
                unit_price=rfq_line.quoted_price,
            )
            created.append(price_list)

    return created


def _generate_po_number(tenant):
    """Atomically consume the next PO number for a tenant."""
    from apps.tenants.models import get_next_sequence_number
    return get_next_sequence_number(tenant, 'PO')


def _generate_estimate_number(tenant):
    """Atomically consume the next estimate number for a tenant."""
    from apps.tenants.models import get_next_sequence_number
    return get_next_sequence_number(tenant, 'EST')


def _generate_rfq_number(tenant):
    """Atomically consume the next RFQ number for a tenant."""
    from apps.tenants.models import get_next_sequence_number
    return get_next_sequence_number(tenant, 'RFQ')


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
        Receive goods against a PO by creating a posted ItemReceipt.

        Delegates the heavy lifting to ReceivingService.create_and_post_receipt,
        which:
        - Creates an ItemReceipt header + lines
        - Posts inventory lots / FIFO layers via InventoryService.receive_stock
        - Posts a Dr Inventory / Cr GR/IR journal entry (per line)
        - Updates PurchaseOrderLine.quantity_received and PO.status

        Vendor bills are no longer auto-created here — that's an explicit
        downstream step from the receipt (see VendorBillService.create_bill_from_receipts).

        Args:
            purchase_order: PO instance (must be confirmed, scheduled, or partially_received)
            line_receipts: Optional list of dicts:
                [{'line_id': int, 'quantity': int, 'unit_cost': Decimal}, ...]
                If None, receives every line at its remaining quantity using
                the line's own unit_cost.

        Returns:
            dict: {'item_receipt': ItemReceipt, 'po_status': str}

        Raises:
            ValidationError: PO is in a non-receivable status, no default
                warehouse, GR/IR account missing.
        """
        if purchase_order.status not in ('confirmed', 'scheduled', 'partially_received'):
            raise ValidationError(
                f"Cannot receive PO with status '{purchase_order.status}'. Must be 'confirmed', 'scheduled', or 'partially_received'."
            )

        from apps.inventory.services import InventoryService, ReceivingService

        warehouse = self._get_default_warehouse()
        if not warehouse:
            raise ValidationError("No default warehouse configured. Cannot receive inventory.")

        # Build the receipt-line payload.
        if line_receipts:
            recv_lines = []
            for r in line_receipts:
                line = purchase_order.lines.get(id=r['line_id'])
                qty = r.get('quantity', line.quantity_remaining)
                cost = Decimal(str(r.get('unit_cost', line.unit_cost)))
                recv_lines.append({
                    'item': line.item,
                    'quantity': qty,
                    'unit_cost': cost,
                    'purchase_order_line': line,
                })
        else:
            recv_lines = []
            for line in purchase_order.lines.select_related('item').all():
                qty = line.quantity_remaining if line.quantity_remaining > 0 else line.quantity_ordered
                if qty <= 0:
                    continue
                recv_lines.append({
                    'item': line.item,
                    'quantity': qty,
                    'unit_cost': line.unit_cost,
                    'purchase_order_line': line,
                })

        if not recv_lines:
            raise ValidationError("Nothing to receive — every PO line is already fully received.")

        receiving_svc = ReceivingService(self.tenant, self.user)
        receipt = receiving_svc.create_and_post_receipt(
            vendor=purchase_order.vendor,
            warehouse=warehouse,
            lines=recv_lines,
            purchase_order=purchase_order,
            notes=f'PO receive: {purchase_order.po_number}',
        )

        # Pull on-order down to reflect what's now arrived.
        inv_svc = InventoryService(self.tenant, self.user)
        for rl in recv_lines:
            try:
                inv_svc.remove_on_order(
                    item=rl['item'],
                    warehouse=warehouse,
                    quantity=rl['quantity'],
                    purchase_order=purchase_order,
                )
            except ValidationError:
                pass  # remove_on_order is best-effort here

        purchase_order.refresh_from_db()

        return {
            'item_receipt': receipt,
            'po_status': purchase_order.status,
        }
