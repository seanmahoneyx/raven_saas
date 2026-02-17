# users/migrations/0003_user_preferences.py
"""Add preferences JSONField to User model."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0002_create_rbac_groups'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='preferences',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='User preferences: default_warehouse_id, items_per_page, theme, default_printer_id',
            ),
        ),
    ]
