import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useContractUtilizationReport } from '@/api/reports'
import type { ContractUtilization as ContractUtilizationRow } from '@/api/reports'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Printer, Download, FileText } from 'lucide-react'

import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import PrintReportHeader, { PrintFooter } from '@/components/common/PrintReportHeader'
import { formatCurrency } from '@/lib/format'

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const color = clamped >= 90 ? 'bg-green-500' : clamped >= 50 ? 'bg-blue-500' : 'bg-amber-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

export default function ContractUtilization() {
  usePageTitle('Contract Utilization')
  const navigate = useNavigate()
  const { data, isLoading } = useContractUtilizationReport()

  // Sort by completion_pct descending
  const contracts: ContractUtilizationRow[] = data?.contracts
    ? [...data.contracts].sort((a: ContractUtilizationRow, b: ContractUtilizationRow) => b.completion_pct - a.completion_pct)
    : []

  const handleDownloadPdf = () => {
    window.open('/api/v1/reports/contract-utilization/pdf/', '_blank')
  }

  const handleExportCsv = () => {
    if (contracts.length === 0) return
    const headers = ['Contract #', 'Blanket PO', 'Customer', 'Status', 'Committed', 'Released', 'Remaining', 'Completion %', 'Days Left', 'Burn Rate', 'At Risk']
    const rows = contracts.map(r => [
      r.contract_number, r.blanket_po || '', r.customer_name, r.status,
      String(r.total_committed), String(r.total_released), String(r.total_remaining),
      r.completion_pct.toFixed(1), r.days_remaining !== null ? String(r.days_remaining) : '',
      r.burn_rate !== null ? r.burn_rate.toFixed(1) : '', r.at_risk ? 'Yes' : 'No',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => { const s = String(v ?? ''); return s.includes(',') ? `"${s}"` : s }).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `contract-utilization-${new Date().toISOString().split('T')[0]}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-print-hide>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Reports
          </Button>
          <h1 className="text-2xl font-bold">Contract Utilization</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleDownloadPdf}>
            <FileText className="h-3.5 w-3.5" /> Download PDF
          </button>
        </div>
      </div>

      <PrintReportHeader title="Contract Utilization" />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 font-medium">Contract #</th>
                    <th className="py-2 font-medium">Blanket PO</th>
                    <th className="py-2 font-medium">Customer</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium text-right">Committed</th>
                    <th className="py-2 font-medium text-right">Released</th>
                    <th className="py-2 font-medium text-right">Remaining</th>
                    <th className="py-2 font-medium">Completion</th>
                    <th className="py-2 font-medium text-right">Days Left</th>
                    <th className="py-2 font-medium text-right">Burn Rate</th>
                    <th className="py-2 font-medium text-center">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((row) => (
                    <tr key={row.contract_id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-1.5 font-mono text-xs">{row.contract_number}</td>
                      <td className="py-1.5 font-mono text-xs">{row.blanket_po || '--'}</td>
                      <td className="py-1.5">{row.customer_name}</td>
                      <td className="py-1.5">
                        <Badge variant="outline" className="text-xs">{row.status}</Badge>
                      </td>
                      <td className="py-1.5 text-right font-mono">{formatCurrency(row.total_committed)}</td>
                      <td className="py-1.5 text-right font-mono">{formatCurrency(row.total_released)}</td>
                      <td className="py-1.5 text-right font-mono">{formatCurrency(row.total_remaining)}</td>
                      <td className="py-1.5">
                        <ProgressBar pct={row.completion_pct} />
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {row.days_remaining !== null ? row.days_remaining : '--'}
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {row.burn_rate !== null ? `${row.burn_rate.toFixed(1)}/day` : '--'}
                      </td>
                      <td className="py-1.5 text-center">
                        {row.at_risk && (
                          <Badge variant="destructive" className="text-xs">At Risk</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {contracts.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No contracts found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <PrintFooter />
    </div>
  )
}
