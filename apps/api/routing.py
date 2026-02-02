"""
WebSocket URL routing for the API app.

Defines WebSocket endpoints for real-time features like the scheduler.
"""

from django.urls import re_path

from apps.api.consumers import SchedulerConsumer

websocket_urlpatterns = [
    re_path(r'ws/scheduler/$', SchedulerConsumer.as_asgi()),
]
