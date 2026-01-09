from django.apps import AppConfig


class WarehouseConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.warehousing'
    label = 'new_warehousing'  # Avoid conflict with legacy 'warehousing' app
    verbose_name = 'Warehousing'
