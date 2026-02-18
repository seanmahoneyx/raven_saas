import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  useTrialBalance,
  useIncomeStatement,
  useBalanceSheet,
} from '@/api/reports'
import type {
  IncomeStatementSection,
  BalanceSheetSection,
} from '@/api/reports'
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

function thirtyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

function firstOfYear(): string {
  const d = new Date()
  return `${d.getFullYear()}-01-01`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FinancialSection({ section }: { section: IncomeStatementSection | BalanceSheetSection }) {
  return (
    <div className="space-y-1">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{section.label}</h3>
      {section.accounts.map((acct) => (
        <div key={acct.account_code} className="flex justify-between py-0.5 pl-4">
          <span className="text-sm">{acct.account_code} {acct.account_name}</span>
          <span className="text-sm font-mono">{formatCurrency(acct.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t pt-1 font-semibold">
        <span>Total {section.label}</span>
        <span className="font-mono">{formatCurrency(section.total)}</span>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trial Balance Tab
// ---------------------------------------------------------------------------

function TrialBalanceTab() {
  const [date, setDate] = useState(today())
  const { data, isLoading } = useTrialBalance(date)

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">As of Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44 h-8" />
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trial Balance as of {data.as_of_date}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Code</th>
                  <th className="py-2 font-medium">Account</th>
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium text-right">Debit</th>
                  <th className="py-2 font-medium text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((acct) => (
                  <tr key={acct.account_id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-1.5 font-mono text-xs">{acct.account_code}</td>
                    <td className="py-1.5">{acct.account_name}</td>
                    <td className="py-1.5 text-muted-foreground">{acct.account_type}</td>
                    <td className="py-1.5 text-right font-mono">{parseFloat(acct.debit_balance) !== 0 ? formatCurrency(acct.debit_balance) : ''}</td>
                    <td className="py-1.5 text-right font-mono">{parseFloat(acct.credit_balance) !== 0 ? formatCurrency(acct.credit_balance) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td colSpan={3} className="py-2">Totals</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(data.total_debits)}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(data.total_credits)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Income Statement Tab
// ---------------------------------------------------------------------------

function IncomeStatementTab() {
  const [startDate, setStartDate] = useState(firstOfYear())
  const [endDate, setEndDate] = useState(today())
  const { data, isLoading } = useIncomeStatement(startDate, endDate)

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-44 h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End Date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44 h-8" />
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Income Statement: {data.start_date} to {data.end_date}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FinancialSection section={data.revenue} />
            <FinancialSection section={data.cogs} />

            <div className="flex justify-between border-t-2 border-b pt-2 pb-2 font-bold text-green-700">
              <span>Gross Profit</span>
              <span className="font-mono">{formatCurrency(data.gross_profit)}</span>
            </div>

            <FinancialSection section={data.expenses} />

            <div className="flex justify-between border-t-2 pt-2 font-bold text-lg">
              <span>Net Income</span>
              <span className="font-mono">{formatCurrency(data.net_income)}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Balance Sheet Tab
// ---------------------------------------------------------------------------

function BalanceSheetTab() {
  const [date, setDate] = useState(today())
  const { data, isLoading } = useBalanceSheet(date)

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">As of Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44 h-8" />
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Balance Sheet as of {data.as_of_date}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <h2 className="text-base font-bold border-b pb-1">Assets</h2>
            {data.assets.map((section) => (
              <FinancialSection key={section.label} section={section} />
            ))}
            <div className="flex justify-between border-t-2 pt-2 font-bold">
              <span>Total Assets</span>
              <span className="font-mono">{formatCurrency(data.total_assets)}</span>
            </div>

            <h2 className="text-base font-bold border-b pb-1 mt-6">Liabilities</h2>
            {data.liabilities.map((section) => (
              <FinancialSection key={section.label} section={section} />
            ))}
            <div className="flex justify-between border-t-2 pt-2 font-bold">
              <span>Total Liabilities</span>
              <span className="font-mono">{formatCurrency(data.total_liabilities)}</span>
            </div>

            <h2 className="text-base font-bold border-b pb-1 mt-6">Equity</h2>
            {data.equity.map((section) => (
              <FinancialSection key={section.label} section={section} />
            ))}
            <div className="flex justify-between border-t-2 pt-2 font-bold">
              <span>Total Equity</span>
              <span className="font-mono">{formatCurrency(data.total_equity)}</span>
            </div>

            <div className="flex justify-between border-t-4 border-double pt-3 font-bold text-lg">
              <span>Total Liabilities + Equity</span>
              <span className="font-mono">
                {formatCurrency(
                  (parseFloat(data.total_liabilities) + parseFloat(data.total_equity)).toString()
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FinancialStatements() {
  usePageTitle('Financial Statements')
  const navigate = useNavigate()

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Reports
        </Button>
        <h1 className="text-2xl font-bold">Financial Statements</h1>
      </div>

      <Tabs defaultValue="trial-balance">
        <TabsList>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
        </TabsList>

        <TabsContent value="trial-balance">
          <TrialBalanceTab />
        </TabsContent>
        <TabsContent value="income-statement">
          <IncomeStatementTab />
        </TabsContent>
        <TabsContent value="balance-sheet">
          <BalanceSheetTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
