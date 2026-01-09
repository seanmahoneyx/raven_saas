# apps/scheduling/urls.py
"""
URL routes for the new Schedulizer using tenant-aware Order models.
"""
from django.urls import path
from . import views

app_name = 'new_scheduling'

urlpatterns = [
    # Main dashboard
    path('schedulizer/', views.schedulizer_dashboard, name='schedulizer_dashboard'),

    # HTMX endpoints
    path('schedule-update/<int:order_id>/', views.schedule_update, name='schedule_update'),
    path('update-status/<str:order_type>/<int:order_id>/', views.update_order_status, name='update_order_status'),
    path('update-note/<str:order_type>/<int:order_id>/', views.update_order_note, name='update_order_note'),
    path('side-panel/<str:order_type>/<int:order_id>/', views.get_side_panel, name='get_side_panel'),
    path('global-history/', views.get_global_history, name='get_global_history'),
]
