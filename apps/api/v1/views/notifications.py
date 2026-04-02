from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from apps.notifications.models import Notification


class NotificationListView(APIView):
    """GET /api/v1/notifications/ - List user's notifications.

    Query params:
        type: Filter by notification_type (e.g., MENTION, TASK, COMMENT)
        content_type: Filter by related model name (e.g., salesorder)
        object_id: Filter by related object ID (requires content_type)
        limit: Max results (default 20, max 100)
        offset: Pagination offset (default 0)
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['notifications'], summary='List my notifications')
    def get(self, request):
        qs = Notification.objects.filter(
            tenant=request.tenant,
            recipient=request.user,
        ).order_by('-created_at')

        # Filter by notification type
        notif_type = request.query_params.get('type')
        if notif_type:
            qs = qs.filter(notification_type=notif_type.upper())

        # Filter by related content type/object
        ct_model = request.query_params.get('content_type')
        if ct_model:
            from django.contrib.contenttypes.models import ContentType
            try:
                ct = ContentType.objects.get(model=ct_model.lower())
                qs = qs.filter(content_type=ct)
                object_id = request.query_params.get('object_id')
                if object_id:
                    qs = qs.filter(object_id=object_id)
            except ContentType.DoesNotExist:
                pass

        # Pagination
        limit = min(int(request.query_params.get('limit', 20)), 100)
        offset = int(request.query_params.get('offset', 0))

        notifications = qs[offset:offset + limit]

        data = [{
            'id': n.id,
            'title': n.title,
            'message': n.message,
            'link': n.link,
            'type': n.notification_type,
            'read': n.read,
            'content_type': n.content_type.model if n.content_type else None,
            'object_id': n.object_id,
            'created_at': n.created_at.isoformat(),
        } for n in notifications]

        unread_count = Notification.objects.filter(
            tenant=request.tenant,
            recipient=request.user,
            read=False,
        ).count()

        return Response({
            'notifications': data,
            'unread_count': unread_count,
            'count': qs.count(),
        })


class NotificationMarkReadView(APIView):
    """POST /api/v1/notifications/mark-read/ - Mark notifications as read."""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['notifications'], summary='Mark notifications as read')
    def post(self, request):
        ids = request.data.get('ids', [])
        if ids:
            Notification.objects.filter(
                tenant=request.tenant,
                recipient=request.user,
                id__in=ids,
            ).update(read=True)
        else:
            # Mark all as read
            Notification.objects.filter(
                tenant=request.tenant,
                recipient=request.user,
                read=False,
            ).update(read=True)
        return Response({'status': 'ok'})
