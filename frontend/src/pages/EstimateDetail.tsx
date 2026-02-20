import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Paperclip, Plus, Trash2, Clock,
  ArrowRightLeft, FileText,
} from 'lucide-react'
import FileUpload from '@/components/common/FileUpload'
import { useAttachments } from '@/api/attachments'
import PrintForm from '@/components/common/PrintForm'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useEstimate, useUpdateEstimate, useConvertEstimate } from '@/api/estimates'
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import type { EstimateStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

const ESTIMATE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
]

/* ── Status badge helper ─────────────────────────────── */
const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    sent:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)'    },
    accepted:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    rejected:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)'  },
    converted: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)'    },
  }
  const c = configs[status] || configs.draft
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

/* ── Shared button styles ────────────────────────────── */
const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

interface LineForm {
  id?: number
  item: string
  description: string
  quantity: string
  uom: string
  unit_price: string
  notes: string
}

/* ═══════════════════════════════════════════════════════ */
export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const estimateId = parseInt(id || '0', 10)

  const { data: estimate, isLoading } = useEstimate(estimateId)
  const updateEstimate = useUpdateEstimate()
  const convertEstimate = useConvertEstimate()

  const [isEditing, setIsEditing] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const { data: attachments } = useAttachments('estimates', 'estimate', estimateId)
  const attachmentCount = attachments?.length ?? 0
  const [formData, setFormData] = useState({
    status: 'draft' as EstimateStatus,
    date: '',
    expiration_date: '',
    customer: '',
    ship_to: '',
    bill_to: '',
    customer_po: '',
    notes: '',
    terms_and_conditions: '',
    tax_rate: '0.00',
  })
  const [lines, setLines] = useState<LineForm[]>([])

  usePageTitle(estimate ? `Estimate ${estimate.estimate_number}` : 'Estimate Detail')

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const customers = customersData?.results ?? []
  const locations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  const selectedCustomer = customers.find((c) => String(c.id) === formData.customer)
  const customerLocations = selectedCustomer
    ? locations.filter((l) => l.party === selectedCustomer.party)
    : []

  useEffect(() => {
    if (isEditing && estimate) {
      setFormData({
        status: estimate.status,
        date: estimate.date,
        expiration_date: estimate.expiration_date ?? '',
        customer: String(estimate.customer),
        ship_to: estimate.ship_to ? String(estimate.ship_to) : '',
        bill_to: estimate.bill_to ? String(estimate.bill_to) : '',
        customer_po: estimate.customer_po,
        notes: estimate.notes,
        terms_and_conditions: estimate.terms_and_conditions,
        tax_rate: estimate.tax_rate ?? '0.00',
      })
      setLines(
        (estimate.lines ?? []).map((line) => ({
          id: line.id,
          item: String(line.item),
          description: line.description,
          quantity: String(line.quantity),
          uom: String(line.uom),
          unit_price: line.unit_price,
          notes: line.notes,
        }))
      )
    }
  }, [isEditing, estimate])

  const handleAddLine = () => {
    setLines([
      ...lines,
      { item: '', description: '', quantity: '1', uom: '', unit_price: '0.00', notes: '' },
    ])
  }

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: keyof LineForm, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }

    if (field === 'item' && value) {
      const selectedItem = itemsData?.results.find((i) => String(i.id) === value)
      if (selectedItem) {
        newLines[index].uom = String(selectedItem.base_uom)
        newLines[index].description = selectedItem.sell_desc || selectedItem.name
      }
    }

    setLines(newLines)
  }

  const handleSave = async () => {
    if (!estimate) return
    const payload = {
      id: estimate.id,
      status: formData.status,
      customer: Number(formData.customer),
      date: formData.date,
      expiration_date: formData.expiration_date || null,
      ship_to: formData.ship_to ? Number(formData.ship_to) : null,
      bill_to: formData.bill_to ? Number(formData.bill_to) : null,
      customer_po: formData.customer_po,
      notes: formData.notes,
      terms_and_conditions: formData.terms_and_conditions,
      tax_rate: formData.tax_rate,
      lines: lines.map((line, index) => ({
        ...(line.id ? { id: line.id } : {}),
        line_number: (index + 1) * 10,
        item: Number(line.item),
        description: line.description,
        quantity: Number(line.quantity),
        uom: Number(line.uom),
        unit_price: line.unit_price,
        notes: line.notes,
      })),
    }
    try {
      await updateEstimate.mutateAsync(payload as any)
      setIsEditing(false)
      toast.success('Estimate updated successfully')
    } catch (error) {
      console.error('Failed to save estimate:', error)
      toast.error('Failed to save estimate')
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({
      status: 'draft' as EstimateStatus,
      date: '',
      expiration_date: '',
      customer: '',
      ship_to: '',
      bill_to: '',
      customer_po: '',
      notes: '',
      terms_and_conditions: '',
      tax_rate: '0.00',
    })
    setLines([])
  }

  const handleConfirmConvert = async () => {
    if (!estimate) return
    try {
      await convertEstimate.mutateAsync(estimate.id)
      toast.success('Estimate converted to Sales Order')
      setConvertDialogOpen(false)
    } catch (error) {
      toast.error('Failed to convert estimate')
    }
  }

  /* ── Loading / Not Found ───────────────────────── */
  if (isLoading) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!estimate) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Estimate not found</div>
        </div>
      </div>
    )
  }

  /* ── Helpers ────────────────────────────────────── */
  const fmtCurrency = (val: string | number) => {
    const num = parseFloat(String(val))
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const editSubtotal = lines.reduce((sum, line) => {
    const qty = parseFloat(line.quantity) || 0
    const price = parseFloat(line.unit_price) || 0
    return sum + qty * price
  }, 0)
  const editTaxRate = parseFloat(formData.tax_rate) || 0
  const editTaxAmount = editSubtotal * (editTaxRate / 100)
  const editTotal = editSubtotal + editTaxAmount

  const lineCount = isEditing ? lines.length : (estimate.lines?.length ?? 0)

  /* ── Detail grid data (read-only) ───────────────── */
  const detailItems = isEditing
    ? [
        { label: 'Date', value: formData.date, empty: !formData.date, mono: false, editable: true, editNode: (
          <Input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="h-9 text-sm border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Expiration', value: formData.expiration_date, empty: !formData.expiration_date, mono: false, editable: true, editNode: (
          <Input
            type="date"
            value={formData.expiration_date}
            onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
            className="h-9 text-sm border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Customer PO', value: formData.customer_po || 'Not set', empty: !formData.customer_po, mono: true, editable: true, editNode: (
          <Input
            value={formData.customer_po}
            onChange={(e) => setFormData({ ...formData, customer_po: e.target.value })}
            placeholder="PO reference"
            className="h-9 text-sm font-mono border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Total Amount', value: `$${fmtCurrency(editTotal)}`, empty: false, mono: true, editable: false },
        { label: 'Ship To', value: estimate.ship_to_name || 'Not set', empty: !estimate.ship_to_name, mono: false, editable: true, editNode: (
          <Select
            value={formData.ship_to}
            onValueChange={(value) => setFormData({ ...formData, ship_to: value })}
            disabled={!formData.customer}
          >
            <SelectTrigger className="h-9 text-sm border rounded-md px-2" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
              <SelectValue placeholder="Select location..." />
            </SelectTrigger>
            <SelectContent>
              {customerLocations.map((location) => (
                <SelectItem key={location.id} value={String(location.id)}>
                  {location.code} - {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )},
        { label: 'Bill To', value: estimate.bill_to_name || 'Not set', empty: !estimate.bill_to_name, mono: false, editable: true, editNode: (
          <Select
            value={formData.bill_to}
            onValueChange={(value) => setFormData({ ...formData, bill_to: value })}
            disabled={!formData.customer}
          >
            <SelectTrigger className="h-9 text-sm border rounded-md px-2" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
              <SelectValue placeholder="Same as ship to" />
            </SelectTrigger>
            <SelectContent>
              {customerLocations.map((location) => (
                <SelectItem key={location.id} value={String(location.id)}>
                  {location.code} - {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )},
        { label: 'Tax Rate', value: `${formData.tax_rate}%`, empty: false, mono: true, editable: true, editNode: (
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.tax_rate}
            onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
            className="h-9 text-sm font-mono border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Lines', value: lineCount, empty: false, mono: true, editable: false },
      ]
    : [
        { label: 'Date', value: format(new Date(estimate.date + 'T00:00:00'), 'MMM d, yyyy'), empty: false, mono: false },
        { label: 'Expiration', value: estimate.expiration_date ? format(new Date(estimate.expiration_date + 'T00:00:00'), 'MMM d, yyyy') : 'No expiration', empty: !estimate.expiration_date, mono: false },
        { label: 'Customer PO', value: estimate.customer_po || 'Not set', empty: !estimate.customer_po, mono: true },
        { label: 'Total Amount', value: `$${fmtCurrency(estimate.total_amount)}`, empty: false, mono: true },
        { label: 'Ship To', value: estimate.ship_to_name || 'Not set', empty: !estimate.ship_to_name, mono: false },
        { label: 'Bill To', value: estimate.bill_to_name || 'Not set', empty: !estimate.bill_to_name, mono: false },
        { label: 'Tax Rate', value: `${parseFloat(estimate.tax_rate).toFixed(2)}%`, empty: false, mono: true },
        { label: 'Lines', value: estimate.num_lines, empty: false, mono: true },
      ]

  /* ═══════════════════════════════════════════════ */
  /*  RENDER                                         */
  /* ═══════════════════════════════════════════════ */
  return (
    <div className="so-detail-page" style={{ minHeight: '100vh' }}>
      {/* Print Form (hidden on screen, visible in print) */}
      <PrintForm
        title="Estimate"
        documentNumber={estimate.estimate_number}
        status={estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)}
        fields={[
          { label: 'Customer', value: estimate.customer_name },
          { label: 'Date', value: format(new Date(estimate.date + 'T00:00:00'), 'MMM d, yyyy') },
          { label: 'Customer PO', value: estimate.customer_po || null },
          { label: 'Expiration', value: estimate.expiration_date ? format(new Date(estimate.expiration_date + 'T00:00:00'), 'MMM d, yyyy') : null },
          { label: 'Ship To', value: estimate.ship_to_name },
          { label: 'Total Amount', value: `$${fmtCurrency(estimate.total_amount)}` },
          { label: 'Bill To', value: estimate.bill_to_name || null },
          { label: 'Lines', value: estimate.num_lines },
        ]}
        notes={estimate.notes}
        columns={[
          { header: '#' },
          { header: 'Item' },
          { header: 'Description' },
          { header: 'Qty', align: 'right' },
          { header: 'UOM' },
          { header: 'Unit Price', align: 'right' },
          { header: 'Amount', align: 'right' },
        ]}
        rows={estimate.lines?.map(line => [
          line.line_number,
          `${line.item_sku} - ${line.item_name}`,
          line.description,
          line.quantity,
          line.uom_code,
          `$${fmtCurrency(line.unit_price)}`,
          `$${fmtCurrency(line.amount)}`,
        ]) || []}
        totals={[
          { label: 'Subtotal:', value: `$${fmtCurrency(estimate.subtotal)}` },
          { label: `Tax (${parseFloat(estimate.tax_rate).toFixed(2)}%):`, value: `$${fmtCurrency(estimate.tax_amount)}` },
          { label: 'Total:', value: `$${fmtCurrency(estimate.total_amount)}` },
        ]}
      />

      {/* ── Main content ──────────────────────────── */}
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* ── Breadcrumb ─────────────────────────── */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/estimates')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Estimates
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{estimate.estimate_number}</span>
        </div>

        {/* ── Title row ──────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{estimate.estimate_number}</h1>
              {isEditing ? (
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as EstimateStatus })}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTIMATE_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                getStatusBadge(estimate.status)
              )}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              <strong className="font-semibold" style={{ color: 'var(--so-text-primary)' }}>{estimate.customer_name}</strong>
              {' \u00b7 Created '}
              {format(new Date(estimate.created_at || estimate.date + 'T00:00:00'), 'MMM d, yyyy')}
              {estimate.is_expired && !isEditing && (
                <span className="ml-2 text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: 'var(--so-danger-text)' }}>Expired</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {isEditing ? (
              <>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleCancel}>
                  Cancel
                </button>
                <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleSave} disabled={updateEstimate.isPending}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {updateEstimate.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                {estimate.is_convertible && (
                  <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setConvertDialogOpen(true)}>
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Convert to SO
                  </button>
                )}
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setAttachmentsOpen(true)}>
                  <Paperclip className="h-3.5 w-3.5" />
                  Attach
                  {attachmentCount > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold text-white" style={{ background: 'var(--so-accent)' }}>
                      {attachmentCount}
                    </span>
                  )}
                </button>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => window.print()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Print
                </button>
                {estimate.is_editable && (
                  <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => setIsEditing(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Estimate Details Card ────────────────── */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Estimate Details</span>
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-4" style={{ borderTop: 'none' }}>
            {detailItems.map((item, idx) => (
              <div
                key={idx}
                className="px-5 py-4"
                style={{
                  borderRight: (idx + 1) % 4 !== 0 ? '1px solid var(--so-border-light)' : 'none',
                  borderBottom: idx < 4 ? '1px solid var(--so-border-light)' : 'none',
                }}
              >
                <div
                  className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5"
                  style={{ color: 'var(--so-text-tertiary)' }}
                >
                  {item.label}
                </div>
                {'editable' in item && item.editable && 'editNode' in item ? (
                  (item as { editNode: React.ReactNode }).editNode
                ) : (
                  <div
                    className={`text-sm font-medium ${item.mono ? 'font-mono' : ''}`}
                    style={{
                      color: item.empty ? 'var(--so-text-tertiary)' : 'var(--so-text-primary)',
                      fontStyle: item.empty ? 'italic' : 'normal',
                    }}
                  >
                    {item.value}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Notes section */}
          {isEditing ? (
            <div className="px-5 py-4" style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Notes</div>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Estimate notes..."
                rows={3}
                className="w-full text-sm border rounded-md px-2 py-2 resize-none"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
          ) : estimate.notes ? (
            <div
              className="flex items-start gap-2.5 px-5 py-4"
              style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
            >
              <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--so-text-tertiary)', opacity: 0.6 }} />
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--so-text-secondary)' }}>{estimate.notes}</p>
            </div>
          ) : null}

          {/* Terms & Conditions section */}
          {isEditing ? (
            <div className="px-5 py-4" style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Terms & Conditions</div>
              <textarea
                value={formData.terms_and_conditions}
                onChange={(e) => setFormData({ ...formData, terms_and_conditions: e.target.value })}
                placeholder="Terms and conditions..."
                rows={3}
                className="w-full text-sm border rounded-md px-2 py-2 resize-none"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
          ) : estimate.terms_and_conditions ? (
            <div
              className="flex items-start gap-2.5 px-5 py-4"
              style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
            >
              <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--so-text-tertiary)', opacity: 0.6 }} />
              <div>
                <div className="text-[11px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Terms & Conditions</div>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--so-text-secondary)' }}>{estimate.terms_and_conditions}</p>
              </div>
            </div>
          ) : null}

          {/* Converted order reference */}
          {!isEditing && estimate.converted_order_number && (
            <div
              className="flex items-center gap-2 px-5 py-3"
              style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-accent-light)' }}
            >
              <span
                className="font-mono text-xs px-2 py-0.5 rounded"
                style={{ border: '1px solid var(--so-border)', color: 'var(--so-accent)' }}
              >
                Converted to: {estimate.converted_order_number}
              </span>
            </div>
          )}
        </div>

        {/* ── Line Items Card ────────────────────── */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Line Items</span>
            <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
              {lineCount} {lineCount === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* ── EDIT MODE TABLE ──────────────────── */}
          {isEditing ? (
            lines.length === 0 ? (
              <div className="text-center py-8 px-6 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                No lines. Click "Add Line" below to add items.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {[
                        { label: 'Item', align: 'text-left', cls: 'pl-6 w-[25%]' },
                        { label: 'Description', align: 'text-left', cls: '' },
                        { label: 'Qty', align: 'text-right', cls: 'w-20' },
                        { label: 'UOM', align: 'text-left', cls: 'w-20' },
                        { label: 'Price', align: 'text-right', cls: 'w-24' },
                        { label: 'Amount', align: 'text-right', cls: 'w-28' },
                        { label: '', align: 'text-left', cls: 'pr-6 w-10' },
                      ].map((col, i) => (
                        <th
                          key={col.label || `blank-${i}`}
                          className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 ${col.align} ${col.cls}`}
                          style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const lineAmount = (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                          {/* Item */}
                          <td className="py-1 px-1 pl-6">
                            <Select value={line.item} onValueChange={(v) => handleLineChange(index, 'item', v)}>
                              <SelectTrigger className="h-auto min-h-9 text-[13px] border-0 bg-transparent shadow-none whitespace-normal text-left">
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
                          </td>
                          {/* Description */}
                          <td className="py-1 px-1">
                            <Input
                              value={line.description}
                              onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                              className="h-9 text-[13px] border-0 bg-transparent shadow-none"
                              placeholder="Description..."
                            />
                          </td>
                          {/* Qty */}
                          <td className="py-1 px-1">
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
                              className="h-9 text-right text-[13px] border-0 bg-transparent shadow-none font-mono"
                            />
                          </td>
                          {/* UOM */}
                          <td className="py-1 px-1">
                            <Select value={line.uom} onValueChange={(v) => handleLineChange(index, 'uom', v)}>
                              <SelectTrigger className="h-9 text-[13px] border-0 bg-transparent shadow-none">
                                <SelectValue placeholder="UOM" />
                              </SelectTrigger>
                              <SelectContent>
                                {uoms.map((uom) => (
                                  <SelectItem key={uom.id} value={String(uom.id)}>
                                    {uom.code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          {/* Price */}
                          <td className="py-1 px-1">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={line.unit_price}
                              onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                              className="h-9 text-right text-[13px] border-0 bg-transparent shadow-none font-mono"
                            />
                          </td>
                          {/* Amount */}
                          <td className="py-1 px-4 text-right font-mono text-[13px] font-semibold">
                            ${fmtCurrency(lineAmount)}
                          </td>
                          {/* Delete */}
                          <td className="py-1.5 px-1 pr-6">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(index)}
                              className="h-7 w-7 inline-flex items-center justify-center rounded transition-colors cursor-pointer"
                              style={{ color: 'var(--so-danger-text)' }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={7} className="py-2 px-2 pl-6">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors cursor-pointer"
                          style={{ color: 'var(--so-accent)' }}
                          onClick={handleAddLine}
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Line
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          ) : (
            /* ── READ-ONLY TABLE ─────────────────── */
            estimate.lines && estimate.lines.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {[
                        { label: 'Item', align: 'text-left', width: 'w-[30%]' },
                        { label: 'Description', align: 'text-left', width: '' },
                        { label: 'Qty', align: 'text-right', width: '' },
                        { label: 'UOM', align: 'text-left', width: '' },
                        { label: 'Rate', align: 'text-right', width: '' },
                        { label: 'Amount', align: 'text-right', width: '' },
                      ].map((col) => (
                        <th
                          key={col.label}
                          className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 ${col.align} ${col.width} ${col.label === 'Item' ? 'pl-6' : ''} ${col.label === 'Amount' ? 'pr-6' : ''}`}
                          style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.lines.map((line) => (
                      <tr key={line.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                        {/* Item */}
                        <td className="py-3.5 px-4 pl-6">
                          <div className="font-medium" style={{ color: 'var(--so-text-primary)' }}>{line.item_name}</div>
                          <div className="font-mono text-[12.5px] mt-0.5" style={{ color: 'var(--so-text-secondary)' }}>{line.item_sku}</div>
                        </td>
                        {/* Description */}
                        <td className="py-3.5 px-4" style={{ color: 'var(--so-text-secondary)' }}>
                          {line.description || <span className="italic" style={{ color: 'var(--so-text-tertiary)' }}>{'\u2014'}</span>}
                        </td>
                        {/* Qty */}
                        <td className="py-3.5 px-4 text-right font-mono font-semibold">
                          {line.quantity.toLocaleString()}
                        </td>
                        {/* UOM */}
                        <td className="py-3.5 px-4" style={{ color: 'var(--so-text-secondary)' }}>
                          {line.uom_code}
                        </td>
                        {/* Rate */}
                        <td className="py-3.5 px-4 text-right font-mono" style={{ color: 'var(--so-text-secondary)' }}>
                          ${fmtCurrency(line.unit_price)}
                        </td>
                        {/* Amount */}
                        <td className="py-3.5 px-4 text-right font-mono font-semibold pr-6">
                          ${fmtCurrency(line.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                No line items
              </div>
            )
          )}

          {/* Total row with subtotal/tax/total */}
          {(isEditing ? lines.length > 0 : (estimate.lines?.length ?? 0) > 0) && (
            <div style={{ borderTop: '1px solid var(--so-border-light)' }}>
              {/* Subtotal */}
              <div className="flex items-center justify-end gap-4 px-6 py-2.5">
                <span className="text-[13px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>
                  Subtotal
                </span>
                <span className="font-mono text-sm font-medium w-32 text-right" style={{ color: 'var(--so-text-secondary)' }}>
                  ${fmtCurrency(isEditing ? editSubtotal : estimate.subtotal)}
                </span>
              </div>
              {/* Tax */}
              <div className="flex items-center justify-end gap-4 px-6 py-2.5">
                <span className="text-[13px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>
                  Tax ({isEditing ? parseFloat(formData.tax_rate).toFixed(2) : parseFloat(estimate.tax_rate).toFixed(2)}%)
                </span>
                <span className="font-mono text-sm font-medium w-32 text-right" style={{ color: 'var(--so-text-secondary)' }}>
                  ${fmtCurrency(isEditing ? editTaxAmount : estimate.tax_amount)}
                </span>
              </div>
              {/* Total */}
              <div
                className="flex items-center justify-end gap-4 px-6 py-4"
                style={{ borderTop: '2px solid var(--so-text-primary)' }}
              >
                <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--so-text-secondary)' }}>
                  Total
                </span>
                <span className="font-mono text-xl font-bold w-32 text-right" style={{ color: 'var(--so-text-primary)' }}>
                  ${fmtCurrency(isEditing ? editTotal : estimate.total_amount)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Two-column: Attachments + Activity ── */}
        {!isEditing && (
          <div className="grid grid-cols-2 gap-4 mt-4 animate-in delay-4">
            {/* Attachments Card */}
            <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Attachments</span>
                {attachmentCount > 0 && (
                  <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>{attachmentCount} {attachmentCount === 1 ? 'file' : 'files'}</span>
                )}
              </div>
              <button
                onClick={() => setAttachmentsOpen(true)}
                className="w-full text-center py-8 px-6 transition-colors cursor-pointer"
                style={{ color: 'var(--so-text-tertiary)', fontSize: '13.5px' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Paperclip className="h-7 w-7 mx-auto mb-2 opacity-25" />
                {attachmentCount > 0 ? `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}` : 'No attachments yet'}
              </button>
            </div>

            {/* Activity Card */}
            <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Activity</span>
              </div>
              <div className="text-center py-8 px-6" style={{ color: 'var(--so-text-tertiary)', fontSize: '13.5px' }}>
                <Clock className="h-7 w-7 mx-auto mb-2 opacity-25" />
                No activity recorded
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Attachments Dialog ────────────────────── */}
      <Dialog open={attachmentsOpen} onOpenChange={setAttachmentsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attachments</DialogTitle>
          </DialogHeader>
          <FileUpload appLabel="estimates" modelName="estimate" objectId={estimateId} />
        </DialogContent>
      </Dialog>

      {/* ── Convert Confirm Dialog ────────────────── */}
      <ConfirmDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        title="Convert to Sales Order"
        description="Convert this estimate to a Sales Order? This action cannot be undone."
        confirmLabel="Convert"
        variant="default"
        onConfirm={handleConfirmConvert}
        loading={convertEstimate.isPending}
      />
    </div>
  )
}
