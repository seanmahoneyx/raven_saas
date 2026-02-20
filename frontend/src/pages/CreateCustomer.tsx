import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreateParty, useCreateCustomer } from '@/api/parties'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

const PAYMENT_TERMS = [
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'NET45', label: 'Net 45' },
  { value: 'NET60', label: 'Net 60' },
  { value: 'DUE_ON_RECEIPT', label: 'Due on Receipt' },
  { value: 'COD', label: 'Cash on Delivery' },
]

export default function CreateCustomer() {
  usePageTitle('Create Customer')
  const navigate = useNavigate()
  const createParty = useCreateParty()
  const createCustomer = useCreateCustomer()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    // Party fields
    code: '',
    display_name: '',
    legal_name: '',
    notes: '',
    // Customer fields
    payment_terms: 'NET30',
    // GL field (optional — falls back to tenant default)
    receivable_account: '',
  })

  const isPending = createParty.isPending || createCustomer.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      // Step 1: Create the Party (auto-set type to CUSTOMER)
      const party = await createParty.mutateAsync({
        code: formData.code,
        display_name: formData.display_name,
        legal_name: formData.legal_name,
        party_type: 'CUSTOMER',
        is_active: true,
        notes: formData.notes,
      })

      // Step 2: Create the Customer record linked to this Party
      await createCustomer.mutateAsync({
        party: party.id,
        payment_terms: formData.payment_terms,
        ...(formData.receivable_account ? { receivable_account: Number(formData.receivable_account) } : {}),
      })

      navigate('/customers')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create customer'))
      }
    }
  }

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Customers
          </button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Create New Customer</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Add a new customer to your system</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Company Info ── */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Company Information</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="code" className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Customer Code *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => update('code', e.target.value)}
                    placeholder="e.g., ACME"
                    required
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payment_terms" className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Payment Terms</Label>
                  <Select
                    value={formData.payment_terms}
                    onValueChange={(v) => update('payment_terms', v)}
                  >
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="display_name" className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Display Name *</Label>
                <Input
                  id="display_name"
                  value={formData.display_name}
                  onChange={(e) => update('display_name', e.target.value)}
                  placeholder="Company name as it appears in lists"
                  required
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="legal_name" className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Legal Name</Label>
                <Input
                  id="legal_name"
                  value={formData.legal_name}
                  onChange={(e) => update('legal_name', e.target.value)}
                  placeholder="Legal entity name (for invoices)"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>
          </div>

          {/* ── Financials ── */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Financials</span>
            </div>
            <div className="px-6 py-5 space-y-1.5">
              <Label htmlFor="receivable_account" className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>A/R Account</Label>
              <Input
                id="receivable_account"
                type="number"
                value={formData.receivable_account}
                onChange={(e) => update('receivable_account', e.target.value)}
                placeholder="Leave blank to use tenant default"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
              <p className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                Accounts Receivable account for this customer. Uses the system default if left blank.
              </p>
            </div>
          </div>

          {/* ── Notes ── */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Notes</span>
            </div>
            <div className="px-6 py-5">
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Internal notes about this customer..."
                rows={3}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div
              className="text-sm rounded-md p-3"
              style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)', border: '1px solid var(--so-danger-text)' }}
            >
              {error}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${primaryBtnClass}${isPending ? ' opacity-50 pointer-events-none' : ''}`}
              style={primaryBtnStyle}
              disabled={isPending}
            >
              {isPending ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
