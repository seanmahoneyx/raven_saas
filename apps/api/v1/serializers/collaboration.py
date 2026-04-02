# apps/api/v1/serializers/collaboration.py
"""
Serializers for the collaboration system (comments, tasks, mentions).
"""
from rest_framework import serializers
from django.contrib.contenttypes.models import ContentType

from apps.collaboration.models import Comment, Task
from .base import TenantModelSerializer


# Allowed content types for collaboration
ALLOWED_MODELS = {
    'salesorder', 'purchaseorder', 'estimate', 'rfq',
    'contract', 'designrequest', 'invoice',
}


def resolve_content_type(model_name):
    """Resolve a model name string to a ContentType, restricted to allowed models."""
    model_name = model_name.lower()
    if model_name not in ALLOWED_MODELS:
        raise serializers.ValidationError(
            f"Invalid content_type '{model_name}'. Allowed: {', '.join(sorted(ALLOWED_MODELS))}"
        )
    try:
        return ContentType.objects.get(model=model_name)
    except ContentType.DoesNotExist:
        raise serializers.ValidationError(f"Content type '{model_name}' not found.")


class CommentSerializer(TenantModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_username = serializers.SerializerMethodField()
    reply_count = serializers.SerializerMethodField()
    content_type_model = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            'id', 'content_type', 'object_id', 'content_type_model',
            'author', 'author_name', 'author_username',
            'body', 'parent', 'is_deleted',
            'reply_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'author', 'is_deleted', 'created_at', 'updated_at']

    def get_author_name(self, obj):
        return obj.author.name or obj.author.username

    def get_author_username(self, obj):
        return obj.author.username

    def get_reply_count(self, obj):
        return obj.replies.filter(is_deleted=False).count()

    def get_content_type_model(self, obj):
        return obj.content_type.model if obj.content_type else None


class CommentCreateSerializer(serializers.Serializer):
    content_type = serializers.CharField(help_text="Model name (e.g., 'salesorder')")
    object_id = serializers.IntegerField()
    body = serializers.CharField()
    parent = serializers.IntegerField(required=False, allow_null=True, default=None)

    def validate_content_type(self, value):
        return resolve_content_type(value)

    def validate_parent(self, value):
        if value is not None:
            try:
                Comment.objects.get(id=value)
            except Comment.DoesNotExist:
                raise serializers.ValidationError("Parent comment not found.")
        return value


class TaskSerializer(TenantModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    content_type_model = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            'id', 'content_type', 'object_id', 'content_type_model',
            'title', 'description', 'status', 'priority',
            'assigned_to', 'assigned_to_name',
            'created_by', 'created_by_name',
            'due_date', 'completed_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'completed_at', 'created_at', 'updated_at']

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.name or obj.assigned_to.username
        return None

    def get_created_by_name(self, obj):
        return obj.created_by.name or obj.created_by.username

    def get_content_type_model(self, obj):
        return obj.content_type.model if obj.content_type else None


class TaskCreateSerializer(serializers.Serializer):
    content_type = serializers.CharField(help_text="Model name (e.g., 'salesorder')")
    object_id = serializers.IntegerField()
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, default='')
    assigned_to = serializers.IntegerField(required=False, allow_null=True, default=None)
    priority = serializers.ChoiceField(choices=Task.PRIORITY_CHOICES, default='normal')
    due_date = serializers.DateField(required=False, allow_null=True, default=None)

    def validate_content_type(self, value):
        return resolve_content_type(value)

    def validate_assigned_to(self, value):
        if value is not None:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                User.objects.get(id=value)
            except User.DoesNotExist:
                raise serializers.ValidationError("User not found.")
        return value


class TaskUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Task.STATUS_CHOICES, required=False)
    assigned_to = serializers.IntegerField(required=False, allow_null=True)
    title = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False)
    priority = serializers.ChoiceField(choices=Task.PRIORITY_CHOICES, required=False)
    due_date = serializers.DateField(required=False, allow_null=True)


class MentionableUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    username = serializers.CharField()


class MentionableGroupSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class DirectMessageSerializer(TenantModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_username = serializers.SerializerMethodField()
    recipient_name = serializers.SerializerMethodField()
    recipient_username = serializers.SerializerMethodField()

    class Meta:
        from apps.collaboration.models import DirectMessage
        model = DirectMessage
        fields = [
            'id', 'sender', 'sender_name', 'sender_username',
            'recipient', 'recipient_name', 'recipient_username',
            'body', 'read', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'sender', 'read', 'created_at', 'updated_at']

    def get_sender_name(self, obj):
        return obj.sender.name or obj.sender.username

    def get_sender_username(self, obj):
        return obj.sender.username

    def get_recipient_name(self, obj):
        return obj.recipient.name or obj.recipient.username

    def get_recipient_username(self, obj):
        return obj.recipient.username


class DirectMessageCreateSerializer(serializers.Serializer):
    recipient = serializers.IntegerField()
    body = serializers.CharField()

    def validate_recipient(self, value):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            User.objects.get(id=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("User not found.")
        return value


