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
from .views.orders import PurchaseOrderViewSet, SalesOrderViewSet, EstimateViewSet, RFQViewSet
from .views.pricing import PriceListViewSet
from .views.costing import CostListViewSet
from .views.warehousing import WarehouseViewSet, BinViewSet
from .views.warehouse import (
    WarehouseLocationViewSet, LotViewSet,
    StockByLocationView, StockMoveView,
)
from .views.logistics import (
    LicensePlateViewSet, DeliveryStopViewSet, InitializeRunView,
)
from .views.importers import DataImportView
from .views.inventory import (
    InventoryLotViewSet, InventoryPalletViewSet,
    InventoryBalanceViewSet, InventoryTransactionViewSet,
)
from .views.shipping import ShipmentViewSet, BillOfLadingViewSet
from .views.invoicing import InvoiceViewSet, PaymentViewSet
from .views.payments import CustomerPaymentViewSet, OpenInvoicesView
from .views.reporting import (
    ReportDefinitionViewSet, ReportScheduleViewSet,
    SavedReportViewSet, ReportFavoriteViewSet,
)
from .views.scheduling import CalendarViewSet
from .views.contracts import ContractViewSet
from .views.priority_list import (
    PriorityListViewSet,
    VendorKickAllotmentViewSet,
    DailyKickOverrideViewSet,
)
from .views.design import DesignRequestViewSet
from .views.documents import AttachmentViewSet
from .views.reporting import (
    TrialBalanceView,
    IncomeStatementView,
    BalanceSheetView,
    ARAgingView,
    ItemQuickReportView,
    ItemQuickReportPDFView,
)
from .views.dashboard import DashboardView
from .views.websocket import get_websocket_ticket
from .views.auth import CookieTokenObtainPairView, CookieTokenRefreshView, CookieLogoutView
from .views.search import GlobalSearchView
from .views.users import CurrentUserView

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
router.register(r'estimates', EstimateViewSet, basename='estimate')
router.register(r'rfqs', RFQViewSet, basename='rfq')

# Pricing & Costing
router.register(r'price-lists', PriceListViewSet, basename='pricelist')
router.register(r'cost-lists', CostListViewSet, basename='costlist')

# Warehousing
router.register(r'warehouses', WarehouseViewSet, basename='warehouse')
router.register(r'bins', BinViewSet, basename='bin')

# WMS (Warehouse Management)
router.register(r'warehouse/locations', WarehouseLocationViewSet, basename='warehouselocation')
router.register(r'warehouse/lots', LotViewSet, basename='lot')

# Logistics
router.register(r'logistics/lpns', LicensePlateViewSet, basename='licenseplate')
router.register(r'logistics/stops', DeliveryStopViewSet, basename='deliverystop')

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

# Customer Payments (Cash Receipts)
router.register(r'customer-payments', CustomerPaymentViewSet, basename='customerpayment')

# Reporting
router.register(r'reports/definitions', ReportDefinitionViewSet, basename='reportdefinition')
router.register(r'reports/schedules', ReportScheduleViewSet, basename='reportschedule')
router.register(r'reports/saved', SavedReportViewSet, basename='savedreport')
router.register(r'reports/favorites', ReportFavoriteViewSet, basename='reportfavorite')

# Scheduling/Calendar
router.register(r'calendar', CalendarViewSet, basename='calendar')

# Priority List
router.register(r'priority-list', PriorityListViewSet, basename='prioritylist')
router.register(r'priority-list/allotments', VendorKickAllotmentViewSet, basename='vendorkickallotment')
router.register(r'priority-list/overrides', DailyKickOverrideViewSet, basename='dailykickoverride')

# Contracts
router.register(r'contracts', ContractViewSet, basename='contract')

# Design
router.register(r'design-requests', DesignRequestViewSet, basename='designrequest')

# Documents & Attachments
router.register(r'attachments', AttachmentViewSet, basename='attachment')

urlpatterns = [
    # JWT Authentication endpoints (legacy - tokens in response body)
    path('auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/token/verify/', TokenVerifyView.as_view(), name='token_verify'),

    # Cookie-based JWT Authentication (preferred - httpOnly cookies)
    path('auth/login/', CookieTokenObtainPairView.as_view(), name='cookie_login'),
    path('auth/refresh/', CookieTokenRefreshView.as_view(), name='cookie_refresh'),
    path('auth/logout/', CookieLogoutView.as_view(), name='cookie_logout'),

    # User profile
    path('users/me/', CurrentUserView.as_view(), name='current-user'),

    # WebSocket authentication ticket
    path('ws/ticket/', get_websocket_ticket, name='websocket_ticket'),

    # WMS endpoints
    path('warehouse/stock-by-location/<int:item_id>/', StockByLocationView.as_view(), name='stock-by-location'),
    path('warehouse/move/', StockMoveView.as_view(), name='stock-move'),

    # Logistics endpoints
    path('logistics/runs/<int:run_id>/initialize/', InitializeRunView.as_view(), name='initialize-run'),

    # Admin Data Import
    path('admin/import/<str:import_type>/', DataImportView.as_view(), name='data-import'),

    # Customer Payments - Open Invoices (must come before router.urls)
    path('customer-payments/open-invoices/', OpenInvoicesView.as_view(), name='open-invoices'),

    # Financial Reports (non-ViewSet, read-only APIViews)
    path('reports/trial-balance/', TrialBalanceView.as_view(), name='trial-balance'),
    path('reports/income-statement/', IncomeStatementView.as_view(), name='income-statement'),
    path('reports/balance-sheet/', BalanceSheetView.as_view(), name='balance-sheet'),
    path('reports/ar-aging/', ARAgingView.as_view(), name='ar-aging'),

    # Item QuickReport
    path('reports/item-quick-report/<int:item_id>/', ItemQuickReportView.as_view(), name='item-quick-report'),
    path('reports/item-quick-report/<int:item_id>/pdf/', ItemQuickReportPDFView.as_view(), name='item-quick-report-pdf'),

    # Dashboard
    path('dashboard/', DashboardView.as_view(), name='dashboard'),

    # Global Search
    path('search/', GlobalSearchView.as_view(), name='global-search'),

    # Router URLs (all ViewSets)
    path('', include(router.urls)),
]
