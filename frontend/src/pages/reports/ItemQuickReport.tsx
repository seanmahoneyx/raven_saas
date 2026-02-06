import { useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useItems } from '@/api/items'
import { useItemQuickReport } from '@/api/reports'
import type { QuickReportFinancialRow, QuickReportPORow, QuickReportSORow } from '@/api/reports'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/ui/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import api from '@/api/client'

// Column definitions
const financialColumns: ColumnDef<QuickReportFinancialRow>[] = [
  { accessorKey: 'date', header: 'Date' },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant={row.original.type === 'Sale' ? 'default' : 'destructive'}>
        {row.original.type}
      </Badge>
    ),
  },
  { accessorKey: 'document_number', header: 'Document #' },
  { accessorKey: 'party_name', header: 'Party' },
  { accessorKey: 'quantity', header: 'Qty', meta: { className: 'text-right' } },
  {
    accessorKey: 'unit_price',
    header: 'Unit Price',
    cell: ({ row }) => `$${row.original.unit_price.toFixed(2)}`,
    meta: { className: 'text-right' },
  },
  {
    accessorKey: 'total',
    header: 'Total',
    cell: ({ row }) => `$${row.original.total.toFixed(2)}`,
    meta: { className: 'text-right' },
  },
]

const poColumns: ColumnDef<QuickReportPORow>[] = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'po_number', header: 'PO #' },
  { accessorKey: 'vendor_name', header: 'Vendor' },
  {
    accessorKey: 'status_display',
    header: 'Status',
    cell: ({ row }) => <Badge variant="outline">{row.original.status_display}</Badge>,
  },
  { accessorKey: 'quantity_ordered', header: 'Qty Ordered', meta: { className: 'text-right' } },
  {
    accessorKey: 'unit_cost',
    header: 'Unit Cost',
    cell: ({ row }) => `$${row.original.unit_cost.toFixed(2)}`,
    meta: { className: 'text-right' },
  },
  {
    accessorKey: 'line_total',
    header: 'Total',
    cell: ({ row }) => `$${row.original.line_total.toFixed(2)}`,
    meta: { className: 'text-right' },
  },
]

const soColumns: ColumnDef<QuickReportSORow>[] = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'order_number', header: 'SO #' },
  { accessorKey: 'customer_name', header: 'Customer' },
  {
    accessorKey: 'status_display',
    header: 'Status',
    cell: ({ row }) => <Badge variant="outline">{row.original.status_display}</Badge>,
  },
  { accessorKey: 'quantity_ordered', header: 'Qty Ordered', meta: { className: 'text-right' } },
  {
    accessorKey: 'unit_price',
    header: 'Unit Price',
    cell: ({ row }) => `$${row.original.unit_price.toFixed(2)}`,
    meta: { className: 'text-right' },
  },
  {
    accessorKey: 'line_total',
    header: 'Total',
    cell: ({ row }) => `$${row.original.line_total.toFixed(2)}`,
    meta: { className: 'text-right' },
  },
]

export default function ItemQuickReport() {
  usePageTitle('Item QuickReport')

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [itemSearch, setItemSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [runParams, setRunParams] = useState<{ itemId: number; start: string; end: string } | null>(null)

  const { data: itemsData } = useItems({ search: itemSearch || undefined })
  const items = itemsData?.results ?? []

  const { data: report, isLoading, isFetching } = useItemQuickReport(
    runParams?.itemId ?? null,
    runParams?.start ?? null,
    runParams?.end ?? null
  )

  const canRun = selectedItemId && startDate && endDate

  function handleRun() {
    if (canRun) {
      setRunParams({ itemId: selectedItemId!, start: startDate, end: endDate })
    }
  }

  async function handleDownloadPDF() {
    if (!runParams) return
    try {
      const response = await api.get(
        `/reports/item-quick-report/${runParams.itemId}/pdf/`,
        {
          params: { start_date: runParams.start, end_date: runParams.end },
          responseType: 'blob',
        }
      )
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `item-quick-report.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      // silently fail for PDF download errors
    }
  }

  const selectedItem = items.find(i => i.id === selectedItemId)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Item QuickReport</h1>
          <p className="text-muted-foreground">Financial and order activity for a single item</p>
        </div>
        {report && (
          <Button variant="outline" onClick={handleDownloadPDF}>
            Download PDF
          </Button>
        )}
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            {/* Item Selector */}
            <div className="space-y-2">
              <Label>Item</Label>
              <div className="relative">
                <Input
                  placeholder="Search items..."
                  value={selectedItem ? `${selectedItem.sku} - ${selectedItem.name}` : itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value)
                    setSelectedItemId(null)
                  }}
                />
                {itemSearch && !selectedItemId && items.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                    {items.slice(0, 10).map((item) => (
                      <button
                        key={item.id}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                        onClick={() => {
                          setSelectedItemId(item.id)
                          setItemSearch('')
                        }}
                      >
                        <span className="font-medium">{item.sku}</span>
                        <span className="text-muted-foreground ml-2">{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Run Button */}
            <Button onClick={handleRun} disabled={!canRun || isFetching}>
              {isFetching ? 'Loading...' : 'Run Report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {isLoading && runParams && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
              <CardContent><Skeleton className="h-32 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Report Sections */}
      {report && (
        <div className="space-y-6">
          {/* Financials */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Financials</span>
                <div className="flex gap-4 text-sm font-normal">
                  <span>Sales: <strong className="text-green-600">${report.financials.summary.total_sales?.toFixed(2)}</strong></span>
                  <span>Costs: <strong className="text-red-600">${report.financials.summary.total_costs?.toFixed(2)}</strong></span>
                  <span>Margin: <strong className="text-blue-600">${report.financials.summary.gross_margin?.toFixed(2)}</strong></span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.financials.rows.length > 0 ? (
                <DataTable columns={financialColumns} data={report.financials.rows} />
              ) : (
                <p className="text-muted-foreground text-center py-8">No financial transactions in this period.</p>
              )}
            </CardContent>
          </Card>

          {/* Purchase Orders */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Purchase Orders</span>
                <div className="flex gap-4 text-sm font-normal">
                  <span><strong>{report.purchase_orders.summary.po_count}</strong> POs</span>
                  <span>Qty: <strong>{report.purchase_orders.summary.total_quantity}</strong></span>
                  <span>Value: <strong className="text-blue-600">${report.purchase_orders.summary.total_value?.toFixed(2)}</strong></span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.purchase_orders.rows.length > 0 ? (
                <DataTable columns={poColumns} data={report.purchase_orders.rows} />
              ) : (
                <p className="text-muted-foreground text-center py-8">No purchase orders in this period.</p>
              )}
            </CardContent>
          </Card>

          {/* Sales Orders */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Sales Orders</span>
                <div className="flex gap-4 text-sm font-normal">
                  <span><strong>{report.sales_orders.summary.so_count}</strong> SOs</span>
                  <span>Qty: <strong>{report.sales_orders.summary.total_quantity}</strong></span>
                  <span>Value: <strong className="text-blue-600">${report.sales_orders.summary.total_value?.toFixed(2)}</strong></span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.sales_orders.rows.length > 0 ? (
                <DataTable columns={soColumns} data={report.sales_orders.rows} />
              ) : (
                <p className="text-muted-foreground text-center py-8">No sales orders in this period.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
