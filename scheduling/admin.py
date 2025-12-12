from django.contrib import admin
from .models import ReleaseOrder, PurchaseOrder
from simple_history.admin import SimpleHistoryAdmin

# We use SimpleHistoryAdmin to let you view the history in the admin panel too
@admin.register(ReleaseOrder)
class ReleaseOrderAdmin(SimpleHistoryAdmin):
    list_display = ('number', 'customer', 'status', 'scheduled_date', 'scheduled_truck')
    list_filter = ('status', 'scheduled_date')

@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(SimpleHistoryAdmin):
    list_display = ('number', 'vendor', 'status', 'scheduled_date')
    list_filter = ('status', 'scheduled_date')