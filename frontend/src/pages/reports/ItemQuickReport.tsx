import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useItems } from '@/api/items'
import type { ItemQuickReport as ItemQuickReportData, QuickReportFinancialRow, QuickReportPORow, QuickReportSORow } from '@/api/reports'
import { useQueries } from '@tanstack/react-query'
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
import PrintReportHeader, { PrintFooter } from '@/components/common/PrintReportHeader'

// ─── Column Definitions ─────────────────────────────────────────────────────

const fmtDateCell = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`
}

const financialColumns: ColumnDef<QuickReportFinancialRow>[] = [
  { accessorKey: 'date', header: 'Date', cell: ({ row }) => fmtDateCell(row.original.date) },
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
  { accessorKey: 'date', header: 'Date', cell: ({ row }) => fmtDateCell(row.original.date) },
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
  { accessorKey: 'date', header: 'Date', cell: ({ row }) => fmtDateCell(row.original.date) },
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

// ─── Per-Item Report Section ─────────────────────────────────────────────────

function ItemReportSection({ report, sku, name }: { report: ItemQuickReportData; sku: string; name: string }) {
  return (
    <div className="space-y-4">
      {/* Item header banner */}
      <div className="flex items-center gap-3 border-b-2 border-foreground/20 pb-2 pt-1">
        <span className="font-mono text-lg font-bold">{sku}</span>
        <span className="text-lg text-muted-foreground">{name}</span>
      </div>

      {/* Posting Transactions */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center justify-between text-base">
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
            <p className="text-muted-foreground text-center py-4 text-sm">No posting transactions in this period.</p>
          )}
        </CardContent>
      </Card>

      {/* Purchase Orders */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center justify-between text-base">
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
            <p className="text-muted-foreground text-center py-4 text-sm">No purchase orders in this period.</p>
          )}
        </CardContent>
      </Card>

      {/* Sales Orders */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center justify-between text-base">
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
            <p className="text-muted-foreground text-center py-4 text-sm">No sales orders in this period.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ItemQuickReport() {
  usePageTitle('Item QuickReport')

  const [searchParams] = useSearchParams()
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [runParams, setRunParams] = useState<{ itemIds: number[]; start: string; end: string } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Pre-select item from URL param (e.g. ?item=5)
  useEffect(() => {
    const itemParam = searchParams.get('item')
    if (itemParam) {
      const id = parseInt(itemParam, 10)
      if (!isNaN(id)) setSelectedItemIds((prev) => prev.includes(id) ? prev : [...prev, id])
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

  // Client-side filter — exclude already-selected items from dropdown
  const filteredItems = useMemo(() => {
    const base = allItems.filter((i) => !selectedItemIds.includes(i.id))
    if (!itemSearch) return base
    const q = itemSearch.toLowerCase()
    return base.filter(
      (i) => i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
    )
  }, [allItems, itemSearch, selectedItemIds])

  const selectedItems = useMemo(
    () => allItems.filter((i) => selectedItemIds.includes(i.id)),
    [allItems, selectedItemIds]
  )

  // Fetch reports for all run items in parallel
  const reportQueries = useQueries({
    queries: (runParams?.itemIds ?? []).map((itemId) => ({
      queryKey: ['item-quick-report', itemId, runParams?.start, runParams?.end],
      queryFn: async () => {
        const params: Record<string, string> = {}
        if (runParams?.start) params.start_date = runParams.start
        if (runParams?.end) params.end_date = runParams.end
        const { data } = await api.get<ItemQuickReportData>(
          `/reports/item-quick-report/${itemId}/`,
          { params }
        )
        return data
      },
      enabled: !!itemId,
    })),
  })

  const isLoading = reportQueries.some((q) => q.isLoading)
  const isFetching = reportQueries.some((q) => q.isFetching)
  const hasResults = reportQueries.some((q) => q.data)

  // Sort results alphabetically descending (Z→A) by item name
  const sortedResults = useMemo(() => {
    const results: { itemId: number; sku: string; name: string; report: ItemQuickReportData }[] = []
    for (const q of reportQueries) {
      if (!q.data) continue
      const item = allItems.find((i) => i.id === q.data.item_id)
      if (item) {
        results.push({ itemId: item.id, sku: item.sku, name: item.name, report: q.data })
      }
    }
    results.sort((a, b) => a.name.localeCompare(b.name))
    return results
  }, [reportQueries, allItems])

  const datePresets = useMemo(getDatePresets, [])

  function handleAddItem(id: number) {
    setSelectedItemIds((prev) => prev.includes(id) ? prev : [...prev, id])
    setItemSearch('')
    setDropdownOpen(false)
  }

  function handleRemoveItem(id: number) {
    setSelectedItemIds((prev) => prev.filter((x) => x !== id))
    // Clear the report results for this item; if it was the last one, reset entirely
    setRunParams((prev) => {
      if (!prev) return null
      const remaining = prev.itemIds.filter((x) => x !== id)
      return remaining.length > 0 ? { ...prev, itemIds: remaining } : null
    })
  }

  function handleRun() {
    if (selectedItemIds.length > 0) {
      setRunParams({ itemIds: [...selectedItemIds], start: startDate, end: endDate })
    }
  }

  function handlePreset(preset: DatePreset) {
    setStartDate(preset.start)
    setEndDate(preset.end)
  }

  async function handleDownloadPDF() {
    if (!runParams || runParams.itemIds.length === 0) return
    try {
      const params: Record<string, string> = {}
      if (runParams.start) params.start_date = runParams.start
      if (runParams.end) params.end_date = runParams.end
      const response = await api.get(
        `/reports/item-quick-report/${runParams.itemIds[0]}/pdf/`,
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

  const subtitleText = selectedItems.length > 0
    ? selectedItems.map((i) => `${i.sku} — ${i.name}`).join(', ')
    : undefined

  return (
    <>
      <div className="p-6 space-y-6 print-landscape">
        <PrintReportHeader
          title="Item Quick Report"
          subtitle={subtitleText}
        />

        {/* ─── Report Header (visible on screen) ─── */}
        <div className="text-center" data-print-hide>
          <p className="text-xs text-muted-foreground text-left">{printTimestamp}</p>
          <h1 className="text-2xl font-bold">Item QuickReport</h1>
          <p className="text-muted-foreground">As of {asOfDate}</p>
        </div>

        {/* ─── Filters (hidden on print) ─── */}
        <Card data-print-hide>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              {/* Multi-select Item Selector */}
              <div className="space-y-2" ref={dropdownRef}>
                <Label>Items</Label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={selectedItemIds.length > 0 ? 'Add another item...' : 'Search items...'}
                      className="pl-8"
                      value={itemSearch}
                      onFocus={() => setDropdownOpen(true)}
                      onChange={(e) => {
                        setItemSearch(e.target.value)
                        setDropdownOpen(true)
                      }}
                    />
                  </div>
                  {dropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-auto">
                      {filteredItems.length > 0 ? (
                        filteredItems.slice(0, 50).map((item) => (
                          <button
                            key={item.id}
                            className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                            onClick={() => handleAddItem(item.id)}
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
              <Button onClick={handleRun} disabled={selectedItemIds.length === 0 || isFetching}>
                {isFetching ? 'Loading...' : `Run Report${selectedItemIds.length > 1 ? ` (${selectedItemIds.length})` : ''}`}
              </Button>
            </div>

            {/* Selected items chips */}
            {selectedItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Selected:</span>
                {selectedItems.map((item) => (
                  <Badge key={item.id} variant="secondary" className="gap-1 pr-1">
                    <span className="font-mono text-xs">{item.sku}</span>
                    <span className="text-xs text-muted-foreground">{item.name}</span>
                    <button
                      className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {selectedItems.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground"
                    onClick={() => { setSelectedItemIds([]); setRunParams(null) }}
                  >
                    Clear all
                  </Button>
                )}
              </div>
            )}

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
        {hasResults && (
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

        {/* ─── Report Sections — one group per item, separated by dividers ─── */}
        {sortedResults.length > 0 && (
          <div className="space-y-10">
            {sortedResults.map((result, idx) => (
              <div key={result.itemId}>
                {idx > 0 && (
                  <div className="border-t-4 border-foreground/10 mb-8" />
                )}
                <ItemReportSection
                  report={result.report}
                  sku={result.sku}
                  name={result.name}
                />
              </div>
            ))}
          </div>
        )}

        <PrintFooter />
      </div>
    </>
  )
}
