import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, ReceiptText, CreditCard, Wallet } from 'lucide-react'
import { FolderTabs } from '@/components/ui/folder-tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExportButton } from '@/components/ui/export-button'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { useBills, useAllBillPayments, type Bill, type BillPayment } from '@/api/invoicing'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/format'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { useCommentCounts } from '@/api/collaboration'
import { CommentCountBadge } from '@/components/collaboration/CommentCountBadge'
import { PageHeader } from '@/components/page'
import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'

type Tab = 'bills' | 'payments'

const TODAY = new Date().toISOString().slice(0, 10)

export default function Bills() {
  usePageTitle('Bills')
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<Tab>('bills')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedVendor, setSelectedVendor] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: billsData, isLoading: billsLoading } = useBills()
  const { data: paymentsData, isLoading: paymentsLoading } = useAllBillPayments()

  // Bulk comment counts for the loaded bill rows (single aggregate query).
  const billIds = useMemo(
    () => (billsData?.results ?? []).map(b => b.id),
    [billsData],
  )
  const { data: billCommentCounts } = useCommentCounts('vendorbill', billIds)

  const billColumns: ColumnDef<Bill>[] = useMemo(
    () => [
      {
        accessorKey: 'bill_number',
        header: 'Bill #',
        cell: ({ row }) => (
          <button
            className="font-mono font-medium hover:underline"
            style={{ color: 'var(--so-accent)' }}
            onClick={() => navigate(`/bills/${row.original.id}`)}
          >
            {row.getValue('bill_number')}
          </button>
        ),
      },
      {
        accessorKey: 'vendor_name',
        header: 'Vendor',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-primary)' }}>{row.getValue('vendor_name')}</span>
        ),
      },
      {
        accessorKey: 'vendor_invoice_number',
        header: 'Vendor Inv #',
        cell: ({ row }) => (
          <span className="font-mono text-[12.5px]" style={{ color: 'var(--so-text-secondary)' }}>
            {(row.getValue('vendor_invoice_number') as string) || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'bill_date',
        header: 'Date',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>
            {format(new Date(row.getValue('bill_date')), 'MMM d, yyyy')}
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
            count={billCommentCounts?.[String(row.original.id)] ?? 0}
            onClick={() => navigate(`/bills/${row.original.id}`)}
          />
        ),
      },
    ],
    [navigate, billCommentCounts]
  )

  const paymentColumns: ColumnDef<BillPayment>[] = useMemo(
    () => [
      {
        accessorKey: 'reference_number',
        header: 'Reference',
        cell: ({ row }) => (
          <span className="font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>
            {(row.getValue('reference_number') as string) || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'bill_number',
        header: 'Bill',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('bill_number')}</span>
        ),
      },
      {
        accessorKey: 'vendor_name',
        header: 'Vendor',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('vendor_name')}</span>
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
          <span className="font-medium" style={{ color: 'var(--so-danger-text)' }}>
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

  const bills = billsData?.results ?? []

  const vendorOptions = useMemo(() => {
    return Array.from(new Set(bills.map((b) => b.vendor_name).filter(Boolean))).sort()
  }, [bills])

  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      if (searchTerm && !bill.bill_number.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (selectedVendor !== 'all' && bill.vendor_name !== selectedVendor) return false
      if (selectedStatus !== 'all' && bill.status !== selectedStatus) return false
      if (dateFrom && bill.bill_date < dateFrom) return false
      if (dateTo && bill.bill_date > dateTo) return false
      return true
    })
  }, [bills, searchTerm, selectedVendor, selectedStatus, dateFrom, dateTo])

  // Payables KPIs
  const totalAP = bills.reduce((sum, b) => sum + parseFloat(b.balance_due || '0'), 0)
  const overdueCount = bills.filter(
    (b) => b.status !== 'paid' && b.status !== 'void' && b.due_date < TODAY
  ).length
  const totalCount = billsData?.count ?? 0

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">

        <PageHeader
          title="Bills"
          description="Manage vendor bills and payments (Accounts Payable)"
          primary={{
            label: activeTab === 'payments' ? 'Pay Bills' : 'New Bill',
            icon: Plus,
            onClick: () => navigate(activeTab === 'payments' ? '/pay-bills' : '/bills/new'),
          }}
          trailing={
            <>
              <button
                type="button"
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => navigate('/pay-bills')}
              >
                <Wallet className="h-3.5 w-3.5" /> Pay Bills
              </button>
              <ExportButton
                iconOnly
                data={(activeTab === 'payments' ? (paymentsData?.results ?? []) : filteredBills) as unknown as Record<string, unknown>[]}
                filename={activeTab === 'payments' ? 'bill-payments' : 'bills'}
                columns={activeTab === 'bills' ? [
                  { key: 'bill_number', header: 'Bill #' },
                  { key: 'vendor_name', header: 'Vendor' },
                  { key: 'vendor_invoice_number', header: 'Vendor Inv #' },
                  { key: 'bill_date', header: 'Date' },
                  { key: 'due_date', header: 'Due Date' },
                  { key: 'status', header: 'Status' },
                  { key: 'total_amount', header: 'Total' },
                  { key: 'balance_due', header: 'Balance Due' },
                ] : undefined}
              />
            </>
          }
        />

        {/* KPI Summary Cards */}
        <div className="rounded-[14px] mb-6 animate-in delay-1 overflow-hidden"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Payable Balance
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-danger-text)' }}>
                {formatCurrency(totalAP)}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Total Bills
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
              { id: 'bills', label: 'Bills', icon: <ReceiptText className="h-3.5 w-3.5" /> },
              { id: 'payments', label: 'Payments', icon: <CreditCard className="h-3.5 w-3.5" /> },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as Tab)}
          />
        </div>

        {/* Filters */}
        {activeTab === 'bills' && (
          <div className="mb-5 animate-in delay-2">
            <div className="py-3">
              <div className="grid gap-4 md:grid-cols-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search Bill #</label>
                  <Input
                    placeholder="Search bill number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Vendor</label>
                  <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue placeholder="All vendors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All vendors</SelectItem>
                      {vendorOptions.map((vendor) => (
                        <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
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
                      {(['draft', 'posted', 'partial', 'paid', 'void'] as const).map((status) => (
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

        {/* DataTable Card */}
        <div className="rounded-[14px] overflow-hidden animate-in delay-2"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              {activeTab === 'payments' ? 'Bill Payments' : 'Bills'}
            </span>
          </div>
          <div className="p-4">
            {activeTab === 'bills' && (
              billsLoading ? (
                <TableSkeleton columns={8} rows={8} />
              ) : (
                <DataTable columns={billColumns} data={filteredBills} storageKey="bills" />
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
                  storageKey="bill-payments"
                />
              )
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
