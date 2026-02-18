import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useGrossMarginReport } from '@/api/reports'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft } from 'lucide-react'

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

function formatPct(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0.0%'
  return `${num.toFixed(1)}%`
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function thirtyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

export default function GrossMargin() {
  usePageTitle('Gross Margin')
  const navigate = useNavigate()
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo())
  const [dateTo, setDateTo] = useState(today())

  const { data, isLoading } = useGrossMarginReport({ date_from: dateFrom, date_to: dateTo })

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Reports
        </Button>
        <h1 className="text-2xl font-bold">Gross Margin Analysis</h1>
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

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-10 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.total_revenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total COGS</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(data.summary.total_cogs)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Gross Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.gross_margin)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Margin %</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatPct(data.summary.margin_pct)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Detail Tabs */}
          <Tabs defaultValue="by-customer">
            <TabsList>
              <TabsTrigger value="by-customer">By Customer</TabsTrigger>
              <TabsTrigger value="by-item">By Item</TabsTrigger>
            </TabsList>

            <TabsContent value="by-customer">
              <Card>
                <CardContent className="pt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 font-medium">Customer</th>
                          <th className="py-2 font-medium text-right">Revenue</th>
                          <th className="py-2 font-medium text-right">COGS</th>
                          <th className="py-2 font-medium text-right">Margin</th>
                          <th className="py-2 font-medium text-right">Margin %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_customer.map((row) => (
                          <tr key={row.customer_id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-1.5">{row.customer_name}</td>
                            <td className="py-1.5 text-right font-mono">{formatCurrency(row.revenue)}</td>
                            <td className="py-1.5 text-right font-mono">{formatCurrency(row.cogs)}</td>
                            <td className="py-1.5 text-right font-mono">{formatCurrency(row.margin)}</td>
                            <td className="py-1.5 text-right font-mono">{formatPct(row.margin_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {data.by_customer.length === 0 && (
                      <p className="text-center py-8 text-muted-foreground">No data for this period.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="by-item">
              <Card>
                <CardContent className="pt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 font-medium">SKU</th>
                          <th className="py-2 font-medium">Item</th>
                          <th className="py-2 font-medium text-right">Revenue</th>
                          <th className="py-2 font-medium text-right">COGS</th>
                          <th className="py-2 font-medium text-right">Margin</th>
                          <th className="py-2 font-medium text-right">Margin %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_item.map((row) => (
                          <tr key={row.item_id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-1.5 font-mono text-xs">{row.item_sku}</td>
                            <td className="py-1.5">{row.item_name}</td>
                            <td className="py-1.5 text-right font-mono">{formatCurrency(row.revenue)}</td>
                            <td className="py-1.5 text-right font-mono">{formatCurrency(row.cogs)}</td>
                            <td className="py-1.5 text-right font-mono">{formatCurrency(row.margin)}</td>
                            <td className="py-1.5 text-right font-mono">{formatPct(row.margin_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {data.by_item.length === 0 && (
                      <p className="text-center py-8 text-muted-foreground">No data for this period.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  )
}
