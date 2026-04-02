from django.contrib import admin
from .models import Comment, Mention, Task, DirectMessage


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('id', 'author', 'content_type', 'object_id', 'is_deleted', 'created_at')
    list_filter = ('content_type', 'is_deleted')
    search_fields = ('body', 'author__username')
    raw_id_fields = ('author', 'parent')


@admin.register(Mention)
class MentionAdmin(admin.ModelAdmin):
    list_display = ('id', 'comment', 'mentioned_user', 'mentioned_group', 'created_at')
    list_filter = ('mentioned_group',)
    raw_id_fields = ('comment', 'mentioned_user')


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'status', 'priority', 'assigned_to', 'content_type', 'object_id', 'created_at')
    list_filter = ('status', 'priority', 'content_type')
    search_fields = ('title', 'description')
    raw_id_fields = ('assigned_to', 'created_by')


@admin.register(DirectMessage)
class DirectMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'sender', 'recipient', 'read', 'created_at')
    list_filter = ('read',)
    search_fields = ('body', 'sender__username', 'recipient__username')
    raw_id_fields = ('sender', 'recipient')
