import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Paperclip, Clock, FileText, Send, ArrowRightLeft,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRFQ, useUpdateRFQ, useConvertRFQ, useSendRFQ } from '@/api/rfqs'
import { useAttachments } from '@/api/attachments'
import FileUpload from '@/components/common/FileUpload'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import PrintForm from '@/components/common/PrintForm'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import type { RFQStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'

const RFQ_STATUSES = [
  { value: 'draft',     label: 'Draft' },
  { value: 'sent',      label: 'Sent' },
  { value: 'received',  label: 'Received' },
  { value: 'converted', label: 'Converted' },
  { value: 'cancelled', label: 'Cancelled' },
]

/* ── Status badge helper ─────────────────────────────── */
const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    sent:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)'    },
    received:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    converted: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)'    },
    cancelled: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)'  },
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

/* ═══════════════════════════════════════════════════════ */
export default function RFQDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const rfqId = parseInt(id || '0', 10)

  const { data: rfq, isLoading } = useRFQ(rfqId)
  const updateRFQ = useUpdateRFQ()
  const convertRFQ = useConvertRFQ()
  const sendRFQ = useSendRFQ()

  const [isEditing, setIsEditing] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const { data: attachments } = useAttachments('purchasing', 'rfq', rfqId)
  const attachmentCount = attachments?.length ?? 0

  const [formData, setFormData] = useState({
    status: 'draft' as RFQStatus,
    expected_date: '',
    notes: '',
  })

  usePageTitle(rfq ? `RFQ ${rfq.rfq_number}` : 'RFQ')

  useEffect(() => {
    if (isEditing && rfq) {
      setFormData({
        status: rfq.status,
        expected_date: rfq.expected_date || '',
        notes: rfq.notes,
      })
    }
  }, [isEditing, rfq])

  const handleSave = async () => {
    if (!rfq) return
    const payload = {
      id: rfq.id,
      status: formData.status,
      expected_date: formData.expected_date || null,
      notes: formData.notes,
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
      toast.error(e?.response?.data?.error || 'Failed to send RFQ')
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
      toast.error(e?.response?.data?.error || 'Failed to convert RFQ')
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({
      status: 'draft' as RFQStatus,
      expected_date: '',
      notes: '',
    })
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

  if (!rfq) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
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
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* ── Breadcrumb ─────────────────────────── */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/purchasing/rfqs')}
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
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
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
          <div className="flex items-center gap-2 shrink-0">
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
                  <button
                    className={outlineBtnClass}
                    style={outlineBtnStyle}
                    onClick={() => setConvertDialogOpen(true)}
                    disabled={convertRFQ.isPending}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Convert to PO
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
          <div className="grid grid-cols-4">
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

          {/* Read-only table */}
          {rfq.lines && rfq.lines.length > 0 ? (
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
    </div>
  )
}
