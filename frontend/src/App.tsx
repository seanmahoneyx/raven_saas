import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import MainLayout from '@/components/layout/MainLayout'
import { useOnboardingStatus } from '@/api/onboarding'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Scheduler from '@/pages/Scheduler'
import Customers from '@/pages/Customers'
import Vendors from '@/pages/Vendors'
import Trucks from '@/pages/Trucks'
import Items from '@/pages/Items'
import Orders from '@/pages/Orders'
import Inventory from '@/pages/Inventory'
import Shipping from '@/pages/Shipping'
import Invoices from '@/pages/Invoices'
import ReceivePayment from '@/pages/ReceivePayment'
import Contracts from '@/pages/Contracts'
import ContractDetail from '@/pages/ContractDetail'
import PriorityList from '@/pages/PriorityList'
import CreateCustomer from '@/pages/CreateCustomer'
import CreateVendor from '@/pages/CreateVendor'
import DesignRequests from '@/pages/DesignRequests'
import CreateDesignRequest from '@/pages/CreateDesignRequest'
import DesignRequestDetail from '@/pages/DesignRequestDetail'
import ItemDetail from '@/pages/ItemDetail'
import CustomerDetail from '@/pages/CustomerDetail'
import VendorDetail from '@/pages/VendorDetail'
import CreateItem from '@/pages/CreateItem'
import ItemQuickReport from '@/pages/reports/ItemQuickReport'
import ReportsDashboard from '@/pages/reports/ReportsDashboard'
import CannedReport from '@/pages/reports/CannedReport'
import FinancialStatements from '@/pages/reports/FinancialStatements'
import AgingReports from '@/pages/reports/AgingReports'
import GrossMargin from '@/pages/reports/GrossMargin'
import ContractUtilization from '@/pages/reports/ContractUtilization'
import VendorScorecard from '@/pages/reports/VendorScorecard'
import SalesCommission from '@/pages/reports/SalesCommission'
import OrdersVsInventory from '@/pages/reports/OrdersVsInventory'
import Estimates from '@/pages/Estimates'
import CreateEstimate from '@/pages/CreateEstimate'
import EstimateDetail from '@/pages/EstimateDetail'
import CreateContract from '@/pages/CreateContract'
import CreateSalesOrder from '@/pages/CreateSalesOrder'
import CreatePurchaseOrder from '@/pages/CreatePurchaseOrder'
import CreateRFQ from '@/pages/CreateRFQ'
import CreatePriceList from '@/pages/CreatePriceList'
import RFQs from '@/pages/RFQs'
import RFQDetail from '@/pages/RFQDetail'
import PriceLists from '@/pages/PriceLists'
import PriceListDetail from '@/pages/PriceListDetail'
import OpenSalesOrders from '@/pages/OpenSalesOrders'
import OpenPurchaseOrders from '@/pages/OpenPurchaseOrders'
import SalesOrderDetail from '@/pages/SalesOrderDetail'
import PurchaseOrderDetail from '@/pages/PurchaseOrderDetail'
import DataImport from '@/pages/admin/DataImport'
import TaxZones from '@/pages/admin/TaxZones'
import ChartOfAccounts from '@/pages/ChartOfAccounts'
import JournalEntries from '@/pages/JournalEntries'
import CreateJournalEntry from '@/pages/CreateJournalEntry'
import JournalEntryDetail from '@/pages/JournalEntryDetail'
import InvoiceDetail from '@/pages/InvoiceDetail'
import Scanner from '@/pages/warehouse/Scanner'
import CycleCounts from '@/pages/warehouse/CycleCounts'
import PrintLabels from '@/pages/warehouse/PrintLabels'
import Settings from '@/pages/Settings'
import Preferences from '@/pages/settings/Preferences'
import Onboarding from '@/pages/Onboarding'

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

// Placeholder pages
function PlaceholderPage({ title }: { title: string }) {
  usePageTitle(title)

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-muted-foreground mt-2">This page is under construction.</p>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <ErrorBoundary>
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
                <Route path="/items" element={<Items />} />
                <Route path="/items/new" element={<CreateItem />} />
                <Route path="/items/:id" element={<ItemDetail />} />
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
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/shipping" element={<Shipping />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/invoices/:id" element={<InvoiceDetail />} />
                <Route path="/receive-payment" element={<ReceivePayment />} />
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
                <Route path="/priority-list" element={<PriorityList />} />
                <Route path="/design-requests" element={<DesignRequests />} />
                <Route path="/design-requests/new" element={<CreateDesignRequest />} />
                <Route path="/design-requests/:id" element={<DesignRequestDetail />} />
                <Route path="/warehouse/scanner" element={<Scanner />} />
                <Route path="/warehouse/cycle-counts" element={<CycleCounts />} />
                <Route path="/warehouse/print-labels" element={<PrintLabels />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/preferences" element={<Preferences />} />
                <Route path="/admin/import" element={<DataImport />} />
                <Route path="/admin/tax-zones" element={<TaxZones />} />
                <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
                <Route path="/journal-entries" element={<JournalEntries />} />
                <Route path="/journal-entries/new" element={<CreateJournalEntry />} />
                <Route path="/journal-entries/:id" element={<JournalEntryDetail />} />
                <Route path="*" element={
                  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                    <h1 className="text-4xl font-bold">404</h1>
                    <p className="text-muted-foreground">Page not found</p>
                    <a href="/" className="text-primary hover:underline">Back to Dashboard</a>
                  </div>
                } />
              </Route>
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
