import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useVendorScorecardReport } from '@/api/reports'
import type { VendorScorecard as VendorScorecardRow } from '@/api/reports'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function thirtyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

function onTimePctColor(pct: number): string {
  if (pct >= 90) return 'text-green-600 font-semibold'
  if (pct >= 70) return 'text-yellow-600 font-semibold'
  return 'text-red-600 font-semibold'
}

export default function VendorScorecard() {
  usePageTitle('Vendor Scorecard')
  const navigate = useNavigate()
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo())
  const [dateTo, setDateTo] = useState(today())

  const { data, isLoading } = useVendorScorecardReport({ date_from: dateFrom, date_to: dateTo })
  const vendors: VendorScorecardRow[] = data?.vendors ?? []

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Reports
        </Button>
        <h1 className="text-2xl font-bold">Vendor Scorecard</h1>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44 h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44 h-8" />
        </div>
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
                    <th className="py-2 font-medium">Vendor</th>
                    <th className="py-2 font-medium text-right">Total POs</th>
                    <th className="py-2 font-medium text-right">Completed</th>
                    <th className="py-2 font-medium text-right">On Time</th>
                    <th className="py-2 font-medium text-right">Late</th>
                    <th className="py-2 font-medium text-right">On-Time %</th>
                    <th className="py-2 font-medium text-right">Total Spend</th>
                    <th className="py-2 font-medium text-right">Avg Lead Time</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((row) => (
                    <tr key={row.vendor_id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-1.5">{row.vendor_name}</td>
                      <td className="py-1.5 text-right font-mono">{row.total_pos}</td>
                      <td className="py-1.5 text-right font-mono">{row.completed_pos}</td>
                      <td className="py-1.5 text-right font-mono">{row.on_time_count}</td>
                      <td className="py-1.5 text-right font-mono">{row.late_count}</td>
                      <td className={`py-1.5 text-right font-mono ${onTimePctColor(row.on_time_pct)}`}>
                        {row.on_time_pct.toFixed(1)}%
                      </td>
                      <td className="py-1.5 text-right font-mono">{formatCurrency(row.total_spend)}</td>
                      <td className="py-1.5 text-right font-mono">
                        {row.avg_lead_time_days !== null ? `${row.avg_lead_time_days.toFixed(0)}d` : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vendors.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No vendor data for this period.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
