import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, FileDown, Mail, Send, Ban, DollarSign, Calendar,
  Hash, MapPin, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { toast } from 'sonner'
import api from '@/api/client'
import EmailModal from '@/components/common/EmailModal'
import { FieldHistoryTab } from '@/components/common/FieldHistoryTab'

interface InvoiceLine {
  id: number
  line_number: number
  item: number
  item_sku: string
  description: string
  quantity: string
  uom: number
  uom_code: string
  unit_price: string
  discount_percent: string
  line_total: string
}

interface InvoicePayment {
  id: number
  payment_date: string
  amount: string
  payment_method: string
  reference_number: string
  recorded_by_name: string
}

interface InvoiceDetail {
  id: number
  invoice_number: string
  customer: number
  customer_name: string
  sales_order: number | null
  shipment: number | null
  invoice_date: string
  due_date: string
  payment_terms: string
  status: string
  bill_to_name: string
  bill_to_address: string
  ship_to_name: string
  ship_to_address: string
  subtotal: string
  tax_rate: string
  tax_amount: string
  freight_amount: string
  discount_amount: string
  total_amount: string
  amount_paid: string
  balance_due: string
  is_paid: boolean
  is_overdue: boolean
  customer_po: string
  notes: string
  customer_notes: string
  lines: InvoiceLine[]
  payments: InvoicePayment[]
  created_at: string
  updated_at: string
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  sent: 'outline',
  partial: 'warning',
  paid: 'success',
  overdue: 'destructive',
  void: 'secondary',
}

type TabType = 'lines' | 'payments' | 'audit'

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const invoiceId = parseInt(id || '0', 10)

  const [activeTab, setActiveTab] = useState<TabType>('lines')
  const [emailModalOpen, setEmailModalOpen] = useState(false)

  const { data: invoice, isLoading, refetch } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: async () => {
      const { data } = await api.get<InvoiceDetail>(`/invoices/${invoiceId}/`)
      return data
    },
    enabled: !!invoiceId,
  })

  usePageTitle(invoice ? `Invoice ${invoice.invoice_number}` : 'Invoice')

  const handleSend = async () => {
    if (!invoice || invoice.status !== 'draft') return
    try {
      await api.post(`/invoices/${invoiceId}/send/`)
      toast.success('Invoice marked as sent')
      refetch()
    } catch {
      toast.error('Failed to send invoice')
    }
  }

  const handleVoid = async () => {
    if (!invoice) return
    if (!confirm('Are you sure you want to void this invoice?')) return
    try {
      await api.post(`/invoices/${invoiceId}/void/`)
      toast.success('Invoice voided')
      refetch()
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to void invoice')
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading invoice...</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Invoice not found.</p>
      </div>
    )
  }

  const tabs = [
    { id: 'lines' as TabType, label: 'Lines', icon: Hash },
    { id: 'payments' as TabType, label: 'Payments', icon: DollarSign },
    { id: 'audit' as TabType, label: 'Audit History', icon: FileText },
  ]

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/invoices')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Invoice {invoice.invoice_number}</h1>
              <Badge variant={statusVariant[invoice.status] || 'outline'}>
                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
              </Badge>
              {invoice.is_overdue && <Badge variant="destructive">Overdue</Badge>}
            </div>
            <p className="text-muted-foreground mt-1">{invoice.customer_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => window.open(`/api/v1/invoices/${invoiceId}/pdf/`, '_blank')}
          >
            <FileDown className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button variant="outline" onClick={() => setEmailModalOpen(true)}>
            <Mail className="h-4 w-4 mr-2" />
            Email
          </Button>
          {invoice.status === 'draft' && (
            <Button onClick={handleSend}>
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          )}
          {invoice.status !== 'void' && invoice.status !== 'paid' && (
            <Button variant="destructive" onClick={handleVoid}>
              <Ban className="h-4 w-4 mr-2" />
              Void
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Total
            </div>
            <div className="text-2xl font-bold">
              ${parseFloat(invoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Paid
            </div>
            <div className="text-2xl font-bold text-green-600">
              ${parseFloat(invoice.amount_paid).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Balance Due
            </div>
            <div className={`text-2xl font-bold ${parseFloat(invoice.balance_due) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              ${parseFloat(invoice.balance_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              Due Date
            </div>
            <div className="text-2xl font-bold">
              {format(new Date(invoice.due_date), 'MMM d, yyyy')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice Date</span>
              <span>{format(new Date(invoice.invoice_date), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Terms</span>
              <span>{invoice.payment_terms}</span>
            </div>
            {invoice.customer_po && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer PO</span>
                <span>{invoice.customer_po}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${parseFloat(invoice.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            {parseFloat(invoice.tax_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({(parseFloat(invoice.tax_rate) * 100).toFixed(1)}%)</span>
                <span>${parseFloat(invoice.tax_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {parseFloat(invoice.freight_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Freight</span>
                <span>${parseFloat(invoice.freight_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {parseFloat(invoice.discount_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-green-600">-${parseFloat(invoice.discount_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Addresses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Bill To
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {invoice.bill_to_name}{invoice.bill_to_address ? `\n${invoice.bill_to_address}` : ''}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Ship To
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {invoice.ship_to_name}{invoice.ship_to_address ? `\n${invoice.ship_to_address}` : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {(invoice.notes || invoice.customer_notes) && (
        <Card>
          <CardContent className="pt-4">
            {invoice.notes && (
              <div className="mb-2">
                <span className="text-sm font-medium">Internal Notes: </span>
                <span className="text-sm text-muted-foreground">{invoice.notes}</span>
              </div>
            )}
            {invoice.customer_notes && (
              <div>
                <span className="text-sm font-medium">Customer Notes: </span>
                <span className="text-sm text-muted-foreground">{invoice.customer_notes}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
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

      {/* Lines Tab */}
      {activeTab === 'lines' && (
        <Card>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4">#</th>
                    <th className="pb-2 pr-4">SKU</th>
                    <th className="pb-2 pr-4">Description</th>
                    <th className="pb-2 pr-4 text-right">Qty</th>
                    <th className="pb-2 pr-4">UOM</th>
                    <th className="pb-2 pr-4 text-right">Unit Price</th>
                    <th className="pb-2 pr-4 text-right">Disc %</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">{line.line_number}</td>
                      <td className="py-2 pr-4 font-mono">{line.item_sku}</td>
                      <td className="py-2 pr-4">{line.description}</td>
                      <td className="py-2 pr-4 text-right">{parseFloat(line.quantity).toLocaleString()}</td>
                      <td className="py-2 pr-4">{line.uom_code}</td>
                      <td className="py-2 pr-4 text-right">${parseFloat(line.unit_price).toFixed(2)}</td>
                      <td className="py-2 pr-4 text-right">
                        {parseFloat(line.discount_percent) > 0 ? `${line.discount_percent}%` : '-'}
                      </td>
                      <td className="py-2 text-right font-medium">
                        ${parseFloat(line.line_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {invoice.lines.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        No lines on this invoice.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <Card>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4 text-right">Amount</th>
                    <th className="pb-2 pr-4">Method</th>
                    <th className="pb-2 pr-4">Reference</th>
                    <th className="pb-2">Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((pmt) => (
                    <tr key={pmt.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{format(new Date(pmt.payment_date), 'MMM d, yyyy')}</td>
                      <td className="py-2 pr-4 text-right font-medium text-green-600">
                        ${parseFloat(pmt.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline">
                          {pmt.payment_method.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">{pmt.reference_number || '-'}</td>
                      <td className="py-2">{pmt.recorded_by_name || '-'}</td>
                    </tr>
                  ))}
                  {invoice.payments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        No payments recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit History Tab */}
      {activeTab === 'audit' && (
        <FieldHistoryTab modelType="invoice" objectId={invoiceId} />
      )}

      {/* Email Modal */}
      <EmailModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        endpoint={`/invoices/${invoiceId}/email/`}
        defaultSubject={`Invoice ${invoice.invoice_number}`}
        defaultBody={`Dear ${invoice.customer_name},\n\nPlease find attached Invoice ${invoice.invoice_number} for $${parseFloat(invoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}.\n\nPayment is due by ${format(new Date(invoice.due_date), 'MMMM d, yyyy')}.\n\nThank you for your business.`}
      />
    </div>
  )
}
