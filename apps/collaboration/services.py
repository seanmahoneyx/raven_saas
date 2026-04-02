# apps/collaboration/services.py
"""
Collaboration services for comments, mentions, and tasks.

All functions create notifications and broadcast via WebSocket
using the existing notify_user/notify_group infrastructure.
"""
import re

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from apps.notifications.services import notify_user, notify_group
from .models import Comment, Mention, Task

User = get_user_model()

# Regex patterns for mention markup
USER_MENTION_RE = re.compile(r'@\[user:(\d+)\]')
GROUP_MENTION_RE = re.compile(r'@\[group:([^\]]+)\]')


def parse_mentions(body):
    """
    Extract @mention references from comment body text.

    Returns:
        tuple: (user_ids: list[int], group_names: list[str])
    """
    user_ids = [int(m) for m in USER_MENTION_RE.findall(body)]
    group_names = GROUP_MENTION_RE.findall(body)
    return user_ids, group_names


def _get_transaction_link(content_object):
    """Build a frontend link for a transaction object."""
    model_name = content_object.__class__.__name__.lower()
    link_map = {
        'salesorder': f'/orders/sales/{content_object.pk}',
        'purchaseorder': f'/orders/purchase/{content_object.pk}',
        'estimate': f'/estimates/{content_object.pk}',
        'rfq': f'/rfqs/{content_object.pk}',
        'contract': f'/contracts/{content_object.pk}',
        'designrequest': f'/design-requests/{content_object.pk}',
        'invoice': f'/invoices/{content_object.pk}',
    }
    return link_map.get(model_name, '')


def _get_transaction_label(content_object):
    """Get a human-readable label for a transaction object."""
    model_name = content_object.__class__.__name__
    # Most transaction models have a number field
    for attr in ('number', 'so_number', 'po_number', 'rfq_number', 'estimate_number', 'invoice_number'):
        if hasattr(content_object, attr):
            val = getattr(content_object, attr)
            if val:
                return f"{model_name} {val}"
    return f"{model_name} #{content_object.pk}"


def create_comment(tenant, author, content_object, body, parent=None):
    """
    Create a comment on a transaction and notify mentioned users/groups.

    Args:
        tenant: The tenant instance
        author: The User creating the comment
        content_object: The transaction (SalesOrder, PO, etc.)
        body: Comment text with @mention markup
        parent: Optional parent Comment for threading

    Returns:
        Comment instance
    """
    ct = ContentType.objects.get_for_model(content_object)

    comment = Comment.objects.create(
        tenant=tenant,
        content_type=ct,
        object_id=content_object.pk,
        author=author,
        body=body,
        parent=parent,
    )

    # Parse and create mention records
    user_ids, group_names = parse_mentions(body)
    link = _get_transaction_link(content_object)
    label = _get_transaction_label(content_object)

    # Notify mentioned users
    mentioned_users = User.objects.filter(id__in=user_ids).exclude(id=author.id)
    for user in mentioned_users:
        Mention.objects.create(
            tenant=tenant,
            comment=comment,
            mentioned_user=user,
        )
        notify_user(
            tenant=tenant,
            recipient=user,
            title=f'{author.name or author.username} mentioned you on {label}',
            message=body[:200],
            link=link,
            notification_type='MENTION',
            content_type=ct,
            object_id=content_object.pk,
        )

    # Notify mentioned groups
    for group_name in group_names:
        try:
            group = Group.objects.get(name=group_name)
        except Group.DoesNotExist:
            continue

        Mention.objects.create(
            tenant=tenant,
            comment=comment,
            mentioned_group=group,
        )
        # Notify all users in the group except the author
        group_users = User.objects.filter(groups=group).exclude(id=author.id)
        # Exclude users already notified individually
        group_users = group_users.exclude(id__in=user_ids)
        for user in group_users:
            notify_user(
                tenant=tenant,
                recipient=user,
                title=f'{author.name or author.username} mentioned @{group_name} on {label}',
                message=body[:200],
                link=link,
                notification_type='MENTION',
                content_type=ct,
                object_id=content_object.pk,
            )

    return comment


def create_task(tenant, created_by, content_object, title, description='',
                assigned_to=None, priority='normal', due_date=None):
    """
    Create a task on a transaction and notify the assignee.

    Returns:
        Task instance
    """
    ct = ContentType.objects.get_for_model(content_object)

    task = Task.objects.create(
        tenant=tenant,
        content_type=ct,
        object_id=content_object.pk,
        title=title,
        description=description,
        created_by=created_by,
        assigned_to=assigned_to,
        priority=priority,
        due_date=due_date,
    )

    # Notify assignee
    if assigned_to and assigned_to != created_by:
        label = _get_transaction_label(content_object)
        link = _get_transaction_link(content_object)
        notify_user(
            tenant=tenant,
            recipient=assigned_to,
            title=f'{created_by.name or created_by.username} assigned you a task on {label}',
            message=title,
            link=link,
            notification_type='TASK',
            content_type=ct,
            object_id=content_object.pk,
        )

    return task


def update_task_status(task, user, new_status):
    """
    Update a task's status and notify relevant parties.

    Returns:
        Task instance
    """
    old_status = task.status
    task.status = new_status

    if new_status == 'complete':
        task.completed_at = timezone.now()

    task.save(update_fields=['status', 'completed_at', 'updated_at'])

    # Notify task creator and assignee about status change
    ct = task.content_type
    label = _get_transaction_label(task.content_object)
    link = _get_transaction_link(task.content_object)
    status_label = dict(Task.STATUS_CHOICES).get(new_status, new_status)

    recipients = set()
    if task.created_by and task.created_by != user:
        recipients.add(task.created_by)
    if task.assigned_to and task.assigned_to != user:
        recipients.add(task.assigned_to)

    for recipient in recipients:
        notify_user(
            tenant=task.tenant,
            recipient=recipient,
            title=f'Task "{task.title}" marked {status_label} on {label}',
            message=f'{user.name or user.username} changed status from {old_status} to {new_status}',
            link=link,
            notification_type='TASK',
            content_type=ct,
            object_id=task.object_id,
        )

    return task
