# apps/api/v1/views/websocket.py
"""
Views for WebSocket-related operations.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from apps.api.websocket_tickets import create_ticket


@extend_schema(
    tags=['websocket'],
    summary='Get a WebSocket authentication ticket',
    description='''
    Exchange your JWT token for a short-lived WebSocket ticket.

    The ticket is valid for 30 seconds and can only be used once.
    Use this instead of passing your JWT token in the WebSocket URL.

    Usage:
    1. Call this endpoint with your JWT in the Authorization header
    2. Connect to WebSocket: ws://host/ws/scheduler/?ticket=<returned_ticket>
    ''',
    responses={
        200: {
            'type': 'object',
            'properties': {
                'ticket': {'type': 'string', 'description': 'One-time use ticket for WebSocket auth'},
                'expires_in': {'type': 'integer', 'description': 'Seconds until ticket expires'},
            }
        }
    }
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def get_websocket_ticket(request):
    """
    Generate a short-lived, single-use ticket for WebSocket authentication.

    This prevents JWT tokens from being exposed in URL query strings,
    which would be logged by web servers and visible in browser history.
    """
    user = request.user
    tenant = getattr(request, 'tenant', None)
    tenant_id = tenant.id if tenant else 0

    ticket = create_ticket(user_id=user.id, tenant_id=tenant_id)

    return Response({
        'ticket': ticket,
        'expires_in': 30,  # TICKET_EXPIRY_SECONDS
    })
