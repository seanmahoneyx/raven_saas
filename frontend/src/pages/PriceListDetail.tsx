import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Pencil, Save, X, Printer, DollarSign,
  Plus, Trash2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePriceList, useUpdatePriceList } from '@/api/priceLists'
import { useCustomers } from '@/api/parties'
import { useItems } from '@/api/items'
import { FieldHistoryTab } from '@/components/common/FieldHistoryTab'
import { format } from 'date-fns'

interface LineForm {
  id?: number
  min_quantity: string
  unit_price: string
}

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    active:   { bg: 'var(--so-success-bg)', border: 'transparent', text: 'var(--so-success-text)' },
    inactive: { bg: 'var(--so-danger-bg)',  border: 'transparent', text: 'var(--so-danger-text)' },
  }
  const c = configs[status] || configs.active
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }
const dangerBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const dangerBtnStyle: React.CSSProperties = { border: '1px solid var(--so-danger-text)', background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }

export default function PriceListDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const priceListId = parseInt(id || '0', 10)

  const { data: priceList, isLoading } = usePriceList(priceListId)
  const updatePriceList = useUpdatePriceList()
  const { data: customersData } = useCustomers()
  const { data: itemsData } = useItems()

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    customer: '',
    item: '',
    begin_date: '',
    end_date: '',
    is_active: true,
    notes: '',
  })
  const [lines, setLines] = useState<LineForm[]>([])

  usePageTitle(priceList ? `Price List - ${priceList.customer_name} / ${priceList.item_sku}` : 'Price List')

  useEffect(() => {
    if (isEditing && priceList) {
      setFormData({
        customer: String(priceList.customer),
        item: String(priceList.item),
        begin_date: priceList.begin_date,
        end_date: priceList.end_date ?? '',
        is_active: priceList.is_active,
        notes: priceList.notes || '',
      })
      setLines(
        (priceList.lines ?? []).map((line) => ({
          id: line.id,
          min_quantity: String(line.min_quantity),
          unit_price: line.unit_price,
        }))
      )
    }
  }, [isEditing, priceList])

  const customers = customersData?.results ?? []
  const items = itemsData?.results ?? []

  const handleAddLine = () => {
    setLines([...lines, { min_quantity: '1', unit_price: '0.00' }])
  }

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: keyof LineForm, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }
    setLines(newLines)
  }

  const handleSave = async () => {
    if (!priceList) return
    const payload = {
      id: priceList.id,
      customer: Number(formData.customer),
      item: Number(formData.item),
      begin_date: formData.begin_date,
      end_date: formData.end_date || null,
      is_active: formData.is_active,
      notes: formData.notes,
      lines: lines.map((line) => ({
        min_quantity: Number(line.min_quantity),
        unit_price: line.unit_price,
      })),
    }
    try {
      await updatePriceList.mutateAsync(payload as any)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save price list:', error)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
  }

  const formatCurrency = (value: string) => {
    return `$${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Ongoing'
    return format(new Date(dateStr + 'T00:00:00'), 'MMM d, yyyy')
  }

  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
          <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!priceList) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
          <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>Price list not found</div>
        </div>
      </div>
    )
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/price-lists')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}>
            <ArrowLeft className="h-3.5 w-3.5" />Price Lists
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{priceList.customer_name} / {priceList.item_sku}</span>
        </div>

        {/* Title Row */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Price List</h1>
              {getStatusBadge(priceList.is_active ? 'active' : 'inactive')}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              <button
                onClick={() => navigate(`/customers/${priceList.customer}`)}
                className="transition-colors cursor-pointer"
                style={{ color: 'var(--so-text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}>
                {priceList.customer_name}
              </button>
              {' · '}
              <button
                onClick={() => navigate(`/items/${priceList.item}`)}
                className="font-mono transition-colors cursor-pointer"
                style={{ color: 'var(--so-text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}>
                {priceList.item_sku}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0" data-print-hide>
            {isEditing ? (
              <>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleCancel}>
                  <X className="h-3.5 w-3.5" />Cancel
                </button>
                <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleSave} disabled={updatePriceList.isPending}>
                  <Save className="h-3.5 w-3.5" />{updatePriceList.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => setIsEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />Edit
                </button>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5" />Print
                </button>
              </>
            )}
          </div>
        </div>

        {/* Overview KPI Card */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Overview</span>
          </div>
          <div className="grid grid-cols-4">
            {[
              { label: 'Customer', value: priceList.customer_name, sub: priceList.customer_code, mono: false },
              { label: 'Item', value: priceList.item_sku, sub: priceList.item_name, mono: true },
              { label: 'Valid From', value: formatDate(priceList.begin_date), mono: false },
              { label: 'Tiers', value: String(priceList.lines?.length ?? 0), mono: true },
            ].map((kpi, idx) => (
              <div key={idx} className="px-5 py-4" style={{ borderRight: idx < 3 ? '1px solid var(--so-border-light)' : 'none' }}>
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>{kpi.label}</div>
                <div className={`text-sm font-bold ${kpi.mono ? 'font-mono' : ''}`} style={{ color: 'var(--so-text-primary)' }}>{kpi.value}</div>
                {kpi.sub && <div className="text-[12px] mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>{kpi.sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Details Card */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Details</span>
          </div>
          <div className="px-6 py-5">
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>Customer</Label>
                    <Select
                      value={formData.customer}
                      onValueChange={(value) => setFormData({ ...formData, customer: value })}
                    >
                      <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                        <SelectValue placeholder="Select customer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.party_code} - {c.party_display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>Item</Label>
                    <Select
                      value={formData.item}
                      onValueChange={(value) => setFormData({ ...formData, item: value })}
                    >
                      <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                        <SelectValue placeholder="Select item..." />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.sku} - {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>Begin Date</Label>
                    <Input
                      type="date"
                      value={formData.begin_date}
                      onChange={(e) => setFormData({ ...formData, begin_date: e.target.value })}
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>End Date</Label>
                    <Input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-is-active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: !!checked })}
                  />
                  <Label htmlFor="edit-is-active" className="text-sm font-normal cursor-pointer">
                    Active
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Internal notes..."
                    rows={3}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-4 gap-6">
                  <div>
                    <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Begin Date</div>
                    <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>{formatDate(priceList.begin_date)}</div>
                  </div>
                  <div>
                    <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>End Date</div>
                    <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>{formatDate(priceList.end_date)}</div>
                  </div>
                  <div>
                    <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Created</div>
                    <div className="text-sm" style={{ color: 'var(--so-text-primary)' }}>{format(new Date(priceList.created_at), 'MMM d, yyyy')}</div>
                  </div>
                  <div>
                    <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Last Updated</div>
                    <div className="text-sm" style={{ color: 'var(--so-text-primary)' }}>{format(new Date(priceList.updated_at), 'MMM d, yyyy')}</div>
                  </div>
                </div>
                {priceList.notes && (
                  <div>
                    <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Notes</div>
                    <div className="text-sm whitespace-pre-wrap rounded-lg px-4 py-3" style={{ background: 'var(--so-bg)', color: 'var(--so-text-secondary)' }}>{priceList.notes}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quantity Break Tiers */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
              <span className="text-sm font-semibold">Quantity Break Tiers</span>
            </div>
            {isEditing && (
              <button
                type="button"
                className={outlineBtnClass}
                style={{ ...outlineBtnStyle, padding: '5px 12px' }}
                onClick={handleAddLine}>
                <Plus className="h-3.5 w-3.5" />Add Tier
              </button>
            )}
          </div>
          <div className="px-6 py-5">
            {isEditing ? (
              lines.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--so-text-tertiary)' }}>
                  No tiers. Click &quot;Add Tier&quot; to begin.
                </p>
              ) : (
                <div className="space-y-3">
                  {lines.map((line, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 rounded-[10px]" style={{ background: 'var(--so-bg)' }}>
                      <div className="col-span-5 space-y-1">
                        <Label className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>Min Quantity</Label>
                        <Input
                          type="number"
                          min="1"
                          value={line.min_quantity}
                          onChange={(e) => handleLineChange(index, 'min_quantity', e.target.value)}
                          className="h-9"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                      <div className="col-span-5 space-y-1">
                        <Label className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>Unit Price</Label>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={line.unit_price}
                          onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                          className="h-9"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <button
                          type="button"
                          className={dangerBtnClass}
                          style={{ ...dangerBtnStyle, padding: '6px 10px' }}
                          onClick={() => handleRemoveLine(index)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="rounded-[10px] overflow-hidden" style={{ border: '1px solid var(--so-border)' }}>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)', borderBottom: '1px solid var(--so-border-light)' }}>
                        Min Quantity
                      </th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-right" style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)', borderBottom: '1px solid var(--so-border-light)' }}>
                        Unit Price
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceList.lines && priceList.lines.length > 0 ? (
                      priceList.lines.map((line, idx) => (
                        <tr key={line.id} style={{ borderBottom: idx < priceList.lines!.length - 1 ? '1px solid var(--so-border-light)' : 'none' }}>
                          <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--so-text-primary)' }}>
                            {line.min_quantity.toLocaleString()}+
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>
                            {formatCurrency(line.unit_price)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                          No pricing tiers defined
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Audit History */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Audit History</span>
          </div>
          <div className="px-6 py-5">
            <FieldHistoryTab modelType="pricelist" objectId={priceListId} />
          </div>
        </div>

      </div>
    </div>
  )
}
