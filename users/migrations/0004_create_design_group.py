# users/migrations/0004_create_design_group.py
"""Create Design RBAC group with permissions."""
from django.db import migrations


def create_design_group(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Permission = apps.get_model('auth', 'Permission')

    group, _ = Group.objects.get_or_create(name='Design')

    codenames = [
        'view_item', 'change_item',
        'view_designrequest', 'add_designrequest', 'change_designrequest',
    ]
    perms = Permission.objects.filter(codename__in=codenames)
    group.permissions.set(perms)


def remove_design_group(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.filter(name='Design').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0003_user_preferences'),
    ]

    operations = [
        migrations.RunPython(create_design_group, remove_design_group),
    ]
