import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useInvoiceSync } from '@/hooks/useRealtimeSync'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, FileText, CreditCard, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/ui/export-button'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { useInvoices, usePayments, type Invoice, type Payment } from '@/api/invoicing'
import { format } from 'date-fns'

type Tab = 'invoices' | 'payments'

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    active:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    inactive:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    sent:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    partial:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    paid:      { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    overdue:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    void:      { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    complete:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    cancelled: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    expired:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    confirmed: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    applied:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    pending:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  }
  const c = configs[status] || { bg: 'var(--so-warning-bg)', border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function Invoices() {
  usePageTitle('Invoices')
  useInvoiceSync()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<Tab>('invoices')

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

  const tabs = [
    { id: 'invoices' as Tab, label: 'Invoices', icon: FileText },
    { id: 'payments' as Tab, label: 'Payments', icon: CreditCard },
  ]

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
              data={activeTab === 'invoices' ? (invoicesData?.results ?? []) : (paymentsData?.results ?? [])}
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
            <button className={primaryBtnClass} style={primaryBtnStyle}>
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
        <div className="flex gap-1 mb-5 animate-in delay-1" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium -mb-px border-b-2 transition-colors"
                style={{
                  borderColor: active ? 'var(--so-accent)' : 'transparent',
                  color: active ? 'var(--so-accent)' : 'var(--so-text-tertiary)',
                  background: 'transparent',
                }}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* DataTable Card */}
        <div className="rounded-[14px] overflow-hidden animate-in delay-2"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              {tabs.find((t) => t.id === activeTab)?.label}
            </span>
          </div>
          <div className="p-4">
            {activeTab === 'invoices' && (
              invoicesLoading ? (
                <TableSkeleton columns={8} rows={8} />
              ) : (
                <DataTable
                  columns={invoiceColumns}
                  data={invoicesData?.results ?? []}
                  searchColumn="invoice_number"
                  searchPlaceholder="Search invoices..."
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
                />
              )
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
