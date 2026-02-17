from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from apps.notifications.models import Notification


class NotificationListView(APIView):
    """GET /api/v1/notifications/ - List user's notifications."""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['notifications'], summary='List my notifications')
    def get(self, request):
        notifications = Notification.objects.filter(
            tenant=request.tenant,
            recipient=request.user,
        ).order_by('-created_at')[:20]

        data = [{
            'id': n.id,
            'title': n.title,
            'message': n.message,
            'link': n.link,
            'type': n.notification_type,
            'read': n.read,
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
