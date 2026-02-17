import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { apiClient } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import ReportViewer from '@/components/reports/ReportViewer'
import type { ReportColumn } from '@/components/reports/ReportViewer'

// Report column definitions
const REPORT_CONFIGS: Record<string, { title: string; endpoint: string; columns: ReportColumn[]; needsDates: boolean }> = {
  'sales-by-customer': {
    title: 'Sales by Customer',
    endpoint: '/reports/sales-by-customer/',
    needsDates: true,
    columns: [
      { key: 'customer_name', header: 'Customer' },
      { key: 'order_count', header: 'Orders', align: 'right', format: 'number' },
      { key: 'total_sales', header: 'Total Sales', align: 'right', format: 'currency', summable: true },
      { key: 'total_cost', header: 'Cost', align: 'right', format: 'currency', summable: true },
      { key: 'margin_pct', header: 'Margin %', align: 'right', format: 'percent' },
    ],
  },
  'sales-by-item': {
    title: 'Sales by Item',
    endpoint: '/reports/sales-by-item/',
    needsDates: true,
    columns: [
      { key: 'item_sku', header: 'SKU' },
      { key: 'item_name', header: 'Item' },
      { key: 'qty_sold', header: 'Qty Sold', align: 'right', format: 'number', summable: true },
      { key: 'total_revenue', header: 'Revenue', align: 'right', format: 'currency', summable: true },
      { key: 'avg_price', header: 'Avg Price', align: 'right', format: 'currency' },
    ],
  },
  'open-orders': {
    title: 'Open Order Detail',
    endpoint: '/reports/open-orders/',
    needsDates: false,
    columns: [
      { key: 'order_number', header: 'Order #' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'order_date', header: 'Order Date' },
      { key: 'scheduled_date', header: 'Due Date' },
      { key: 'status', header: 'Status' },
      { key: 'subtotal', header: 'Subtotal', align: 'right', format: 'currency', summable: true },
      { key: 'num_lines', header: 'Lines', align: 'right' },
    ],
  },
  'backorders': {
    title: 'Backorder Report',
    endpoint: '/reports/backorders/',
    needsDates: false,
    columns: [
      { key: 'order_number', header: 'Order #' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'scheduled_date', header: 'Due Date' },
      { key: 'item_sku', header: 'SKU' },
      { key: 'item_name', header: 'Item' },
      { key: 'qty_ordered', header: 'Qty', align: 'right', format: 'number', summable: true },
      { key: 'uom', header: 'UOM' },
    ],
  },
  'open-pos': {
    title: 'Open PO Report',
    endpoint: '/reports/open-pos/',
    needsDates: false,
    columns: [
      { key: 'po_number', header: 'PO #' },
      { key: 'vendor_name', header: 'Vendor' },
      { key: 'order_date', header: 'Order Date' },
      { key: 'expected_date', header: 'Expected' },
      { key: 'status', header: 'Status' },
      { key: 'subtotal', header: 'Subtotal', align: 'right', format: 'currency', summable: true },
      { key: 'num_lines', header: 'Lines', align: 'right' },
    ],
  },
  'vendor-performance': {
    title: 'Vendor Performance',
    endpoint: '/reports/vendor-performance/',
    needsDates: true,
    columns: [
      { key: 'vendor_name', header: 'Vendor' },
      { key: 'total_orders', header: 'Total Orders', align: 'right', format: 'number', summable: true },
      { key: 'late_orders', header: 'Late', align: 'right', format: 'number', summable: true },
      { key: 'on_time_pct', header: 'On-Time %', align: 'right', format: 'percent' },
    ],
  },
  'purchase-history': {
    title: 'Purchase History',
    endpoint: '/reports/purchase-history/',
    needsDates: true,
    columns: [
      { key: 'item_sku', header: 'SKU' },
      { key: 'item_name', header: 'Item' },
      { key: 'qty_purchased', header: 'Qty', align: 'right', format: 'number', summable: true },
      { key: 'total_cost', header: 'Total Cost', align: 'right', format: 'currency', summable: true },
      { key: 'avg_cost', header: 'Avg Cost', align: 'right', format: 'currency' },
    ],
  },
  'inventory-valuation': {
    title: 'Inventory Valuation',
    endpoint: '/reports/inventory-valuation/',
    needsDates: false,
    columns: [
      { key: 'item_sku', header: 'SKU' },
      { key: 'item_name', header: 'Item' },
      { key: 'qty_on_hand', header: 'Qty On Hand', align: 'right', format: 'number', summable: true },
      { key: 'unit_cost', header: 'Unit Cost', align: 'right', format: 'currency' },
      { key: 'total_value', header: 'Total Value', align: 'right', format: 'currency', summable: true },
    ],
  },
  'stock-status': {
    title: 'Stock Status',
    endpoint: '/reports/stock-status/',
    needsDates: false,
    columns: [
      { key: 'item_sku', header: 'SKU' },
      { key: 'item_name', header: 'Item' },
      { key: 'qty_on_hand', header: 'On Hand', align: 'right', format: 'number', summable: true },
      { key: 'qty_reserved', header: 'Reserved', align: 'right', format: 'number', summable: true },
      { key: 'qty_available', header: 'Available', align: 'right', format: 'number', summable: true },
      { key: 'qty_on_order', header: 'On Order', align: 'right', format: 'number', summable: true },
    ],
  },
  'low-stock': {
    title: 'Low Stock Alerts',
    endpoint: '/reports/low-stock-alert/',
    needsDates: false,
    columns: [
      { key: 'item_sku', header: 'SKU' },
      { key: 'item_name', header: 'Item' },
      { key: 'qty_available', header: 'Available', align: 'right', format: 'number' },
      { key: 'reorder_point', header: 'Reorder Point', align: 'right', format: 'number' },
      { key: 'shortage', header: 'Shortage', align: 'right', format: 'number', summable: true },
    ],
  },
  'dead-stock': {
    title: 'Dead Stock',
    endpoint: '/reports/dead-stock/',
    needsDates: false,
    columns: [
      { key: 'item_sku', header: 'SKU' },
      { key: 'item_name', header: 'Item' },
      { key: 'qty_on_hand', header: 'Qty On Hand', align: 'right', format: 'number', summable: true },
      { key: 'last_sale_date', header: 'Last Sale' },
      { key: 'days_since_sale', header: 'Days Idle', align: 'right', format: 'number' },
    ],
  },
  'sales-tax': {
    title: 'Sales Tax Liability',
    endpoint: '/reports/sales-tax-liability/',
    needsDates: true,
    columns: [
      { key: 'zone_name', header: 'Tax Zone' },
      { key: 'taxable_amount', header: 'Taxable Amount', align: 'right', format: 'currency', summable: true },
      { key: 'total_tax', header: 'Tax Collected', align: 'right', format: 'currency', summable: true },
      { key: 'invoice_count', header: 'Invoices', align: 'right', format: 'number', summable: true },
    ],
  },
  'gross-margin-detail': {
    title: 'Gross Margin Detail',
    endpoint: '/reports/gross-margin-detail/',
    needsDates: true,
    columns: [
      { key: 'item_sku', header: 'SKU' },
      { key: 'item_name', header: 'Item' },
      { key: 'qty_sold', header: 'Qty', align: 'right', format: 'number', summable: true },
      { key: 'revenue', header: 'Revenue', align: 'right', format: 'currency', summable: true },
      { key: 'cogs', header: 'COGS', align: 'right', format: 'currency', summable: true },
      { key: 'gross_margin', header: 'Gross Margin', align: 'right', format: 'currency', summable: true },
      { key: 'margin_pct', header: 'Margin %', align: 'right', format: 'percent' },
    ],
  },
}

function getDefaultDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

export default function CannedReport() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const config = slug ? REPORT_CONFIGS[slug] : null

  const defaults = getDefaultDates()
  const [startDate, setStartDate] = useState(defaults.start)
  const [endDate, setEndDate] = useState(defaults.end)

  usePageTitle(config?.title || 'Report')

  const params: Record<string, string> = {}
  if (config?.needsDates) {
    params.start_date = startDate
    params.end_date = endDate
  }

  const { data, isLoading } = useQuery({
    queryKey: ['canned-report', slug, startDate, endDate],
    queryFn: () => apiClient.get(config!.endpoint, { params }).then(r => r.data),
    enabled: !!config,
  })

  const handleExportCsv = () => {
    const csvParams = new URLSearchParams({ ...params, format: 'csv' })
    // Use window.open to trigger CSV download
    window.open(`/api/v1${config!.endpoint}?${csvParams.toString()}`, '_blank')
  }

  if (!config) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600">Report not found</h1>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/reports')}>
          Back to Reports
        </Button>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Reports
        </Button>
      </div>

      {config.needsDates && (
        <div className="flex items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40 h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40 h-8" />
          </div>
        </div>
      )}

      <ReportViewer
        title={config.title}
        columns={config.columns}
        rows={data?.rows || []}
        isLoading={isLoading}
        onExportCsv={handleExportCsv}
      />
    </div>
  )
}
