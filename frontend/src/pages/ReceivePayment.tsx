import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import apiClient from '@/api/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, DollarSign } from 'lucide-react'
import type { Customer } from '@/types/api'
import { toast } from 'sonner'

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

interface OpenInvoice {
  id: number
  invoice_number: string
  invoice_date: string
  due_date: string
  total_amount: string
  amount_paid: string
  balance_due: string
}

interface PaymentApplication {
  invoice_id: number
  amount: string
}

const inputStyle: React.CSSProperties = { borderColor: 'var(--so-border)', background: 'var(--so-surface)' }
const labelStyle: React.CSSProperties = { color: 'var(--so-text-secondary)' }

export default function ReceivePayment() {
  usePageTitle('Receive Payment')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // State
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<string>('CHECK')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [applications, setApplications] = useState<Record<number, string>>({})
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(new Set())

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiClient.get('/customers/').then(r => r.data),
  })

  const customers = customersData?.results || []

  // Fetch open invoices when customer selected
  const { data: openInvoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['open-invoices', selectedCustomerId],
    queryFn: () => apiClient.get(`/customer-payments/open-invoices/?customer=${selectedCustomerId}`).then(r => r.data),
    enabled: !!selectedCustomerId,
  })

  // Create draft mutation
  const createDraft = useMutation({
    mutationFn: (data: any) => apiClient.post('/customer-payments/', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })

  // Post payment mutation
  const postPayment = useMutation({
    mutationFn: ({ id, applications }: { id: number; applications: PaymentApplication[] }) =>
      apiClient.post(`/customer-payments/${id}/post_payment/`, { applications }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['open-invoices'] })
    },
  })

  // Calculations
  const checkAmount = parseFloat(amount) || 0
  const totalApplied = useMemo(() => {
    return Object.values(applications).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)
  }, [applications])
  const unappliedAmount = checkAmount - totalApplied

  // Auto-Apply FIFO logic
  const handleAutoApply = () => {
    if (!openInvoices || checkAmount <= 0) return

    let remaining = checkAmount
    const newApplications: Record<number, string> = {}
    const newSelected = new Set<number>()

    const sorted = [...openInvoices].sort((a: OpenInvoice, b: OpenInvoice) =>
      new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    )

    for (const inv of sorted) {
      if (remaining <= 0) break
      const balance = parseFloat(inv.balance_due)
      const apply = Math.min(remaining, balance)
      if (apply > 0) {
        newApplications[inv.id] = apply.toFixed(2)
        newSelected.add(inv.id)
        remaining -= apply
      }
    }

    setApplications(newApplications)
    setSelectedInvoices(newSelected)
  }

  const handleClearAll = () => {
    setApplications({})
    setSelectedInvoices(new Set())
  }

  const handleApplicationChange = (invoiceId: number, value: string) => {
    const newApplications = { ...applications }
    const balance = parseFloat(openInvoices?.find((i: OpenInvoice) => i.id === invoiceId)?.balance_due || '0')
    const amt = parseFloat(value) || 0

    if (amt > balance) {
      toast.error(`Applied amount cannot exceed invoice balance of $${balance.toFixed(2)}`)
      return
    }

    if (value === '' || amt === 0) {
      delete newApplications[invoiceId]
      const newSelected = new Set(selectedInvoices)
      newSelected.delete(invoiceId)
      setSelectedInvoices(newSelected)
    } else {
      newApplications[invoiceId] = value
    }

    setApplications(newApplications)
  }

  const handleInvoiceSelect = (invoiceId: number, checked: boolean) => {
    const newSelected = new Set(selectedInvoices)

    if (checked) {
      newSelected.add(invoiceId)
      if (!applications[invoiceId]) {
        const invoice = openInvoices?.find((i: OpenInvoice) => i.id === invoiceId)
        if (invoice) {
          const balance = parseFloat(invoice.balance_due)
          const remaining = checkAmount - totalApplied
          const amt = Math.min(balance, remaining)
          if (amt > 0) {
            setApplications({ ...applications, [invoiceId]: amt.toFixed(2) })
          }
        }
      }
    } else {
      newSelected.delete(invoiceId)
      const newApplications = { ...applications }
      delete newApplications[invoiceId]
      setApplications(newApplications)
    }

    setSelectedInvoices(newSelected)
  }

  const handleSaveDraft = async () => {
    if (!selectedCustomerId) {
      toast.error('Please select a customer')
      return
    }
    if (!amount || checkAmount <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }

    try {
      const payload = {
        customer: selectedCustomerId,
        payment_date: paymentDate,
        amount,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        notes,
      }

      await createDraft.mutateAsync(payload)
      toast.success('Payment draft saved successfully')
      navigate('/invoices')
    } catch (error: any) {
      toast.error(`Error saving draft: ${error.response?.data?.detail || error.message}`)
    }
  }

  const handlePostPayment = async () => {
    if (!selectedCustomerId) {
      toast.error('Please select a customer')
      return
    }
    if (!amount || checkAmount <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }

    const applicationsList = Object.entries(applications)
      .filter(([_, amt]) => parseFloat(amt) > 0)
      .map(([invoiceId, amt]) => ({
        invoice_id: parseInt(invoiceId),
        amount: amt,
      }))

    if (applicationsList.length === 0) {
      toast.error('Please apply the payment to at least one invoice')
      return
    }

    if (totalApplied > checkAmount) {
      toast.error('Total applied amount cannot exceed payment amount')
      return
    }

    try {
      const payload = {
        customer: selectedCustomerId,
        payment_date: paymentDate,
        amount,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        notes,
      }

      const draft = await createDraft.mutateAsync(payload)

      await postPayment.mutateAsync({
        id: draft.id,
        applications: applicationsList,
      })

      toast.success('Payment posted successfully')
      navigate('/invoices')
    } catch (error: any) {
      toast.error(`Error posting payment: ${error.response?.data?.detail || error.message}`)
    }
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center gap-4 mb-7 animate-in">
          <button className={outlineBtnClass + ' !px-2'} style={outlineBtnStyle} onClick={() => navigate('/invoices')}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Receive Payment</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Record a customer payment and apply to invoices</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Payment Info Section */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <DollarSign className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
              <span className="text-sm font-semibold">Payment Information</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Customer *</Label>
                  <Select
                    value={selectedCustomerId?.toString() || ''}
                    onValueChange={(val) => {
                      setSelectedCustomerId(parseInt(val))
                      setApplications({})
                      setSelectedInvoices(new Set())
                    }}
                  >
                    <SelectTrigger style={inputStyle}><SelectValue placeholder="Select customer..." /></SelectTrigger>
                    <SelectContent>
                      {customers.map((customer: Customer) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.party_display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Payment Date *</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={inputStyle} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Amount *</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" style={inputStyle} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CHECK">Check</SelectItem>
                      <SelectItem value="ACH">ACH</SelectItem>
                      <SelectItem value="WIRE">Wire</SelectItem>
                      <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                      <SelectItem value="CASH">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Reference # / Check #</Label>
                  <Input placeholder="Check number or reference" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} style={inputStyle} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Deposit Account (optional)</Label>
                  <Input placeholder="e.g., Cash - Operating" disabled style={{ ...inputStyle, opacity: 0.5 }} />
                </div>
              </div>

              {/* Notes Section */}
              <div className="mt-4">
                <button
                  className="text-[13px] font-medium cursor-pointer mb-2"
                  style={{ color: 'var(--so-accent)' }}
                  onClick={() => setShowNotes(!showNotes)}
                >
                  {showNotes ? 'Hide' : 'Add'} Notes
                </button>
                {showNotes && (
                  <Textarea placeholder="Payment notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={inputStyle} />
                )}
              </div>
            </div>
          </div>

          {/* Invoice Application Grid */}
          {selectedCustomerId && (
            <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Apply to Invoices</span>
                <div className="flex gap-2">
                  <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleAutoApply}>
                    Auto-Apply (FIFO)
                  </button>
                  <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleClearAll}>
                    Clear All
                  </button>
                </div>
              </div>
              <div className="px-6 py-5">
                {loadingInvoices ? (
                  <p className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>Loading invoices...</p>
                ) : !openInvoices || openInvoices.length === 0 ? (
                  <p className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>No open invoices for this customer</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                            <th className="p-2 text-left w-12" style={{ background: 'var(--so-bg)' }}></th>
                            <th className="p-2 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Invoice #</th>
                            <th className="p-2 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Date</th>
                            <th className="p-2 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Due Date</th>
                            <th className="p-2 text-right text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Total</th>
                            <th className="p-2 text-right text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Paid</th>
                            <th className="p-2 text-right text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Balance Due</th>
                            <th className="p-2 text-right text-[11px] font-semibold uppercase tracking-widest w-28" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Apply Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {openInvoices.map((invoice: OpenInvoice) => {
                            const isSelected = selectedInvoices.has(invoice.id)
                            const appliedAmount = applications[invoice.id] || ''

                            return (
                              <tr key={invoice.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                                <td className="p-2">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) => handleInvoiceSelect(invoice.id, checked as boolean)}
                                  />
                                </td>
                                <td className="p-2 font-mono font-medium">{invoice.invoice_number}</td>
                                <td className="p-2" style={{ color: 'var(--so-text-secondary)' }}>{new Date(invoice.invoice_date).toLocaleDateString()}</td>
                                <td className="p-2" style={{ color: 'var(--so-text-secondary)' }}>{new Date(invoice.due_date).toLocaleDateString()}</td>
                                <td className="p-2 text-right font-mono">${parseFloat(invoice.total_amount).toFixed(2)}</td>
                                <td className="p-2 text-right font-mono">${parseFloat(invoice.amount_paid).toFixed(2)}</td>
                                <td className="p-2 text-right font-mono font-semibold" style={{ color: 'var(--so-danger-text)' }}>
                                  ${parseFloat(invoice.balance_due).toFixed(2)}
                                </td>
                                <td className="p-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={appliedAmount}
                                    onChange={(e) => handleApplicationChange(invoice.id, e.target.value)}
                                    className="w-28 text-right font-mono"
                                    style={inputStyle}
                                  />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: '2px solid var(--so-border)' }}>
                            <td colSpan={7} className="p-2 text-right text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>Total Applied:</td>
                            <td className="p-2 text-right font-mono text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>${totalApplied.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <td colSpan={7} className="p-2 text-right text-sm font-semibold" style={{ color: unappliedAmount > 0 ? 'var(--so-warning-text)' : 'var(--so-text-primary)' }}>
                              Unapplied Amount:
                            </td>
                            <td className="p-2 text-right font-mono text-sm font-semibold" style={{ color: unappliedAmount > 0 ? 'var(--so-warning-text)' : 'var(--so-text-primary)' }}>
                              ${unappliedAmount.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {unappliedAmount > 0 && (
                      <p className="text-[12px] mt-2" style={{ color: 'var(--so-warning-text)' }}>
                        Note: ${unappliedAmount.toFixed(2)} will remain as an unapplied credit for this customer
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2" style={{ borderTop: '1px solid var(--so-border-light)' }}>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleSaveDraft} disabled={createDraft.isPending}>
              Save Draft
            </button>
            <button
              className={`${primaryBtnClass} ${createDraft.isPending || postPayment.isPending ? 'opacity-50 pointer-events-none' : ''}`}
              style={primaryBtnStyle}
              onClick={handlePostPayment}
              disabled={createDraft.isPending || postPayment.isPending}
            >
              Post Payment
            </button>
            <button className={outlineBtnClass} style={{ ...outlineBtnStyle, border: 'none' }} onClick={() => navigate('/invoices')}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
