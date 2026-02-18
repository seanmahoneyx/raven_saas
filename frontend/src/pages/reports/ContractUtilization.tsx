import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useContractUtilizationReport } from '@/api/reports'
import type { ContractUtilization as ContractUtilizationRow } from '@/api/reports'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

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

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Reports
        </Button>
        <h1 className="text-2xl font-bold">Contract Utilization</h1>
      </div>

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
    </div>
  )
}
