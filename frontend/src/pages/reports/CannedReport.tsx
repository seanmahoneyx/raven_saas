import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { apiClient } from '@/api/client'
import { useCustomers } from '@/api/parties'
import { useVendors } from '@/api/parties'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ReportViewer from '@/components/reports/ReportViewer'
import type { ReportColumn } from '@/components/reports/ReportViewer'

// Filter kinds supported by the per-slug filter bar
type FilterKind = 'status_so' | 'status_po' | 'customer' | 'vendor' | 'start_date' | 'end_date'

// Report column definitions
const REPORT_CONFIGS: Record<
  string,
  {
    title: string
    endpoint: string
    columns: ReportColumn[]
    needsDates: boolean
    pdfEndpoint?: string
    filters?: FilterKind[]
  }
> = {
  'sales-by-customer': {
    title: 'Sales by Customer',
    endpoint: '/reports/sales-by-customer/',
    needsDates: true,
    pdfEndpoint: '/reports/sales-by-customer/pdf/',
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
    pdfEndpoint: '/reports/sales-by-item/pdf/',
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
    pdfEndpoint: '/reports/open-orders/pdf/',
    filters: ['status_so', 'customer', 'start_date', 'end_date'],
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
    pdfEndpoint: '/reports/backorders/pdf/',
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
    pdfEndpoint: '/reports/open-pos/pdf/',
    filters: ['status_po', 'vendor', 'start_date', 'end_date'],
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
    pdfEndpoint: '/reports/vendor-performance/pdf/',
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
    pdfEndpoint: '/reports/purchase-history/pdf/',
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
    pdfEndpoint: '/reports/inventory-valuation/pdf/',
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
    pdfEndpoint: '/reports/stock-status/pdf/',
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
    pdfEndpoint: '/reports/low-stock-alert/pdf/',
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
    pdfEndpoint: '/reports/dead-stock/pdf/',
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
    pdfEndpoint: '/reports/sales-tax-liability/pdf/',
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
    pdfEndpoint: '/reports/gross-margin-detail/pdf/',
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

const SO_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'picking', label: 'Picking' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

const PO_STATUS_OPTIONS = SO_STATUS_OPTIONS // same BaseOrder.STATUS_CHOICES

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

  // Per-slug filter state (only consumed when config.filters includes the kind)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPartyId, setFilterPartyId] = useState<number | null>(null)
  const [filterPartySearch, setFilterPartySearch] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  // Party lists for open-orders / open-pos selectors
  const isOpenOrders = slug === 'open-orders'
  const isOpenPos = slug === 'open-pos'
  const { data: customersData } = useCustomers(
    isOpenOrders ? { search: filterPartySearch || undefined } : undefined
  )
  const { data: vendorsData } = useVendors(
    isOpenPos ? { search: filterPartySearch || undefined } : undefined
  )

  usePageTitle(config?.title || 'Report')

  // Build params for the main query
  const params: Record<string, string> = {}
  if (config?.needsDates) {
    params.start_date = startDate
    params.end_date = endDate
  }
  if (config?.filters) {
    if (filterStatus) params.status = filterStatus
    if (filterPartyId != null) {
      if (isOpenOrders) params.customer = String(filterPartyId)
      if (isOpenPos) params.vendor = String(filterPartyId)
    }
    if (filterStartDate) params.start_date = filterStartDate
    if (filterEndDate) params.end_date = filterEndDate
  }

  const { data, isLoading } = useQuery({
    queryKey: ['canned-report', slug, params],
    queryFn: () => apiClient.get(config!.endpoint, { params }).then(r => r.data),
    enabled: !!config,
  })

  const handleExportCsv = () => {
    const csvParams = new URLSearchParams({ ...params, format: 'csv' })
    window.open(`/api/v1${config!.endpoint}?${csvParams.toString()}`, '_blank')
  }

  const handleDownloadPdf = () => {
    if (!config?.pdfEndpoint) return
    const pdfParams = new URLSearchParams(params)
    window.open(`/api/v1${config.pdfEndpoint}?${pdfParams.toString()}`, '_blank')
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

  const hasSlugFilters = !!config.filters?.length

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Reports
        </Button>
      </div>

      {/* Date range filter for reports that use needsDates */}
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

      {/* Per-slug filter bar for open-orders and open-pos */}
      {hasSlugFilters && (
        <div className="flex flex-wrap items-end gap-4">
          {/* Status filter */}
          {(config.filters!.includes('status_so') || config.filters!.includes('status_po')) && (
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={filterStatus || 'all'}
                onValueChange={(v) => setFilterStatus(v === 'all' ? '' : v)}
              >
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {(config.filters!.includes('status_so') ? SO_STATUS_OPTIONS : PO_STATUS_OPTIONS).map(
                    (opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Customer filter (open-orders) */}
          {config.filters!.includes('customer') && (
            <div className="space-y-1">
              <Label className="text-xs">Customer</Label>
              <Select
                value={filterPartyId != null ? String(filterPartyId) : 'all'}
                onValueChange={(v) => setFilterPartyId(v === 'all' ? null : Number(v))}
              >
                <SelectTrigger className="w-52 h-8 text-xs">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1">
                    <Input
                      placeholder="Search..."
                      value={filterPartySearch}
                      onChange={(e) => setFilterPartySearch(e.target.value)}
                      className="h-7 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customersData?.results.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.party_display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Vendor filter (open-pos) */}
          {config.filters!.includes('vendor') && (
            <div className="space-y-1">
              <Label className="text-xs">Vendor</Label>
              <Select
                value={filterPartyId != null ? String(filterPartyId) : 'all'}
                onValueChange={(v) => setFilterPartyId(v === 'all' ? null : Number(v))}
              >
                <SelectTrigger className="w-52 h-8 text-xs">
                  <SelectValue placeholder="All Vendors" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1">
                    <Input
                      placeholder="Search..."
                      value={filterPartySearch}
                      onChange={(e) => setFilterPartySearch(e.target.value)}
                      className="h-7 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <SelectItem value="all">All Vendors</SelectItem>
                  {vendorsData?.results.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.party_display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date range filters */}
          {config.filters!.includes('start_date') && (
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-40 h-8"
              />
            </div>
          )}
          {config.filters!.includes('end_date') && (
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-40 h-8"
              />
            </div>
          )}
        </div>
      )}

      <ReportViewer
        title={config.title}
        columns={config.columns}
        rows={data?.rows || []}
        isLoading={isLoading}
        onExportCsv={handleExportCsv}
        onDownloadPdf={config.pdfEndpoint ? handleDownloadPdf : undefined}
      />
    </div>
  )
}
