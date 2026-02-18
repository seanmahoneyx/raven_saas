import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  BarChart3, Users, Package, Truck, Warehouse, DollarSign,
  AlertTriangle, TrendingDown, FileText, ShoppingCart, Clock, Archive,
} from 'lucide-react'

interface ReportLink {
  title: string
  description: string
  path: string
  icon: React.ReactNode
}

const reportSections: { title: string; reports: ReportLink[] }[] = [
  {
    title: 'Financial Statements & Analysis',
    reports: [
      { title: 'Financial Statements', description: 'Trial Balance, Income Statement, Balance Sheet', path: '/reports/financial-statements', icon: <FileText className="h-5 w-5 text-blue-600" /> },
      { title: 'AR / AP Aging', description: 'Receivables and payables aging by bucket', path: '/reports/aging', icon: <Clock className="h-5 w-5 text-amber-600" /> },
      { title: 'Gross Margin', description: 'Revenue vs COGS by customer and item', path: '/reports/gross-margin', icon: <TrendingDown className="h-5 w-5 text-green-600" /> },
      { title: 'Contract Utilization', description: 'Commitment vs release with burn rate', path: '/reports/contract-utilization', icon: <FileText className="h-5 w-5 text-purple-600" /> },
      { title: 'Vendor Scorecard', description: 'Delivery performance, spend, and lead time', path: '/reports/vendor-scorecard', icon: <Users className="h-5 w-5 text-cyan-600" /> },
      { title: 'Sales Commission', description: 'Commission earned by rep from paid invoices', path: '/reports/sales-commission', icon: <DollarSign className="h-5 w-5 text-green-500" /> },
      { title: 'Orders vs Inventory', description: 'Demand coverage and projected shortages', path: '/reports/orders-vs-inventory', icon: <Package className="h-5 w-5 text-blue-500" /> },
    ],
  },
  {
    title: 'Sales',
    reports: [
      { title: 'Sales by Customer', description: 'Revenue, orders, and margin by customer', path: '/reports/sales-by-customer', icon: <Users className="h-5 w-5 text-blue-500" /> },
      { title: 'Sales by Item', description: 'Qty sold, revenue, and avg price by item', path: '/reports/sales-by-item', icon: <BarChart3 className="h-5 w-5 text-green-500" /> },
      { title: 'Open Orders', description: 'All active orders by due date', path: '/reports/open-orders', icon: <ShoppingCart className="h-5 w-5 text-purple-500" /> },
      { title: 'Backorders', description: 'Outstanding order lines awaiting fulfillment', path: '/reports/backorders', icon: <Clock className="h-5 w-5 text-amber-500" /> },
    ],
  },
  {
    title: 'Purchasing',
    reports: [
      { title: 'Open POs', description: 'Incoming stock sorted by expected date', path: '/reports/open-pos', icon: <Truck className="h-5 w-5 text-indigo-500" /> },
      { title: 'Vendor Performance', description: 'On-time delivery rate by vendor', path: '/reports/vendor-performance', icon: <Users className="h-5 w-5 text-cyan-500" /> },
      { title: 'Purchase History', description: 'Items purchased with cost trends', path: '/reports/purchase-history', icon: <FileText className="h-5 w-5 text-teal-500" /> },
    ],
  },
  {
    title: 'Warehouse & Inventory',
    reports: [
      { title: 'Inventory Valuation', description: 'Qty x Cost = Total Value', path: '/reports/inventory-valuation', icon: <DollarSign className="h-5 w-5 text-green-600" /> },
      { title: 'Stock Status', description: 'On hand, reserved, available, on order', path: '/reports/stock-status', icon: <Warehouse className="h-5 w-5 text-blue-600" /> },
      { title: 'Low Stock Alerts', description: 'Items below reorder point', path: '/reports/low-stock', icon: <AlertTriangle className="h-5 w-5 text-amber-600" /> },
      { title: 'Dead Stock', description: 'Items with no sales in 180+ days', path: '/reports/dead-stock', icon: <Archive className="h-5 w-5 text-red-500" /> },
    ],
  },
  {
    title: 'Financial',
    reports: [
      { title: 'Sales Tax Liability', description: 'Tax collected by zone', path: '/reports/sales-tax', icon: <DollarSign className="h-5 w-5 text-red-600" /> },
      { title: 'Gross Margin Detail', description: 'Revenue minus COGS by item', path: '/reports/gross-margin-detail', icon: <TrendingDown className="h-5 w-5 text-orange-500" /> },
    ],
  },
]

export default function ReportsDashboard() {
  usePageTitle('Reports')
  const navigate = useNavigate()

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-1">Standard report pack — sales, purchasing, inventory, and financial</p>
      </div>

      {reportSections.map((section) => (
        <div key={section.title}>
          <h2 className="text-lg font-semibold mb-3">{section.title}</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {section.reports.map((report) => (
              <Card
                key={report.path}
                className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
                onClick={() => navigate(report.path)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {report.icon}
                    {report.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{report.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
