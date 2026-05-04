import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useInvoiceSync } from '@/hooks/useRealtimeSync'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, FileText, CreditCard, FileDown } from 'lucide-react'
import { FolderTabs } from '@/components/ui/folder-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExportButton } from '@/components/ui/export-button'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { useInvoices, usePayments, type Invoice, type Payment } from '@/api/invoicing'
import { format } from 'date-fns'

type Tab = 'invoices' | 'payments'

import { getStatusBadge } from '@/components/ui/StatusBadge'
import { primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MobileCardList } from '@/components/ui/MobileCardList'
import { InvoiceCard } from '@/components/invoices/InvoiceCard'

export default function Invoices() {
  usePageTitle('Invoices')
  useInvoiceSync()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [mobileSearch, setMobileSearch] = useState('')
  const [mobileSortKey, setMobileSortKey] = useState('invoice_number')
  const [mobileSortDir, setMobileSortDir] = useState<'asc' | 'desc'>('desc')

  const [activeTab, setActiveTab] = useState<Tab>('invoices')

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedParty, setSelectedParty] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices()
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments()

  const invoiceColumns: ColumnDef<Invoice>[] = useMemo(
    () => [
      {
        accessorKey: 'invoice_number',
        header: 'Invoice #',
        cell: ({ row }) => (
          <button
            className="font-mono font-medium hover:underline"
            style={{ color: 'var(--so-accent)' }}
            onClick={() => navigate(`/invoices/${row.original.id}`)}
          >
            {row.getValue('invoice_number')}
          </button>
        ),
      },
      {
        accessorKey: 'invoice_type',
        header: 'Type',
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
            style={{ background: 'var(--so-surface-raised)', border: '1px solid var(--so-border)', color: 'var(--so-text-secondary)' }}>
            {row.getValue('invoice_type') === 'AR' ? 'Receivable' : 'Payable'}
          </span>
        ),
      },
      {
        accessorKey: 'party_name',
        header: 'Party',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-primary)' }}>{row.getValue('party_name')}</span>
        ),
      },
      {
        accessorKey: 'invoice_date',
        header: 'Date',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>
            {format(new Date(row.getValue('invoice_date')), 'MMM d, yyyy')}
          </span>
        ),
      },
      {
        accessorKey: 'due_date',
        header: 'Due',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>
            {format(new Date(row.getValue('due_date')), 'MMM d, yyyy')}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
      },
      {
        accessorKey: 'total_amount',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
            ${parseFloat(row.getValue('total_amount')).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        ),
      },
      {
        accessorKey: 'balance_due',
        header: 'Balance',
        cell: ({ row }) => {
          const balance = parseFloat(row.getValue('balance_due'))
          return (
            <span className="font-medium" style={{ color: balance > 0 ? 'var(--so-danger-text)' : 'var(--so-success-text)' }}>
              ${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          )
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const invoice = row.original
          return (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => window.open(`/api/v1/invoices/${invoice.id}/pdf/`, '_blank')}
              title="Download PDF"
            >
              <FileDown className="h-4 w-4" />
            </Button>
          )
        },
      },
    ],
    []
  )

  const paymentColumns: ColumnDef<Payment>[] = useMemo(
    () => [
      {
        accessorKey: 'payment_number',
        header: 'Payment #',
        cell: ({ row }) => (
          <span className="font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>
            {row.getValue('payment_number')}
          </span>
        ),
      },
      {
        accessorKey: 'invoice_number',
        header: 'Invoice',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('invoice_number')}</span>
        ),
      },
      {
        accessorKey: 'payment_date',
        header: 'Date',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>
            {format(new Date(row.getValue('payment_date')), 'MMM d, yyyy')}
          </span>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="font-medium" style={{ color: 'var(--so-success-text)' }}>
            ${parseFloat(row.getValue('amount')).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        ),
      },
      {
        accessorKey: 'payment_method',
        header: 'Method',
        cell: ({ row }) => {
          const method = row.getValue('payment_method') as string
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
              style={{ background: 'var(--so-surface-raised)', border: '1px solid var(--so-border)', color: 'var(--so-text-secondary)' }}>
              {method.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </span>
          )
        },
      },
      {
        accessorKey: 'reference_number',
        header: 'Reference',
        cell: ({ row }) => {
          const ref = row.getValue('reference_number') as string
          return <span style={{ color: 'var(--so-text-tertiary)' }}>{ref || '-'}</span>
        },
      },
    ],
    []
  )

  const invoices = invoicesData?.results ?? []

  const partyOptions = useMemo(() => {
    const names = new Set(invoices.map(i => i.party_name).filter(Boolean))
    return Array.from(names).sort()
  }, [invoices])

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (searchTerm && !inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (selectedParty !== 'all' && inv.party_name !== selectedParty) {
        return false
      }
      if (selectedStatus !== 'all' && inv.status !== selectedStatus) {
        return false
      }
      if (dateFrom && inv.invoice_date < dateFrom) {
        return false
      }
      if (dateTo && inv.invoice_date > dateTo) {
        return false
      }
      return true
    })
  }, [invoices, searchTerm, selectedParty, selectedStatus, dateFrom, dateTo])

  const mobileInvoices = useMemo(() => {
    let rows = filteredInvoices
    if (mobileSearch.trim()) {
      const q = mobileSearch.toLowerCase()
      rows = rows.filter(i =>
        i.invoice_number?.toLowerCase().includes(q) ||
        i.party_name?.toLowerCase().includes(q)
      )
    }
    return [...rows].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (mobileSortKey === 'invoice_number') {
        av = a.invoice_number ?? ''; bv = b.invoice_number ?? ''
      } else if (mobileSortKey === 'party_name') {
        av = a.party_name ?? ''; bv = b.party_name ?? ''
      } else if (mobileSortKey === 'total_amount') {
        av = parseFloat(a.total_amount || '0'); bv = parseFloat(b.total_amount || '0')
      } else if (mobileSortKey === 'due_date') {
        av = a.due_date ?? ''; bv = b.due_date ?? ''
      } else if (mobileSortKey === 'balance_due') {
        av = parseFloat(a.balance_due || '0'); bv = parseFloat(b.balance_due || '0')
      }
      if (av < bv) return mobileSortDir === 'asc' ? -1 : 1
      if (av > bv) return mobileSortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredInvoices, mobileSearch, mobileSortKey, mobileSortDir])

  // Summary stats
  const arInvoices = invoicesData?.results.filter((i) => i.invoice_type === 'AR') ?? []
  const apInvoices = invoicesData?.results.filter((i) => i.invoice_type === 'AP') ?? []
  const totalAR = arInvoices.reduce((sum, i) => sum + parseFloat(i.balance_due), 0)
  const totalAP = apInvoices.reduce((sum, i) => sum + parseFloat(i.balance_due), 0)
  const overdueCount = invoicesData?.results.filter((i) => i.status === 'overdue').length ?? 0

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Invoices</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              Manage invoices and payments
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton
              data={(activeTab === 'invoices' ? (invoicesData?.results ?? []) : (paymentsData?.results ?? [])) as unknown as Record<string, unknown>[]}
              filename={activeTab === 'invoices' ? 'invoices' : 'payments'}
              columns={activeTab === 'invoices' ? [
                { key: 'invoice_number', header: 'Invoice #' },
                { key: 'invoice_type', header: 'Type' },
                { key: 'party_name', header: 'Party' },
                { key: 'invoice_date', header: 'Date' },
                { key: 'due_date', header: 'Due Date' },
                { key: 'status', header: 'Status' },
                { key: 'total_amount', header: 'Total' },
                { key: 'balance_due', header: 'Balance Due' },
              ] : undefined}
            />
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate(activeTab === 'invoices' ? '/invoices/new' : '/receive-payment')}>
              <Plus className="h-3.5 w-3.5" />
              New {activeTab === 'invoices' ? 'Invoice' : 'Payment'}
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="rounded-[14px] mb-6 animate-in delay-1 overflow-hidden"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="grid grid-cols-4 divide-x" style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Receivable Balance
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-success-text)' }}>
                ${totalAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Payable Balance
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-danger-text)' }}>
                ${totalAP.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Total Invoices
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>
                {invoicesData?.count ?? 0}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Overdue
              </div>
              <div className="text-2xl font-bold" style={{ color: overdueCount > 0 ? 'var(--so-warning-text)' : 'var(--so-text-primary)' }}>
                {overdueCount}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-5 animate-in delay-1">
          <FolderTabs
            tabs={[
              { id: 'invoices', label: 'Invoices', icon: <FileText className="h-3.5 w-3.5" /> },
              { id: 'payments', label: 'Payments', icon: <CreditCard className="h-3.5 w-3.5" /> },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as any)}
          />
        </div>

        {/* Filters */}
        {activeTab === 'invoices' && (
          <div className="mb-5 animate-in delay-2">
            <div className="py-3">
              <div className="grid gap-4 md:grid-cols-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search Invoice #</label>
                  <Input
                    placeholder="Search invoice number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Party</label>
                  <Select value={selectedParty} onValueChange={setSelectedParty}>
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue placeholder="All parties" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All parties</SelectItem>
                      {partyOptions.map(party => (
                        <SelectItem key={party} value={party}>
                          {party}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Status</label>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {(['draft', 'sent', 'partial', 'paid', 'overdue', 'void'] as const).map(status => (
                        <SelectItem key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>From Date</label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>To Date</label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DataTable Card / Mobile Cards */}
        {isMobile && activeTab === 'invoices' ? (
          <MobileCardList
            data={mobileInvoices}
            renderCard={(invoice) => <InvoiceCard invoice={invoice} />}
            searchValue={mobileSearch}
            onSearchChange={setMobileSearch}
            searchPlaceholder="Search invoices..."
            sortOptions={[
              { label: 'Invoice #', key: 'invoice_number' },
              { label: 'Party', key: 'party_name' },
              { label: 'Total', key: 'total_amount' },
              { label: 'Due Date', key: 'due_date' },
              { label: 'Balance', key: 'balance_due' },
            ]}
            currentSort={mobileSortKey}
            onSortChange={setMobileSortKey}
            sortDirection={mobileSortDir}
            onSortDirectionChange={() => setMobileSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            resultCount={mobileInvoices.length}
            onItemClick={(invoice) => navigate(`/invoices/${invoice.id}`)}
            emptyMessage="No invoices found."
          />
        ) : (
          <div className="rounded-[14px] overflow-hidden animate-in delay-2"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                {activeTab === 'invoices' ? 'Invoices' : 'Payments'}
              </span>
            </div>
            <div className="p-4">
              {activeTab === 'invoices' && (
                invoicesLoading ? (
                  <TableSkeleton columns={8} rows={8} />
                ) : (
                  <DataTable
                    columns={invoiceColumns}
                    data={filteredInvoices}
                    storageKey="invoices"
                  />
                )
              )}
              {activeTab === 'payments' && (
                paymentsLoading ? (
                  <TableSkeleton columns={6} rows={8} />
                ) : (
                  <DataTable
                    columns={paymentColumns}
                    data={paymentsData?.results ?? []}
                    searchColumn="payment_number"
                    searchPlaceholder="Search payments..."
                    storageKey="bills"
                  />
                )
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
