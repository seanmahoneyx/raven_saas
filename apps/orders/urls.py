# apps/orders/urls.py
"""
URL patterns for order management.
"""
from django.urls import path
from . import views

app_name = 'orders'

urlpatterns = [
    # Purchase Orders
    path('purchase/', views.PurchaseOrderListView.as_view(), name='purchase_order_list'),
    path('purchase/<int:pk>/', views.PurchaseOrderDetailView.as_view(), name='purchase_order_detail'),

    # Sales Orders
    path('sales/', views.SalesOrderListView.as_view(), name='sales_order_list'),
    path('sales/<int:pk>/', views.SalesOrderDetailView.as_view(), name='sales_order_detail'),
]
