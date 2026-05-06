import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCollaborationPanel } from '@/hooks/useCollaborationPanel'
import { TransactionPanel } from '@/components/collaboration/TransactionPanel'
import { PanelToggleButton } from '@/components/collaboration/PanelToggleButton'
import {
  ArrowLeft, Paperclip, Clock, FileText, Send, ArrowRightLeft, ChevronDown, Plus, Trash2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRFQ, useUpdateRFQ, useConvertRFQ, useSendRFQ, useConvertRFQToPriceList } from '@/api/rfqs'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import { useAttachments } from '@/api/attachments'
import FileUpload from '@/components/common/FileUpload'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import PrintForm from '@/components/common/PrintForm'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import type { RFQStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/errors'
import { getStatusBadge } from '@/components/ui/StatusBadge'

const RFQ_STATUSES = [
  { value: 'draft',     label: 'Draft' },
  { value: 'sent',      label: 'Sent' },
  { value: 'received',  label: 'Received' },
  { value: 'converted', label: 'Converted' },
  { value: 'cancelled', label: 'Cancelled' },
]

import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

/* ═══════════════════════════════════════════════════════ */
export default function RFQDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const rfqId = parseInt(id || '0', 10)
  const { panelOpen, togglePanel, closePanel } = useCollaborationPanel()

  const { data: rfq, isLoading } = useRFQ(rfqId)
  const updateRFQ = useUpdateRFQ()
  const convertRFQ = useConvertRFQ()
  const sendRFQ = useSendRFQ()
  const convertToPriceList = useConvertRFQToPriceList()

  const [isEditing, setIsEditing] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [convertMenuOpen, setConvertMenuOpen] = useState(false)
  const [priceListDialogOpen, setPriceListDialogOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null)
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const { data: attachments } = useAttachments('purchasing', 'rfq', rfqId)
  const attachmentCount = attachments?.length ?? 0

  const [formData, setFormData] = useState({
    status: 'draft' as RFQStatus,
    expected_date: '',
    notes: '',
  })
  const [linesFormData, setLinesFormData] = useState<
    { item: string; item_name: string; item_sku: string; quantity: string; uom: string; uom_code: string; target_price: string; quoted_price: string; notes: string }[]
  >([])

  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  usePageTitle(rfq ? `RFQ ${rfq.rfq_number}` : 'RFQ')

  useEffect(() => {
    if (isEditing && rfq) {
      setFormData({
        status: rfq.status,
        expected_date: rfq.expected_date || '',
        notes: rfq.notes,
      })
      setLinesFormData(
        rfq.lines?.map(line => ({
          item: String(line.item),
          item_name: line.item_name,
          item_sku: line.item_sku,
          quantity: String(line.quantity),
          uom: String(line.uom),
          uom_code: line.uom_code,
          target_price: line.target_price || '',
          quoted_price: line.quoted_price || '',
          notes: line.notes || '',
        })) || []
      )
    }
  }, [isEditing, rfq])

  const handleAddLine = () => {
    setLinesFormData(prev => [...prev, { item: '', item_name: '', item_sku: '', quantity: '1', uom: '', uom_code: '', target_price: '', quoted_price: '', notes: '' }])
  }

  const handleRemoveLine = (index: number) => {
    setLinesFormData(prev => prev.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: string, value: string) => {
    setLinesFormData(prev => prev.map((line, i) =>
      i === index ? { ...line, [field]: value } : line
    ))
  }

  const handleLineItemChange = (index: number, value: string) => {
    const selectedItem = items.find(i => String(i.id) === value)
    const selectedUom = selectedItem ? uoms.find(u => u.id === selectedItem.base_uom) : null
    setLinesFormData(prev => prev.map((line, i) => {
      if (i !== index) return line
      return {
        ...line,
        item: value,
        item_name: selectedItem?.name || '',
        item_sku: selectedItem?.sku || '',
        uom: selectedItem ? String(selectedItem.base_uom) : line.uom,
        uom_code: selectedUom?.code || line.uom_code,
      }
    }))
  }

  const handleSave = async () => {
    if (!rfq) return
    const payload: Record<string, unknown> = {
      id: rfq.id,
      status: formData.status,
      expected_date: formData.expected_date || null,
      notes: formData.notes,
      lines: linesFormData.map((line, idx) => ({
        line_number: (idx + 1) * 10,
        item: Number(line.item),
        quantity: Number(line.quantity),
        uom: Number(line.uom),
        target_price: line.target_price || null,
        quoted_price: line.quoted_price || null,
        notes: line.notes,
      })),
    }
    try {
      await updateRFQ.mutateAsync(payload as Parameters<typeof updateRFQ.mutateAsync>[0])
      setIsEditing(false)
      toast.success('RFQ updated successfully')
    } catch (error) {
      console.error('Failed to save RFQ:', error)
      toast.error('Failed to save RFQ')
    }
  }

  const handleSend = async () => {
    if (!rfq) return
    try {
      await sendRFQ.mutateAsync({ id: rfq.id })
      toast.success('RFQ sent successfully')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(getApiErrorMessage(e, 'Failed to send RFQ'))
    }
  }

  const handleConfirmConvert = async () => {
    if (!rfq) return
    try {
      const result = await convertRFQ.mutateAsync(rfq.id)
      toast.success('RFQ converted to Purchase Order')
      setConvertDialogOpen(false)
      if (result?.purchase_order_id) {
        navigate(`/orders/purchase/${result.purchase_order_id}`)
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(getApiErrorMessage(e, 'Failed to convert RFQ'))
    }
  }

  const handleConvertToPriceList = async () => {
    if (!rfq || !selectedCustomer) return
    try {
      await convertToPriceList.mutateAsync({ id: rfq.id, customer: selectedCustomer })
      setPriceListDialogOpen(false)
      setSelectedCustomer(null)
      toast.success('Price lists created successfully')
    } catch {
      // error toast handled by hook
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({
      status: 'draft' as RFQStatus,
      expected_date: '',
      notes: '',
    })
    setLinesFormData([])
  }

  /* ── Loading / Not Found ───────────────────────── */
  if (isLoading) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!rfq) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>RFQ not found</div>
        </div>
      </div>
    )
  }

  /* ── Helpers ────────────────────────────────────── */
  const fmtPrice = (val: string | null | undefined) => {
    if (!val) return '-'
    const num = parseFloat(val)
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null
    return format(new Date(dateStr + 'T00:00:00'), 'MMM d, yyyy')
  }

  const lineCount = rfq.lines?.length ?? 0

  /* ═══════════════════════════════════════════════ */
  /*  RENDER                                         */
  /* ═══════════════════════════════════════════════ */
  return (
    <div className="so-detail-page" style={{ minHeight: '100vh' }}>
      {/* Print Form (hidden on screen, visible in print) */}
      <PrintForm
        title="Request for Quote"
        documentNumber={rfq.rfq_number}
        status={rfq.status.charAt(0).toUpperCase() + rfq.status.slice(1)}
        fields={[
          { label: 'Vendor',        value: rfq.vendor_name },
          { label: 'Date',          value: formatDate(rfq.date) },
          { label: 'Expected Date', value: formatDate(rfq.expected_date) },
          { label: 'Ship To',       value: rfq.ship_to_name || null },
          { label: 'Lines',         value: rfq.num_lines },
        ]}
        notes={rfq.notes}
        columns={[
          { header: '#' },
          { header: 'Item' },
          { header: 'Qty', align: 'right' },
          { header: 'UOM' },
          { header: 'Target Price', align: 'right' },
          { header: 'Quoted Price', align: 'right' },
          { header: 'Notes' },
        ]}
        rows={rfq.lines?.map(line => [
          line.line_number,
          `${line.item_sku} - ${line.item_name}`,
          line.quantity,
          line.uom_code,
          line.target_price ? `$${fmtPrice(line.target_price)}` : '\u2014',
          line.quoted_price ? `$${fmtPrice(line.quoted_price)}` : '\u2014',
          line.notes || '\u2014',
        ]) || []}
      />

      {/* ── Main content ──────────────────────────── */}
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16" data-print-hide>

        {/* ── Breadcrumb ─────────────────────────── */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/rfqs')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            RFQs
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{rfq.rfq_number}</span>
        </div>

        {/* ── Title row ──────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{rfq.rfq_number}</h1>
              {isEditing ? (
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as RFQStatus })}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RFQ_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                getStatusBadge(rfq.status)
              )}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              <strong className="font-semibold" style={{ color: 'var(--so-text-primary)' }}>{rfq.vendor_name}</strong>
              {rfq.date && (
                <>
                  {' \u00b7 Created '}
                  {format(new Date(rfq.date + 'T00:00:00'), 'MMM d, yyyy')}
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {isEditing ? (
              <>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleCancel}>
                  Cancel
                </button>
                <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleSave} disabled={updateRFQ.isPending}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {updateRFQ.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                {rfq.status === 'draft' && (
                  <button
                    className={outlineBtnClass}
                    style={outlineBtnStyle}
                    onClick={handleSend}
                    disabled={sendRFQ.isPending}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sendRFQ.isPending ? 'Sending...' : 'Send'}
                  </button>
                )}
                {(rfq.status === 'sent' || rfq.status === 'received') && rfq.is_convertible && (
                  <div className="relative">
                    <button
                      className={outlineBtnClass}
                      style={outlineBtnStyle}
                      onClick={() => setConvertMenuOpen(!convertMenuOpen)}
                      onBlur={() => setTimeout(() => setConvertMenuOpen(false), 150)}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Convert
                      <ChevronDown className="h-3 w-3 ml-0.5" />
                    </button>
                    {convertMenuOpen && (
                      <div
                        className="absolute right-0 top-full mt-1 w-56 rounded-lg border shadow-lg z-50 py-1"
                        style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
                      >
                        <button
                          className="w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer flex items-center gap-2"
                          style={{ color: 'var(--so-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          onMouseDown={() => setConvertDialogOpen(true)}
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" style={{ color: 'var(--so-text-tertiary)' }} />
                          Purchase Order
                          <span className="ml-auto text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>From quotes</span>
                        </button>
                        <button
                          className="w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer flex items-center gap-2"
                          style={{ color: 'var(--so-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          onMouseDown={() => setPriceListDialogOpen(true)}
                        >
                          <FileText className="h-3.5 w-3.5" style={{ color: 'var(--so-text-tertiary)' }} />
                          Price List
                          <span className="ml-auto text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Customer pricing</span>
                        </button>
                      </div>
                    )}
                  </div>
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
                {rfq.is_editable && (
                  <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => setIsEditing(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── RFQ Details Card ───────────────────── */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">RFQ Details</span>
          </div>

          {/* Detail grid — 4 columns */}
          <div className="grid grid-cols-2 md:grid-cols-4">
            {/* Col 1: Date */}
            <div
              className="px-5 py-4"
              style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: 'none' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Date</div>
              <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>
                {rfq.date ? format(new Date(rfq.date + 'T00:00:00'), 'MMM d, yyyy') : (
                  <span style={{ color: 'var(--so-text-tertiary)', fontStyle: 'italic' }}>Not set</span>
                )}
              </div>
            </div>

            {/* Col 2: Expected Date */}
            <div
              className="px-5 py-4"
              style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: 'none' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Expected Date</div>
              {isEditing ? (
                <Input
                  type="date"
                  value={formData.expected_date}
                  onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
                  className="h-9 text-sm border rounded-md px-2"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              ) : rfq.expected_date ? (
                <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>
                  {format(new Date(rfq.expected_date + 'T00:00:00'), 'MMM d, yyyy')}
                </div>
              ) : (
                <div className="text-sm font-medium" style={{ color: 'var(--so-text-tertiary)', fontStyle: 'italic' }}>Not set</div>
              )}
            </div>

            {/* Col 3: Ship To */}
            <div
              className="px-5 py-4"
              style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: 'none' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Ship To</div>
              {rfq.ship_to_name ? (
                <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>{rfq.ship_to_name}</div>
              ) : (
                <div className="text-sm font-medium" style={{ color: 'var(--so-text-tertiary)', fontStyle: 'italic' }}>Not set</div>
              )}
            </div>

            {/* Col 4: Lines */}
            <div
              className="px-5 py-4"
              style={{ borderBottom: 'none' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Lines</div>
              <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>{rfq.num_lines}</div>
            </div>
          </div>

          {/* Notes section */}
          {isEditing ? (
            <div className="px-5 py-4" style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Notes</div>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="RFQ notes..."
                className="h-9 text-sm border rounded-md px-2"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
          ) : rfq.notes ? (
            <div
              className="flex items-start gap-2.5 px-5 py-4"
              style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
            >
              <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--so-text-tertiary)', opacity: 0.6 }} />
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--so-text-secondary)' }}>{rfq.notes}</p>
            </div>
          ) : null}
          {/* Converted reference */}
          {!isEditing && rfq.converted_po_number && (
            <div
              className="flex items-center gap-2 px-5 py-3"
              style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-accent-light)' }}
            >
              <span
                className="font-mono text-xs px-2 py-0.5 rounded"
                style={{ border: '1px solid var(--so-border)', color: 'var(--so-accent)' }}
              >
                Converted to PO: {rfq.converted_po_number}
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
              {(isEditing ? linesFormData.length : lineCount)} {(isEditing ? linesFormData.length : lineCount) === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* ── EDIT MODE TABLE ──────────────────── */}
          {isEditing ? (
            linesFormData.length === 0 ? (
              <div className="text-center py-8 px-6 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                No lines. Click "Add Line" below to add items.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {[
                        { label: 'Item', align: 'text-left', cls: 'pl-6 w-[30%]' },
                        { label: 'Qty', align: 'text-right', cls: 'w-20' },
                        { label: 'UOM', align: 'text-left', cls: 'w-20' },
                        { label: 'Target Price', align: 'text-right', cls: 'w-28' },
                        { label: 'Quoted Price', align: 'text-right', cls: 'w-28' },
                        { label: 'Notes', align: 'text-left', cls: '' },
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
                    {linesFormData.map((line, index) => {
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                          {/* Item */}
                          <td className="py-1 px-1 pl-6">
                            {(() => {
                              const currentInList = items.some(i => String(i.id) === line.item)
                              return (
                                <Select value={line.item} onValueChange={(v) => handleLineItemChange(index, v)}>
                                  <SelectTrigger className="h-auto min-h-9 text-[13px] border shadow-none bg-transparent whitespace-normal text-left">
                                    <SelectValue placeholder="Select item..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {!currentInList && line.item && line.item_name && (
                                      <SelectItem key={line.item} value={line.item}>
                                        {line.item_sku} - {line.item_name}
                                      </SelectItem>
                                    )}
                                    {items.map((item) => (
                                      <SelectItem key={item.id} value={String(item.id)}>
                                        {item.sku} - {item.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )
                            })()}
                          </td>
                          {/* Qty */}
                          <td className="py-1 px-1">
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
                              className="h-9 text-right text-[13px] border shadow-none font-mono"
                            />
                          </td>
                          {/* UOM */}
                          <td className="py-1 px-1">
                            {(() => {
                              const currentUomInList = uoms.some(u => String(u.id) === line.uom)
                              return (
                                <Select value={line.uom} onValueChange={(v) => handleLineChange(index, 'uom', v)}>
                                  <SelectTrigger className="h-9 text-[13px] border shadow-none bg-transparent">
                                    <SelectValue placeholder="UOM" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {!currentUomInList && line.uom && line.uom_code && (
                                      <SelectItem key={line.uom} value={line.uom}>
                                        {line.uom_code}
                                      </SelectItem>
                                    )}
                                    {uoms.map((uom) => (
                                      <SelectItem key={uom.id} value={String(uom.id)}>
                                        {uom.code}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )
                            })()}
                          </td>
                          {/* Target Price */}
                          <td className="py-1 px-1">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={line.target_price}
                              onChange={(e) => handleLineChange(index, 'target_price', e.target.value)}
                              className="h-9 text-right text-[13px] border shadow-none font-mono"
                              placeholder="0.00"
                            />
                          </td>
                          {/* Quoted Price */}
                          <td className="py-1 px-1">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={line.quoted_price}
                              onChange={(e) => handleLineChange(index, 'quoted_price', e.target.value)}
                              className="h-9 text-right text-[13px] border shadow-none font-mono"
                              placeholder="0.00"
                            />
                          </td>
                          {/* Notes */}
                          <td className="py-1 px-1">
                            <Input
                              value={line.notes}
                              onChange={(e) => handleLineChange(index, 'notes', e.target.value)}
                              className="h-9 text-[13px] border shadow-none"
                              placeholder="Notes..."
                            />
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
            rfq.lines && rfq.lines.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {[
                        { label: 'Item',         cls: 'text-left pl-6 w-[35%]' },
                        { label: 'Qty',          cls: 'text-center' },
                        { label: 'UOM',          cls: 'text-left' },
                        { label: 'Target Price', cls: 'text-right' },
                        { label: 'Quoted Price', cls: 'text-right' },
                        { label: 'Notes',        cls: 'text-left pr-6' },
                      ].map((col) => (
                        <th
                          key={col.label}
                          className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 ${col.cls}`}
                          style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.lines.map((line) => (
                      <tr key={line.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                        {/* Item */}
                        <td className="py-3.5 px-4 pl-6">
                          <div className="font-medium" style={{ color: 'var(--so-text-primary)' }}>{line.item_name}</div>
                          <div className="font-mono text-[12.5px] mt-0.5" style={{ color: 'var(--so-text-secondary)' }}>{line.item_sku}</div>
                        </td>
                        {/* Qty */}
                        <td className="py-3.5 px-4 text-center font-mono font-semibold">
                          {typeof line.quantity === 'number' ? line.quantity.toLocaleString() : line.quantity}
                        </td>
                        {/* UOM */}
                        <td className="py-3.5 px-4" style={{ color: 'var(--so-text-secondary)' }}>
                          {line.uom_code}
                        </td>
                        {/* Target Price */}
                        <td className="py-3.5 px-4 text-right font-mono" style={{ color: 'var(--so-text-secondary)' }}>
                          {line.target_price ? `$${fmtPrice(line.target_price)}` : '-'}
                        </td>
                        {/* Quoted Price */}
                        <td className="py-3.5 px-4 text-right font-mono font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                          {line.quoted_price ? `$${fmtPrice(line.quoted_price)}` : '-'}
                        </td>
                        {/* Notes */}
                        <td className="py-3.5 px-4 pr-6 text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                          {line.notes || '-'}
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
          <FileUpload appLabel="purchasing" modelName="rfq" objectId={rfqId} />
        </DialogContent>
      </Dialog>

      {/* ── Convert Confirm Dialog ────────────────── */}
      <ConfirmDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        title="Convert RFQ to Purchase Order"
        description="Convert this RFQ to a Purchase Order? This will create a new PO with the quoted prices."
        confirmLabel="Convert"
        variant="default"
        onConfirm={handleConfirmConvert}
        loading={convertRFQ.isPending}
      />

      {/* ── Price List Customer Selection Dialog ── */}
      <Dialog open={priceListDialogOpen} onOpenChange={(open) => { setPriceListDialogOpen(open); if (!open) setSelectedCustomer(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Price Lists from RFQ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              This will create customer price lists from the {rfq?.lines?.filter(l => l.quoted_price).length || 0} quoted line items on this RFQ.
            </p>
            <div>
              <label className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--so-text-tertiary)' }}>
                Customer
              </label>
              <SearchableCombobox
                entityType="customer"
                value={selectedCustomer}
                onChange={(id) => setSelectedCustomer(id)}
                placeholder="Select customer..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => { setPriceListDialogOpen(false); setSelectedCustomer(null); }}
              >
                Cancel
              </button>
              <button
                className={primaryBtnClass}
                style={primaryBtnStyle}
                onClick={handleConvertToPriceList}
                disabled={!selectedCustomer || convertToPriceList.isPending}
              >
                {convertToPriceList.isPending ? 'Creating...' : 'Create Price Lists'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PanelToggleButton contentType="rfq" objectId={rfqId} onClick={togglePanel} isOpen={panelOpen} />
      <TransactionPanel contentType="rfq" objectId={rfqId} open={panelOpen} onClose={closePanel} label={rfq ? `RFQ ${rfq.rfq_number}` : 'RFQ'} />
    </div>
  )
}
