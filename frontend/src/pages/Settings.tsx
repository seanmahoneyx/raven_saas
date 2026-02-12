import { useState, useEffect } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Building2, Calculator } from 'lucide-react'
import { useSettings, useUpdateSettings, useAccounts } from '@/api/settings'
import { toast } from 'sonner'

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

type TabType = 'company' | 'accounting'

export default function Settings() {
  usePageTitle('Settings')

  const [activeTab, setActiveTab] = useState<TabType>('company')
  const { data: settings, isLoading } = useSettings()
  const { data: accounts } = useAccounts()
  const updateSettings = useUpdateSettings()

  const [formData, setFormData] = useState({
    company_name: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    company_logo_url: '',
    fiscal_year_start_month: 1,
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

  // Initialize form data when settings load
  useEffect(() => {
    if (settings) {
      setFormData({
        company_name: settings.company_name,
        company_address: settings.company_address,
        company_phone: settings.company_phone,
        company_email: settings.company_email,
        company_logo_url: settings.company_logo_url,
        fiscal_year_start_month: settings.fiscal_year_start_month,
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
      toast.success('Settings saved')
    } catch (error) {
      toast.error('Failed to save settings')
      console.error(error)
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage company and accounting configuration</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('company')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'company'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Company
          </div>
        </button>
        <button
          onClick={() => setActiveTab('accounting')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'accounting'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Accounting
          </div>
        </button>
      </div>

      {/* Company Tab */}
      {activeTab === 'company' && (
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_address">Company Address</Label>
              <Textarea
                id="company_address"
                value={formData.company_address}
                onChange={(e) => setFormData({ ...formData, company_address: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company_phone">Company Phone</Label>
                <Input
                  id="company_phone"
                  value={formData.company_phone}
                  onChange={(e) => setFormData({ ...formData, company_phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_email">Company Email</Label>
                <Input
                  id="company_email"
                  type="email"
                  value={formData.company_email}
                  onChange={(e) => setFormData({ ...formData, company_email: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_logo_url">Logo URL</Label>
              <Input
                id="company_logo_url"
                value={formData.company_logo_url}
                onChange={(e) => setFormData({ ...formData, company_logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fiscal_year_start_month">Fiscal Year Start Month</Label>
              <Select
                value={formData.fiscal_year_start_month.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, fiscal_year_start_month: parseInt(value) })
                }
              >
                <SelectTrigger id="fiscal_year_start_month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem key={month.value} value={month.value.toString()}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4">
              <Button onClick={handleSave} disabled={updateSettings.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounting Tab */}
      {activeTab === 'accounting' && (
        <Card>
          <CardHeader>
            <CardTitle>Default GL Accounts</CardTitle>
            <p className="text-sm text-muted-foreground">
              These accounts are used as defaults when creating transactions.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Income Account */}
              <div className="space-y-2">
                <Label htmlFor="default_income_account">Income Account</Label>
                <Select
                  value={formData.default_income_account?.toString() || ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      default_income_account: value ? parseInt(value) : null,
                    })
                  }
                >
                  <SelectTrigger id="default_income_account">
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

              {/* COGS Account */}
              <div className="space-y-2">
                <Label htmlFor="default_cogs_account">COGS Account</Label>
                <Select
                  value={formData.default_cogs_account?.toString() || ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      default_cogs_account: value ? parseInt(value) : null,
                    })
                  }
                >
                  <SelectTrigger id="default_cogs_account">
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

              {/* Inventory Account */}
              <div className="space-y-2">
                <Label htmlFor="default_inventory_account">Inventory Account</Label>
                <Select
                  value={formData.default_inventory_account?.toString() || ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      default_inventory_account: value ? parseInt(value) : null,
                    })
                  }
                >
                  <SelectTrigger id="default_inventory_account">
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

              {/* A/R Account */}
              <div className="space-y-2">
                <Label htmlFor="default_ar_account">A/R Account</Label>
                <Select
                  value={formData.default_ar_account?.toString() || ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      default_ar_account: value ? parseInt(value) : null,
                    })
                  }
                >
                  <SelectTrigger id="default_ar_account">
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

              {/* A/P Account */}
              <div className="space-y-2">
                <Label htmlFor="default_ap_account">A/P Account</Label>
                <Select
                  value={formData.default_ap_account?.toString() || ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      default_ap_account: value ? parseInt(value) : null,
                    })
                  }
                >
                  <SelectTrigger id="default_ap_account">
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

              {/* Cash Account */}
              <div className="space-y-2">
                <Label htmlFor="default_cash_account">Cash Account</Label>
                <Select
                  value={formData.default_cash_account?.toString() || ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      default_cash_account: value ? parseInt(value) : null,
                    })
                  }
                >
                  <SelectTrigger id="default_cash_account">
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

              {/* Freight Income Account */}
              <div className="space-y-2">
                <Label htmlFor="default_freight_income_account">Freight Income Account</Label>
                <Select
                  value={formData.default_freight_income_account?.toString() || ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      default_freight_income_account: value ? parseInt(value) : null,
                    })
                  }
                >
                  <SelectTrigger id="default_freight_income_account">
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

              {/* Freight Expense Account */}
              <div className="space-y-2">
                <Label htmlFor="default_freight_expense_account">Freight Expense Account</Label>
                <Select
                  value={formData.default_freight_expense_account?.toString() || ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      default_freight_expense_account: value ? parseInt(value) : null,
                    })
                  }
                >
                  <SelectTrigger id="default_freight_expense_account">
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

              {/* Sales Discount Account */}
              <div className="space-y-2">
                <Label htmlFor="default_sales_discount_account">Sales Discount Account</Label>
                <Select
                  value={formData.default_sales_discount_account?.toString() || ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      default_sales_discount_account: value ? parseInt(value) : null,
                    })
                  }
                >
                  <SelectTrigger id="default_sales_discount_account">
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

              {/* Purchase Discount Account */}
              <div className="space-y-2">
                <Label htmlFor="default_purchase_discount_account">Purchase Discount Account</Label>
                <Select
                  value={formData.default_purchase_discount_account?.toString() || ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      default_purchase_discount_account: value ? parseInt(value) : null,
                    })
                  }
                >
                  <SelectTrigger id="default_purchase_discount_account">
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
            </div>

            <div className="pt-4">
              <Button onClick={handleSave} disabled={updateSettings.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
