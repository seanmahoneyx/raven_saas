from django.urls import path
from . import views

urlpatterns = [
    # 1. The Main Page (http://127.0.0.1:8000/app/schedulizer/)
    path('schedulizer/', views.schedulizer_dashboard, name='schedulizer_dashboard'),

    # 2. HTMX Endpoint: Drag & Drop Updates
    path('schedule-update/<int:order_id>/', views.schedule_update, name='schedule_update'),

    # 3. HTMX Endpoint: Global History Feed
    path('global-history/', views.get_global_history, name='get_global_history'),
]