import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreateParty, useCreateVendor } from '@/api/parties'
import { Button } from '@/components/ui/button'
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

const PAYMENT_TERMS = [
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'NET45', label: 'Net 45' },
  { value: 'NET60', label: 'Net 60' },
  { value: 'DUE_ON_RECEIPT', label: 'Due on Receipt' },
  { value: 'COD', label: 'Cash on Delivery' },
]

export default function CreateVendor() {
  usePageTitle('Create Vendor')
  const navigate = useNavigate()
  const createParty = useCreateParty()
  const createVendor = useCreateVendor()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    // Party fields
    code: '',
    display_name: '',
    legal_name: '',
    notes: '',
    // Vendor fields
    payment_terms: 'NET30',
    // GL field (optional — falls back to tenant default)
    payable_account: '',
  })

  const isPending = createParty.isPending || createVendor.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      // Step 1: Create the Party (auto-set type to VENDOR)
      const party = await createParty.mutateAsync({
        code: formData.code,
        display_name: formData.display_name,
        legal_name: formData.legal_name,
        party_type: 'VENDOR',
        is_active: true,
        notes: formData.notes,
      })

      // Step 2: Create the Vendor record linked to this Party
      await createVendor.mutateAsync({
        party: party.id,
        payment_terms: formData.payment_terms,
        ...(formData.payable_account ? { payable_account: Number(formData.payable_account) } : {}),
      })

      navigate('/vendors')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create vendor'))
      }
    }
  }

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Vendor</h1>
          <p className="text-sm text-muted-foreground">
            Add a new vendor/supplier to your system
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Company Info ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Company Information</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Vendor Code *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => update('code', e.target.value)}
                placeholder="e.g., ACME-SUP"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_terms">Payment Terms</Label>
              <Select
                value={formData.payment_terms}
                onValueChange={(v) => update('payment_terms', v)}
              >
                <SelectTrigger>
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

          <div className="space-y-2">
            <Label htmlFor="display_name">Display Name *</Label>
            <Input
              id="display_name"
              value={formData.display_name}
              onChange={(e) => update('display_name', e.target.value)}
              placeholder="Vendor name as it appears in lists"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="legal_name">Legal Name</Label>
            <Input
              id="legal_name"
              value={formData.legal_name}
              onChange={(e) => update('legal_name', e.target.value)}
              placeholder="Legal entity name (for payments/1099)"
            />
          </div>
        </section>

        {/* ── Financials ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Financials</h2>

          <div className="space-y-2">
            <Label htmlFor="payable_account">A/P Account</Label>
            <Input
              id="payable_account"
              type="number"
              value={formData.payable_account}
              onChange={(e) => update('payable_account', e.target.value)}
              placeholder="Leave blank to use tenant default"
            />
            <p className="text-xs text-muted-foreground">
              Accounts Payable account for this vendor. Uses the system default if left blank.
            </p>
          </div>
        </section>

        {/* ── Notes ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Notes</h2>
          <div className="space-y-2">
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Internal notes about this vendor..."
              rows={3}
            />
          </div>
        </section>

        {/* ── Error ── */}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Vendor'}
          </Button>
        </div>
      </form>
    </div>
  )
}
