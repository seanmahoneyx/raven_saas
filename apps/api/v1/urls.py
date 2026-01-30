# apps/api/v1/urls.py
"""
URL routing for API v1.

All API endpoints are mounted under /api/v1/
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

from .views.parties import (
    PartyViewSet, CustomerViewSet, VendorViewSet,
    LocationViewSet, TruckViewSet,
)
from .views.items import (
    UnitOfMeasureViewSet, ItemViewSet, ItemVendorViewSet,
    CorrugatedFeatureViewSet, CorrugatedItemViewSet,
    DCItemViewSet, RSCItemViewSet, HSCItemViewSet, FOLItemViewSet, TeleItemViewSet,
)
from .views.orders import PurchaseOrderViewSet, SalesOrderViewSet
from .views.pricing import PriceListViewSet
from .views.costing import CostListViewSet
from .views.warehousing import WarehouseViewSet, BinViewSet
from .views.inventory import (
    InventoryLotViewSet, InventoryPalletViewSet,
    InventoryBalanceViewSet, InventoryTransactionViewSet,
)
from .views.shipping import ShipmentViewSet, BillOfLadingViewSet
from .views.invoicing import InvoiceViewSet, PaymentViewSet
from .views.reporting import (
    ReportDefinitionViewSet, ReportScheduleViewSet,
    SavedReportViewSet, ReportFavoriteViewSet,
)
from .views.scheduling import CalendarViewSet
from .views.contracts import ContractViewSet

# Create router and register viewsets
router = DefaultRouter()

# Parties
router.register(r'parties', PartyViewSet, basename='party')
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'locations', LocationViewSet, basename='location')
router.register(r'trucks', TruckViewSet, basename='truck')

# Items
router.register(r'uom', UnitOfMeasureViewSet, basename='uom')
router.register(r'items', ItemViewSet, basename='item')
router.register(r'item-vendors', ItemVendorViewSet, basename='itemvendor')
router.register(r'corrugated-features', CorrugatedFeatureViewSet, basename='corrugatedfeature')

# Corrugated Items
router.register(r'corrugated-items', CorrugatedItemViewSet, basename='corrugateditem')
router.register(r'dc-items', DCItemViewSet, basename='dcitem')
router.register(r'rsc-items', RSCItemViewSet, basename='rscitem')
router.register(r'hsc-items', HSCItemViewSet, basename='hscitem')
router.register(r'fol-items', FOLItemViewSet, basename='folitem')
router.register(r'tele-items', TeleItemViewSet, basename='teleitem')

# Orders
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'sales-orders', SalesOrderViewSet, basename='salesorder')

# Pricing & Costing
router.register(r'price-lists', PriceListViewSet, basename='pricelist')
router.register(r'cost-lists', CostListViewSet, basename='costlist')

# Warehousing
router.register(r'warehouses', WarehouseViewSet, basename='warehouse')
router.register(r'bins', BinViewSet, basename='bin')

# Inventory
router.register(r'inventory/lots', InventoryLotViewSet, basename='inventorylot')
router.register(r'inventory/pallets', InventoryPalletViewSet, basename='inventorypallet')
router.register(r'inventory/balances', InventoryBalanceViewSet, basename='inventorybalance')
router.register(r'inventory/transactions', InventoryTransactionViewSet, basename='inventorytransaction')

# Shipping
router.register(r'shipments', ShipmentViewSet, basename='shipment')
router.register(r'bols', BillOfLadingViewSet, basename='bol')

# Invoicing
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'payments', PaymentViewSet, basename='payment')

# Reporting
router.register(r'reports/definitions', ReportDefinitionViewSet, basename='reportdefinition')
router.register(r'reports/schedules', ReportScheduleViewSet, basename='reportschedule')
router.register(r'reports/saved', SavedReportViewSet, basename='savedreport')
router.register(r'reports/favorites', ReportFavoriteViewSet, basename='reportfavorite')

# Scheduling/Calendar
router.register(r'calendar', CalendarViewSet, basename='calendar')

# Contracts
router.register(r'contracts', ContractViewSet, basename='contract')

urlpatterns = [
    # JWT Authentication endpoints
    path('auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/token/verify/', TokenVerifyView.as_view(), name='token_verify'),

    # Router URLs (all ViewSets)
    path('', include(router.urls)),
]
