# apps/api/v1/views/health.py
"""
Health check endpoint for load balancers and monitoring.

Returns HTTP 200 with component status when the service is healthy.
No authentication required.
"""
from django.db import connection
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    GET /api/v1/health/

    Returns service health with database and Redis connectivity status.
    Used by Digital Ocean health checks, load balancers, and uptime monitors.
    """
    status = {
        'status': 'healthy',
        'database': 'unknown',
        'redis': 'unknown',
    }
    overall_healthy = True

    # Check database
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        status['database'] = 'connected'
    except Exception as e:
        status['database'] = f'error: {type(e).__name__}'
        overall_healthy = False

    # Check Redis
    try:
        channel_layer = settings.CHANNEL_LAYERS.get('default', {})
        backend = channel_layer.get('BACKEND', '')
        if 'Redis' in backend:
            from channels.layers import get_channel_layer
            import asyncio

            layer = get_channel_layer()

            async def _check_redis():
                # Send and receive a test message
                await layer.send('health-check', {'type': 'health.check'})
                await layer.receive('health-check')

            asyncio.run(_check_redis())
            status['redis'] = 'connected'
        else:
            status['redis'] = 'in-memory (dev mode)'
    except Exception as e:
        status['redis'] = f'error: {type(e).__name__}'
        # Redis being down is degraded, not fatal
        status['status'] = 'degraded'

    if not overall_healthy:
        status['status'] = 'unhealthy'
        return Response(status, status=503)

    return Response(status, status=200)
