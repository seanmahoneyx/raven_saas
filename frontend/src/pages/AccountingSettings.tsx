import { useState, useEffect } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Calculator } from 'lucide-react'
import { useSettings, useUpdateSettings, useAccounts } from '@/api/settings'
import { toast } from 'sonner'

const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function AccountingSettings() {
  usePageTitle('Accounting Settings')

  const { data: settings, isLoading } = useSettings()
  const { data: accounts } = useAccounts()
  const updateSettings = useUpdateSettings()

  const [formData, setFormData] = useState({
    default_income_account: null as number | null,
    default_cogs_account: null as number | null,
    default_inventory_account: null as number | null,
    default_ar_account: null as number | null,
    default_ap_account: null as number | null,
    default_cash_account: null as number | null,
    default_freight_income_account: null as number | null,
    default_freight_expense_account: null as number | null,
    default_sales_discount_account: null as number | null,
    default_purchase_discount_account: null as number | null,
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        default_income_account: settings.default_income_account,
        default_cogs_account: settings.default_cogs_account,
        default_inventory_account: settings.default_inventory_account,
        default_ar_account: settings.default_ar_account,
        default_ap_account: settings.default_ap_account,
        default_cash_account: settings.default_cash_account,
        default_freight_income_account: settings.default_freight_income_account,
        default_freight_expense_account: settings.default_freight_expense_account,
        default_sales_discount_account: settings.default_sales_discount_account,
        default_purchase_discount_account: settings.default_purchase_discount_account,
      })
    }
  }, [settings])

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync(formData)
      toast.success('Accounting settings saved')
    } catch (error) {
      toast.error('Failed to save accounting settings')
      console.error(error)
    }
  }

  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading accounting settings...</div>
        </div>
      </div>
    )
  }

  const accountSelect = (id: string, label: string, field: keyof typeof formData) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} style={{ color: 'var(--so-text-secondary)' }}>{label}</Label>
      <Select
        value={formData[field]?.toString() || ''}
        onValueChange={(value) =>
          setFormData({ ...formData, [field]: value ? parseInt(value) : null })
        }
      >
        <SelectTrigger
          id={id}
          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
        >
          <SelectValue placeholder="Select account..." />
        </SelectTrigger>
        <SelectContent>
          {accounts?.map((account) => (
            <SelectItem key={account.id} value={account.id.toString()}>
              {account.code} - {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="mb-7 animate-in">
          <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Accounting Settings</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Configure default GL account mappings for transactions.</p>
        </div>

        {/* Default GL Accounts Card */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
              <span className="text-sm font-semibold">Default GL Accounts</span>
            </div>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              These accounts are used as defaults when creating transactions.
            </p>
          </div>

          <div className="px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accountSelect('default_income_account', 'Income Account', 'default_income_account')}
              {accountSelect('default_cogs_account', 'COGS Account', 'default_cogs_account')}
              {accountSelect('default_inventory_account', 'Inventory Account', 'default_inventory_account')}
              {accountSelect('default_ar_account', 'A/R Account', 'default_ar_account')}
              {accountSelect('default_ap_account', 'A/P Account', 'default_ap_account')}
              {accountSelect('default_cash_account', 'Cash Account', 'default_cash_account')}
              {accountSelect('default_freight_income_account', 'Freight Income Account', 'default_freight_income_account')}
              {accountSelect('default_freight_expense_account', 'Freight Expense Account', 'default_freight_expense_account')}
              {accountSelect('default_sales_discount_account', 'Sales Discount Account', 'default_sales_discount_account')}
              {accountSelect('default_purchase_discount_account', 'Purchase Discount Account', 'default_purchase_discount_account')}
            </div>

            <div className="pt-5">
              <button
                className={primaryBtnClass + (updateSettings.isPending ? ' opacity-50 pointer-events-none' : '')}
                style={primaryBtnStyle}
                onClick={handleSave}
                disabled={updateSettings.isPending}
              >
                <Save className="h-3.5 w-3.5" />
                {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
