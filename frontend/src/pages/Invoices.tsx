import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useInvoiceSync } from '@/hooks/useRealtimeSync'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, FileText, CreditCard, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/ui/export-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { useInvoices, usePayments, type Invoice, type Payment } from '@/api/invoicing'
import { format } from 'date-fns'

type Tab = 'invoices' | 'payments'

const invoiceStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  sent: 'outline',
  partial: 'warning',
  paid: 'success',
  overdue: 'destructive',
  void: 'secondary',
}

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
            className="font-mono font-medium text-primary hover:underline"
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
          <Badge variant="outline">
            {row.getValue('invoice_type') === 'AR' ? 'Receivable' : 'Payable'}
          </Badge>
        ),
      },
      {
        accessorKey: 'party_name',
        header: 'Party',
      },
      {
        accessorKey: 'invoice_date',
        header: 'Date',
        cell: ({ row }) => format(new Date(row.getValue('invoice_date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'due_date',
        header: 'Due',
        cell: ({ row }) => format(new Date(row.getValue('due_date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string
          return (
            <Badge variant={invoiceStatusVariant[status] || 'outline'}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'total_amount',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium">
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
            <span className={balance > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
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
          <span className="font-mono font-medium">{row.getValue('payment_number')}</span>
        ),
      },
      {
        accessorKey: 'invoice_number',
        header: 'Invoice',
      },
      {
        accessorKey: 'payment_date',
        header: 'Date',
        cell: ({ row }) => format(new Date(row.getValue('payment_date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="font-medium text-green-600">
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
            <Badge variant="outline">
              {method.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'reference_number',
        header: 'Reference',
        cell: ({ row }) => {
          const ref = row.getValue('reference_number') as string
          return ref || '-'
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
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-muted-foreground">
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
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New {activeTab === 'invoices' ? 'Invoice' : 'Payment'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">
              ${totalAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-sm text-muted-foreground">Receivable Balance</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">
              ${totalAP.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-sm text-muted-foreground">Payable Balance</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{invoicesData?.count ?? 0}</div>
            <div className="text-sm text-muted-foreground">Total Invoices</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{overdueCount}</div>
            <div className="text-sm text-muted-foreground">Overdue</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle>
            {tabs.find((t) => t.id === activeTab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  )
}
