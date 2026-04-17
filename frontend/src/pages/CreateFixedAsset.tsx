import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useCreateFixedAsset } from '@/api/assets'
import { useAssetCategories } from '@/api/assets'
import { DEPRECIATION_METHODS } from '@/constants/assets'
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
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'


export default function CreateFixedAsset() {
  usePageTitle('Create Fixed Asset')
  const navigate = useNavigate()
  const createAsset = useCreateFixedAsset()
  const isMobile = useIsMobile()

  const { data: categoriesData } = useAssetCategories()
  const categories = categoriesData?.results ?? []

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    asset_number: '',
    description: '',
    category: '',
    serial_number: '',
    location: '',
    acquisition_date: new Date().toISOString().split('T')[0],
    acquisition_cost: '',
    vendor: '',
    depreciation_method: 'straight_line',
    useful_life_months: '60',
    salvage_value: '0.00',
    depreciation_start_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  const isPending = createAsset.isPending

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  // Auto-fill from category defaults
  useEffect(() => {
    if (!formData.category) return
    const cat = categories.find(c => String(c.id) === formData.category)
    if (!cat) return

    setFormData(prev => {
      const cost = parseFloat(prev.acquisition_cost) || 0
      const salvageRate = parseFloat(cat.default_salvage_rate) || 0
      const salvage = cost > 0 ? (cost * salvageRate / 100).toFixed(2) : '0.00'
      return {
        ...prev,
        depreciation_method: cat.default_depreciation_method,
        useful_life_months: String(cat.default_useful_life_months),
        salvage_value: salvage,
      }
    })
  }, [formData.category, categories])

  // Recalculate salvage when cost changes and category is set
  useEffect(() => {
    if (!formData.category) return
    const cat = categories.find(c => String(c.id) === formData.category)
    if (!cat) return

    const cost = parseFloat(formData.acquisition_cost) || 0
    const salvageRate = parseFloat(cat.default_salvage_rate) || 0
    const salvage = cost > 0 ? (cost * salvageRate / 100).toFixed(2) : '0.00'
    setFormData(prev => ({ ...prev, salvage_value: salvage }))
  }, [formData.acquisition_cost]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync depreciation start date with acquisition date
  useEffect(() => {
    setFormData(prev => ({ ...prev, depreciation_start_date: prev.acquisition_date }))
  }, [formData.acquisition_date])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const result = await createAsset.mutateAsync({
        asset_number: formData.asset_number || undefined,
        description: formData.description,
        category: Number(formData.category),
        serial_number: formData.serial_number,
        location: formData.location,
        acquisition_date: formData.acquisition_date,
        acquisition_cost: formData.acquisition_cost,
        vendor: formData.vendor ? Number(formData.vendor) : null,
        depreciation_method: formData.depreciation_method,
        useful_life_months: Number(formData.useful_life_months),
        salvage_value: formData.salvage_value,
        depreciation_start_date: formData.depreciation_start_date,
        notes: formData.notes,
      } as any)

      navigate(`/fixed-assets/${result.id}`)
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create asset'))
      }
    }
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className={`max-w-[1080px] mx-auto px-8 py-7 ${isMobile ? 'pb-32 px-4' : 'pb-16'}`}>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/fixed-assets')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Fixed Assets
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>New</span>
        </div>

        {/* Header */}
        <div className="mb-7 animate-in delay-1">
          <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Create New Fixed Asset</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
            Register a new fixed asset in the asset register
          </p>
        </div>

        <form id="create-asset-form" onSubmit={handleSubmit} className="space-y-4">

          {/* Asset Info */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Asset Information</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Asset Number</Label>
                  <Input
                    value={formData.asset_number}
                    onChange={(e) => update('asset_number', e.target.value)}
                    placeholder="Auto-generated"
                    className="font-mono"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Description *</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => update('description', e.target.value)}
                    placeholder="Asset description"
                    required
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Category *</Label>
                  <Select value={formData.category} onValueChange={(v) => update('category', v)}>
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue placeholder="Select category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          {cat.code} - {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Serial Number</Label>
                  <Input
                    value={formData.serial_number}
                    onChange={(e) => update('serial_number', e.target.value)}
                    placeholder="Optional"
                    className="font-mono"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Location</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => update('location', e.target.value)}
                    placeholder="e.g. Warehouse A"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Acquisition */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Acquisition</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Acquisition Date *</Label>
                  <Input
                    type="date"
                    value={formData.acquisition_date}
                    onChange={(e) => update('acquisition_date', e.target.value)}
                    required
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Acquisition Cost *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.acquisition_cost}
                    onChange={(e) => update('acquisition_cost', e.target.value)}
                    placeholder="0.00"
                    className="font-mono"
                    required
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Vendor</Label>
                  <SearchableCombobox
                    entityType="vendor"
                    value={formData.vendor ? Number(formData.vendor) : null}
                    onChange={(id) => setFormData(prev => ({ ...prev, vendor: id ? String(id) : '' }))}
                    placeholder="Select vendor..."
                    allowClear
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Depreciation */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Depreciation</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Method</Label>
                  <Select value={formData.depreciation_method} onValueChange={(v) => update('depreciation_method', v)}>
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPRECIATION_METHODS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Useful Life (months)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.useful_life_months}
                    onChange={(e) => update('useful_life_months', e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Salvage Value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.salvage_value}
                    onChange={(e) => update('salvage_value', e.target.value)}
                    className="font-mono"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Start Date</Label>
                  <Input
                    type="date"
                    value={formData.depreciation_start_date}
                    onChange={(e) => update('depreciation_start_date', e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Notes</span>
            </div>
            <div className="px-6 py-5">
              <Textarea
                value={formData.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Additional notes about this asset..."
                rows={3}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
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
          {!isMobile && (
            <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid var(--so-border-light)' }}>
              <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/fixed-assets')}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${primaryBtnClass}${isPending || !formData.description || !formData.category || !formData.acquisition_cost ? ' opacity-50 pointer-events-none' : ''}`}
                style={primaryBtnStyle}
                disabled={isPending || !formData.description || !formData.category || !formData.acquisition_cost}
              >
                {isPending ? 'Creating...' : 'Create Asset'}
              </button>
            </div>
          )}

        </form>
      </div>

      {/* Mobile sticky bottom bar */}
      {isMobile && (
        <div
          className="fixed bottom-16 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 shadow-lg"
          style={{ background: 'var(--so-surface)', borderTop: '1px solid var(--so-border)' }}
        >
          <button
            type="button"
            className={outlineBtnClass}
            style={{ ...outlineBtnStyle, minHeight: 44 }}
            onClick={() => navigate('/fixed-assets')}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-asset-form"
            className={`${primaryBtnClass} flex-1${isPending || !formData.description || !formData.category || !formData.acquisition_cost ? ' opacity-50 pointer-events-none' : ''}`}
            style={{ ...primaryBtnStyle, minHeight: 44 }}
            disabled={isPending || !formData.description || !formData.category || !formData.acquisition_cost}
          >
            {isPending ? 'Creating...' : 'Create Asset'}
          </button>
        </div>
      )}
    </div>
  )
}
