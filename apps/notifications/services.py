from .models import Notification


def notify_user(tenant, recipient, title, message='', link='', notification_type='INFO'):
    """Create a notification for a user and broadcast via WebSocket."""
    notification = Notification.objects.create(
        tenant=tenant,
        recipient=recipient,
        title=title,
        message=message,
        link=link,
        notification_type=notification_type,
    )

    # Also push via WebSocket for real-time delivery
    try:
        from apps.api.ws_signals import send_notification
        send_notification(
            user_id=recipient.pk,
            notification_data={
                'id': notification.pk,
                'title': title,
                'message': message,
                'link': link,
                'type': notification_type,
                'created_at': notification.created_at.isoformat() if hasattr(notification, 'created_at') else '',
            },
        )
    except Exception:
        pass  # Never break the main flow

    return notification


def notify_group(tenant, group_name, title, message='', link='', notification_type='INFO'):
    """Create notifications for all users in a group/role and broadcast via WebSocket."""
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
    created = Notification.objects.bulk_create(notifications)

    # Also push each via WebSocket for real-time delivery
    try:
        from apps.api.ws_signals import send_notification
        for notif in created:
            try:
                send_notification(
                    user_id=notif.recipient_id,
                    notification_data={
                        'id': notif.pk,
                        'title': title,
                        'message': message,
                        'link': link,
                        'type': notification_type,
                        'created_at': notif.created_at.isoformat() if hasattr(notif, 'created_at') else '',
                    },
                )
            except Exception:
                pass  # Skip individual failures
    except Exception:
        pass  # Never break the main flow

    return created
