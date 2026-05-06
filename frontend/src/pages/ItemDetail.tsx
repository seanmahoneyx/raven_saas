import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useTrackEntityView, useFavorites, useAddFavorite, useRemoveFavorite } from '@/api/favorites'
import { ArrowLeft, Package, History, Users, Printer, Copy, BarChart3, Pencil, Paperclip, Search, DollarSign, Star } from 'lucide-react'
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
import { useItem, useItemVendors, useDuplicateItem, useUpdateItem, useSimilarItems, useTransitionItem, useBumpRevision, useSetPreferredVendor, useUnitsOfMeasure, useCreateItemVendor } from '@/api/items'
import { useParties } from '@/api/parties'
import { useCostLists, useCreateCostList } from '@/api/costLists'
import type { SimilarItemEntry } from '@/api/items'
import { ItemHistoryTab } from '@/components/items/ItemHistoryTab'
import ItemFormShell from '@/components/items/ItemFormShell'
import { ProductCardTab } from '@/components/items/ProductCardTab'
import { FieldHistoryTab } from '@/components/common/FieldHistoryTab'
import type { ItemVendor } from '@/types/api'
import { FileText } from 'lucide-react'

import { getStatusBadge, getItemTypeBadge } from '@/components/ui/StatusBadge'

type Tab = 'details' | 'history' | 'product-card' | 'vendors' | 'similar' | 'attachments' | 'audit'

import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

/** Convert a decimal number to a fraction string rounded to the nearest 1/16th. */
const toFraction = (val: string | number | null | undefined): string | null => {
  if (val == null || val === '') return null
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return null
  const whole = Math.floor(num)
  const remainder = num - whole
  const sixteenths = Math.round(remainder * 16)
  if (sixteenths === 0) return String(whole)
  if (sixteenths === 16) return String(whole + 1)
  // simplify fraction
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(sixteenths, 16)
  const n = sixteenths / g
  const d = 16 / g
  return whole > 0 ? `${whole}-${n}/${d}` : `${n}/${d}`
}

export default function ItemDetail() {
  usePageTitle('Item Details')

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const itemId = parseInt(id || '0', 10)

  const { data: item, isLoading } = useItem(itemId)
  const { data: vendors } = useItemVendors(itemId)
  const { data: similarItems } = useSimilarItems(itemId)
  const { data: uomData } = useUnitsOfMeasure()
  const { data: customersData } = useParties({ party_type: 'CUSTOMER' })
  const { data: vendorPartiesData } = useParties({ party_type: 'VENDOR' })
  const uomList = uomData?.results ?? []
  const customerList = customersData?.results ?? []
  const vendorPartyList = vendorPartiesData?.results ?? []
  const duplicateItem = useDuplicateItem()
  const updateItem = useUpdateItem()
  const transitionItem = useTransitionItem()
  const bumpRevision = useBumpRevision()
  const createItemVendor = useCreateItemVendor(itemId)
  const createCostList = useCreateCostList()
  const { data: costListsData } = useCostLists({ item: itemId })
  const costLists = costListsData?.results ?? []
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false)
  const [revisionReason, setRevisionReason] = useState('')
  const [addVendorOpen, setAddVendorOpen] = useState(false)
  const [addVendorForm, setAddVendorForm] = useState({ vendor: '', mpn: '', lead_time_days: '', min_order_qty: '' })
  const [costListPrompt, setCostListPrompt] = useState<{ vendorRecordId: number; vendorName: string } | null>(null)
  const [costListForm, setCostListForm] = useState({ unit_cost: '', min_quantity: '1', begin_date: new Date().toISOString().split('T')[0] })
  const setPreferredVendor = useSetPreferredVendor()
  const [searchParams] = useSearchParams()
  const trackView = useTrackEntityView()
  useEffect(() => {
    if (itemId) {
      trackView.mutate({ entity_type: 'item', object_id: itemId })
    }
  }, [itemId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: favorites } = useFavorites('item')
  const addFavorite = useAddFavorite()
  const removeFavorite = useRemoveFavorite()
  const favRecord = favorites?.find(f => f.object_id === itemId)
  const isFavorited = !!favRecord

  const handleToggleFavorite = () => {
    if (isFavorited && favRecord) {
      removeFavorite.mutate(favRecord.id)
    } else {
      addFavorite.mutate({ entity_type: 'item', object_id: itemId })
    }
  }

  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'product-card') {
      setActiveTab('product-card')
    }
  }, [searchParams])
  const handleDuplicate = () => {
    if (!itemId) return
    duplicateItem.mutate(itemId, {
      onSuccess: (newItem) => {
        navigate(`/items/${newItem.id}`)
      },
    })
  }

  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Item not found</div>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'details' as Tab, label: 'Item Details', icon: Package },
    { id: 'history' as Tab, label: 'Transaction History', icon: History },
    { id: 'product-card' as Tab, label: 'Product Card', icon: DollarSign },
    { id: 'vendors' as Tab, label: 'Vendors', icon: Users },
    { id: 'similar' as Tab, label: 'Similar Items', icon: Search },
    { id: 'attachments' as Tab, label: 'Attachments', icon: Paperclip },
    { id: 'audit' as Tab, label: 'Audit History', icon: FileText },
  ]

  const statusKey = item.is_active ? 'active' : 'inactive'

  /* -- Detail grid data ----------------------------------------- */
  const inputStyle = { borderColor: 'var(--so-border)', background: 'var(--so-surface)' }

  const detailItems = [
    { label: 'Name', value: item.name || '-', empty: !item.name },
    { label: 'Division', value: item.division ? item.division.charAt(0).toUpperCase() + item.division.slice(1) : '-', empty: !item.division },
    { label: 'Item Type', value: { inventory: 'Inventory', crossdock: 'Crossdock', non_stockable: 'Non-Stockable', other_charge: 'Other Charge' }[item.item_type] || item.item_type, empty: false },
    { label: 'Customer', value: item.customer_name || 'Stock Item', empty: !item.customer },
    { label: 'Base UoM', value: item.base_uom_code || '-', empty: !item.base_uom_code },
    { label: 'Parent Item', value: item.parent ? (item.parent_sku || `Item #${item.parent}`) : '-', empty: !item.parent, isParentLink: !!item.parent },
  ]


  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16" data-print-hide>

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
        <div className="flex flex-wrap items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono" style={{ letterSpacing: '-0.03em' }}>{item.sku}</h1>
              <button
                onClick={handleToggleFavorite}
                title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                className="inline-flex items-center justify-center transition-colors cursor-pointer"
                style={{ background: 'none', border: 'none', padding: '2px' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <Star
                  style={{
                    width: 18,
                    height: 18,
                    fill: isFavorited ? '#f59e0b' : 'none',
                    color: isFavorited ? '#f59e0b' : 'var(--so-text-tertiary)',
                    transition: 'fill 0.15s, color 0.15s',
                  }}
                />
              </button>
              {getStatusBadge(statusKey)}
              {getItemTypeBadge(item.item_type)}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>{item.name}</div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {!isEditing && (
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

        {/* -- Lifecycle Banner ---------------------------------- */}
        {item.lifecycle_status && item.lifecycle_status !== 'active' && (
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2 px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3"
            style={{
              background: item.lifecycle_status === 'draft' ? 'rgba(168,85,247,0.06)' : 'rgba(59,130,246,0.06)',
              borderColor: item.lifecycle_status === 'draft' ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)',
            }}>
            <div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider mr-3"
                style={{
                  background: item.lifecycle_status === 'draft' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)',
                  color: item.lifecycle_status === 'draft' ? '#a855f7' : '#3b82f6',
                }}>
                {{ draft: 'Draft', pending_design: 'Design Requested', in_design: 'In Design', design_complete: 'Design Complete', pending_approval: 'Pending Approval' }[item.lifecycle_status] || item.lifecycle_status}
              </span>
              <span className="text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                This item is not yet active and cannot be used in orders.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {item.lifecycle_status === 'draft' && (
                <>
                  {item.division === 'corrugated' && (
                    <button className={outlineBtnClass} style={outlineBtnStyle}
                      onClick={() => transitionItem.mutate({ id: item.id, lifecycle_status: 'pending_design' })}>
                      Request Design
                    </button>
                  )}
                  <button className={primaryBtnClass} style={primaryBtnStyle}
                    onClick={() => transitionItem.mutate({ id: item.id, lifecycle_status: 'pending_approval' })}>
                    Submit for Approval
                  </button>
                </>
              )}
              {item.lifecycle_status === 'pending_design' && (
                <button className={primaryBtnClass} style={primaryBtnStyle}
                  onClick={() => transitionItem.mutate({ id: item.id, lifecycle_status: 'in_design' })}>
                  Claim Design
                </button>
              )}
              {item.lifecycle_status === 'in_design' && (
                <button className={primaryBtnClass} style={primaryBtnStyle}
                  onClick={() => transitionItem.mutate({ id: item.id, lifecycle_status: 'design_complete' })}>
                  Mark Design Complete
                </button>
              )}
              {item.lifecycle_status === 'design_complete' && (
                <button className={primaryBtnClass} style={primaryBtnStyle}
                  onClick={() => transitionItem.mutate({ id: item.id, lifecycle_status: 'pending_approval' })}>
                  Submit for Approval
                </button>
              )}
              {item.lifecycle_status === 'pending_approval' && (
                <>
                  <button className={outlineBtnClass} style={outlineBtnStyle}
                    onClick={() => transitionItem.mutate({ id: item.id, lifecycle_status: 'draft' })}>
                    Reject
                  </button>
                  <button className={primaryBtnClass} style={primaryBtnStyle}
                    onClick={() => transitionItem.mutate({ id: item.id, lifecycle_status: 'active' })}>
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* -- Revision Info (active items) ---------------------- */}
        {item.lifecycle_status === 'active' && item.revision && item.revision > 0 && (
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2 px-6 py-3 flex items-center justify-between"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider font-mono"
                style={{ background: 'rgba(74,144,92,0.1)', color: 'var(--so-success, #4a905c)' }}>
                Rev {item.revision}
              </span>
              {item.revision_reason && (
                <span className="text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                  {item.revision_reason}
                </span>
              )}
              {item.revision_date && (
                <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                  {new Date(item.revision_date).toLocaleDateString()}
                </span>
              )}
            </div>
            <button className={outlineBtnClass} style={outlineBtnStyle}
              onClick={() => { setRevisionReason(''); setRevisionDialogOpen(true) }}>
              Bump Revision
            </button>
          </div>
        )}

        {/* Revision bump dialog */}
        {revisionDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="rounded-[14px] border p-6 w-[440px] space-y-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <h3 className="text-lg font-bold">Bump Revision</h3>
              <p className="text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                This will increment the revision to <span className="font-mono font-bold">Rev {(item.revision || 0) + 1}</span>.
                Vendors will see the change note on future POs.
              </p>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium">What changed? *</Label>
                <Textarea
                  value={revisionReason}
                  onChange={e => setRevisionReason(e.target.value)}
                  placeholder="e.g., Height increased 6&quot; to 7&quot; per customer request"
                  rows={3}
                  style={inputStyle}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setRevisionDialogOpen(false)}>Cancel</button>
                <button className={primaryBtnClass} style={primaryBtnStyle}
                  disabled={!revisionReason.trim() || bumpRevision.isPending}
                  onClick={async () => {
                    await bumpRevision.mutateAsync({ id: item.id, reason: revisionReason.trim() })
                    setRevisionDialogOpen(false)
                  }}>
                  {bumpRevision.isPending ? 'Saving...' : `Save as Rev ${(item.revision || 0) + 1}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -- Tabs --------------------------------------------- */}
        <div className="flex gap-1 mb-6 animate-in delay-3 rounded-xl p-1.5 overflow-x-auto"
             style={{ background: 'var(--so-surface)', border: '1px solid var(--so-border)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg transition-all cursor-pointer"
              style={{
                background: activeTab === tab.id ? 'var(--so-accent)' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'var(--so-text-tertiary)',
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* -- Details Tab Content ------------------------------- */}
        {activeTab === 'details' && isEditing && (
          <ItemFormShell
            mode="edit"
            initialItem={item}
            noPageChrome
            onCancel={() => setIsEditing(false)}
            onSuccess={() => setIsEditing(false)}
          />
        )}
        {activeTab === 'details' && !isEditing && (
          <>
            {/* Item Details Card */}
            <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              {/* Card header */}
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Item Details</span>
              </div>

              {/* Detail grid: 4 columns */}
              <div className="grid grid-cols-2 md:grid-cols-4">
                {detailItems.map((di, idx) => (
                  <div
                    key={idx}
                    className="px-5 py-4"
                    style={{
                      borderRight: '1px solid var(--so-border-light)',
                      borderBottom: '1px solid var(--so-border-light)',
                    }}
                  >
                    <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                      {di.label}
                    </div>
                    {'isParentLink' in di && di.isParentLink ? (
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
                    <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>General Description</div>
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

              {/* Unitizing / Pallet fields (edit mode) */}
            </div>

            {/* Board Specifications (view only, corrugated) */}
            {!isEditing && item.corrugated_details && (
              <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                  <span className="text-sm font-semibold">Board Specifications</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
                  {[
                    { label: 'Box Type', value: item.box_type ? item.box_type.toUpperCase().replace(/^DC$/, 'D/C') : null },
                    { label: 'Test (ECT)', value: item.corrugated_details.test ? item.corrugated_details.test.toUpperCase() : null },
                    { label: 'Flute', value: item.corrugated_details.flute ? item.corrugated_details.flute.toUpperCase() : null },
                    { label: 'Paper', value: item.corrugated_details.paper ? item.corrugated_details.paper.toUpperCase() : null },
                  ].map((f, i) => (
                    <div key={i} className="px-5 py-4" style={{ borderRight: (i + 1) % 4 !== 0 ? '1px solid var(--so-border-light)' : 'none' }}>
                      <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>{f.label}</div>
                      <div className="text-sm font-medium" style={{ color: f.value ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>{f.value || '-'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dimensions (view only, corrugated) */}
            {!isEditing && item.dimensions && (
              <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                  <span className="text-sm font-semibold">Dimensions</span>
                </div>
                {item.box_type === 'dc' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-0">
                    <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)' }}>
                      <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Blank Size (L × W)</div>
                      <div className="text-sm font-medium font-mono" style={{ color: item.dimensions.blank_length ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
                        {item.dimensions.blank_length && item.dimensions.blank_width
                          ? `${toFraction(item.dimensions.blank_length)} × ${toFraction(item.dimensions.blank_width)}`
                          : '-'}
                      </div>
                    </div>
                    <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)' }}>
                      <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Make-up Size (L × W × H)</div>
                      <div className="text-sm font-medium font-mono" style={{ color: item.dimensions.length ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
                        {item.dimensions.length && item.dimensions.width
                          ? `${toFraction(item.dimensions.length)} × ${toFraction(item.dimensions.width)}${item.dimensions.height ? ` × ${toFraction(item.dimensions.height)}` : ''}`
                          : '-'}
                      </div>
                    </div>
                    <div className="px-5 py-4">
                      <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}># Out (Rotary)</div>
                      <div className="text-sm font-medium font-mono" style={{ color: item.dimensions.out_per_rotary ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
                        {item.dimensions.out_per_rotary ?? '-'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
                    {(() => {
                      const d = item.dimensions!
                      const fields: { label: string; value: string | number | null | undefined }[] = [
                        { label: 'Length', value: toFraction(d.length) },
                        { label: 'Width', value: toFraction(d.width) },
                      ]
                      if (d.height != null) fields.push({ label: 'Height', value: toFraction(d.height) })
                      return fields.map((f, i) => (
                        <div key={i} className="px-5 py-4" style={{ borderRight: (i + 1) % fields.length !== 0 ? '1px solid var(--so-border-light)' : 'none' }}>
                          <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>{f.label}</div>
                          <div className="text-sm font-medium font-mono" style={{ color: f.value ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>{f.value ?? '-'}</div>
                        </div>
                      ))
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Print Info (view only, corrugated + printed) */}
            {!isEditing && item.corrugated_details?.is_printed && (
              <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                  <span className="text-sm font-semibold">Print Information</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
                  {[
                    { label: 'Printed', value: 'Yes' },
                    { label: 'Panels Printed', value: item.corrugated_details.panels_printed != null ? String(item.corrugated_details.panels_printed) : null },
                    { label: 'Colors Printed', value: item.corrugated_details.colors_printed != null ? String(item.corrugated_details.colors_printed) : null },
                    { label: 'Ink List', value: item.corrugated_details.ink_list || null, isInkList: true },
                  ].map((f, i) => (
                    <div key={i} className="px-5 py-4" style={{ borderRight: (i + 1) % 4 !== 0 ? '1px solid var(--so-border-light)' : 'none' }}>
                      <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>{f.label}</div>
                      {'isInkList' in f && f.isInkList && f.value ? (
                        <div className="flex flex-col gap-0.5">
                          {f.value.split(',').map((ink: string, j: number) => (
                            <div key={j} className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>{ink.trim()}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm font-medium" style={{ color: f.value ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>{f.value || '-'}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Packaging Specifications (view only) */}
            {!isEditing && item.packaging_details && (
              <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                  <span className="text-sm font-semibold">Packaging Specifications</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
                  {Object.entries(item.packaging_details)
                    .filter(([, v]) => v != null && v !== '' && v !== false)
                    .map(([key, value], i) => (
                      <div key={key} className="px-5 py-4" style={{ borderRight: (i + 1) % 4 !== 0 ? '1px solid var(--so-border-light)' : 'none', borderBottom: '1px solid var(--so-border-light)' }}>
                        <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                          {key.replace(/_/g, ' ')}
                        </div>
                        <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>
                          {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Unitizing / Pallet (view only) */}
            {!isEditing && (item.units_per_layer != null || item.units_per_pallet != null || item.unit_height || item.pallet_height || item.pallet_footprint) && (
              <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                  <span className="text-sm font-semibold">Unitizing / Pallet</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-0">
                  {[
                    { label: 'Units / Bundle', value: item.units_per_layer != null ? String(item.units_per_layer) : null },
                    { label: 'Units / Pallet', value: item.units_per_pallet != null ? String(item.units_per_pallet) : null },
                    { label: 'Unit Height', value: item.unit_height },
                    { label: 'Pallet Height', value: item.pallet_height },
                    { label: 'Pallet Footprint', value: item.pallet_footprint || null },
                  ].map((f, i) => (
                    <div key={i} className="px-5 py-4" style={{ borderRight: (i + 1) % 5 !== 0 ? '1px solid var(--so-border-light)' : 'none' }}>
                      <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>{f.label}</div>
                      <div className="text-sm font-medium" style={{ color: f.value ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>{f.value || '-'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reorder Settings Card - only for inventory/crossdock */}
            {(item.item_type === 'inventory' || item.item_type === 'crossdock') && (
              <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                {/* Card header */}
                <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                  <span className="text-sm font-semibold">Reorder Settings</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3">
                    {[
                      { label: 'Reorder Point', value: item.reorder_point, hint: 'Alert when on-hand reaches this level' },
                      { label: 'Min Stock', value: item.min_stock, hint: 'Minimum acceptable stock level' },
                      { label: 'Safety Stock', value: item.safety_stock, hint: 'Buffer above min stock' },
                    ].map((s, idx) => (
                      <div
                        key={s.label}
                        className="px-5 py-4"
                        style={{ borderRight: '1px solid var(--so-border-light)' }}
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
              </div>
            )}
          </>
        )}

        {/* -- Tab Content Card ---------------------------------- */}
        {activeTab !== 'details' && (
        <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">
              {tabs.find((t) => t.id === activeTab)?.label}
            </span>
            {activeTab === 'vendors' && !addVendorOpen && (
              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => setAddVendorOpen(true)}
              >
                + Add Vendor
              </button>
            )}
          </div>

          <div className="px-6 py-5">
            {activeTab === 'history' && <ItemHistoryTab itemId={itemId} />}
            {activeTab === 'product-card' && <ProductCardTab itemId={itemId} />}

            {activeTab === 'similar' && (
              <div>
                {similarItems && (similarItems.exact_matches.length > 0 || similarItems.close_matches.length > 0) ? (
                  <div className="space-y-6">
                    {/* Exact Matches */}
                    {similarItems.exact_matches.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--so-text-primary)' }}>
                          Exact Matches ({similarItems.exact_matches.length})
                        </h3>
                        <div className="overflow-x-auto -mx-6 rounded-lg border" style={{ borderColor: 'var(--so-border-light)' }}>
                          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                {['SKU', 'Name', 'Customer', 'Dimensions', 'Diff', 'Type'].map((h) => (
                                  <th key={h} className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {similarItems.exact_matches.map((m: SimilarItemEntry) => (
                                <tr key={m.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                                  <td className="py-3 px-4">
                                    <button onClick={() => navigate(`/items/${m.id}`)} className="font-mono font-medium text-sm cursor-pointer" style={{ color: 'var(--so-accent)' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{m.sku}</button>
                                  </td>
                                  <td className="py-3 px-4" style={{ color: 'var(--so-text-primary)' }}>{m.name}</td>
                                  <td className="py-3 px-4" style={{ color: 'var(--so-text-secondary)' }}>{m.customer_name || '-'}</td>
                                  <td className="py-3 px-4 font-mono text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                                    {m.length && m.width ? `${m.length}×${m.width}${m.height ? `×${m.height}` : ''}` : '-'}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider" style={{ background: 'var(--so-success-bg)', color: 'var(--so-success-text)' }}>{m.dimension_diff}</span>
                                  </td>
                                  <td className="py-3 px-4 text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>{m.item_type}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Close Matches */}
                    {similarItems.close_matches.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--so-text-primary)' }}>
                          Close Matches (&plusmn;0.5&quot;) ({similarItems.close_matches.length})
                        </h3>
                        <div className="overflow-x-auto -mx-6 rounded-lg border" style={{ borderColor: 'var(--so-border-light)' }}>
                          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                {['SKU', 'Name', 'Customer', 'Dimensions', 'Diff', 'Type'].map((h) => (
                                  <th key={h} className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {similarItems.close_matches.map((m: SimilarItemEntry) => (
                                <tr key={m.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                                  <td className="py-3 px-4">
                                    <button onClick={() => navigate(`/items/${m.id}`)} className="font-mono font-medium text-sm cursor-pointer" style={{ color: 'var(--so-accent)' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{m.sku}</button>
                                  </td>
                                  <td className="py-3 px-4" style={{ color: 'var(--so-text-primary)' }}>{m.name}</td>
                                  <td className="py-3 px-4" style={{ color: 'var(--so-text-secondary)' }}>{m.customer_name || '-'}</td>
                                  <td className="py-3 px-4 font-mono text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                                    {m.length && m.width ? `${m.length}×${m.width}${m.height ? `×${m.height}` : ''}` : '-'}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--so-warning-bg)', color: 'var(--so-warning-text)' }}>{m.dimension_diff}</span>
                                  </td>
                                  <td className="py-3 px-4 text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>{m.item_type}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                    No similar items found
                  </div>
                )}
              </div>
            )}

            {activeTab === 'attachments' && <FileUpload appLabel="items" modelName="item" objectId={itemId} />}
            {activeTab === 'audit' && <FieldHistoryTab modelType="item" objectId={itemId} />}

            {activeTab === 'vendors' && (
              <div>
                {/* Quick Add Vendor */}
                {addVendorOpen && (
                  <div className="rounded-lg border p-4 mb-4" style={{ borderColor: 'var(--so-border)', background: 'var(--so-bg)' }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div>
                        <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Vendor *</div>
                        <Select value={addVendorForm.vendor} onValueChange={(v) => setAddVendorForm({ ...addVendorForm, vendor: v })}>
                          <SelectTrigger className="h-9 text-sm border rounded-md" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                            <SelectValue placeholder="Select vendor..." />
                          </SelectTrigger>
                          <SelectContent>
                            {vendorPartyList
                              .filter(vp => !vendors?.some((ev: ItemVendor) => ev.vendor === vp.id))
                              .map((vp) => (
                                <SelectItem key={vp.id} value={String(vp.id)}>{vp.display_name}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--so-text-tertiary)' }}>MPN</div>
                        <Input
                          value={addVendorForm.mpn}
                          onChange={(e) => setAddVendorForm({ ...addVendorForm, mpn: e.target.value })}
                          placeholder="Vendor part #"
                          className="h-9 text-sm border rounded-md px-2"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                      <div>
                        <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Lead Time (days)</div>
                        <Input
                          type="number"
                          value={addVendorForm.lead_time_days}
                          onChange={(e) => setAddVendorForm({ ...addVendorForm, lead_time_days: e.target.value })}
                          placeholder="-"
                          min="0"
                          className="h-9 text-sm border rounded-md px-2"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                      <div>
                        <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Min Order Qty</div>
                        <Input
                          type="number"
                          value={addVendorForm.min_order_qty}
                          onChange={(e) => setAddVendorForm({ ...addVendorForm, min_order_qty: e.target.value })}
                          placeholder="-"
                          min="0"
                          className="h-9 text-sm border rounded-md px-2"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className={primaryBtnClass}
                        style={primaryBtnStyle}
                        disabled={!addVendorForm.vendor || createItemVendor.isPending}
                        onClick={async () => {
                          const newVendor = await createItemVendor.mutateAsync({
                            vendor: parseInt(addVendorForm.vendor, 10),
                            mpn: addVendorForm.mpn,
                            lead_time_days: addVendorForm.lead_time_days ? parseInt(addVendorForm.lead_time_days, 10) : null,
                            min_order_qty: addVendorForm.min_order_qty ? parseInt(addVendorForm.min_order_qty, 10) : null,
                          })
                          const vendorName = vendorPartyList.find(vp => vp.id === parseInt(addVendorForm.vendor, 10))?.display_name || 'this vendor'
                          setAddVendorForm({ vendor: '', mpn: '', lead_time_days: '', min_order_qty: '' })
                          setAddVendorOpen(false)
                          if (newVendor.vendor_record_id) {
                            setCostListForm({ unit_cost: '', min_quantity: '1', begin_date: new Date().toISOString().split('T')[0] })
                            setCostListPrompt({ vendorRecordId: newVendor.vendor_record_id, vendorName })
                          }
                        }}
                      >
                        {createItemVendor.isPending ? 'Adding...' : 'Add Vendor'}
                      </button>
                      <button
                        className={outlineBtnClass}
                        style={outlineBtnStyle}
                        onClick={() => {
                          setAddVendorForm({ vendor: '', mpn: '', lead_time_days: '', min_order_qty: '' })
                          setAddVendorOpen(false)
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Cost list creation prompt after adding vendor */}
                {costListPrompt && (
                  <div className="rounded-lg border p-4 mb-4" style={{ borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.04)' }}>
                    <div className="text-sm font-medium mb-3" style={{ color: 'var(--so-text-primary)' }}>
                      Create a cost list for <span className="font-semibold">{costListPrompt.vendorName}</span>?
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                      <div>
                        <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Unit Cost *</div>
                        <Input
                          type="number"
                          step="0.01"
                          value={costListForm.unit_cost}
                          onChange={(e) => setCostListForm({ ...costListForm, unit_cost: e.target.value })}
                          placeholder="0.00"
                          className="h-9 text-sm border rounded-md px-2"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                      <div>
                        <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Min Quantity</div>
                        <Input
                          type="number"
                          value={costListForm.min_quantity}
                          onChange={(e) => setCostListForm({ ...costListForm, min_quantity: e.target.value })}
                          placeholder="1"
                          min="1"
                          className="h-9 text-sm border rounded-md px-2"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                      <div>
                        <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Begin Date</div>
                        <Input
                          type="date"
                          value={costListForm.begin_date}
                          onChange={(e) => setCostListForm({ ...costListForm, begin_date: e.target.value })}
                          className="h-9 text-sm border rounded-md px-2"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className={primaryBtnClass}
                        style={primaryBtnStyle}
                        disabled={!costListForm.unit_cost || createCostList.isPending}
                        onClick={async () => {
                          await createCostList.mutateAsync({
                            vendor: costListPrompt.vendorRecordId,
                            item: itemId,
                            begin_date: costListForm.begin_date,
                            lines: [{ min_quantity: parseInt(costListForm.min_quantity, 10) || 1, unit_cost: costListForm.unit_cost }],
                          })
                          setCostListPrompt(null)
                        }}
                      >
                        {createCostList.isPending ? 'Creating...' : 'Create Cost List'}
                      </button>
                      <button
                        className={outlineBtnClass}
                        style={outlineBtnStyle}
                        onClick={() => setCostListPrompt(null)}
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                )}

                {vendors && vendors.length > 0 ? (
                  <div className="overflow-x-auto -mx-6" style={{ marginBottom: '-20px' }}>
                    <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Vendor', 'MPN', 'Lead Time', 'Min Order', 'Cost List', 'Preferred'].map((h) => (
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
                        {vendors.map((v: ItemVendor) => {
                          const vendorCostList = costLists.find(cl => cl.vendor === v.vendor_record_id)
                          return (
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
                                {vendorCostList ? (
                                  <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
                                    style={{ background: 'var(--so-success-bg)', border: '1px solid transparent', color: 'var(--so-success-text)' }}
                                  >
                                    Active
                                  </span>
                                ) : v.vendor_record_id ? (
                                  <button
                                    className="text-[12px] font-medium cursor-pointer transition-colors"
                                    style={{ color: 'var(--so-accent)', background: 'none', border: 'none' }}
                                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                                    onClick={() => {
                                      setCostListForm({ unit_cost: '', min_quantity: '1', begin_date: new Date().toISOString().split('T')[0] })
                                      setCostListPrompt({ vendorRecordId: v.vendor_record_id!, vendorName: v.vendor_name })
                                    }}
                                  >
                                    + Add Cost
                                  </button>
                                ) : (
                                  <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>-</span>
                                )}
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
                                  : (
                                    <button
                                      className="text-[12px] font-medium cursor-pointer transition-colors"
                                      style={{ color: 'var(--so-accent)', background: 'none', border: 'none' }}
                                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                                      onClick={() => setPreferredVendor.mutate({ itemId, vendorLinkId: v.id })}
                                      disabled={setPreferredVendor.isPending}
                                    >
                                      Set as Preferred
                                    </button>
                                  )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : !addVendorOpen ? (
                  <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                    No vendors linked to this item
                  </div>
                ) : null}
              </div>
            )}

          </div>
        </div>
        )}

      </div>

      {/* Print-only product card — rendered outside data-print-hide wrapper */}
      {activeTab === 'product-card' && <ProductCardTab itemId={itemId} printOnly />}
    </div>
  )
}
