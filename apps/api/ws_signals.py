"""
WebSocket broadcast helper functions.

These functions are called from service layers after mutations to broadcast
real-time updates to connected WebSocket clients.

Each function uses async_to_sync(channel_layer.group_send) to broadcast
messages to the appropriate tenant-scoped or user-scoped group.

IMPORTANT: All calls to these functions should be wrapped in try/except
in the calling code so that WebSocket failures never break the main
database transaction flow.
"""

import logging

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


def _get_channel_layer():
    """Get the channel layer, returning None if unavailable."""
    try:
        layer = get_channel_layer()
        if layer is None:
            logger.debug('Channel layer is not configured')
        return layer
    except Exception:
        logger.debug('Failed to get channel layer', exc_info=True)
        return None


# ─── Inventory Broadcasts ────────────────────────────────────────────────────────

def broadcast_inventory_change(tenant_id, item_id, warehouse_id, new_balance, transaction_type=''):
    """
    Broadcast an inventory balance change to all connected clients for the tenant.

    Args:
        tenant_id: Tenant ID (int or str)
        item_id: Item primary key
        warehouse_id: Warehouse primary key
        new_balance: Dict or numeric value representing new balance
        transaction_type: Type of inventory transaction (RECEIPT, ISSUE, ADJUST, etc.)
    """
    layer = _get_channel_layer()
    if not layer:
        return

    try:
        async_to_sync(layer.group_send)(
            f'inventory_{tenant_id}',
            {
                'type': 'inventory.balance.changed',
                'data': {
                    'type': 'inventory_balance_changed',
                    'item_id': item_id,
                    'warehouse_id': warehouse_id,
                    'new_balance': new_balance,
                    'transaction_type': transaction_type,
                },
            }
        )
    except Exception:
        logger.warning('Failed to broadcast inventory change', exc_info=True)


def broadcast_inventory_lot_update(tenant_id, lot_id, item_id, action='created'):
    """
    Broadcast a lot creation or update.

    Args:
        tenant_id: Tenant ID
        lot_id: InventoryLot primary key
        item_id: Item primary key
        action: 'created' or 'updated'
    """
    layer = _get_channel_layer()
    if not layer:
        return

    try:
        async_to_sync(layer.group_send)(
            f'inventory_{tenant_id}',
            {
                'type': 'inventory.lot.updated',
                'data': {
                    'type': 'inventory_lot_updated',
                    'lot_id': lot_id,
                    'item_id': item_id,
                    'action': action,
                },
            }
        )
    except Exception:
        logger.warning('Failed to broadcast lot update', exc_info=True)


def broadcast_inventory_stock_moved(tenant_id, item_id, from_warehouse_id, to_warehouse_id, quantity):
    """
    Broadcast a stock transfer/movement event.

    Args:
        tenant_id: Tenant ID
        item_id: Item primary key
        from_warehouse_id: Source warehouse ID
        to_warehouse_id: Destination warehouse ID
        quantity: Quantity moved
    """
    layer = _get_channel_layer()
    if not layer:
        return

    try:
        async_to_sync(layer.group_send)(
            f'inventory_{tenant_id}',
            {
                'type': 'inventory.stock.moved',
                'data': {
                    'type': 'inventory_stock_moved',
                    'item_id': item_id,
                    'from_warehouse_id': from_warehouse_id,
                    'to_warehouse_id': to_warehouse_id,
                    'quantity': quantity,
                },
            }
        )
    except Exception:
        logger.warning('Failed to broadcast stock movement', exc_info=True)


# ─── Order Broadcasts ────────────────────────────────────────────────────────────

def broadcast_order_update(tenant_id, order_type, order_id, status, data=None):
    """
    Broadcast an order status change.

    Args:
        tenant_id: Tenant ID
        order_type: 'sales_order' or 'purchase_order'
        order_id: Order primary key
        status: New status string
        data: Optional dict with additional order data
    """
    layer = _get_channel_layer()
    if not layer:
        return

    try:
        payload = {
            'type': 'order_updated',
            'order_type': order_type,
            'order_id': order_id,
            'status': status,
        }
        if data:
            payload['data'] = data

        async_to_sync(layer.group_send)(
            f'orders_{tenant_id}',
            {
                'type': 'order.updated',
                'data': payload,
            }
        )
    except Exception:
        logger.warning('Failed to broadcast order update', exc_info=True)


def broadcast_order_created(tenant_id, order_type, order_id, order_number):
    """
    Broadcast a new order creation event.

    Args:
        tenant_id: Tenant ID
        order_type: 'sales_order' or 'purchase_order'
        order_id: Order primary key
        order_number: Human-readable order number
    """
    layer = _get_channel_layer()
    if not layer:
        return

    try:
        async_to_sync(layer.group_send)(
            f'orders_{tenant_id}',
            {
                'type': 'order.created',
                'data': {
                    'type': 'order_created',
                    'order_type': order_type,
                    'order_id': order_id,
                    'order_number': order_number,
                },
            }
        )
    except Exception:
        logger.warning('Failed to broadcast order creation', exc_info=True)


# ─── Shipment Broadcasts ─────────────────────────────────────────────────────────

def broadcast_shipment_update(tenant_id, shipment_id, status, data=None):
    """
    Broadcast a shipment status change.

    Args:
        tenant_id: Tenant ID
        shipment_id: Shipment primary key
        status: New status string
        data: Optional dict with additional shipment data
    """
    layer = _get_channel_layer()
    if not layer:
        return

    try:
        payload = {
            'type': 'shipment_updated',
            'shipment_id': shipment_id,
            'status': status,
        }
        if data:
            payload['data'] = data

        async_to_sync(layer.group_send)(
            f'shipments_{tenant_id}',
            {
                'type': 'shipment.updated',
                'data': payload,
            }
        )
    except Exception:
        logger.warning('Failed to broadcast shipment update', exc_info=True)


def broadcast_shipment_delivered(tenant_id, shipment_id, shipment_number):
    """
    Broadcast a shipment delivery completion.

    Args:
        tenant_id: Tenant ID
        shipment_id: Shipment primary key
        shipment_number: Human-readable shipment number
    """
    layer = _get_channel_layer()
    if not layer:
        return

    try:
        async_to_sync(layer.group_send)(
            f'shipments_{tenant_id}',
            {
                'type': 'shipment.delivered',
                'data': {
                    'type': 'shipment_delivered',
                    'shipment_id': shipment_id,
                    'shipment_number': shipment_number,
                },
            }
        )
    except Exception:
        logger.warning('Failed to broadcast shipment delivery', exc_info=True)


# ─── Invoice Broadcasts ──────────────────────────────────────────────────────────

def broadcast_invoice_update(tenant_id, invoice_id, status, data=None):
    """
    Broadcast an invoice status change.

    Args:
        tenant_id: Tenant ID
        invoice_id: Invoice primary key
        status: New status string
        data: Optional dict with additional invoice data
    """
    layer = _get_channel_layer()
    if not layer:
        return

    try:
        payload = {
            'type': 'invoice_updated',
            'invoice_id': invoice_id,
            'status': status,
        }
        if data:
            payload['data'] = data

        async_to_sync(layer.group_send)(
            f'invoices_{tenant_id}',
            {
                'type': 'invoice.updated',
                'data': payload,
            }
        )
    except Exception:
        logger.warning('Failed to broadcast invoice update', exc_info=True)


def broadcast_invoice_payment(tenant_id, invoice_id, invoice_number, amount, new_status):
    """
    Broadcast a payment received event.

    Args:
        tenant_id: Tenant ID
        invoice_id: Invoice primary key
        invoice_number: Human-readable invoice number
        amount: Payment amount (will be converted to string)
        new_status: Invoice status after payment
    """
    layer = _get_channel_layer()
    if not layer:
        return

    try:
        async_to_sync(layer.group_send)(
            f'invoices_{tenant_id}',
            {
                'type': 'invoice.payment.received',
                'data': {
                    'type': 'invoice_payment_received',
                    'invoice_id': invoice_id,
                    'invoice_number': invoice_number,
                    'amount': str(amount),
                    'new_status': new_status,
                },
            }
        )
    except Exception:
        logger.warning('Failed to broadcast invoice payment', exc_info=True)


# ─── Notification Broadcasts ─────────────────────────────────────────────────────

def send_notification(user_id, notification_data):
    """
    Send a real-time notification to a specific user via WebSocket.

    This sends to the user-scoped group (notifications_{user_id}),
    not a tenant-scoped group.

    Args:
        user_id: Recipient user primary key
        notification_data: Dict with notification details:
            {
                'id': int,
                'title': str,
                'message': str,
                'link': str,
                'type': 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR',
                'created_at': str (ISO format),
            }
    """
    layer = _get_channel_layer()
    if not layer:
        return

    try:
        payload = {
            'type': 'notification_new',
            **notification_data,
        }

        async_to_sync(layer.group_send)(
            f'notifications_{user_id}',
            {
                'type': 'notification.new',
                'data': payload,
            }
        )
    except Exception:
        logger.warning(f'Failed to send WebSocket notification to user {user_id}', exc_info=True)
