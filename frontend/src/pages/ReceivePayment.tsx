import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, DollarSign } from 'lucide-react'
import type { Customer } from '@/types/api'
import { toast } from 'sonner'

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

    // Sort by due_date ascending (FIFO)
    const sorted = [...openInvoices].sort((a, b) =>
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
    const amount = parseFloat(value) || 0

    if (amount > balance) {
      toast.error(`Applied amount cannot exceed invoice balance of $${balance.toFixed(2)}`)
      return
    }

    if (value === '' || amount === 0) {
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
      // Auto-fill with balance if no amount entered
      if (!applications[invoiceId]) {
        const invoice = openInvoices?.find((i: OpenInvoice) => i.id === invoiceId)
        if (invoice) {
          const balance = parseFloat(invoice.balance_due)
          const remaining = checkAmount - totalApplied
          const amount = Math.min(balance, remaining)
          if (amount > 0) {
            setApplications({ ...applications, [invoiceId]: amount.toFixed(2) })
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

    // Validate applications
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
      // First create the draft
      const payload = {
        customer: selectedCustomerId,
        payment_date: paymentDate,
        amount,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        notes,
      }

      const draft = await createDraft.mutateAsync(payload)

      // Then post it with applications
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
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/invoices')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Receive Payment</h1>
            <p className="text-muted-foreground">Record a customer payment and apply to invoices</p>
          </div>
        </div>
      </div>

      {/* Payment Info Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Payment Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="customer">Customer *</Label>
              <Select
                value={selectedCustomerId?.toString() || ''}
                onValueChange={(val) => {
                  setSelectedCustomerId(parseInt(val))
                  setApplications({})
                  setSelectedInvoices(new Set())
                }}
              >
                <SelectTrigger id="customer">
                  <SelectValue placeholder="Select customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer: Customer) => (
                    <SelectItem key={customer.id} value={customer.id.toString()}>
                      {customer.party_display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="payment_date">Payment Date *</Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="payment_method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment_method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHECK">Check</SelectItem>
                  <SelectItem value="ACH">ACH</SelectItem>
                  <SelectItem value="WIRE">Wire</SelectItem>
                  <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="reference_number">Reference # / Check #</Label>
              <Input
                id="reference_number"
                placeholder="Check number or reference"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="deposit_account">Deposit Account (optional)</Label>
              <Input
                id="deposit_account"
                placeholder="e.g., Cash - Operating"
                disabled
              />
            </div>
          </div>

          {/* Notes Section */}
          <div className="mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotes(!showNotes)}
              className="mb-2"
            >
              {showNotes ? 'Hide' : 'Add'} Notes
            </Button>
            {showNotes && (
              <Textarea
                placeholder="Payment notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoice Application Grid */}
      {selectedCustomerId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Apply to Invoices</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleAutoApply}>
                  Auto-Apply (FIFO)
                </Button>
                <Button variant="outline" size="sm" onClick={handleClearAll}>
                  Clear All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingInvoices ? (
              <p className="text-muted-foreground">Loading invoices...</p>
            ) : !openInvoices || openInvoices.length === 0 ? (
              <p className="text-muted-foreground">No open invoices for this customer</p>
            ) : (
              <>
                <div className="border rounded-md">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr className="border-b">
                        <th className="p-2 text-left w-12"></th>
                        <th className="p-2 text-left">Invoice #</th>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Due Date</th>
                        <th className="p-2 text-right">Total</th>
                        <th className="p-2 text-right">Paid</th>
                        <th className="p-2 text-right">Balance Due</th>
                        <th className="p-2 text-right w-28">Apply Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openInvoices.map((invoice: OpenInvoice) => {
                        const isSelected = selectedInvoices.has(invoice.id)
                        const appliedAmount = applications[invoice.id] || ''

                        return (
                          <tr key={invoice.id} className="border-b hover:bg-muted/30">
                            <td className="p-2">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => handleInvoiceSelect(invoice.id, checked as boolean)}
                              />
                            </td>
                            <td className="p-2 font-mono font-medium">{invoice.invoice_number}</td>
                            <td className="p-2">{new Date(invoice.invoice_date).toLocaleDateString()}</td>
                            <td className="p-2">{new Date(invoice.due_date).toLocaleDateString()}</td>
                            <td className="p-2 text-right">${parseFloat(invoice.total_amount).toFixed(2)}</td>
                            <td className="p-2 text-right">${parseFloat(invoice.amount_paid).toFixed(2)}</td>
                            <td className="p-2 text-right font-semibold text-red-600">
                              ${parseFloat(invoice.balance_due).toFixed(2)}
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={appliedAmount}
                                onChange={(e) => handleApplicationChange(invoice.id, e.target.value)}
                                className="w-28 text-right"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-muted/50 font-semibold">
                      <tr className="border-t-2">
                        <td colSpan={7} className="p-2 text-right">Total Applied:</td>
                        <td className="p-2 text-right">${totalApplied.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colSpan={7} className="p-2 text-right">
                          <span className={unappliedAmount > 0 ? 'text-amber-600' : ''}>
                            Unapplied Amount:
                          </span>
                        </td>
                        <td className={`p-2 text-right ${unappliedAmount > 0 ? 'text-amber-600' : ''}`}>
                          ${unappliedAmount.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {unappliedAmount > 0 && (
                  <p className="text-sm text-amber-600 mt-2">
                    Note: ${unappliedAmount.toFixed(2)} will remain as an unapplied credit for this customer
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mt-6">
        <Button
          variant="outline"
          onClick={handleSaveDraft}
          disabled={createDraft.isPending}
        >
          Save Draft
        </Button>
        <Button
          onClick={handlePostPayment}
          disabled={createDraft.isPending || postPayment.isPending}
        >
          Post Payment
        </Button>
        <Button variant="ghost" onClick={() => navigate('/invoices')}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
