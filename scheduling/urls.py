# scheduling/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # 1. Dashboard
    path('schedulizer/', views.schedulizer_dashboard, name='schedulizer_dashboard'),

    # 2. HTMX: Drag & Drop Update
    path('schedule-update/<int:order_id>/', views.schedule_update, name='schedule_update'),

    # 3. HTMX: Global History Feed (Right Column)
    path('global-history/', views.get_global_history, name='get_global_history'),

    # 4. HTMX: Side Panel Content (Clicking a card)
    path('side-panel/<str:order_type>/<int:order_id>/', views.get_side_panel, name='get_side_panel'),

    # 5. HTMX: Status & Note Updates
    path('update-status/<str:order_type>/<int:order_id>/', views.update_order_status, name='update_order_status'),
    path('update-note/<str:order_type>/<int:order_id>/', views.update_order_note, name='update_order_note'),
]