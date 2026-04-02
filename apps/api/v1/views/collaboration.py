# apps/api/v1/views/collaboration.py
"""
API views for the collaboration system (comments, tasks, @mentions).
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from drf_spectacular.utils import extend_schema

from apps.collaboration.models import Comment, Task, DirectMessage
from apps.collaboration.services import create_comment, create_task, update_task_status
from apps.api.v1.serializers.collaboration import (
    CommentSerializer, CommentCreateSerializer,
    TaskSerializer, TaskCreateSerializer, TaskUpdateSerializer,
    DirectMessageSerializer,
)

User = get_user_model()


class CommentListCreateView(APIView):
    """GET /api/v1/collaboration/comments/?content_type=salesorder&object_id=42"""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['collaboration'], summary='List comments for a transaction')
    def get(self, request):
        ct_model = request.query_params.get('content_type')
        object_id = request.query_params.get('object_id')

        if not ct_model or not object_id:
            return Response(
                {'error': 'content_type and object_id are required query parameters'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ct = ContentType.objects.get(model=ct_model.lower())
        except ContentType.DoesNotExist:
            return Response({'error': f"Invalid content_type '{ct_model}'"}, status=status.HTTP_400_BAD_REQUEST)

        comments = Comment.objects.filter(
            tenant=request.tenant,
            content_type=ct,
            object_id=object_id,
            parent__isnull=True,  # Top-level comments only
        ).select_related('author').prefetch_related('replies__author')

        # Include replies inline
        results = []
        for comment in comments:
            data = CommentSerializer(comment).data
            if not comment.is_deleted:
                replies = comment.replies.filter(is_deleted=False).select_related('author')
                data['replies'] = CommentSerializer(replies, many=True).data
            else:
                data['body'] = '[deleted]'
                data['replies'] = []
            results.append(data)

        return Response({'results': results, 'count': len(results)})

    @extend_schema(tags=['collaboration'], summary='Create a comment')
    def post(self, request):
        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ct = serializer.validated_data['content_type']
        object_id = serializer.validated_data['object_id']
        body = serializer.validated_data['body']
        parent_id = serializer.validated_data.get('parent')

        parent = Comment.objects.get(id=parent_id) if parent_id else None

        # Resolve content object
        model_class = ct.model_class()
        try:
            content_object = model_class.objects.get(
                pk=object_id,
                tenant=request.tenant,
            )
        except model_class.DoesNotExist:
            return Response({'error': 'Object not found'}, status=status.HTTP_404_NOT_FOUND)

        comment = create_comment(
            tenant=request.tenant,
            author=request.user,
            content_object=content_object,
            body=body,
            parent=parent,
        )

        return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


class CommentDetailView(APIView):
    """PUT/DELETE /api/v1/collaboration/comments/<id>/"""
    permission_classes = [IsAuthenticated]

    def _get_comment(self, request, pk):
        try:
            return Comment.objects.get(pk=pk, tenant=request.tenant)
        except Comment.DoesNotExist:
            return None

    @extend_schema(tags=['collaboration'], summary='Update a comment')
    def put(self, request, pk):
        comment = self._get_comment(request, pk)
        if not comment:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        if comment.author != request.user:
            return Response({'error': 'Cannot edit another user\'s comment'}, status=status.HTTP_403_FORBIDDEN)

        body = request.data.get('body')
        if body:
            comment.body = body
            comment.save(update_fields=['body', 'updated_at'])

        return Response(CommentSerializer(comment).data)

    @extend_schema(tags=['collaboration'], summary='Soft-delete a comment')
    def delete(self, request, pk):
        comment = self._get_comment(request, pk)
        if not comment:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        if comment.author != request.user:
            return Response({'error': 'Cannot delete another user\'s comment'}, status=status.HTTP_403_FORBIDDEN)

        comment.is_deleted = True
        comment.save(update_fields=['is_deleted', 'updated_at'])
        return Response({'status': 'deleted'})


class TaskListCreateView(APIView):
    """GET/POST /api/v1/collaboration/tasks/"""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['collaboration'], summary='List tasks for a transaction')
    def get(self, request):
        ct_model = request.query_params.get('content_type')
        object_id = request.query_params.get('object_id')

        if not ct_model or not object_id:
            return Response(
                {'error': 'content_type and object_id are required query parameters'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ct = ContentType.objects.get(model=ct_model.lower())
        except ContentType.DoesNotExist:
            return Response({'error': f"Invalid content_type '{ct_model}'"}, status=status.HTTP_400_BAD_REQUEST)

        tasks = Task.objects.filter(
            tenant=request.tenant,
            content_type=ct,
            object_id=object_id,
        ).select_related('assigned_to', 'created_by')

        data = TaskSerializer(tasks, many=True).data
        return Response({'results': data, 'count': len(data)})

    @extend_schema(tags=['collaboration'], summary='Create a task')
    def post(self, request):
        serializer = TaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ct = serializer.validated_data['content_type']
        object_id = serializer.validated_data['object_id']

        model_class = ct.model_class()
        try:
            content_object = model_class.objects.get(
                pk=object_id,
                tenant=request.tenant,
            )
        except model_class.DoesNotExist:
            return Response({'error': 'Object not found'}, status=status.HTTP_404_NOT_FOUND)

        assigned_to_id = serializer.validated_data.get('assigned_to')
        assigned_to = User.objects.get(id=assigned_to_id) if assigned_to_id else None

        task = create_task(
            tenant=request.tenant,
            created_by=request.user,
            content_object=content_object,
            title=serializer.validated_data['title'],
            description=serializer.validated_data.get('description', ''),
            assigned_to=assigned_to,
            priority=serializer.validated_data.get('priority', 'normal'),
            due_date=serializer.validated_data.get('due_date'),
        )

        return Response(TaskSerializer(task).data, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    """PUT /api/v1/collaboration/tasks/<id>/"""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['collaboration'], summary='Update a task')
    def put(self, request, pk):
        try:
            task = Task.objects.get(pk=pk, tenant=request.tenant)
        except Task.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = TaskUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data.get('status')
        if new_status and new_status != task.status:
            update_task_status(task, request.user, new_status)

        # Update other fields
        for field in ('title', 'description', 'priority', 'due_date'):
            if field in serializer.validated_data:
                setattr(task, field, serializer.validated_data[field])

        if 'assigned_to' in serializer.validated_data:
            assigned_to_id = serializer.validated_data['assigned_to']
            task.assigned_to = User.objects.get(id=assigned_to_id) if assigned_to_id else None

        task.save()

        return Response(TaskSerializer(task).data)


class MyTasksView(APIView):
    """GET /api/v1/collaboration/tasks/my/ - Tasks assigned to current user."""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['collaboration'], summary='List my assigned tasks')
    def get(self, request):
        status_filter = request.query_params.get('status')

        tasks = Task.objects.filter(
            tenant=request.tenant,
            assigned_to=request.user,
        ).select_related('assigned_to', 'created_by', 'content_type')

        if status_filter:
            tasks = tasks.filter(status=status_filter)

        data = TaskSerializer(tasks, many=True).data
        return Response({'results': data, 'count': len(data)})


class MentionableUsersView(APIView):
    """GET /api/v1/users/mentionable/ - Users and groups available for @mention."""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['collaboration'], summary='List mentionable users and groups')
    def get(self, request):
        search = request.query_params.get('q', '').strip()

        users_qs = User.objects.filter(is_active=True)
        if search:
            users_qs = users_qs.filter(
                Q(name__icontains=search) | Q(username__icontains=search)
            )
        users_qs = users_qs.values('id', 'name', 'username')[:20]

        groups_qs = Group.objects.all()
        if search:
            groups_qs = groups_qs.filter(name__icontains=search)
        groups_qs = groups_qs.values('id', 'name')[:10]

        return Response({
            'users': list(users_qs),
            'groups': list(groups_qs),
        })


class ConversationListView(APIView):
    """GET /api/v1/collaboration/messages/ - List conversations for current user."""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['collaboration'], summary='List my conversations')
    def get(self, request):
        me = request.user

        # Get all users I've exchanged messages with
        sent_to = DirectMessage.objects.filter(
            tenant=request.tenant, sender=me
        ).values_list('recipient_id', flat=True).distinct()

        received_from = DirectMessage.objects.filter(
            tenant=request.tenant, recipient=me
        ).values_list('sender_id', flat=True).distinct()

        partner_ids = set(sent_to) | set(received_from)

        conversations = []
        for partner_id in partner_ids:
            partner = User.objects.filter(id=partner_id).first()
            if not partner:
                continue

            # Last message in conversation
            last_msg = DirectMessage.objects.filter(
                tenant=request.tenant,
            ).filter(
                Q(sender=me, recipient=partner) | Q(sender=partner, recipient=me)
            ).order_by('-created_at').first()

            # Unread count (messages from partner that I haven't read)
            unread = DirectMessage.objects.filter(
                tenant=request.tenant,
                sender=partner,
                recipient=me,
                read=False,
            ).count()

            if last_msg:
                conversations.append({
                    'user_id': partner.id,
                    'user_name': partner.name or partner.username,
                    'user_username': partner.username,
                    'last_message': last_msg.body[:100],
                    'last_message_at': last_msg.created_at.isoformat(),
                    'unread_count': unread,
                })

        # Sort by most recent message
        conversations.sort(key=lambda c: c['last_message_at'], reverse=True)

        return Response({'results': conversations})


class DirectMessageListView(APIView):
    """GET/POST /api/v1/collaboration/messages/<user_id>/"""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['collaboration'], summary='Get messages with a user')
    def get(self, request, user_id):
        me = request.user

        try:
            partner = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        messages = DirectMessage.objects.filter(
            tenant=request.tenant,
        ).filter(
            Q(sender=me, recipient=partner) | Q(sender=partner, recipient=me)
        ).select_related('sender', 'recipient').order_by('created_at')

        # Mark unread messages from partner as read
        DirectMessage.objects.filter(
            tenant=request.tenant,
            sender=partner,
            recipient=me,
            read=False,
        ).update(read=True)

        data = DirectMessageSerializer(messages, many=True).data
        return Response({'results': data, 'count': len(data)})

    @extend_schema(tags=['collaboration'], summary='Send a message to a user')
    def post(self, request, user_id):
        me = request.user

        try:
            recipient = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        body = request.data.get('body', '').strip()
        if not body:
            return Response({'error': 'Body is required'}, status=status.HTTP_400_BAD_REQUEST)

        dm = DirectMessage.objects.create(
            tenant=request.tenant,
            sender=me,
            recipient=recipient,
            body=body,
        )

        # Notify recipient via existing notification system
        from apps.notifications.services import notify_user
        notify_user(
            tenant=request.tenant,
            recipient=recipient,
            title=f'New message from {me.name or me.username}',
            message=body[:200],
            link='/notifications?tab=messages',
            notification_type='COMMENT',
        )

        return Response(DirectMessageSerializer(dm).data, status=status.HTTP_201_CREATED)


class UnreadMessageCountView(APIView):
    """GET /api/v1/collaboration/messages/unread-count/"""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['collaboration'], summary='Get total unread DM count')
    def get(self, request):
        count = DirectMessage.objects.filter(
            tenant=request.tenant,
            recipient=request.user,
            read=False,
        ).count()
        return Response({'unread_count': count})
