# apps/orders/urls.py
"""
URL patterns for order management.
"""
from django.urls import path
from . import views

app_name = 'orders'

urlpatterns = [
    # Dashboard
    path('', views.DashboardView.as_view(), name='dashboard'),

    # Purchase Orders
    path('purchase/', views.PurchaseOrderListView.as_view(), name='purchase_order_list'),
    path('purchase/create/', views.PurchaseOrderCreateView.as_view(), name='purchase_order_create'),
    path('purchase/<int:pk>/', views.PurchaseOrderDetailView.as_view(), name='purchase_order_detail'),

    # Purchase Order HTMX endpoints
    path('purchase/vendor-locations/', views.VendorLocationsView.as_view(), name='purchase_vendor_locations'),
    path('purchase/item-uoms/', views.ItemUOMsView.as_view(), name='purchase_item_uoms'),
    path('purchase/calculate-line/', views.CalculateLineView.as_view(), name='purchase_calculate_line'),

    # Sales Orders
    path('sales/', views.SalesOrderListView.as_view(), name='sales_order_list'),
    path('sales/create/', views.SalesOrderCreateView.as_view(), name='sales_order_create'),
    path('sales/<int:pk>/', views.SalesOrderDetailView.as_view(), name='sales_order_detail'),

    # Sales Order HTMX endpoints
    path('sales/customer-locations/', views.CustomerLocationsView.as_view(), name='sales_customer_locations'),
    path('sales/item-uoms/', views.ItemUOMsView.as_view(), name='sales_item_uoms'),
    path('sales/calculate-line/', views.CalculateLineView.as_view(), name='sales_calculate_line'),
]
