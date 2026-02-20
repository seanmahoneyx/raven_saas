import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Package, History, Users, Printer, Copy, BarChart3, Pencil, Save, X, Paperclip } from 'lucide-react'
import FileUpload from '@/components/common/FileUpload'
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
import { useItem, useItemVendors, useDuplicateItem, useUpdateItem } from '@/api/items'
import api from '@/api/client'
import { ItemHistoryTab } from '@/components/items/ItemHistoryTab'
import { FieldHistoryTab } from '@/components/common/FieldHistoryTab'
import type { ItemVendor } from '@/types/api'
import { FileText } from 'lucide-react'

type Tab = 'history' | 'vendors' | 'audit' | 'attachments' | 'children'

/* -- Status badge helper ---------------------------------------- */
const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    active:   { bg: 'var(--so-success-bg)', border: 'transparent', text: 'var(--so-success-text)' },
    inactive: { bg: 'var(--so-danger-bg)',  border: 'transparent', text: 'var(--so-danger-text)' },
  }
  const c = configs[status] || configs.active
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}

const getInventoryBadge = () => (
  <span
    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
    style={{ background: 'var(--so-info-bg)', border: '1px solid transparent', color: 'var(--so-info-text)' }}
  >
    Inventory
  </span>
)

/* -- Shared button styles --------------------------------------- */
const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function ItemDetail() {
  usePageTitle('Item Details')

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const itemId = parseInt(id || '0', 10)

  const { data: item, isLoading } = useItem(itemId)
  const { data: vendors } = useItemVendors(itemId)
  const duplicateItem = useDuplicateItem()
  const updateItem = useUpdateItem()
  const { data: childItems } = useQuery({
    queryKey: ['items', itemId, 'children'],
    queryFn: async () => {
      const { data } = await api.get('/items/', { params: { parent: itemId } })
      return data
    },
    enabled: !!itemId,
  })
  const [activeTab, setActiveTab] = useState<Tab>('history')
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    is_active: 'true',
    name: '',
    description: '',
    division: 'corrugated',
    purch_desc: '',
    sell_desc: '',
    is_inventory: 'true',
    reorder_point: '',
    min_stock: '',
    safety_stock: '',
    parent: '',
  })

  useEffect(() => {
    if (isEditing && item) {
      setFormData({
        is_active: String(item.is_active),
        name: item.name,
        description: item.description || '',
        division: item.division || 'corrugated',
        purch_desc: item.purch_desc || '',
        sell_desc: item.sell_desc || '',
        is_inventory: String(item.is_inventory),
        reorder_point: item.reorder_point !== null ? String(item.reorder_point) : '',
        min_stock: item.min_stock !== null ? String(item.min_stock) : '',
        safety_stock: item.safety_stock !== null ? String(item.safety_stock) : '',
        parent: item.parent ? String(item.parent) : '',
      })
    }
  }, [isEditing, item])

  const handleDuplicate = () => {
    if (!itemId) return
    duplicateItem.mutate(itemId, {
      onSuccess: (newItem) => {
        navigate(`/items/${newItem.id}`)
      },
    })
  }

  const handleSave = async () => {
    if (!item) return
    try {
      await updateItem.mutateAsync({
        id: item.id,
        is_active: formData.is_active === 'true',
        name: formData.name,
        description: formData.description,
        division: formData.division as any,
        purch_desc: formData.purch_desc,
        sell_desc: formData.sell_desc,
        is_inventory: formData.is_inventory === 'true',
        reorder_point: formData.reorder_point ? parseInt(formData.reorder_point, 10) : null,
        min_stock: formData.min_stock ? parseInt(formData.min_stock, 10) : null,
        safety_stock: formData.safety_stock ? parseInt(formData.safety_stock, 10) : null,
        parent: formData.parent ? parseInt(formData.parent, 10) : null,
      })
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save item:', error)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({
      is_active: 'true',
      name: '',
      description: '',
      division: 'corrugated',
      purch_desc: '',
      sell_desc: '',
      is_inventory: 'true',
      reorder_point: '',
      min_stock: '',
      safety_stock: '',
      parent: '',
    })
  }

  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Item not found</div>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'history' as Tab, label: 'Transaction History', icon: History },
    { id: 'vendors' as Tab, label: 'Vendors', icon: Users },
    { id: 'attachments' as Tab, label: 'Attachments', icon: Paperclip },
    { id: 'audit' as Tab, label: 'Audit History', icon: FileText },
    { id: 'children' as Tab, label: 'Sub-Items', icon: Package },
  ]

  const statusKey = item.is_active ? 'active' : 'inactive'

  /* -- Detail grid data ----------------------------------------- */
  const detailItems = isEditing
    ? [
        { label: 'Name', value: formData.name, empty: !formData.name, editable: true, editNode: (
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Item name"
            className="h-9 text-sm border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Division', value: formData.division, empty: !formData.division, editable: true, editNode: (
          <Select
            value={formData.division}
            onValueChange={(v) => setFormData({ ...formData, division: v })}
          >
            <SelectTrigger
              className="h-9 text-sm border rounded-md"
              style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="corrugated">Corrugated</SelectItem>
              <SelectItem value="packaging">Packaging</SelectItem>
              <SelectItem value="tooling">Tooling</SelectItem>
              <SelectItem value="janitorial">Janitorial</SelectItem>
              <SelectItem value="misc">Misc</SelectItem>
            </SelectContent>
          </Select>
        )},
        { label: 'Parent Item (ID)', value: formData.parent, empty: !formData.parent, editable: true, editNode: (
          <Input
            type="number"
            value={formData.parent}
            onChange={(e) => setFormData({ ...formData, parent: e.target.value })}
            placeholder="Parent item ID"
            min="1"
            className="h-9 text-sm border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Is Inventory', value: formData.is_inventory, empty: false, editable: true, editNode: (
          <Select
            value={formData.is_inventory}
            onValueChange={(v) => setFormData({ ...formData, is_inventory: v })}
          >
            <SelectTrigger
              className="h-9 text-sm border rounded-md"
              style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        )},
      ]
    : [
        { label: 'Name', value: item.name || '-', empty: !item.name },
        { label: 'Division', value: item.division || '-', empty: !item.division },
        { label: 'Parent Item', value: item.parent ? (item.parent_sku || `Item #${item.parent}`) : '-', empty: !item.parent, isParentLink: !!item.parent },
        { label: 'Is Inventory', value: item.is_inventory ? 'Yes' : 'No', empty: false },
      ]

  /* -- Summary stat cards --------------------------------------- */
  const summaryItems = [
    { label: 'Base UOM', value: item.base_uom_code || '-' },
    { label: 'Division', value: item.division || '-' },
    { label: 'Description', value: item.description || '-', isText: true },
    { label: 'Vendors', value: String(vendors?.length ?? 0) },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* -- Breadcrumb ---------------------------------------- */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/items')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Items
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{item.sku}</span>
        </div>

        {/* -- Title row ----------------------------------------- */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono" style={{ letterSpacing: '-0.03em' }}>{item.sku}</h1>
              {isEditing ? (
                <Select
                  value={formData.is_active}
                  onValueChange={(v) => setFormData({ ...formData, is_active: v })}
                >
                  <SelectTrigger
                    className="h-8 text-sm border rounded-md w-[120px]"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                getStatusBadge(statusKey)
              )}
              {item.is_inventory && !isEditing && getInventoryBadge()}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>{item.name}</div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {isEditing ? (
              <>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleCancel}>
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleSave} disabled={updateItem.isPending}>
                  <Save className="h-3.5 w-3.5" />
                  {updateItem.isPending ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setIsEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  className={outlineBtnClass}
                  style={outlineBtnStyle}
                  onClick={() => navigate(`/reports/item-quick-report?item=${item.id}`)}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Quick Report
                </button>
                <button
                  className={outlineBtnClass}
                  style={outlineBtnStyle}
                  onClick={() => window.open(`/api/v1/items/${item.id}/spec_sheet/`, '_blank')}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Spec Sheet
                </button>
                <button
                  className={outlineBtnClass}
                  style={outlineBtnStyle}
                  onClick={handleDuplicate}
                  disabled={duplicateItem.isPending}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {duplicateItem.isPending ? 'Duplicating...' : 'Save As Copy'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* -- Item Details Card --------------------------------- */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Item Details</span>
          </div>

          {/* Detail grid: 4 columns */}
          <div className="grid grid-cols-4">
            {detailItems.map((di, idx) => (
              <div
                key={idx}
                className="px-5 py-4"
                style={{
                  borderRight: (idx + 1) % 4 !== 0 ? '1px solid var(--so-border-light)' : 'none',
                  borderBottom: idx < 4 ? '1px solid var(--so-border-light)' : 'none',
                }}
              >
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                  {di.label}
                </div>
                {'editable' in di && di.editable && 'editNode' in di ? (
                  (di as { editNode: React.ReactNode }).editNode
                ) : 'isParentLink' in di && di.isParentLink ? (
                  <button
                    onClick={() => navigate(`/items/${item.parent}`)}
                    className="text-sm font-medium transition-colors cursor-pointer"
                    style={{ color: 'var(--so-accent)' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    {di.value}
                  </button>
                ) : (
                  <div
                    className="text-sm font-medium"
                    style={{
                      color: di.empty ? 'var(--so-text-tertiary)' : 'var(--so-text-primary)',
                      fontStyle: di.empty ? 'italic' : 'normal',
                    }}
                  >
                    {di.value}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Description fields row (view mode) */}
          {!isEditing && (
            <>
              <div
                className="px-5 py-4"
                style={{ borderTop: '1px solid var(--so-border-light)' }}
              >
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Description</div>
                <div className="text-sm whitespace-pre-wrap" style={{ color: item.description ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)', fontStyle: item.description ? 'normal' : 'italic' }}>
                  {item.description || 'Not set'}
                </div>
              </div>
              <div
                className="px-5 py-4"
                style={{ borderTop: '1px solid var(--so-border-light)' }}
              >
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Purchase Description</div>
                <div className="text-sm whitespace-pre-wrap" style={{ color: item.purch_desc ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)', fontStyle: item.purch_desc ? 'normal' : 'italic' }}>
                  {item.purch_desc || 'Not set'}
                </div>
              </div>
              <div
                className="px-5 py-4"
                style={{ borderTop: '1px solid var(--so-border-light)' }}
              >
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Sales Description</div>
                <div className="text-sm whitespace-pre-wrap" style={{ color: item.sell_desc ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)', fontStyle: item.sell_desc ? 'normal' : 'italic' }}>
                  {item.sell_desc || 'Not set'}
                </div>
              </div>
            </>
          )}

          {/* Description fields (edit mode) */}
          {isEditing && (
            <>
              <div className="px-5 py-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                <Label className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--so-text-tertiary)' }}>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="General description..."
                  rows={2}
                  className="text-sm border rounded-md px-2"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div className="px-5 py-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                <Label className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--so-text-tertiary)' }}>Purchase Description</Label>
                <Textarea
                  value={formData.purch_desc}
                  onChange={(e) => setFormData({ ...formData, purch_desc: e.target.value })}
                  placeholder="Description for purchase orders..."
                  rows={2}
                  className="text-sm border rounded-md px-2"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div className="px-5 py-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                <Label className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--so-text-tertiary)' }}>Sales Description</Label>
                <Textarea
                  value={formData.sell_desc}
                  onChange={(e) => setFormData({ ...formData, sell_desc: e.target.value })}
                  placeholder="Description for sales orders..."
                  rows={2}
                  className="text-sm border rounded-md px-2"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </>
          )}

          {/* Summary row */}
          <div
            className="grid grid-cols-4"
            style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
          >
            {summaryItems.map((si, idx) => (
              <div
                key={idx}
                className="px-5 py-3.5"
                style={{
                  borderRight: idx < 3 ? '1px solid var(--so-border-light)' : 'none',
                }}
              >
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--so-text-tertiary)' }}>
                  {si.label}
                </div>
                <span
                  className={`font-mono text-sm font-bold ${si.isText ? 'truncate block' : ''}`}
                  style={{ color: 'var(--so-text-primary)' }}
                  title={si.isText ? si.value : undefined}
                >
                  {si.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* -- Reorder Settings Card ----------------------------- */}
        {item.is_inventory && (
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            {/* Card header */}
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Reorder Settings</span>
            </div>

            {isEditing ? (
              <div className="grid grid-cols-3">
                {[
                  { field: 'reorder_point' as const, label: 'Reorder Point', hint: 'Alert when on-hand reaches this level', value: formData.reorder_point },
                  { field: 'min_stock' as const, label: 'Min Stock', hint: 'Minimum acceptable stock level', value: formData.min_stock },
                  { field: 'safety_stock' as const, label: 'Safety Stock', hint: 'Buffer above min stock', value: formData.safety_stock },
                ].map((f, idx) => (
                  <div
                    key={f.field}
                    className="px-5 py-4"
                    style={{ borderRight: idx < 2 ? '1px solid var(--so-border-light)' : 'none' }}
                  >
                    <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                      {f.label}
                    </div>
                    <Input
                      type="number"
                      value={f.value}
                      onChange={(e) => setFormData({ ...formData, [f.field]: e.target.value })}
                      placeholder={f.hint}
                      min="0"
                      className="h-9 text-sm border rounded-md px-2 mb-1.5"
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    />
                    <p className="text-[11.5px]" style={{ color: 'var(--so-text-tertiary)' }}>{f.hint}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3">
                {[
                  { label: 'Reorder Point', value: item.reorder_point, hint: 'Alert when on-hand reaches this level' },
                  { label: 'Min Stock', value: item.min_stock, hint: 'Minimum acceptable stock level' },
                  { label: 'Safety Stock', value: item.safety_stock, hint: 'Buffer above min stock' },
                ].map((s, idx) => (
                  <div
                    key={s.label}
                    className="px-5 py-4"
                    style={{ borderRight: idx < 2 ? '1px solid var(--so-border-light)' : 'none' }}
                  >
                    <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                      {s.label}
                    </div>
                    <div className="text-lg font-semibold font-mono mb-1" style={{ color: s.value != null ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
                      {s.value ?? '-'}
                    </div>
                    <p className="text-[11.5px]" style={{ color: 'var(--so-text-tertiary)' }}>{s.hint}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* -- Tabs --------------------------------------------- */}
        <div className="flex gap-1 mb-5 animate-in delay-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors cursor-pointer"
              style={{
                borderColor: activeTab === tab.id ? 'var(--so-accent)' : 'transparent',
                color: activeTab === tab.id ? 'var(--so-accent)' : 'var(--so-text-tertiary)',
              }}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* -- Tab Content Card ---------------------------------- */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">
              {tabs.find((t) => t.id === activeTab)?.label}
            </span>
          </div>

          <div className="px-6 py-5">
            {activeTab === 'history' && <ItemHistoryTab itemId={itemId} />}
            {activeTab === 'attachments' && <FileUpload appLabel="items" modelName="item" objectId={itemId} />}
            {activeTab === 'audit' && <FieldHistoryTab modelType="item" objectId={itemId} />}

            {activeTab === 'vendors' && (
              <div>
                {vendors && vendors.length > 0 ? (
                  <div className="overflow-x-auto -mx-6 -my-5">
                    <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Vendor', 'MPN', 'Lead Time', 'Min Order', 'Preferred'].map((h) => (
                            <th
                              key={h}
                              className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left"
                              style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {vendors.map((v: ItemVendor) => (
                          <tr key={v.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                            <td className="py-3.5 px-4 font-medium" style={{ color: 'var(--so-text-primary)' }}>
                              {v.vendor_name || `Vendor ${v.vendor}`}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                              {v.mpn || '-'}
                            </td>
                            <td className="py-3.5 px-4" style={{ color: 'var(--so-text-secondary)' }}>
                              {v.lead_time_days ? `${v.lead_time_days} days` : '-'}
                            </td>
                            <td className="py-3.5 px-4" style={{ color: 'var(--so-text-secondary)' }}>
                              {v.min_order_qty ?? '-'}
                            </td>
                            <td className="py-3.5 px-4">
                              {v.is_preferred
                                ? (
                                  <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
                                    style={{ background: 'var(--so-success-bg)', border: '1px solid transparent', color: 'var(--so-success-text)' }}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: 'var(--so-success-text)' }} />
                                    Preferred
                                  </span>
                                )
                                : <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                    No vendors linked to this item
                  </div>
                )}
              </div>
            )}

            {activeTab === 'children' && (
              <div>
                {childItems?.results && childItems.results.length > 0 ? (
                  <div className="overflow-x-auto -mx-6 -my-5">
                    <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['SKU', 'Name', 'Division', 'Status'].map((h) => (
                            <th
                              key={h}
                              className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left"
                              style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {childItems.results.map((child: any) => (
                          <tr
                            key={child.id}
                            style={{ borderBottom: '1px solid var(--so-border-light)', cursor: 'pointer' }}
                            onClick={() => navigate(`/items/${child.id}`)}
                            onMouseEnter={e => ((e.currentTarget as HTMLTableRowElement).style.background = 'var(--so-bg)')}
                            onMouseLeave={e => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                          >
                            <td className="py-3.5 px-4 font-mono font-medium" style={{ color: 'var(--so-accent)' }}>
                              {child.sku}
                            </td>
                            <td className="py-3.5 px-4" style={{ color: 'var(--so-text-primary)' }}>
                              {child.name}
                            </td>
                            <td className="py-3.5 px-4" style={{ color: 'var(--so-text-secondary)' }}>
                              {child.division || '-'}
                            </td>
                            <td className="py-3.5 px-4">
                              {getStatusBadge(child.is_active ? 'active' : 'inactive')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                    No sub-items
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
