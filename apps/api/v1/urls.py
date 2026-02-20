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
    ScannerLocationLookupView, ScannerItemLookupView,
    CycleCountViewSet,
)
from .views.logistics import (
    LicensePlateViewSet, DeliveryStopViewSet, InitializeRunView,
    DriverRunView, ManifestPDFView,
)
from .views.importers import DataImportView
from .views.inventory import (
    InventoryLotViewSet, InventoryPalletViewSet,
    InventoryBalanceViewSet, InventoryTransactionViewSet,
)
from .views.shipping import ShipmentViewSet, BillOfLadingViewSet, DeliveryRunCreateShipmentView
from .views.invoicing import InvoiceViewSet, PaymentViewSet, TaxZoneViewSet, TaxRuleViewSet
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
    APAgingView,
    CashFlowStatementView,
    ItemQuickReportView,
    ItemQuickReportPDFView,
    ReorderAlertsView,
    GrossMarginView,
    OrdersVsInventoryView,
    SalesCommissionView,
    ContractUtilizationView,
    VendorScorecardView,
)
from .views.dashboard import DashboardView
from .views.history import ModelHistoryView
from .views.websocket import get_websocket_ticket
from .views.auth import CookieTokenObtainPairView, CookieTokenRefreshView, CookieLogoutView
from .views.search import GlobalSearchView
from .views.users import CurrentUserView, UserPreferencesView, UserListView, UserDetailView
from .views.accounting import AccountViewSet, JournalEntryViewSet
from .views.email import SendInvoiceEmailView, SendPurchaseOrderEmailView
from .views.notifications import NotificationListView, NotificationMarkReadView
from .views.approvals import ApprovalRequestViewSet, TokenApproveView, TokenRejectView
from .views.labels import ItemLabelsView, BinLabelsView, LPNLabelsView
from .views.canned_reports import (
    SalesByCustomerView, SalesByItemView, BackorderReportView, OpenOrderDetailView,
    OpenPOReportView, VendorPerformanceView, PurchaseHistoryView,
    InventoryValuationView, StockStatusView, LowStockAlertView, DeadStockView,
    SalesTaxLiabilityView, GrossMarginReportView,
)
from .views.health import health_check
from .views.settings import TenantSettingsView
from .views.onboarding import (
    OnboardingStatusView,
    OnboardingCompanyView,
    OnboardingWarehouseView,
    OnboardingUoMView,
    OnboardingInviteView,
    OnboardingCompleteView,
)

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
router.register(r'warehouse/cycle-counts', CycleCountViewSet, basename='cyclecount')

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
router.register(r'tax-zones', TaxZoneViewSet, basename='taxzone')
router.register(r'tax-rules', TaxRuleViewSet, basename='taxrule')

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

# Accounting
router.register(r'accounts', AccountViewSet, basename='account')
router.register(r'journal-entries', JournalEntryViewSet, basename='journalentry')

# Approvals
router.register(r'approvals', ApprovalRequestViewSet, basename='approvalrequest')

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
    path('users/', UserListView.as_view(), name='user-list'),
    path('users/<int:pk>/', UserDetailView.as_view(), name='user-detail'),
    path('users/me/', CurrentUserView.as_view(), name='current-user'),
    path('users/me/preferences/', UserPreferencesView.as_view(), name='user-preferences'),

    # Notifications
    path('notifications/', NotificationListView.as_view(), name='notifications'),
    path('notifications/mark-read/', NotificationMarkReadView.as_view(), name='notifications-mark-read'),

    # WebSocket authentication ticket
    path('ws/ticket/', get_websocket_ticket, name='websocket_ticket'),

    # WMS endpoints
    path('warehouse/stock-by-location/<int:item_id>/', StockByLocationView.as_view(), name='stock-by-location'),
    path('warehouse/move/', StockMoveView.as_view(), name='stock-move'),
    path('warehouse/scanner/location/', ScannerLocationLookupView.as_view(), name='scanner-location-lookup'),
    path('warehouse/scanner/item/', ScannerItemLookupView.as_view(), name='scanner-item-lookup'),

    # Logistics endpoints
    path('logistics/my-run/', DriverRunView.as_view(), name='driver-my-run'),
    path('logistics/runs/<int:run_id>/initialize/', InitializeRunView.as_view(), name='initialize-run'),
    path('logistics/runs/<int:run_id>/manifest-pdf/', ManifestPDFView.as_view(), name='run-manifest-pdf'),

    # Admin Data Import
    path('admin/import/<str:import_type>/', DataImportView.as_view(), name='data-import'),

    # Customer Payments - Open Invoices (must come before router.urls)
    path('customer-payments/open-invoices/', OpenInvoicesView.as_view(), name='open-invoices'),

    # Financial Reports (non-ViewSet, read-only APIViews)
    path('reports/trial-balance/', TrialBalanceView.as_view(), name='trial-balance'),
    path('reports/income-statement/', IncomeStatementView.as_view(), name='income-statement'),
    path('reports/balance-sheet/', BalanceSheetView.as_view(), name='balance-sheet'),
    path('reports/ar-aging/', ARAgingView.as_view(), name='ar-aging'),
    path('reports/ap-aging/', APAgingView.as_view(), name='ap-aging'),
    path('reports/cash-flow/', CashFlowStatementView.as_view(), name='cash-flow'),

    # Item QuickReport
    path('reports/item-quick-report/<int:item_id>/', ItemQuickReportView.as_view(), name='item-quick-report'),
    path('reports/item-quick-report/<int:item_id>/pdf/', ItemQuickReportPDFView.as_view(), name='item-quick-report-pdf'),

    # Gross Margin Report
    path('reports/gross-margin/', GrossMarginView.as_view(), name='gross-margin'),

    # Orders vs Inventory and Sales Commission Reports
    path('reports/orders-vs-inventory/', OrdersVsInventoryView.as_view(), name='orders-vs-inventory'),
    path('reports/sales-commission/', SalesCommissionView.as_view(), name='sales-commission'),

    # Contract & Vendor Reports
    path('reports/contract-utilization/', ContractUtilizationView.as_view(), name='contract-utilization'),
    path('reports/vendor-scorecard/', VendorScorecardView.as_view(), name='vendor-scorecard'),

    # Inventory reorder alerts
    path('inventory/reorder-alerts/', ReorderAlertsView.as_view(), name='reorder-alerts'),

    # Field-Level History
    path('history/<str:model_type>/<int:object_id>/', ModelHistoryView.as_view(), name='model-history'),

    # Dashboard
    path('dashboard/', DashboardView.as_view(), name='dashboard'),

    # Settings
    path('settings/', TenantSettingsView.as_view(), name='tenant-settings'),

    # Global Search
    path('search/', GlobalSearchView.as_view(), name='global-search'),

    # Email
    path('invoices/<int:pk>/email/', SendInvoiceEmailView.as_view(), name='invoice-email'),
    path('purchase-orders/<int:pk>/email/', SendPurchaseOrderEmailView.as_view(), name='purchase-order-email'),

    # Delivery Run to Shipment
    path('delivery-runs/<int:pk>/create-shipment/', DeliveryRunCreateShipmentView.as_view(), name='delivery-run-create-shipment'),

    # Label printing
    path('labels/items/', ItemLabelsView.as_view(), name='labels-items'),
    path('labels/bins/', BinLabelsView.as_view(), name='labels-bins'),
    path('labels/lpns/', LPNLabelsView.as_view(), name='labels-lpns'),

    # Approval token-based endpoints (no auth required - token IS the auth)
    path('approvals/token/<uuid:token>/approve/', TokenApproveView.as_view(), name='approval-token-approve'),
    path('approvals/token/<uuid:token>/reject/', TokenRejectView.as_view(), name='approval-token-reject'),

    # Canned Reports (Standard Report Pack)
    path('reports/sales-by-customer/', SalesByCustomerView.as_view(), name='report-sales-by-customer'),
    path('reports/sales-by-item/', SalesByItemView.as_view(), name='report-sales-by-item'),
    path('reports/backorders/', BackorderReportView.as_view(), name='report-backorders'),
    path('reports/open-orders/', OpenOrderDetailView.as_view(), name='report-open-orders'),
    path('reports/open-pos/', OpenPOReportView.as_view(), name='report-open-pos'),
    path('reports/vendor-performance/', VendorPerformanceView.as_view(), name='report-vendor-performance'),
    path('reports/purchase-history/', PurchaseHistoryView.as_view(), name='report-purchase-history'),
    path('reports/inventory-valuation/', InventoryValuationView.as_view(), name='report-inventory-valuation'),
    path('reports/stock-status/', StockStatusView.as_view(), name='report-stock-status'),
    path('reports/low-stock-alert/', LowStockAlertView.as_view(), name='report-low-stock-alert'),
    path('reports/dead-stock/', DeadStockView.as_view(), name='report-dead-stock'),
    path('reports/sales-tax-liability/', SalesTaxLiabilityView.as_view(), name='report-sales-tax-liability'),
    path('reports/gross-margin-detail/', GrossMarginReportView.as_view(), name='report-gross-margin-detail'),

    # Onboarding wizard
    path('onboarding/status/', OnboardingStatusView.as_view(), name='onboarding-status'),
    path('onboarding/company/', OnboardingCompanyView.as_view(), name='onboarding-company'),
    path('onboarding/warehouse/', OnboardingWarehouseView.as_view(), name='onboarding-warehouse'),
    path('onboarding/uom/', OnboardingUoMView.as_view(), name='onboarding-uom'),
    path('onboarding/invite/', OnboardingInviteView.as_view(), name='onboarding-invite'),
    path('onboarding/complete/', OnboardingCompleteView.as_view(), name='onboarding-complete'),

    # Health check (no auth required - used by load balancers)
    path('health/', health_check, name='health-check'),

    # Router URLs (all ViewSets)
    path('', include(router.urls)),
]
