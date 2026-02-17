from .models import Notification


def notify_user(tenant, recipient, title, message='', link='', notification_type='INFO'):
    """Create a notification for a user."""
    return Notification.objects.create(
        tenant=tenant,
        recipient=recipient,
        title=title,
        message=message,
        link=link,
        notification_type=notification_type,
    )


def notify_group(tenant, group_name, title, message='', link='', notification_type='INFO'):
    """Create notifications for all users in a group/role."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    users = User.objects.filter(groups__name=group_name)
    notifications = []
    for user in users:
        notifications.append(Notification(
            tenant=tenant,
            recipient=user,
            title=title,
            message=message,
            link=link,
            notification_type=notification_type,
        ))
    return Notification.objects.bulk_create(notifications)
