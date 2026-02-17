"""
WebSocket consumers for real-time features.

Consumers handle WebSocket connections and broadcast events to connected clients.
"""

import logging
import time
from collections import deque

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)

# Rate limiting configuration
RATE_LIMIT_MESSAGES = 30  # Max messages per window
RATE_LIMIT_WINDOW_SECONDS = 60  # Time window in seconds


class SchedulerConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for real-time scheduler updates.

    Clients connect to receive live updates when orders, delivery runs,
    or notes are modified by other users.

    Groups:
        - scheduler_{tenant_id}: Per-tenant scheduler updates for multi-tenant isolation
    """

    async def connect(self):
        """Handle WebSocket connection."""
        user = self.scope.get('user')

        # Require authenticated user
        if not user or isinstance(user, AnonymousUser):
            logger.warning('WebSocket connection rejected: unauthenticated')
            await self.close()
            return

        # Initialize rate limiting for this connection
        self._message_timestamps = deque()

        # Get tenant ID for tenant-specific group isolation
        tenant_id = await self._get_user_tenant_id(user)
        self.group_name = f'scheduler_{tenant_id}'

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()
        logger.info(f'WebSocket connected: user={user.username}, tenant={tenant_id}, channel={self.channel_name}')

        # Send connection confirmation
        await self.send_json({
            'type': 'connection_established',
            'message': 'Connected to scheduler updates',
        })

    def _is_rate_limited(self) -> bool:
        """Check if the connection has exceeded the rate limit."""
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW_SECONDS

        # Remove timestamps outside the window
        while self._message_timestamps and self._message_timestamps[0] < window_start:
            self._message_timestamps.popleft()

        # Check if we've exceeded the limit
        if len(self._message_timestamps) >= RATE_LIMIT_MESSAGES:
            return True

        # Record this message
        self._message_timestamps.append(now)
        return False

    @database_sync_to_async
    def _get_user_tenant_id(self, user):
        """Get the tenant ID for the user."""
        # User model should have a tenant relationship
        if hasattr(user, 'tenant_id') and user.tenant_id:
            return user.tenant_id
        # Fallback for users without tenant (superusers, etc.)
        return 'default'

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        # Leave the scheduler updates group
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )
        logger.info(f'WebSocket disconnected: channel={self.channel_name}, code={close_code}')

    async def receive_json(self, content):
        """
        Handle incoming messages from clients.

        Currently supports:
            - ping: Respond with pong for connection health checks
        """
        # Rate limiting check
        if self._is_rate_limited():
            logger.warning(f'WebSocket rate limit exceeded: channel={self.channel_name}')
            await self.send_json({
                'type': 'error',
                'message': 'Rate limit exceeded. Please slow down.',
            })
            return

        msg_type = content.get('type')

        if msg_type == 'ping':
            await self.send_json({'type': 'pong'})
        else:
            logger.debug(f'Unknown message type: {msg_type}')

    # ─── Event Handlers ─────────────────────────────────────────────────────────
    # These methods are called when events are broadcast to the group

    async def scheduler_order_updated(self, event):
        """Broadcast order update to client."""
        await self.send_json(event['data'])

    async def scheduler_run_updated(self, event):
        """Broadcast delivery run update to client."""
        await self.send_json(event['data'])

    async def scheduler_note_updated(self, event):
        """Broadcast scheduler note update to client."""
        await self.send_json(event['data'])

    async def scheduler_bulk_update(self, event):
        """Broadcast bulk update (multiple entities) to client."""
        await self.send_json(event['data'])

    async def scheduler_priority_updated(self, event):
        """Broadcast priority list update to client."""
        await self.send_json(event['data'])


# ─── Base Tenant Consumer ────────────────────────────────────────────────────────

class BaseTenantConsumer(AsyncJsonWebsocketConsumer):
    """
    Base consumer with common tenant-scoped WebSocket logic.

    Subclasses set `channel_prefix` and define event handler methods.
    Provides: authentication, rate limiting, ping/pong, tenant-scoped groups.
    """

    channel_prefix = ''  # Override in subclass

    async def connect(self):
        """Authenticate and join tenant-scoped group."""
        user = self.scope.get('user')

        if not user or isinstance(user, AnonymousUser):
            logger.warning(f'WebSocket connection rejected ({self.channel_prefix}): unauthenticated')
            await self.close()
            return

        self._message_timestamps = deque()
        self._user = user

        tenant_id = await self._get_user_tenant_id(user)
        self.group_name = f'{self.channel_prefix}_{tenant_id}'

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()
        logger.info(
            f'WebSocket connected ({self.channel_prefix}): '
            f'user={user.username}, tenant={tenant_id}, channel={self.channel_name}'
        )

        await self.send_json({
            'type': 'connection_established',
            'message': f'Connected to {self.channel_prefix} updates',
        })

    def _is_rate_limited(self) -> bool:
        """Check if the connection has exceeded the rate limit."""
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW_SECONDS

        while self._message_timestamps and self._message_timestamps[0] < window_start:
            self._message_timestamps.popleft()

        if len(self._message_timestamps) >= RATE_LIMIT_MESSAGES:
            return True

        self._message_timestamps.append(now)
        return False

    @database_sync_to_async
    def _get_user_tenant_id(self, user):
        """Get the tenant ID for the user."""
        if hasattr(user, 'tenant_id') and user.tenant_id:
            return user.tenant_id
        return 'default'

    async def disconnect(self, close_code):
        """Leave group on disconnect."""
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )
        logger.info(
            f'WebSocket disconnected ({self.channel_prefix}): '
            f'channel={self.channel_name}, code={close_code}'
        )

    async def receive_json(self, content):
        """Handle incoming messages (ping/pong)."""
        if self._is_rate_limited():
            logger.warning(f'WebSocket rate limit exceeded ({self.channel_prefix}): channel={self.channel_name}')
            await self.send_json({
                'type': 'error',
                'message': 'Rate limit exceeded. Please slow down.',
            })
            return

        msg_type = content.get('type')

        if msg_type == 'ping':
            await self.send_json({'type': 'pong'})
        else:
            logger.debug(f'Unknown message type ({self.channel_prefix}): {msg_type}')


# ─── Inventory Consumer ──────────────────────────────────────────────────────────

class InventoryConsumer(BaseTenantConsumer):
    """
    WebSocket consumer for real-time inventory updates.

    Broadcasts inventory balance changes, lot updates, and stock movements.

    Groups:
        - inventory_{tenant_id}: Per-tenant inventory updates
    """

    channel_prefix = 'inventory'

    async def inventory_balance_changed(self, event):
        """Broadcast inventory balance change to client."""
        await self.send_json(event['data'])

    async def inventory_lot_updated(self, event):
        """Broadcast lot update to client."""
        await self.send_json(event['data'])

    async def inventory_stock_moved(self, event):
        """Broadcast stock movement to client."""
        await self.send_json(event['data'])


# ─── Order Consumer ──────────────────────────────────────────────────────────────

class OrderConsumer(BaseTenantConsumer):
    """
    WebSocket consumer for real-time order updates.

    Broadcasts SO/PO status changes and new order events.

    Groups:
        - orders_{tenant_id}: Per-tenant order updates
    """

    channel_prefix = 'orders'

    async def order_updated(self, event):
        """Broadcast order status update to client."""
        await self.send_json(event['data'])

    async def order_created(self, event):
        """Broadcast new order event to client."""
        await self.send_json(event['data'])


# ─── Shipment Consumer ───────────────────────────────────────────────────────────

class ShipmentConsumer(BaseTenantConsumer):
    """
    WebSocket consumer for real-time shipment updates.

    Broadcasts shipment status changes and delivery updates.

    Groups:
        - shipments_{tenant_id}: Per-tenant shipment updates
    """

    channel_prefix = 'shipments'

    async def shipment_updated(self, event):
        """Broadcast shipment status update to client."""
        await self.send_json(event['data'])

    async def shipment_delivered(self, event):
        """Broadcast delivery completion to client."""
        await self.send_json(event['data'])


# ─── Invoice Consumer ────────────────────────────────────────────────────────────

class InvoiceConsumer(BaseTenantConsumer):
    """
    WebSocket consumer for real-time invoice updates.

    Broadcasts invoice status changes and payment events.

    Groups:
        - invoices_{tenant_id}: Per-tenant invoice updates
    """

    channel_prefix = 'invoices'

    async def invoice_updated(self, event):
        """Broadcast invoice status update to client."""
        await self.send_json(event['data'])

    async def invoice_payment_received(self, event):
        """Broadcast payment received event to client."""
        await self.send_json(event['data'])


# ─── Notification Consumer ───────────────────────────────────────────────────────

class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for personal notification delivery.

    Unlike other consumers, this joins a user-scoped group (not tenant-scoped)
    so notifications are delivered only to the intended recipient.

    Groups:
        - notifications_{user_id}: Per-user notification delivery
    """

    async def connect(self):
        """Authenticate and join user-scoped notification group."""
        user = self.scope.get('user')

        if not user or isinstance(user, AnonymousUser):
            logger.warning('WebSocket connection rejected (notifications): unauthenticated')
            await self.close()
            return

        self._message_timestamps = deque()
        self._user = user

        self.group_name = f'notifications_{user.id}'

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()
        logger.info(
            f'WebSocket connected (notifications): '
            f'user={user.username}, channel={self.channel_name}'
        )

        await self.send_json({
            'type': 'connection_established',
            'message': 'Connected to notification updates',
        })

    def _is_rate_limited(self) -> bool:
        """Check if the connection has exceeded the rate limit."""
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW_SECONDS

        while self._message_timestamps and self._message_timestamps[0] < window_start:
            self._message_timestamps.popleft()

        if len(self._message_timestamps) >= RATE_LIMIT_MESSAGES:
            return True

        self._message_timestamps.append(now)
        return False

    async def disconnect(self, close_code):
        """Leave notification group on disconnect."""
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )
        logger.info(f'WebSocket disconnected (notifications): channel={self.channel_name}, code={close_code}')

    async def receive_json(self, content):
        """Handle incoming messages (ping/pong)."""
        if self._is_rate_limited():
            logger.warning(f'WebSocket rate limit exceeded (notifications): channel={self.channel_name}')
            await self.send_json({
                'type': 'error',
                'message': 'Rate limit exceeded. Please slow down.',
            })
            return

        msg_type = content.get('type')

        if msg_type == 'ping':
            await self.send_json({'type': 'pong'})
        else:
            logger.debug(f'Unknown message type (notifications): {msg_type}')

    # ─── Event Handlers ──────────────────────────────────────────────────────

    async def notification_new(self, event):
        """Deliver a new notification to the user."""
        await self.send_json(event['data'])
