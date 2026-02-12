import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { format, startOfWeek, startOfMonth, startOfYear } from 'date-fns'
import { FileDown, Printer, Search, X } from 'lucide-react'
import api from '@/api/client'

// ─── Column Definitions ─────────────────────────────────────────────────────

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

// ─── Date Helpers ────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

type DatePreset = { label: string; start: string; end: string }

function getDatePresets(): DatePreset[] {
  const today = new Date()
  return [
    { label: 'Today', start: fmtDate(today), end: fmtDate(today) },
    { label: 'This Week', start: fmtDate(startOfWeek(today, { weekStartsOn: 1 })), end: fmtDate(today) },
    { label: 'This Month', start: fmtDate(startOfMonth(today)), end: fmtDate(today) },
    { label: 'YTD', start: fmtDate(startOfYear(today)), end: fmtDate(today) },
    { label: 'All Time', start: '', end: '' },
  ]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ItemQuickReport() {
  usePageTitle('Item QuickReport')

  const [searchParams] = useSearchParams()
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [itemSearch, setItemSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [runParams, setRunParams] = useState<{ itemId: number; start: string; end: string } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Pre-select item from URL param (e.g. ?item=5)
  useEffect(() => {
    const itemParam = searchParams.get('item')
    if (itemParam) {
      const id = parseInt(itemParam, 10)
      if (!isNaN(id)) setSelectedItemId(id)
    }
  }, [searchParams])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { data: itemsData } = useItems()
  const allItems = itemsData?.results ?? []

  // Client-side filter
  const filteredItems = useMemo(() => {
    if (!itemSearch) return allItems
    const q = itemSearch.toLowerCase()
    return allItems.filter(
      (i) => i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
    )
  }, [allItems, itemSearch])

  const selectedItem = allItems.find((i) => i.id === selectedItemId)

  const { data: report, isLoading, isFetching } = useItemQuickReport(
    runParams?.itemId ?? null,
    runParams?.start || null,
    runParams?.end || null
  )

  const datePresets = useMemo(getDatePresets, [])

  function handleRun() {
    if (selectedItemId) {
      setRunParams({ itemId: selectedItemId, start: startDate, end: endDate })
    }
  }

  function handlePreset(preset: DatePreset) {
    setStartDate(preset.start)
    setEndDate(preset.end)
  }

  async function handleDownloadPDF() {
    if (!runParams) return
    try {
      const params: Record<string, string> = {}
      if (runParams.start) params.start_date = runParams.start
      if (runParams.end) params.end_date = runParams.end
      const response = await api.get(
        `/reports/item-quick-report/${runParams.itemId}/pdf/`,
        { params, responseType: 'blob' }
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

  const printTimestamp = format(new Date(), 'MMMM d, yyyy h:mm a')
  const asOfDate = format(new Date(), 'MMMM d, yyyy')

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          header, nav, [data-print-hide] { display: none !important; }
          main { padding: 0 !important; }
          .print-only { display: block !important; }
          @page { margin: 0.75in; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="p-6 space-y-6">
        {/* ─── Report Header (visible always, centered) ─── */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground text-left">{printTimestamp}</p>
          <h1 className="text-2xl font-bold">Item QuickReport</h1>
          <p className="text-muted-foreground">As of {asOfDate}</p>
          {selectedItem && (
            <p className="text-sm font-medium mt-1">
              <span className="font-mono">{selectedItem.sku}</span>
              <span className="text-muted-foreground ml-2">{selectedItem.name}</span>
            </p>
          )}
        </div>

        {/* ─── Filters (hidden on print) ─── */}
        <Card data-print-hide>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              {/* Smart Item Selector */}
              <div className="space-y-2" ref={dropdownRef}>
                <Label>Item</Label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search items..."
                      className="pl-8 pr-8"
                      value={selectedItem && !dropdownOpen ? `${selectedItem.sku} - ${selectedItem.name}` : itemSearch}
                      onFocus={() => {
                        setDropdownOpen(true)
                        if (selectedItem) setItemSearch('')
                      }}
                      onChange={(e) => {
                        setItemSearch(e.target.value)
                        setDropdownOpen(true)
                        if (selectedItemId) setSelectedItemId(null)
                      }}
                    />
                    {selectedItemId && (
                      <button
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setSelectedItemId(null)
                          setItemSearch('')
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {dropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-auto">
                      {filteredItems.length > 0 ? (
                        filteredItems.slice(0, 50).map((item) => (
                          <button
                            key={item.id}
                            className={`w-full text-left px-3 py-2 hover:bg-accent text-sm ${
                              item.id === selectedItemId ? 'bg-accent' : ''
                            }`}
                            onClick={() => {
                              setSelectedItemId(item.id)
                              setItemSearch('')
                              setDropdownOpen(false)
                            }}
                          >
                            <span className="font-mono font-medium">{item.sku}</span>
                            <span className="text-muted-foreground ml-2">{item.name}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No items found</div>
                      )}
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
                  placeholder="Beginning of time"
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="Today"
                />
              </div>

              {/* Run Button */}
              <Button onClick={handleRun} disabled={!selectedItemId || isFetching}>
                {isFetching ? 'Loading...' : 'Run Report'}
              </Button>
            </div>

            {/* Date Presets */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Quick:</span>
              {datePresets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handlePreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ─── Action Buttons (hidden on print) ─── */}
        {report && (
          <div className="flex justify-end gap-2" data-print-hide>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
              <FileDown className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        )}

        {/* ─── Loading skeleton ─── */}
        {isLoading && runParams && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
                <CardContent><Skeleton className="h-32 w-full" /></CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ─── Report Sections ─── */}
        {report && (
          <div className="space-y-6">
            {/* Posting Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Posting Transactions</span>
                  <div className="flex gap-4 text-sm font-normal">
                    <span>Sales: <strong className="text-green-600">${report.financials.summary.total_sales?.toFixed(2)}</strong></span>
                    <span>Costs: <strong className="text-red-600">${report.financials.summary.total_costs?.toFixed(2)}</strong></span>
                    <span>Margin: <strong className="text-blue-600">${report.financials.summary.gross_margin?.toFixed(2)}</strong></span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {report.financials.rows.length > 0 ? (
                  <div className="[&_tbody_tr:nth-child(odd)]:bg-muted/40">
                    <DataTable columns={financialColumns} data={report.financials.rows} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No posting transactions in this period.</p>
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
                  <div className="[&_tbody_tr:nth-child(odd)]:bg-muted/40">
                    <DataTable columns={poColumns} data={report.purchase_orders.rows} />
                  </div>
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
                  <div className="[&_tbody_tr:nth-child(odd)]:bg-muted/40">
                    <DataTable columns={soColumns} data={report.sales_orders.rows} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No sales orders in this period.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
