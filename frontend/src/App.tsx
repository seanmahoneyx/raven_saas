import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { AuthProvider } from '@/hooks/useAuth'
import { ThemeProvider } from '@/components/theme-provider'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import MainLayout from '@/components/layout/MainLayout'
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
import Reports from '@/pages/Reports'
import Contracts from '@/pages/Contracts'
import ContractDetail from '@/pages/ContractDetail'
import PriorityList from '@/pages/PriorityList'
import CreateCustomer from '@/pages/CreateCustomer'
import CreateVendor from '@/pages/CreateVendor'
import DesignRequests from '@/pages/DesignRequests'
import CreateDesignRequest from '@/pages/CreateDesignRequest'
import ItemDetail from '@/pages/ItemDetail'
import CreateItem from '@/pages/CreateItem'
import ItemQuickReport from '@/pages/reports/ItemQuickReport'
import DataImport from '@/pages/admin/DataImport'

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

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
            <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected routes */}
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/vendors" element={<Vendors />} />
              <Route path="/trucks" element={<Trucks />} />
              <Route path="/customers/new" element={<CreateCustomer />} />
              <Route path="/vendors/new" element={<CreateVendor />} />
              <Route path="/contracts" element={<Contracts />} />
              <Route path="/contracts/:id" element={<ContractDetail />} />
              <Route path="/items" element={<Items />} />
              <Route path="/items/new" element={<CreateItem />} />
              <Route path="/items/:id" element={<ItemDetail />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/shipping" element={<Shipping />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/receive-payment" element={<ReceivePayment />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/item-quick-report" element={<ItemQuickReport />} />
              <Route path="/scheduler" element={<Scheduler />} />
              <Route path="/priority-list" element={<PriorityList />} />
              <Route path="/design-requests" element={<DesignRequests />} />
              <Route path="/design-requests/new" element={<CreateDesignRequest />} />
              <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
              <Route path="/admin/import" element={<DataImport />} />
            </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
