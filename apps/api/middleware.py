"""
WebSocket middleware for authentication and tenant context.

Provides secure authentication for WebSocket connections using
ticket-based authentication (preferred) or JWT tokens (deprecated).

Security: Ticket-based auth is preferred because tokens in URL query
strings are logged by web servers and visible in browser history.
"""

import logging

from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser

from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from apps.api.websocket_tickets import validate_and_consume_ticket

logger = logging.getLogger(__name__)


class JWTAuthMiddleware(BaseMiddleware):
    """
    Authentication middleware for Django Channels WebSockets.

    Supports two authentication methods:
    1. Ticket-based (PREFERRED): ws://host/ws/endpoint/?ticket=<ticket>
       - Tickets are short-lived (30s) and single-use
       - Get a ticket from POST /api/v1/ws/ticket/

    2. Token-based (DEPRECATED): ws://host/ws/endpoint/?token=<jwt>
       - Kept for backwards compatibility during migration
       - Will log deprecation warnings
    """

    async def __call__(self, scope, receive, send):
        # Extract params from query string
        query_string = scope.get('query_string', b'').decode('utf-8')
        query_params = dict(
            param.split('=', 1) for param in query_string.split('&')
            if '=' in param
        )

        # Try ticket-based auth first (preferred)
        ticket = query_params.get('ticket')
        if ticket:
            scope['user'] = await self.get_user_from_ticket(ticket)
            return await super().__call__(scope, receive, send)

        # Fall back to token-based auth (deprecated)
        token = query_params.get('token')
        if token:
            logger.warning(
                'DEPRECATED: WebSocket token-based auth is deprecated. '
                'Use ticket-based auth via POST /api/v1/ws/ticket/'
            )
            scope['user'] = await self.get_user_from_token(token)
            return await super().__call__(scope, receive, send)

        # No credentials provided
        scope['user'] = AnonymousUser()
        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def get_user_from_ticket(self, ticket: str):
        """
        Validate ticket and return the associated user.

        Tickets are single-use and expire after 30 seconds.
        Returns AnonymousUser if ticket is invalid, expired, or already used.
        """
        result = validate_and_consume_ticket(ticket)
        if result is None:
            return AnonymousUser()

        user_id, tenant_id = result
        User = get_user_model()

        try:
            user = User.objects.get(id=user_id)
            # Store tenant_id on user for the consumer to access
            user._ws_tenant_id = tenant_id
            return user
        except User.DoesNotExist:
            return AnonymousUser()

    @database_sync_to_async
    def get_user_from_token(self, token: str):
        """
        Validate JWT token and return the associated user.

        DEPRECATED: Use ticket-based auth instead.
        Returns AnonymousUser if token is invalid or expired.
        """
        try:
            validated_token = AccessToken(token)
            user_id = validated_token.get('user_id')

            if user_id is None:
                return AnonymousUser()

            User = get_user_model()
            try:
                user = User.objects.get(id=user_id)
                return user
            except User.DoesNotExist:
                return AnonymousUser()

        except (InvalidToken, TokenError):
            return AnonymousUser()
