"""
Broadcast utilities for WebSocket real-time updates.

These functions send updates to connected WebSocket clients via Django Channels.
Call them from views after successful mutations to notify all connected clients.
"""

import logging
from typing import Optional

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def _get_scheduler_group(tenant_id: Optional[int] = None) -> str:
    """Get the scheduler group name for a tenant."""
    if tenant_id:
        return f'scheduler_{tenant_id}'
    return 'scheduler_default'


def _broadcast_to_group(group_name: str, event_type: str, data: dict) -> None:
    """
    Internal helper to broadcast a message to a channel group.

    Args:
        group_name: The channel layer group to broadcast to
        event_type: The event type (maps to consumer method, e.g., 'scheduler.order.updated')
        data: The payload to send to clients
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning('Channel layer not configured, skipping broadcast')
        return

    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': event_type,
                'data': data,
            }
        )
    except Exception as e:
        # Log but don't fail the request if broadcast fails
        logger.error(f'Failed to broadcast {event_type}: {e}')


def broadcast_order_update(order_id: int, action: str, order_data: dict, tenant_id: Optional[int] = None) -> None:
    """
    Broadcast an order update to connected scheduler clients for the tenant.

    Args:
        order_id: The ID of the order that was modified
        action: The action performed ('created', 'updated', 'deleted')
        order_data: Serialized order data (from CalendarOrderSerializer)
        tenant_id: The tenant ID for scoped broadcasting (None broadcasts to default group)
    """
    group_name = _get_scheduler_group(tenant_id)
    _broadcast_to_group(
        group_name,
        'scheduler.order.updated',
        {
            'event': 'order_updated',
            'action': action,
            'order_id': order_id,
            'order': order_data,
        }
    )
    logger.debug(f'Broadcast order_updated: id={order_id}, action={action}, tenant={tenant_id}')


def broadcast_run_update(run_id: int, action: str, run_data: dict, tenant_id: Optional[int] = None) -> None:
    """
    Broadcast a delivery run update to connected scheduler clients for the tenant.

    Args:
        run_id: The ID of the delivery run that was modified
        action: The action performed ('created', 'updated', 'deleted')
        run_data: Serialized run data
        tenant_id: The tenant ID for scoped broadcasting (None broadcasts to default group)
    """
    group_name = _get_scheduler_group(tenant_id)
    _broadcast_to_group(
        group_name,
        'scheduler.run.updated',
        {
            'event': 'run_updated',
            'action': action,
            'run_id': run_id,
            'run': run_data,
        }
    )
    logger.debug(f'Broadcast run_updated: id={run_id}, action={action}, tenant={tenant_id}')


def broadcast_note_update(note_id: int, action: str, note_data: dict, tenant_id: Optional[int] = None) -> None:
    """
    Broadcast a scheduler note update to connected scheduler clients for the tenant.

    Args:
        note_id: The ID of the note that was modified
        action: The action performed ('created', 'updated', 'deleted')
        note_data: Serialized note data
        tenant_id: The tenant ID for scoped broadcasting (None broadcasts to default group)
    """
    group_name = _get_scheduler_group(tenant_id)
    _broadcast_to_group(
        group_name,
        'scheduler.note.updated',
        {
            'event': 'note_updated',
            'action': action,
            'note_id': note_id,
            'note': note_data,
        }
    )
    logger.debug(f'Broadcast note_updated: id={note_id}, action={action}, tenant={tenant_id}')


def broadcast_bulk_update(
    orders: list[dict] = None,
    runs: list[dict] = None,
    notes: list[dict] = None,
    tenant_id: Optional[int] = None
) -> None:
    """
    Broadcast multiple updates in a single message.

    Useful when a single operation affects multiple entities (e.g., moving a run
    also updates all orders in that run).

    Args:
        orders: List of order updates, each with 'action' and 'order' keys
        runs: List of run updates, each with 'action' and 'run' keys
        notes: List of note updates, each with 'action' and 'note' keys
        tenant_id: The tenant ID for scoped broadcasting (None broadcasts to default group)
    """
    data = {
        'event': 'bulk_update',
    }

    if orders:
        data['orders'] = orders
    if runs:
        data['runs'] = runs
    if notes:
        data['notes'] = notes

    group_name = _get_scheduler_group(tenant_id)
    _broadcast_to_group(
        group_name,
        'scheduler.bulk.update',
        data
    )
    logger.debug(f'Broadcast bulk_update: orders={len(orders or [])}, runs={len(runs or [])}, notes={len(notes or [])}, tenant={tenant_id}')


def broadcast_priority_update(
    vendor_id: int,
    date: str,
    action: str,
    data: dict,
    tenant_id: Optional[int] = None
) -> None:
    """
    Broadcast a priority list update to connected clients for the tenant.

    When a PO line is moved to a different date, this also triggers an order_updated
    broadcast since the PO's scheduled_date changes.

    Args:
        vendor_id: The vendor ID affected by the update
        date: The date (YYYY-MM-DD) affected by the update
        action: The action performed ('reordered', 'moved', 'synced')
        data: Additional context (line IDs, new sequences, etc.)
        tenant_id: The tenant ID for scoped broadcasting (None broadcasts to default group)
    """
    group_name = _get_scheduler_group(tenant_id)
    _broadcast_to_group(
        group_name,
        'scheduler.priority.updated',
        {
            'event': 'priority_updated',
            'action': action,
            'vendor_id': vendor_id,
            'date': date,
            **data,
        }
    )
    logger.debug(f'Broadcast priority_updated: vendor={vendor_id}, date={date}, action={action}, tenant={tenant_id}')
