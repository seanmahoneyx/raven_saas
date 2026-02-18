import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useSalesCommissionReport } from '@/api/reports'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export default function SalesCommission() {
  usePageTitle('Sales Commission')
  const navigate = useNavigate()
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo())
  const [dateTo, setDateTo] = useState(today())
  const [commissionRate, setCommissionRate] = useState<string>('')

  const params: { date_from?: string; date_to?: string; commission_rate?: number } = {
    date_from: dateFrom,
    date_to: dateTo,
  }
  if (commissionRate && !isNaN(parseFloat(commissionRate))) {
    params.commission_rate = parseFloat(commissionRate)
  }

  const { data, isLoading } = useSalesCommissionReport(params)

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Reports
        </Button>
        <h1 className="text-2xl font-bold">Sales Commission</h1>
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
        <div className="space-y-1">
          <Label className="text-xs">Commission Rate (%)</Label>
          <Input
            type="number"
            step="0.5"
            min="0"
            max="100"
            placeholder="e.g. 5"
            value={commissionRate}
            onChange={(e) => setCommissionRate(e.target.value)}
            className="w-32 h-8"
          />
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-10 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Invoiced</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.total_invoiced)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.total_paid)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Commission</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(data.summary.total_commission)}</p>
              </CardContent>
            </Card>
          </div>

          {/* By Rep Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Commission by Sales Rep</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 font-medium">Sales Rep</th>
                      <th className="py-2 font-medium text-right">Invoices</th>
                      <th className="py-2 font-medium text-right">Total Invoiced</th>
                      <th className="py-2 font-medium text-right">Total Paid</th>
                      <th className="py-2 font-medium text-right">Rate</th>
                      <th className="py-2 font-medium text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_rep.map((row) => (
                      <tr key={row.rep_id ?? 'unassigned'} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-1.5">{row.rep_name}</td>
                        <td className="py-1.5 text-right font-mono">{row.invoice_count}</td>
                        <td className="py-1.5 text-right font-mono">{formatCurrency(row.total_invoiced)}</td>
                        <td className="py-1.5 text-right font-mono">{formatCurrency(row.total_paid)}</td>
                        <td className="py-1.5 text-right font-mono">{parseFloat(row.commission_rate).toFixed(1)}%</td>
                        <td className="py-1.5 text-right font-mono font-semibold text-blue-600">
                          {formatCurrency(row.commission_earned)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.by_rep.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground">No commission data for this period.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
