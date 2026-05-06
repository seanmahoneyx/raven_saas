import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useOrdersVsInventoryReport } from '@/api/reports'
import type { OrdersVsInventoryItem } from '@/api/reports'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Printer, Download } from 'lucide-react'

import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import PrintReportHeader, { PrintFooter } from '@/components/common/PrintReportHeader'

function statusColor(status: string): string {
  switch (status) {
    case 'ok':
      return 'text-green-600'
    case 'warning':
      return 'text-yellow-600'
    case 'critical':
      return 'text-red-600'
    default:
      return ''
  }
}

function statusBadgeVariant(status: string): 'success' | 'warning' | 'destructive' {
  switch (status) {
    case 'ok':
      return 'success'
    case 'warning':
      return 'warning'
    case 'critical':
      return 'destructive'
    default:
      return 'success'
  }
}

export default function OrdersVsInventory() {
  usePageTitle('Orders vs Inventory')
  const navigate = useNavigate()
  const { data, isLoading } = useOrdersVsInventoryReport()

  const items = data?.items ?? []

  const handleExportCsv = () => {
    if (items.length === 0) return
    const headers = ['SKU', 'Item', 'Open SO', 'On Hand', 'Allocated', 'Available', 'On Order', 'Incoming PO', 'Projected', 'Shortage', 'Coverage %', 'Status']
    const rows = items.map((r: OrdersVsInventoryItem) => [
      r.item_sku, r.item_name, String(r.open_so_qty), String(r.on_hand),
      String(r.allocated), String(r.available), String(r.on_order), String(r.incoming_po),
      String(r.projected), String(r.shortage), r.coverage_pct.toFixed(1), r.status,
    ])
    const csv = [headers.join(','), ...rows.map((r: string[]) => r.map(v => { const s = String(v ?? ''); return s.includes(',') ? `"${s}"` : s }).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `orders-vs-inventory-${new Date().toISOString().split('T')[0]}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-print-hide>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Reports
          </Button>
          <h1 className="text-2xl font-bold">Orders vs Inventory</h1>
          {data && (
            <span className="text-sm text-muted-foreground">({data.count} items)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      <PrintReportHeader title="Orders vs Inventory" />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demand Coverage Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 font-medium">SKU</th>
                    <th className="py-2 font-medium">Item</th>
                    <th className="py-2 font-medium text-right">Open SO</th>
                    <th className="py-2 font-medium text-right">On Hand</th>
                    <th className="py-2 font-medium text-right">Allocated</th>
                    <th className="py-2 font-medium text-right">Available</th>
                    <th className="py-2 font-medium text-right">On Order</th>
                    <th className="py-2 font-medium text-right">Incoming PO</th>
                    <th className="py-2 font-medium text-right">Projected</th>
                    <th className="py-2 font-medium text-right">Shortage</th>
                    <th className="py-2 font-medium text-right">Coverage</th>
                    <th className="py-2 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.item_id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-1.5 font-mono text-xs">{row.item_sku}</td>
                      <td className="py-1.5">{row.item_name}</td>
                      <td className="py-1.5 text-right font-mono">{row.open_so_qty}</td>
                      <td className="py-1.5 text-right font-mono">{row.on_hand}</td>
                      <td className="py-1.5 text-right font-mono">{row.allocated}</td>
                      <td className="py-1.5 text-right font-mono">{row.available}</td>
                      <td className="py-1.5 text-right font-mono">{row.on_order}</td>
                      <td className="py-1.5 text-right font-mono">{row.incoming_po}</td>
                      <td className="py-1.5 text-right font-mono">{row.projected}</td>
                      <td className="py-1.5 text-right font-mono">
                        {row.shortage > 0 ? (
                          <span className="text-red-600 font-semibold">-{row.shortage}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className={`py-1.5 text-right font-mono ${statusColor(row.status)}`}>
                        {row.coverage_pct.toFixed(0)}%
                      </td>
                      <td className="py-1.5 text-center">
                        <Badge variant={statusBadgeVariant(row.status)} className="text-xs capitalize">
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No items with open orders.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <PrintFooter />
    </div>
  )
}
