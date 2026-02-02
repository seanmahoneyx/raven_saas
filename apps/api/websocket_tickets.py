"""
WebSocket ticket system for secure authentication.

Instead of passing JWT tokens in URL query strings (which get logged),
clients exchange their JWT for a short-lived, single-use ticket.

Flow:
1. Client calls POST /api/v1/ws/ticket/ with JWT in Authorization header
2. Server returns a ticket (UUID) valid for 30 seconds
3. Client connects to WebSocket with ?ticket=<ticket>
4. Server validates and consumes the ticket (single-use)
"""

import secrets
import time
import logging
from typing import Optional, Tuple
from threading import Lock

logger = logging.getLogger(__name__)

# Ticket configuration
TICKET_EXPIRY_SECONDS = 30  # Tickets expire after 30 seconds
TICKET_CLEANUP_INTERVAL = 60  # Cleanup expired tickets every 60 seconds

# In-memory ticket store (for single-server deployments)
# For multi-server, use Django cache with Redis backend
_ticket_store: dict[str, dict] = {}
_ticket_lock = Lock()
_last_cleanup = time.time()


def _cleanup_expired_tickets():
    """Remove expired tickets from the store."""
    global _last_cleanup
    now = time.time()

    if now - _last_cleanup < TICKET_CLEANUP_INTERVAL:
        return

    _last_cleanup = now
    expired = [
        ticket_id for ticket_id, data in _ticket_store.items()
        if data['expires_at'] < now
    ]
    for ticket_id in expired:
        del _ticket_store[ticket_id]

    if expired:
        logger.debug(f'Cleaned up {len(expired)} expired WebSocket tickets')


def create_ticket(user_id: int, tenant_id: int) -> str:
    """
    Create a new WebSocket authentication ticket.

    Args:
        user_id: The authenticated user's ID
        tenant_id: The user's tenant ID

    Returns:
        A unique ticket string
    """
    ticket = secrets.token_urlsafe(32)
    expires_at = time.time() + TICKET_EXPIRY_SECONDS

    with _ticket_lock:
        _cleanup_expired_tickets()
        _ticket_store[ticket] = {
            'user_id': user_id,
            'tenant_id': tenant_id,
            'expires_at': expires_at,
        }

    logger.debug(f'Created WebSocket ticket for user {user_id}')
    return ticket


def validate_and_consume_ticket(ticket: str) -> Optional[Tuple[int, int]]:
    """
    Validate a ticket and consume it (single-use).

    Args:
        ticket: The ticket string to validate

    Returns:
        Tuple of (user_id, tenant_id) if valid, None otherwise
    """
    with _ticket_lock:
        _cleanup_expired_tickets()

        ticket_data = _ticket_store.pop(ticket, None)

        if not ticket_data:
            logger.warning('Invalid or already-used WebSocket ticket')
            return None

        if ticket_data['expires_at'] < time.time():
            logger.warning('Expired WebSocket ticket')
            return None

        logger.debug(f'Validated WebSocket ticket for user {ticket_data["user_id"]}')
        return (ticket_data['user_id'], ticket_data['tenant_id'])
