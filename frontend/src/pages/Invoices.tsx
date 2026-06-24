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
import { formatCurrency } from '@/lib/format'
import { downloadAuthed } from '@/lib/downloads'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { useCommentCounts } from '@/api/collaboration'
import { CommentCountBadge } from '@/components/collaboration/CommentCountBadge'
import { PageHeader } from '@/components/page'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MobileCardList } from '@/components/ui/MobileCardList'
import { InvoiceCard } from '@/components/invoices/InvoiceCard'

type Tab = 'invoices' | 'payments'

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

  // Bulk comment counts for the loaded invoice rows (single aggregate query).
  const invoiceIds = useMemo(
    () => (invoicesData?.results ?? []).map(i => i.id),
    [invoicesData],
  )
  const { data: invoiceCommentCounts } = useCommentCounts('invoice', invoiceIds)

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
        accessorKey: 'customer_name',
        header: 'Customer',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-primary)' }}>{row.getValue('customer_name')}</span>
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
            {formatCurrency(row.getValue('total_amount'))}
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
              {formatCurrency(balance)}
            </span>
          )
        },
      },
      {
        id: 'comments',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <CommentCountBadge
            count={invoiceCommentCounts?.[String(row.original.id)] ?? 0}
            onClick={() => navigate(`/invoices/${row.original.id}`)}
          />
        ),
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
              onClick={() => downloadAuthed(`/invoices/${invoice.id}/pdf/`, `invoice-${invoice.invoice_number}.pdf`)}
              title="Download PDF"
            >
              <FileDown className="h-4 w-4" />
            </Button>
          )
        },
      },
    ],
    [navigate, invoiceCommentCounts]
  )

  const paymentColumns: ColumnDef<Payment>[] = useMemo(
    () => [
      {
        accessorKey: 'reference_number',
        header: 'Reference',
        cell: ({ row }) => {
          const ref = row.getValue('reference_number') as string
          return (
            <span className="font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>
              {ref || '—'}
            </span>
          )
        },
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
            {formatCurrency(row.getValue('amount'))}
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
    ],
    []
  )

  const invoices = invoicesData?.results ?? []

  const partyOptions = useMemo(() => {
    return Array.from(new Set(invoices.map((i) => i.customer_name).filter(Boolean))).sort()
  }, [invoices])

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (searchTerm && !inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (selectedParty !== 'all' && inv.customer_name !== selectedParty) return false
      if (selectedStatus !== 'all' && inv.status !== selectedStatus) return false
      if (dateFrom && inv.invoice_date < dateFrom) return false
      if (dateTo && inv.invoice_date > dateTo) return false
      return true
    })
  }, [invoices, searchTerm, selectedParty, selectedStatus, dateFrom, dateTo])

  const mobileInvoices = useMemo(() => {
    let rows = filteredInvoices
    if (mobileSearch.trim()) {
      const q = mobileSearch.toLowerCase()
      rows = rows.filter(i =>
        i.invoice_number?.toLowerCase().includes(q) ||
        i.customer_name?.toLowerCase().includes(q)
      )
    }
    return [...rows].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (mobileSortKey === 'invoice_number') {
        av = a.invoice_number ?? ''; bv = b.invoice_number ?? ''
      } else if (mobileSortKey === 'customer_name') {
        av = a.customer_name ?? ''; bv = b.customer_name ?? ''
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

  // Summary stats (AR only)
  const totalAR = invoices.reduce((sum, i) => sum + parseFloat(i.balance_due || '0'), 0)
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length
  const totalCount = invoicesData?.count ?? 0

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">

        {/* Header */}
        <PageHeader
          title="Invoices"
          description="Manage customer invoices and payments (Accounts Receivable)"
          primary={{
            label: activeTab === 'payments' ? 'Receive Payment' : 'New Invoice',
            icon: Plus,
            onClick: () => navigate(activeTab === 'payments' ? '/receive-payment' : '/invoices/new'),
          }}
          trailing={
            <ExportButton
              iconOnly
              data={(activeTab === 'payments' ? (paymentsData?.results ?? []) : (invoicesData?.results ?? [])) as unknown as Record<string, unknown>[]}
              filename={activeTab === 'payments' ? 'payments' : 'invoices'}
              columns={activeTab === 'invoices' ? [
                { key: 'invoice_number', header: 'Invoice #' },
                { key: 'customer_name', header: 'Customer' },
                { key: 'invoice_date', header: 'Date' },
                { key: 'due_date', header: 'Due Date' },
                { key: 'status', header: 'Status' },
                { key: 'total_amount', header: 'Total' },
                { key: 'balance_due', header: 'Balance Due' },
              ] : undefined}
            />
          }
        />

        {/* KPI Summary Cards */}
        <div className="rounded-[14px] mb-6 animate-in delay-1 overflow-hidden"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Receivable Balance
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-success-text)' }}>
                {formatCurrency(totalAR)}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Total Invoices
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>
                {totalCount}
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
            onTabChange={(id) => setActiveTab(id as Tab)}
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
                  <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Customer</label>
                  <Select value={selectedParty} onValueChange={setSelectedParty}>
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue placeholder="All customers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All customers</SelectItem>
                      {partyOptions.map(party => (
                        <SelectItem key={party} value={party}>{party}</SelectItem>
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
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>To Date</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
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
              { label: 'Customer', key: 'customer_name' },
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
                {activeTab === 'payments' ? 'Payments' : 'Invoices'}
              </span>
            </div>
            <div className="p-4">
              {activeTab === 'invoices' && (
                invoicesLoading ? (
                  <TableSkeleton columns={8} rows={8} />
                ) : (
                  <DataTable columns={invoiceColumns} data={filteredInvoices} storageKey="invoices" />
                )
              )}
              {activeTab === 'payments' && (
                paymentsLoading ? (
                  <TableSkeleton columns={6} rows={8} />
                ) : (
                  <DataTable
                    columns={paymentColumns}
                    data={paymentsData?.results ?? []}
                    searchColumn="reference_number"
                    searchPlaceholder="Search payments..."
                    storageKey="payments"
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
