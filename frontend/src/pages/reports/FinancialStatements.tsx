import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  useTrialBalance,
  useIncomeStatement,
  useBalanceSheet,
  useCashFlowStatement,
} from '@/api/reports'
import type {
  IncomeStatementSection,
  BalanceSheetSection,
  TrialBalanceAccount,
  CashFlowSection,
} from '@/api/reports'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Printer, Download } from 'lucide-react'

import { formatCurrency } from '@/lib/format'
import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import PrintReportHeader, { PrintFooter } from '@/components/common/PrintReportHeader'


function today(): string {
  return new Date().toISOString().split('T')[0]
}

function firstOfYear(): string {
  const d = new Date()
  return `${d.getFullYear()}-01-01`
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

function CashFlowSectionView({ section }: { section: CashFlowSection }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{section.label}</h3>
      {section.details.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 font-medium">Description</th>
              <th className="py-1 font-medium">Reference</th>
              <th className="py-1 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {section.details.map((row, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                <td className="py-1 font-mono text-xs">{row.date}</td>
                <td className="py-1">{row.description}</td>
                <td className="py-1 text-muted-foreground">{row.reference}</td>
                <td className="py-1 text-right font-mono">{formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="pl-4 space-y-0.5 border-t pt-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Inflows</span>
          <span className="font-mono">{formatCurrency(section.inflows)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Outflows</span>
          <span className="font-mono">{formatCurrency(section.outflows)}</span>
        </div>
        <div className="flex justify-between font-semibold border-t pt-1">
          <span>Net {section.label}</span>
          <span className="font-mono">{formatCurrency(section.net)}</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FinancialStatements() {
  usePageTitle('Financial Statements')
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('trial-balance')

  // Trial Balance state
  const [tbDate, setTbDate] = useState(today())
  const { data: tbData, isLoading: tbLoading } = useTrialBalance(tbDate)

  // Income Statement state
  const [isStartDate, setIsStartDate] = useState(firstOfYear())
  const [isEndDate, setIsEndDate] = useState(today())
  const { data: isData, isLoading: isLoading } = useIncomeStatement(isStartDate, isEndDate)

  // Balance Sheet state
  const [bsDate, setBsDate] = useState(today())
  const { data: bsData, isLoading: bsLoading } = useBalanceSheet(bsDate)

  // Cash Flow state
  const [cfStartDate, setCfStartDate] = useState(firstOfYear())
  const [cfEndDate, setCfEndDate] = useState(today())
  const { data: cfData, isLoading: cfLoading } = useCashFlowStatement(cfStartDate, cfEndDate)

  const handleExportCsv = () => {
    if (activeTab === 'cash-flow') {
      toast.info('Use Print for Cash Flow export')
      return
    }
    const datestamp = new Date().toISOString().split('T')[0]
    if (activeTab === 'trial-balance' && tbData) {
      const headers = ['Code', 'Account', 'Type', 'Debit', 'Credit']
      const rows = tbData.accounts.map((a: TrialBalanceAccount) => [a.account_code, a.account_name, a.account_type, a.debit_balance, a.credit_balance])
      downloadCsv(headers, rows, `trial-balance-${datestamp}.csv`)
    } else if (activeTab === 'income-statement' && isData) {
      const headers = ['Section', 'Account Code', 'Account Name', 'Amount']
      const rows: string[][] = []
      const addSection = (s: IncomeStatementSection | BalanceSheetSection) => {
        s.accounts.forEach(a => rows.push([s.label, a.account_code, a.account_name, String(a.amount)]))
        rows.push([s.label, '', `Total ${s.label}`, String(s.total)])
      }
      addSection(isData.revenue)
      addSection(isData.cogs)
      rows.push(['', '', 'Gross Profit', String(isData.gross_profit)])
      addSection(isData.expenses)
      rows.push(['', '', 'Net Income', String(isData.net_income)])
      downloadCsv(headers, rows, `income-statement-${datestamp}.csv`)
    } else if (activeTab === 'balance-sheet' && bsData) {
      const headers = ['Category', 'Section', 'Account Code', 'Account Name', 'Amount']
      const rows: string[][] = []
      const addSections = (cat: string, sections: (IncomeStatementSection | BalanceSheetSection)[]) => {
        sections.forEach(s => {
          s.accounts.forEach(a => rows.push([cat, s.label, a.account_code, a.account_name, String(a.amount)]))
          rows.push([cat, s.label, '', `Total ${s.label}`, String(s.total)])
        })
      }
      addSections('Assets', bsData.assets)
      rows.push(['Assets', '', '', 'Total Assets', String(bsData.total_assets)])
      addSections('Liabilities', bsData.liabilities)
      rows.push(['Liabilities', '', '', 'Total Liabilities', String(bsData.total_liabilities)])
      addSections('Equity', bsData.equity)
      rows.push(['Equity', '', '', 'Total Equity', String(bsData.total_equity)])
      downloadCsv(headers, rows, `balance-sheet-${datestamp}.csv`)
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-print-hide>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Reports
          </Button>
          <h1 className="text-2xl font-bold">Financial Statements</h1>
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

      <PrintReportHeader
        title="Financial Statements"
        subtitle={activeTab === 'trial-balance' ? 'Trial Balance' : activeTab === 'income-statement' ? 'Income Statement' : activeTab === 'cash-flow' ? 'Cash Flow Statement' : 'Balance Sheet'}
      />

      <Tabs defaultValue="trial-balance" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
        </TabsList>

        {/* Trial Balance */}
        <TabsContent value="trial-balance">
          <div className="space-y-4">
            <div className="flex items-end gap-4" data-print-hide>
              <div className="space-y-1">
                <Label className="text-xs">As of Date</Label>
                <Input type="date" value={tbDate} onChange={(e) => setTbDate(e.target.value)} className="w-44 h-8" />
              </div>
            </div>

            {tbLoading ? (
              <LoadingSkeleton />
            ) : tbData ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Trial Balance as of {tbData.as_of_date}</CardTitle>
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
                      {tbData.accounts.map((acct: TrialBalanceAccount) => (
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
                        <td className="py-2 text-right font-mono">{formatCurrency(tbData.total_debits)}</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(tbData.total_credits)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        {/* Income Statement */}
        <TabsContent value="income-statement">
          <div className="space-y-4">
            <div className="flex items-end gap-4" data-print-hide>
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={isStartDate} onChange={(e) => setIsStartDate(e.target.value)} className="w-44 h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={isEndDate} onChange={(e) => setIsEndDate(e.target.value)} className="w-44 h-8" />
              </div>
            </div>

            {isLoading ? (
              <LoadingSkeleton />
            ) : isData ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Income Statement: {isData.start_date} to {isData.end_date}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FinancialSection section={isData.revenue} />
                  <FinancialSection section={isData.cogs} />

                  <div className="flex justify-between border-t-2 border-b pt-2 pb-2 font-bold text-green-700">
                    <span>Gross Profit</span>
                    <span className="font-mono">{formatCurrency(isData.gross_profit)}</span>
                  </div>

                  <FinancialSection section={isData.expenses} />

                  <div className="flex justify-between border-t-2 pt-2 font-bold text-lg">
                    <span>Net Income</span>
                    <span className="font-mono">{formatCurrency(isData.net_income)}</span>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        {/* Balance Sheet */}
        <TabsContent value="balance-sheet">
          <div className="space-y-4">
            <div className="flex items-end gap-4" data-print-hide>
              <div className="space-y-1">
                <Label className="text-xs">As of Date</Label>
                <Input type="date" value={bsDate} onChange={(e) => setBsDate(e.target.value)} className="w-44 h-8" />
              </div>
            </div>

            {bsLoading ? (
              <LoadingSkeleton />
            ) : bsData ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Balance Sheet as of {bsData.as_of_date}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <h2 className="text-base font-bold border-b pb-1">Assets</h2>
                  {bsData.assets.map((section: BalanceSheetSection) => (
                    <FinancialSection key={section.label} section={section} />
                  ))}
                  <div className="flex justify-between border-t-2 pt-2 font-bold">
                    <span>Total Assets</span>
                    <span className="font-mono">{formatCurrency(bsData.total_assets)}</span>
                  </div>

                  <h2 className="text-base font-bold border-b pb-1 mt-6">Liabilities</h2>
                  {bsData.liabilities.map((section: BalanceSheetSection) => (
                    <FinancialSection key={section.label} section={section} />
                  ))}
                  <div className="flex justify-between border-t-2 pt-2 font-bold">
                    <span>Total Liabilities</span>
                    <span className="font-mono">{formatCurrency(bsData.total_liabilities)}</span>
                  </div>

                  <h2 className="text-base font-bold border-b pb-1 mt-6">Equity</h2>
                  {bsData.equity.map((section: BalanceSheetSection) => (
                    <FinancialSection key={section.label} section={section} />
                  ))}
                  <div className="flex justify-between border-t-2 pt-2 font-bold">
                    <span>Total Equity</span>
                    <span className="font-mono">{formatCurrency(bsData.total_equity)}</span>
                  </div>

                  <div className="flex justify-between border-t-4 border-double pt-3 font-bold text-lg">
                    <span>Total Liabilities + Equity</span>
                    <span className="font-mono">
                      {formatCurrency(
                        (parseFloat(bsData.total_liabilities) + parseFloat(bsData.total_equity)).toString()
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>
        {/* Cash Flow Statement */}
        <TabsContent value="cash-flow">
          <div className="space-y-4">
            <div className="flex items-end gap-4" data-print-hide>
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={cfStartDate} onChange={(e) => setCfStartDate(e.target.value)} className="w-44 h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={cfEndDate} onChange={(e) => setCfEndDate(e.target.value)} className="w-44 h-8" />
              </div>
            </div>

            {cfLoading ? (
              <LoadingSkeleton />
            ) : cfData ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Cash Flow Statement: {cfData.start_date} to {cfData.end_date}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex justify-between font-bold">
                    <span>Beginning Cash Balance</span>
                    <span className="font-mono">{formatCurrency(cfData.beginning_cash_balance)}</span>
                  </div>

                  <CashFlowSectionView section={cfData.sections.operating} />
                  <CashFlowSectionView section={cfData.sections.investing} />
                  <CashFlowSectionView section={cfData.sections.financing} />

                  <div className={`flex justify-between border-t-2 pt-2 font-bold ${parseFloat(cfData.net_change_in_cash) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    <span>Net Change in Cash</span>
                    <span className="font-mono">{formatCurrency(cfData.net_change_in_cash)}</span>
                  </div>

                  <div className="flex justify-between border-t-4 border-double pt-3 font-bold text-lg">
                    <span>Ending Cash Balance</span>
                    <span className="font-mono">{formatCurrency(cfData.ending_cash_balance)}</span>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <PrintFooter />
      </Tabs>
    </div>
  )
}
