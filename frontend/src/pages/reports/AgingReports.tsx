import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useARAgingReport, useAPAgingReport } from '@/api/reports'
import type { AgingReport } from '@/api/reports'
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

function today(): string {
  return new Date().toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Aging Table
// ---------------------------------------------------------------------------

function AgingTable({ data, partyLabel }: { data: AgingReport; partyLabel: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">As of {data.as_of_date}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 font-medium">{partyLabel}</th>
                <th className="py-2 font-medium text-right">Current</th>
                <th className="py-2 font-medium text-right">1-30</th>
                <th className="py-2 font-medium text-right">31-60</th>
                <th className="py-2 font-medium text-right">61-90</th>
                <th className="py-2 font-medium text-right text-red-600">Over 90</th>
                <th className="py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.party_id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-1.5">{row.party_name}</td>
                  <td className="py-1.5 text-right font-mono">{formatCurrency(row.current)}</td>
                  <td className="py-1.5 text-right font-mono">{formatCurrency(row.days_1_30)}</td>
                  <td className="py-1.5 text-right font-mono">{formatCurrency(row.days_31_60)}</td>
                  <td className="py-1.5 text-right font-mono">{formatCurrency(row.days_61_90)}</td>
                  <td className="py-1.5 text-right font-mono text-red-600 font-semibold">
                    {parseFloat(row.over_90) !== 0 ? formatCurrency(row.over_90) : ''}
                  </td>
                  <td className="py-1.5 text-right font-mono font-semibold">{formatCurrency(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className="py-2">Totals</td>
                <td className="py-2 text-right font-mono">{formatCurrency(data.totals.current)}</td>
                <td className="py-2 text-right font-mono">{formatCurrency(data.totals.days_1_30)}</td>
                <td className="py-2 text-right font-mono">{formatCurrency(data.totals.days_31_60)}</td>
                <td className="py-2 text-right font-mono">{formatCurrency(data.totals.days_61_90)}</td>
                <td className="py-2 text-right font-mono text-red-600">{formatCurrency(data.totals.over_90)}</td>
                <td className="py-2 text-right font-mono">{formatCurrency(data.totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// AR Tab
// ---------------------------------------------------------------------------

function ARAgingTab() {
  const [date, setDate] = useState(today())
  const { data, isLoading } = useARAgingReport(date)

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">As of Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44 h-8" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : data ? (
        <AgingTable data={data} partyLabel="Customer" />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AP Tab
// ---------------------------------------------------------------------------

function APAgingTab() {
  const [date, setDate] = useState(today())
  const { data, isLoading } = useAPAgingReport(date)

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">As of Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44 h-8" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : data ? (
        <AgingTable data={data} partyLabel="Vendor" />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AgingReports() {
  usePageTitle('AR / AP Aging')
  const navigate = useNavigate()

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Reports
        </Button>
        <h1 className="text-2xl font-bold">AR / AP Aging</h1>
      </div>

      <Tabs defaultValue="ar">
        <TabsList>
          <TabsTrigger value="ar">AR Aging (Receivables)</TabsTrigger>
          <TabsTrigger value="ap">AP Aging (Payables)</TabsTrigger>
        </TabsList>

        <TabsContent value="ar">
          <ARAgingTab />
        </TabsContent>
        <TabsContent value="ap">
          <APAgingTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
