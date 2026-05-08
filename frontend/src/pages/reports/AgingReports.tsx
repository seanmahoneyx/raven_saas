import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useARAgingReport, useAPAgingReport } from '@/api/reports'
import type { AgingReport } from '@/api/reports'
import { useCustomers } from '@/api/parties'
import { useVendors } from '@/api/parties'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Printer, Download, FileText } from 'lucide-react'

import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import PrintReportHeader, { PrintFooter } from '@/components/common/PrintReportHeader'
import { formatCurrency } from '@/lib/format'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function downloadCsv(headers: string[], rows: string[][], filename: string) {
  const csv = [headers.join(','), ...rows.map(r => r.map(v => {
    const s = String(v ?? '')
    return s.includes(',') ? `"${s}"` : s
  }).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Aging Table — dynamic columns driven by data.buckets
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
                {data.buckets.map(b => (
                  <th
                    key={b.key}
                    className={`py-2 font-medium text-right${b.key === 'over' ? ' text-red-600' : ''}`}
                  >
                    {b.label}
                  </th>
                ))}
                <th className="py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.party_id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-1.5">{row.party_name}</td>
                  {row.amounts.map((amt, i) => (
                    <td
                      key={i}
                      className={`py-1.5 text-right font-mono${
                        data.buckets[i]?.key === 'over' && parseFloat(amt) > 0
                          ? ' text-red-600 font-semibold'
                          : ''
                      }`}
                    >
                      {formatCurrency(amt)}
                    </td>
                  ))}
                  <td className="py-1.5 text-right font-mono font-semibold">
                    {formatCurrency(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className="py-2">Totals</td>
                {data.totals.amounts.map((amt, i) => (
                  <td
                    key={i}
                    className={`py-2 text-right font-mono${
                      data.buckets[i]?.key === 'over' ? ' text-red-600' : ''
                    }`}
                  >
                    {formatCurrency(amt)}
                  </td>
                ))}
                <td className="py-2 text-right font-mono">{formatCurrency(data.totals.grand_total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AgingReports() {
  usePageTitle('AR / AP Aging')
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('ar')

  // AR filter state
  const [arDate, setArDate] = useState(today())
  const [arInterval, setArInterval] = useState(30)
  const [arThrough, setArThrough] = useState(90)
  const [arCustomerId, setArCustomerId] = useState<number | null>(null)
  const [arCustomerSearch, setArCustomerSearch] = useState('')

  // AP filter state
  const [apDate, setApDate] = useState(today())
  const [apInterval, setApInterval] = useState(30)
  const [apThrough, setApThrough] = useState(90)
  const [apVendorId, setApVendorId] = useState<number | null>(null)
  const [apVendorSearch, setApVendorSearch] = useState('')

  // Party lookup lists (top 50)
  const { data: customersData } = useCustomers({ search: arCustomerSearch || undefined })
  const { data: vendorsData } = useVendors({ search: apVendorSearch || undefined })

  const { data: arData, isLoading: arLoading } = useARAgingReport({
    date: arDate,
    interval: arInterval,
    through: arThrough,
    customer: arCustomerId,
  })

  const { data: apData, isLoading: apLoading } = useAPAgingReport({
    date: apDate,
    interval: apInterval,
    through: apThrough,
    vendor: apVendorId,
  })

  const handleExportCsv = () => {
    const datestamp = new Date().toISOString().split('T')[0]
    const agingData = activeTab === 'ar' ? arData : apData
    if (!agingData) return
    const partyLabel = activeTab === 'ar' ? 'Customer' : 'Vendor'
    const bucketHeaders = agingData.buckets.map(b => b.label)
    const headers = [partyLabel, ...bucketHeaders, 'Total']
    const rows = agingData.rows.map(r => [r.party_name, ...r.amounts, r.total])
    downloadCsv(headers, rows, `${activeTab}-aging-${datestamp}.csv`)
  }

  const buildPdfUrl = (tab: 'ar' | 'ap') => {
    if (tab === 'ar') {
      const p = new URLSearchParams({ date: arDate, interval: String(arInterval), through: String(arThrough) })
      if (arCustomerId != null) p.set('customer', String(arCustomerId))
      return `/api/v1/reports/ar-aging/pdf/?${p.toString()}`
    } else {
      const p = new URLSearchParams({ date: apDate, interval: String(apInterval), through: String(apThrough) })
      if (apVendorId != null) p.set('vendor', String(apVendorId))
      return `/api/v1/reports/ap-aging/pdf/?${p.toString()}`
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-print-hide>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Reports
          </Button>
          <h1 className="text-2xl font-bold">AR / AP Aging</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button
            className={outlineBtnClass}
            style={outlineBtnStyle}
            onClick={() => window.open(buildPdfUrl(activeTab as 'ar' | 'ap'), '_blank')}
          >
            <FileText className="h-3.5 w-3.5" /> Download PDF
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      <PrintReportHeader title="Aging Report" subtitle={activeTab === 'ar' ? 'AR Aging (Receivables)' : 'AP Aging (Payables)'} />

      <Tabs defaultValue="ar" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="ar">AR Aging (Receivables)</TabsTrigger>
          <TabsTrigger value="ap">AP Aging (Payables)</TabsTrigger>
        </TabsList>

        {/* AR Tab */}
        <TabsContent value="ar">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4" data-print-hide>
              <div className="space-y-1">
                <Label className="text-xs">As of Date</Label>
                <Input type="date" value={arDate} onChange={(e) => setArDate(e.target.value)} className="w-44 h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Interval (days)</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={arInterval}
                  onChange={(e) => setArInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Through (days)</Label>
                <Input
                  type="number"
                  min={arInterval}
                  max={3650}
                  value={arThrough}
                  onChange={(e) => setArThrough(Math.max(arInterval, parseInt(e.target.value) || arInterval))}
                  className="w-24 h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Customer</Label>
                <Select
                  value={arCustomerId != null ? String(arCustomerId) : 'all'}
                  onValueChange={(v) => setArCustomerId(v === 'all' ? null : Number(v))}
                >
                  <SelectTrigger className="w-52 h-8 text-xs">
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1">
                      <Input
                        placeholder="Search..."
                        value={arCustomerSearch}
                        onChange={(e) => setArCustomerSearch(e.target.value)}
                        className="h-7 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customersData?.results.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.party_display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {arLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : arData ? (
              <AgingTable data={arData} partyLabel="Customer" />
            ) : null}
          </div>
        </TabsContent>

        {/* AP Tab */}
        <TabsContent value="ap">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4" data-print-hide>
              <div className="space-y-1">
                <Label className="text-xs">As of Date</Label>
                <Input type="date" value={apDate} onChange={(e) => setApDate(e.target.value)} className="w-44 h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Interval (days)</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={apInterval}
                  onChange={(e) => setApInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Through (days)</Label>
                <Input
                  type="number"
                  min={apInterval}
                  max={3650}
                  value={apThrough}
                  onChange={(e) => setApThrough(Math.max(apInterval, parseInt(e.target.value) || apInterval))}
                  className="w-24 h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vendor</Label>
                <Select
                  value={apVendorId != null ? String(apVendorId) : 'all'}
                  onValueChange={(v) => setApVendorId(v === 'all' ? null : Number(v))}
                >
                  <SelectTrigger className="w-52 h-8 text-xs">
                    <SelectValue placeholder="All Vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1">
                      <Input
                        placeholder="Search..."
                        value={apVendorSearch}
                        onChange={(e) => setApVendorSearch(e.target.value)}
                        className="h-7 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <SelectItem value="all">All Vendors</SelectItem>
                    {vendorsData?.results.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.party_display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {apLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : apData ? (
              <AgingTable data={apData} partyLabel="Vendor" />
            ) : null}
          </div>
        </TabsContent>
        <PrintFooter />
      </Tabs>
    </div>
  )
}
