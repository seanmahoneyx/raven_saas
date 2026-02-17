from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    """
    Custom User Model inheriting from AbstractUser for flexibility.
    """

    name = models.CharField(max_length=255)
    preferences = models.JSONField(
        default=dict,
        blank=True,
        help_text="User preferences: default_warehouse_id, items_per_page, theme, default_printer_id"
    )
    # Add fields specific to Raven later (e.g., internal roles, etc.)

    # Example for later:
    # is_sales_rep = models.BooleanField(default=False)
    # is_warehouse_mgr = models.BooleanField(default=False)