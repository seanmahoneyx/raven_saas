"""
WebSocket URL routing for the API app.

Defines WebSocket endpoints for real-time features:
- /ws/scheduler/      - Scheduler board updates
- /ws/inventory/      - Inventory balance/lot/stock changes
- /ws/orders/         - SO/PO status changes
- /ws/shipments/      - Shipment status and delivery updates
- /ws/invoices/       - Invoice status and payment events
- /ws/notifications/  - Personal notification delivery (per-user)
"""

from django.urls import re_path

from apps.api.consumers import (
    SchedulerConsumer,
    InventoryConsumer,
    OrderConsumer,
    ShipmentConsumer,
    InvoiceConsumer,
    NotificationConsumer,
)

websocket_urlpatterns = [
    re_path(r'ws/scheduler/$', SchedulerConsumer.as_asgi()),
    re_path(r'ws/inventory/$', InventoryConsumer.as_asgi()),
    re_path(r'ws/orders/$', OrderConsumer.as_asgi()),
    re_path(r'ws/shipments/$', ShipmentConsumer.as_asgi()),
    re_path(r'ws/invoices/$', InvoiceConsumer.as_asgi()),
    re_path(r'ws/notifications/$', NotificationConsumer.as_asgi()),
]
