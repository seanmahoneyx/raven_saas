import { useState, useEffect } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Building2 } from 'lucide-react'
import { useSettings, useUpdateSettings } from '@/api/settings'
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

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function Settings() {
  usePageTitle('My Company')

  const { data: settings, isLoading } = useSettings()
  const updateSettings = useUpdateSettings()

  const [formData, setFormData] = useState({
    company_name: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    company_logo_url: '',
    fiscal_year_start_month: 1,
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        company_name: settings.company_name,
        company_address: settings.company_address,
        company_phone: settings.company_phone,
        company_email: settings.company_email,
        company_logo_url: settings.company_logo_url,
        fiscal_year_start_month: settings.fiscal_year_start_month,
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
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading settings...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="mb-7 animate-in">
          <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>My Company</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Manage your company information.</p>
        </div>

        {/* Company Information Card */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
              <span className="text-sm font-semibold">Company Information</span>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="company_name" style={{ color: 'var(--so-text-secondary)' }}>Company Name</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company_address" style={{ color: 'var(--so-text-secondary)' }}>Company Address</Label>
              <Textarea
                id="company_address"
                value={formData.company_address}
                onChange={(e) => setFormData({ ...formData, company_address: e.target.value })}
                rows={3}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="company_phone" style={{ color: 'var(--so-text-secondary)' }}>Company Phone</Label>
                <Input
                  id="company_phone"
                  value={formData.company_phone}
                  onChange={(e) => setFormData({ ...formData, company_phone: e.target.value })}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="company_email" style={{ color: 'var(--so-text-secondary)' }}>Company Email</Label>
                <Input
                  id="company_email"
                  type="email"
                  value={formData.company_email}
                  onChange={(e) => setFormData({ ...formData, company_email: e.target.value })}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company_logo_url" style={{ color: 'var(--so-text-secondary)' }}>Logo URL</Label>
              <Input
                id="company_logo_url"
                value={formData.company_logo_url}
                onChange={(e) => setFormData({ ...formData, company_logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fiscal_year_start_month" style={{ color: 'var(--so-text-secondary)' }}>Fiscal Year Start Month</Label>
              <Select
                value={formData.fiscal_year_start_month.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, fiscal_year_start_month: parseInt(value) })
                }
              >
                <SelectTrigger
                  id="fiscal_year_start_month"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                >
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

            <div className="pt-2">
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
