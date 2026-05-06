import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useQuery } from '@tanstack/react-query'
import { useCreateCheck } from '@/api/checks'
import { useOtherNames, type OtherName } from '@/api/otherNames'
import api from '@/api/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft } from 'lucide-react'
import { primaryBtnClass, primaryBtnStyle, outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/page'

type PayeeType = 'other_name' | 'manual'

interface BankAccount {
  id: number
  name: string
  account_type: string
}

export default function CreateCheck() {
  usePageTitle('Write Check')
  const navigate = useNavigate()
  const createCheck = useCreateCheck()

  const { data: otherNamesData } = useOtherNames()
  const { data: bankAccountsData } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts-asset'],
    queryFn: async () => {
      const { data: res } = await api.get('/accounts/', { params: { type: 'ASSET_CURRENT' } })
      return res.results ?? res
    },
  })

  const otherNames = otherNamesData ?? []
  const bankAccounts: BankAccount[] = bankAccountsData ?? []

  const [error, setError] = useState('')
  const [payeeType, setPayeeType] = useState<PayeeType>('other_name')
  const [otherNameId, setOtherNameId] = useState('')
  const [formData, setFormData] = useState({
    payee_name: '',
    payee_address: '',
    bank_account: '',
    check_date: new Date().toISOString().split('T')[0],
    amount: '',
    memo: '',
  })

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handlePayeeTypeChange = (type: PayeeType) => {
    setPayeeType(type)
    setOtherNameId('')
    setFormData((prev) => ({ ...prev, payee_name: '', payee_address: '' }))
  }

  const handleOtherNameSelect = (id: string) => {
    const found = otherNames.find((o: OtherName) => String(o.id) === id)
    setOtherNameId(id)
    setFormData((prev) => ({
      ...prev,
      payee_name: found ? (found.print_name || found.name) : '',
      payee_address: found ? found.full_address ?? '' : '',
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const payload: Record<string, unknown> = {
        check_date: formData.check_date,
        payee_name: formData.payee_name,
        payee_address: formData.payee_address,
        bank_account: formData.bank_account ? Number(formData.bank_account) : undefined,
        amount: formData.amount,
        memo: formData.memo,
      }
      if (payeeType === 'other_name' && otherNameId) {
        payload.other_name = Number(otherNameId)
      }

      await createCheck.mutateAsync(payload as Parameters<typeof createCheck.mutateAsync>[0])
      navigate('/checks')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to write check'))
      }
    }
  }

  const isPending = createCheck.isPending

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[720px] mx-auto px-4 md:px-8 py-7 pb-16">

        <PageHeader
          title="Write Check"
          description="Create a new check"
          breadcrumb={[{ label: 'Checks', to: '/checks' }, { label: 'New' }]}
        />

        <form id="create-check-form" onSubmit={handleSubmit} className="space-y-4">

          {/* Payee */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Payee</span>
            </div>
            <div className="px-6 py-5 space-y-4">

              {/* Payee Type toggle */}
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--so-text-secondary)' }}>Payee Type</Label>
                <div className="flex rounded-md overflow-hidden border" style={{ borderColor: 'var(--so-border)' }}>
                  {(['other_name', 'manual'] as PayeeType[]).map((type) => {
                    const label = type === 'other_name' ? 'Other Name' : 'Manual'
                    const active = payeeType === type
                    return (
                      <button
                        key={type}
                        type="button"
                        className="flex-1 px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
                        style={{
                          background: active ? 'var(--so-accent)' : 'var(--so-surface)',
                          color: active ? '#fff' : 'var(--so-text-secondary)',
                          borderRight: type !== 'manual' ? '1px solid var(--so-border)' : undefined,
                        }}
                        onClick={() => handlePayeeTypeChange(type)}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Other Name selector */}
              {payeeType === 'other_name' && (
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Select Other Name</Label>
                  <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-primary)' }}
                    value={otherNameId}
                    onChange={(e) => handleOtherNameSelect(e.target.value)}
                  >
                    <option value="">Select a payee...</option>
                    {otherNames.map((o: OtherName) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.print_name || o.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}


              {/* Manual: name + address */}
              {payeeType === 'manual' && (
                <>
                  <div className="space-y-1.5">
                    <Label style={{ color: 'var(--so-text-secondary)' }}>Payee Name</Label>
                    <Input
                      value={formData.payee_name}
                      onChange={(e) => update('payee_name', e.target.value)}
                      placeholder="Payee name"
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label style={{ color: 'var(--so-text-secondary)' }}>Payee Address</Label>
                    <Textarea
                      rows={3}
                      value={formData.payee_address}
                      onChange={(e) => update('payee_address', e.target.value)}
                      placeholder="Street address..."
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    />
                  </div>
                </>
              )}

              {/* Auto-filled address for other_name */}
              {payeeType === 'other_name' && formData.payee_address && (
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Address</Label>
                  <div
                    className="rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface-raised)', color: 'var(--so-text-secondary)' }}
                  >
                    {formData.payee_address}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Check Details */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Check Details</span>
            </div>
            <div className="px-6 py-5 space-y-4">

              {/* Bank Account */}
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--so-text-secondary)' }}>Bank Account</Label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-primary)' }}
                  value={formData.bank_account}
                  onChange={(e) => update('bank_account', e.target.value)}
                >
                  <option value="">Select bank account...</option>
                  {bankAccounts.map((acct) => (
                    <option key={acct.id} value={String(acct.id)}>
                      {acct.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Check Date */}
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Check Date</Label>
                  <Input
                    type="date"
                    value={formData.check_date}
                    onChange={(e) => update('check_date', e.target.value)}
                    required
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => update('amount', e.target.value)}
                    placeholder="0.00"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>

              {/* Memo */}
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--so-text-secondary)' }}>Memo</Label>
                <Input
                  value={formData.memo}
                  onChange={(e) => update('memo', e.target.value)}
                  placeholder="Memo (optional)"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="text-[13px] rounded-[10px] p-3"
              style={{ color: 'var(--so-danger-text)', background: 'var(--so-danger-bg)', border: '1px solid var(--so-danger-border, transparent)' }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid var(--so-border-light)' }}>
            <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/checks')}>
              Cancel
            </button>
            <button
              type="submit"
              className={`${primaryBtnClass}${isPending || !formData.payee_name.trim() || !formData.amount || !formData.check_date ? ' opacity-50 pointer-events-none' : ''}`}
              style={primaryBtnStyle}
              disabled={isPending || !formData.payee_name.trim() || !formData.amount || !formData.check_date}
            >
              {isPending ? 'Saving...' : 'Write Check'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
