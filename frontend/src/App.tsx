import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { PageLoader } from '@/components/ui/page-loader'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import MainLayout from '@/components/layout/MainLayout'
import { useOnboardingStatus } from '@/api/onboarding'
import Login from '@/pages/Login'

// Pages are lazy-loaded so each route ships as its own chunk instead of one giant
// bundle. This also pulls heavy, route-specific deps (recharts in the report pages,
// dnd-kit in the scheduler) out of the initial download. Login stays eager so the
// unauthenticated entry point paints without a chunk round-trip.
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Scheduler = lazy(() => import('@/pages/Scheduler'))
const Customers = lazy(() => import('@/pages/Customers'))
const Vendors = lazy(() => import('@/pages/Vendors'))
const Trucks = lazy(() => import('@/pages/Trucks'))
const Items = lazy(() => import('@/pages/Items'))
const Orders = lazy(() => import('@/pages/Orders'))
const Inventory = lazy(() => import('@/pages/Inventory'))
const Shipping = lazy(() => import('@/pages/Shipping'))
const Invoices = lazy(() => import('@/pages/Invoices'))
const ReceivePayment = lazy(() => import('@/pages/ReceivePayment'))
const Contracts = lazy(() => import('@/pages/Contracts'))
const ContractDetail = lazy(() => import('@/pages/ContractDetail'))
const PriorityList = lazy(() => import('@/pages/PriorityList'))
const CreateCustomer = lazy(() => import('@/pages/CreateCustomer'))
const CreateVendor = lazy(() => import('@/pages/CreateVendor'))
const DesignRequests = lazy(() => import('@/pages/DesignRequests'))
const CreateDesignRequest = lazy(() => import('@/pages/CreateDesignRequest'))
const DesignRequestDetail = lazy(() => import('@/pages/DesignRequestDetail'))
const ItemDetail = lazy(() => import('@/pages/ItemDetail'))
const CustomerDetail = lazy(() => import('@/pages/CustomerDetail'))
const VendorDetail = lazy(() => import('@/pages/VendorDetail'))
const CreateItem = lazy(() => import('@/pages/CreateItem'))
const RequestItem = lazy(() => import('@/pages/RequestItem'))
const ItemQuickReport = lazy(() => import('@/pages/reports/ItemQuickReport'))
const ReportsDashboard = lazy(() => import('@/pages/reports/ReportsDashboard'))
const CannedReport = lazy(() => import('@/pages/reports/CannedReport'))
const FinancialStatements = lazy(() => import('@/pages/reports/FinancialStatements'))
const AgingReports = lazy(() => import('@/pages/reports/AgingReports'))
const GrossMargin = lazy(() => import('@/pages/reports/GrossMargin'))
const ContractUtilization = lazy(() => import('@/pages/reports/ContractUtilization'))
const VendorScorecard = lazy(() => import('@/pages/reports/VendorScorecard'))
const SalesCommission = lazy(() => import('@/pages/reports/SalesCommission'))
const OrdersVsInventory = lazy(() => import('@/pages/reports/OrdersVsInventory'))
const Estimates = lazy(() => import('@/pages/Estimates'))
const CreateEstimate = lazy(() => import('@/pages/CreateEstimate'))
const EstimateDetail = lazy(() => import('@/pages/EstimateDetail'))
const CreateContract = lazy(() => import('@/pages/CreateContract'))
const CreateSalesOrder = lazy(() => import('@/pages/CreateSalesOrder'))
const CreatePurchaseOrder = lazy(() => import('@/pages/CreatePurchaseOrder'))
const CreateRFQ = lazy(() => import('@/pages/CreateRFQ'))
const CreatePriceList = lazy(() => import('@/pages/CreatePriceList'))
const RFQs = lazy(() => import('@/pages/RFQs'))
const RFQDetail = lazy(() => import('@/pages/RFQDetail'))
const PriceLists = lazy(() => import('@/pages/PriceLists'))
const ProductCards = lazy(() => import('@/pages/ProductCards'))
const PriceListDetail = lazy(() => import('@/pages/PriceListDetail'))
const CostLists = lazy(() => import('@/pages/CostLists'))
const CostListDetail = lazy(() => import('@/pages/CostListDetail'))
const CreateCostList = lazy(() => import('@/pages/CreateCostList'))
const OpenSalesOrders = lazy(() => import('@/pages/OpenSalesOrders'))
const OpenPurchaseOrders = lazy(() => import('@/pages/OpenPurchaseOrders'))
const SalesOrderDetail = lazy(() => import('@/pages/SalesOrderDetail'))
const PurchaseOrderDetail = lazy(() => import('@/pages/PurchaseOrderDetail'))
const AdminHub = lazy(() => import('@/pages/admin/AdminHub'))
const DataImport = lazy(() => import('@/pages/admin/DataImport'))
const TaxZones = lazy(() => import('@/pages/admin/TaxZones'))
const UserAuditReport = lazy(() => import('@/pages/admin/UserAuditReport'))
const ChartOfAccounts = lazy(() => import('@/pages/ChartOfAccounts'))
const JournalEntries = lazy(() => import('@/pages/JournalEntries'))
const CreateJournalEntry = lazy(() => import('@/pages/CreateJournalEntry'))
const JournalEntryDetail = lazy(() => import('@/pages/JournalEntryDetail'))
const CreateInvoice = lazy(() => import('@/pages/CreateInvoice'))
const CreateBill = lazy(() => import('@/pages/CreateBill'))
const BillDetail = lazy(() => import('@/pages/BillDetail'))
const PayBills = lazy(() => import('@/pages/PayBills'))
const ItemReceipts = lazy(() => import('@/pages/ItemReceipts'))
const ItemReceiptDetail = lazy(() => import('@/pages/ItemReceiptDetail'))
const Pipeline = lazy(() => import('@/pages/Pipeline'))
const ContactDetail = lazy(() => import('@/pages/ContactDetail'))
const InvoiceDetail = lazy(() => import('@/pages/InvoiceDetail'))
const Scanner = lazy(() => import('@/pages/warehouse/Scanner'))
const CycleCounts = lazy(() => import('@/pages/warehouse/CycleCounts'))
const PrintLabels = lazy(() => import('@/pages/warehouse/PrintLabels'))
const WarehouseLocations = lazy(() => import('@/pages/warehouse/WarehouseLocations'))
const Logistics = lazy(() => import('@/pages/Logistics'))
const DriverManifest = lazy(() => import('@/pages/DriverManifest'))
const OtherNames = lazy(() => import('@/pages/OtherNames'))
const Checks = lazy(() => import('@/pages/Checks'))
const CreateCheck = lazy(() => import('@/pages/CreateCheck'))
const Settings = lazy(() => import('@/pages/Settings'))
const AccountingSettings = lazy(() => import('@/pages/AccountingSettings'))
const Preferences = lazy(() => import('@/pages/settings/Preferences'))
const UsersPage = lazy(() => import('@/pages/Users'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const FixedAssets = lazy(() => import('@/pages/FixedAssets'))
const FixedAssetDetail = lazy(() => import('@/pages/FixedAssetDetail'))
const CreateFixedAsset = lazy(() => import('@/pages/CreateFixedAsset'))
const Approvals = lazy(() => import('@/pages/Approvals'))
const NotificationHub = lazy(() => import('@/pages/NotificationHub'))
const UnitOfMeasure = lazy(() => import('@/pages/UnitOfMeasure'))

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

// Guard: redirect authenticated users who haven't completed onboarding
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { data: onboardingStatus, isLoading: onboardingLoading } = useOnboardingStatus()
  const location = useLocation()

  if (authLoading || onboardingLoading) return null

  // Only redirect if authenticated and onboarding not complete
  if (isAuthenticated && onboardingStatus && !onboardingStatus.onboarding_completed) {
    // Don't redirect if already on the onboarding page
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />
    }
  }

  return <>{children}</>
}

// Guard: redirect non-admins away from admin-only routes
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  const isAdmin = !!(user?.is_superuser || user?.is_staff || user?.roles?.includes('admin'))
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <ErrorBoundary>
              {/* Outer boundary catches standalone lazy routes (e.g. Onboarding).
                  Pages rendered inside MainLayout have their own Suspense around the
                  Outlet so the nav shell doesn't flash on navigation. */}
              <Suspense fallback={<PageLoader />}>
              <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />

              {/* Onboarding - protected but outside MainLayout */}
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute>
                    <Onboarding />
                  </ProtectedRoute>
                }
              />

              {/* Protected routes */}
              <Route
                element={
                  <ProtectedRoute>
                    <OnboardingGuard>
                      <MainLayout />
                    </OnboardingGuard>
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Dashboard />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/vendors" element={<Vendors />} />
                <Route path="/trucks" element={<Trucks />} />
                <Route path="/customers/open-orders" element={<OpenSalesOrders />} />
                <Route path="/customers/new" element={<CreateCustomer />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/vendors/open-orders" element={<OpenPurchaseOrders />} />
                <Route path="/vendors/new" element={<CreateVendor />} />
                <Route path="/vendors/:id" element={<VendorDetail />} />
                <Route path="/contracts" element={<Contracts />} />
                <Route path="/contracts/:id" element={<ContractDetail />} />
                <Route path="/contacts/new" element={<ContactDetail />} />
                <Route path="/contacts/:id" element={<ContactDetail />} />
                <Route path="/items" element={<Items />} />
                <Route path="/items/new" element={<CreateItem />} />
                <Route path="/items/request" element={<RequestItem />} />
                <Route path="/items/:id" element={<ItemDetail />} />
                <Route path="/product-cards" element={<ProductCards />} />
                <Route path="/estimates" element={<Estimates />} />
                <Route path="/estimates/new" element={<CreateEstimate />} />
                <Route path="/estimates/:id" element={<EstimateDetail />} />
                <Route path="/contracts/new" element={<CreateContract />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/orders/sales/new" element={<CreateSalesOrder />} />
                <Route path="/orders/purchase/new" element={<CreatePurchaseOrder />} />
                <Route path="/orders/sales/:id" element={<SalesOrderDetail />} />
                <Route path="/orders/purchase/:id" element={<PurchaseOrderDetail />} />
                <Route path="/rfqs" element={<RFQs />} />
                <Route path="/rfqs/new" element={<CreateRFQ />} />
                <Route path="/rfqs/:id" element={<RFQDetail />} />
                <Route path="/price-lists" element={<PriceLists />} />
                <Route path="/price-lists/new" element={<CreatePriceList />} />
                <Route path="/price-lists/:id" element={<PriceListDetail />} />
                <Route path="/cost-lists" element={<CostLists />} />
                <Route path="/cost-lists/new" element={<CreateCostList />} />
                <Route path="/cost-lists/:id" element={<CostListDetail />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/shipping" element={<Shipping />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/invoices/new" element={<CreateInvoice />} />
                <Route path="/invoices/:id" element={<InvoiceDetail />} />
                <Route path="/bills/new" element={<CreateBill />} />
                <Route path="/bills/:id" element={<BillDetail />} />
                <Route path="/pay-bills" element={<PayBills />} />
                <Route path="/item-receipts" element={<ItemReceipts />} />
                <Route path="/item-receipts/:id" element={<ItemReceiptDetail />} />
                <Route path="/receive-payment" element={<ReceivePayment />} />
                <Route path="/other-names" element={<OtherNames />} />
                <Route path="/checks" element={<Checks />} />
                <Route path="/checks/new" element={<CreateCheck />} />
                <Route path="/reports" element={<ReportsDashboard />} />
                <Route path="/reports/item-quick-report" element={<ItemQuickReport />} />
                <Route path="/reports/financial-statements" element={<FinancialStatements />} />
                <Route path="/reports/aging" element={<AgingReports />} />
                <Route path="/reports/gross-margin" element={<GrossMargin />} />
                <Route path="/reports/contract-utilization" element={<ContractUtilization />} />
                <Route path="/reports/vendor-scorecard" element={<VendorScorecard />} />
                <Route path="/reports/sales-commission" element={<SalesCommission />} />
                <Route path="/reports/orders-vs-inventory" element={<OrdersVsInventory />} />
                <Route path="/reports/:slug" element={<CannedReport />} />
                <Route path="/scheduler" element={<Scheduler />} />
                <Route path="/vendors/:vendorId/priority-list" element={<PriorityList />} />
                <Route path="/priority-list" element={<PriorityList />} />
                <Route path="/design-requests" element={<DesignRequests />} />
                <Route path="/design-requests/new" element={<CreateDesignRequest />} />
                <Route path="/design-requests/:id" element={<DesignRequestDetail />} />
                <Route path="/warehouse/scanner" element={<Scanner />} />
                <Route path="/warehouse/cycle-counts" element={<CycleCounts />} />
                <Route path="/warehouse/print-labels" element={<PrintLabels />} />
                <Route path="/warehouse/locations" element={<WarehouseLocations />} />
                <Route path="/logistics" element={<Logistics />} />
                <Route path="/logistics/manifest" element={<DriverManifest />} />
                <Route path="/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/accounting-settings" element={<AccountingSettings />} />
                <Route path="/settings/preferences" element={<Preferences />} />
                <Route path="/admin" element={<AdminRoute><AdminHub /></AdminRoute>} />
                <Route path="/admin/import" element={<AdminRoute><DataImport /></AdminRoute>} />
                <Route path="/admin/tax-zones" element={<AdminRoute><TaxZones /></AdminRoute>} />
                <Route path="/admin/user-audit" element={<AdminRoute><UserAuditReport /></AdminRoute>} />
                <Route path="/fixed-assets" element={<FixedAssets />} />
                <Route path="/fixed-assets/new" element={<CreateFixedAsset />} />
                <Route path="/fixed-assets/:id" element={<FixedAssetDetail />} />
                <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
                <Route path="/journal-entries" element={<JournalEntries />} />
                <Route path="/journal-entries/new" element={<CreateJournalEntry />} />
                <Route path="/journal-entries/:id" element={<JournalEntryDetail />} />
                <Route path="/pipeline" element={<Pipeline />} />
                <Route path="/approvals" element={<Approvals />} />
                <Route path="/notifications" element={<NotificationHub />} />
                <Route path="/uom" element={<UnitOfMeasure />} />
                <Route path="*" element={
                  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                    <h1 className="text-4xl font-bold">404</h1>
                    <p className="text-muted-foreground">Page not found</p>
                    <a href="/" className="text-primary hover:underline">Back to Dashboard</a>
                  </div>
                } />
              </Route>
              </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
