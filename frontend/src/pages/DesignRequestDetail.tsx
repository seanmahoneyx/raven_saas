import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Pencil, Save, X, Printer, Rocket,
  CheckCircle, XCircle, Clock, Loader2, Check,
  Paperclip, Upload, Trash2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  useDesignRequest, useUpdateDesignRequest, usePromoteDesign,
  useDesignRequestAttachments, useUploadDesignRequestAttachment, useDeleteDesignRequestAttachment,
  useCreateEstimateFromDesign,
} from '@/api/design'
import { useCustomers } from '@/api/parties'
import { useUnitsOfMeasure } from '@/api/items'
import type { DesignRequestStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

const statusLabels: Record<DesignRequestStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
}

const statusIcons: Record<DesignRequestStatus, React.ElementType> = {
  pending: Clock,
  in_progress: Loader2,
  approved: Check,
  rejected: XCircle,
  completed: CheckCircle,
}

const DESIGN_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
]

const STYLES = [
  { value: 'RSC', label: 'RSC' },
  { value: 'DC', label: 'DC' },
  { value: 'HSC', label: 'HSC' },
  { value: 'FOL', label: 'FOL' },
  { value: 'TELE', label: 'TELE' },
  { value: 'OTHER', label: 'Other' },
]

const TESTS = [
  { value: 'ect29', label: 'ECT 29' },
  { value: 'ect32', label: 'ECT 32' },
  { value: 'ect40', label: 'ECT 40' },
  { value: 'ect44', label: 'ECT 44' },
  { value: 'ect48', label: 'ECT 48' },
  { value: 'ect51', label: 'ECT 51' },
  { value: 'ect55', label: 'ECT 55' },
  { value: 'ect112', label: 'ECT 112' },
  { value: '200t', label: '200T' },
]

const FLUTES = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
  { value: 'e', label: 'E' },
  { value: 'f', label: 'F' },
  { value: 'bc', label: 'BC' },
  { value: 'eb', label: 'EB' },
  { value: 'tw', label: 'TW' },
]

const PAPERS = [
  { value: 'k', label: 'Kraft' },
  { value: 'mw', label: 'Mottled White' },
]

// Checklist items configuration
const CHECKLIST_ITEMS = [
  { key: 'has_ard' as const, label: 'ARD', description: 'Artwork Release Document' },
  { key: 'has_pdf' as const, label: 'PDF', description: 'PDF proof file' },
  { key: 'has_eps' as const, label: 'EPS', description: 'EPS vector file' },
  { key: 'has_dxf' as const, label: 'DXF', description: 'DXF CAD drawing' },
  { key: 'has_samples' as const, label: 'Samples', description: 'Physical samples produced' },
  { key: 'pallet_configuration' as const, label: 'Pallet Config', description: 'Pallet layout configured' },
]

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    pending:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    in_progress: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    approved:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    rejected:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    completed:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  }
  const c = configs[status] || configs.pending
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {statusLabels[status as DesignRequestStatus] || status}
    </span>
  )
}

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }
const dangerBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const dangerBtnStyle: React.CSSProperties = { border: '1px solid var(--so-danger-text)', background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }

interface FormData {
  ident: string
  style: string
  status: DesignRequestStatus
  customer: string
  length: string
  width: string
  depth: string
  test: string
  flute: string
  paper: string
  sample_quantity: string
  notes: string
}

export default function DesignRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const designRequestId = parseInt(id || '0', 10)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: designRequest, isLoading } = useDesignRequest(designRequestId)
  const updateDesignRequest = useUpdateDesignRequest()
  const { data: attachments } = useDesignRequestAttachments(designRequestId)
  const uploadAttachment = useUploadDesignRequestAttachment()
  const deleteAttachment = useDeleteDesignRequestAttachment()
  const { data: customersData } = useCustomers()

  const [isEditing, setIsEditing] = useState(false)
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false)
  const [createEstimateDialogOpen, setCreateEstimateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState<number | null>(null)
  const [formData, setFormData] = useState<FormData>({
    ident: '',
    style: '',
    status: 'pending',
    customer: '',
    length: '',
    width: '',
    depth: '',
    test: '',
    flute: '',
    paper: '',
    sample_quantity: '',
    notes: '',
  })

  usePageTitle(designRequest ? `Design ${designRequest.file_number}` : 'Design Request')

  useEffect(() => {
    if (isEditing && designRequest) {
      setFormData({
        ident: designRequest.ident || '',
        style: designRequest.style || '',
        status: designRequest.status,
        customer: designRequest.customer ? String(designRequest.customer) : '',
        length: designRequest.length || '',
        width: designRequest.width || '',
        depth: designRequest.depth || '',
        test: designRequest.test || '',
        flute: designRequest.flute || '',
        paper: designRequest.paper || '',
        sample_quantity: designRequest.sample_quantity ? String(designRequest.sample_quantity) : '',
        notes: designRequest.notes || '',
      })
    }
  }, [isEditing, designRequest])

  const customers = customersData?.results ?? []

  const handleSave = async () => {
    if (!designRequest) return
    try {
      await updateDesignRequest.mutateAsync({
        id: designRequest.id,
        ident: formData.ident,
        style: formData.style,
        status: formData.status,
        customer: formData.customer ? Number(formData.customer) : null,
        length: formData.length || null,
        width: formData.width || null,
        depth: formData.depth || null,
        test: formData.test || '',
        flute: formData.flute || '',
        paper: formData.paper || '',
        sample_quantity: formData.sample_quantity ? Number(formData.sample_quantity) : null,
        notes: formData.notes,
      } as any)
      setIsEditing(false)
      toast.success('Design request updated successfully')
    } catch (error) {
      console.error('Failed to save design request:', error)
      toast.error('Failed to save design request')
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
  }

  // LIVE checkbox toggle - saves immediately without edit mode
  const handleCheckboxToggle = async (field: string, currentValue: boolean) => {
    if (!designRequest) return
    try {
      await updateDesignRequest.mutateAsync({
        id: designRequest.id,
        [field]: !currentValue,
      } as any)
      toast.success('Checklist updated')
    } catch (error) {
      console.error('Failed to toggle checkbox:', error)
      toast.error('Failed to update checklist')
    }
  }

  const handleConfirmDeleteAttachment = async () => {
    if (!pendingDeleteAttachmentId) return
    try {
      await deleteAttachment.mutateAsync({ designRequestId, attachmentId: pendingDeleteAttachmentId })
      toast.success('Attachment deleted successfully')
      setDeleteDialogOpen(false)
      setPendingDeleteAttachmentId(null)
    } catch (error) {
      toast.error('Failed to delete attachment')
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadAttachment.mutate({ designRequestId, file })
      e.target.value = ''
    }
  }

  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
          <div className="text-center py-8 text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!designRequest) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
          <div className="text-center py-8 text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>Design request not found</div>
        </div>
      </div>
    )
  }

  const checklistDone = CHECKLIST_ITEMS.filter((item) => designRequest[item.key]).length

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/design-requests')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />Design Requests
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium font-mono" style={{ color: 'var(--so-text-secondary)' }}>{designRequest.file_number}</span>
        </div>

        {/* Title Row */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono" style={{ letterSpacing: '-0.03em' }}>{designRequest.file_number}</h1>
              {isEditing ? (
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as DesignRequestStatus })}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESIGN_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                getStatusBadge(designRequest.status)
              )}
              {designRequest.generated_item_sku && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold font-mono"
                  style={{ background: 'var(--so-success-bg)', color: 'var(--so-success-text)', border: '1px solid transparent' }}
                >
                  <CheckCircle className="h-3 w-3" />Item: {designRequest.generated_item_sku}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              {designRequest.customer_name ? (
                <button
                  onClick={() => navigate(`/customers/${designRequest.customer}`)}
                  className="transition-colors cursor-pointer hover:underline"
                  style={{ color: 'var(--so-text-secondary)' }}
                >
                  {designRequest.customer_name}
                </button>
              ) : (
                <span style={{ color: 'var(--so-text-tertiary)' }}>No customer assigned</span>
              )}
              {designRequest.ident && (
                <>
                  <span style={{ color: 'var(--so-border)' }}>•</span>
                  <span>{designRequest.ident}</span>
                </>
              )}
              {designRequest.assigned_to_name && (
                <>
                  <span style={{ color: 'var(--so-border)' }}>•</span>
                  <span>Assigned to {designRequest.assigned_to_name}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0" data-print-hide>
            {isEditing ? (
              <>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleCancel}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
                <button
                  className={primaryBtnClass}
                  style={updateDesignRequest.isPending ? { ...primaryBtnStyle, opacity: 0.6 } : primaryBtnStyle}
                  onClick={handleSave}
                  disabled={updateDesignRequest.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  {updateDesignRequest.isPending ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setIsEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {designRequest.status === 'approved' && !designRequest.generated_item && (
                  <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => setPromoteDialogOpen(true)}>
                    <Rocket className="h-3.5 w-3.5" /> Promote to Item
                  </button>
                )}
                {(designRequest.status === 'completed' || designRequest.status === 'approved') && designRequest.generated_item && (
                  <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => setCreateEstimateDialogOpen(true)}>
                    <Rocket className="h-3.5 w-3.5" /> Create Estimate
                  </button>
                )}
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
              </>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* LEFT: Request Details (2 cols wide) */}
          <div className="lg:col-span-2">

            {/* Request Information Card */}
            <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2"
              style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Request Information</span>
              </div>
              <div className="px-6 py-5">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Identifier</Label>
                        <Input
                          value={formData.ident}
                          onChange={(e) => setFormData({ ...formData, ident: e.target.value })}
                          placeholder="Design identifier"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Style</Label>
                        <Select
                          value={formData.style}
                          onValueChange={(value) => setFormData({ ...formData, style: value })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select style..." /></SelectTrigger>
                          <SelectContent>
                            {STYLES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Customer</Label>
                        <Select
                          value={formData.customer}
                          onValueChange={(value) => setFormData({ ...formData, customer: value })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                          <SelectContent>
                            {customers.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.party_code} - {c.party_display_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Sample Quantity</Label>
                      <Input
                        type="number"
                        min="0"
                        className="max-w-[200px]"
                        value={formData.sample_quantity}
                        onChange={(e) => setFormData({ ...formData, sample_quantity: e.target.value })}
                        placeholder="Sample qty"
                        style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-x-8 gap-y-0 md:grid-cols-2">
                    <div className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Identifier</span>
                      <span className="font-medium text-sm">{designRequest.ident || '\u2014'}</span>
                    </div>
                    <div className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Style</span>
                      <span className="font-medium text-sm">{designRequest.style || '\u2014'}</span>
                    </div>
                    <div className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Customer</span>
                      <span className="font-medium text-sm">
                        {designRequest.customer_name ? (
                          <button
                            onClick={() => navigate(`/customers/${designRequest.customer}`)}
                            className="hover:underline cursor-pointer"
                          >
                            {designRequest.customer_name}
                          </button>
                        ) : '\u2014'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Sample Qty</span>
                      <span className="font-mono text-sm">{designRequest.sample_quantity ?? '\u2014'}</span>
                    </div>
                    {designRequest.requested_by_name && (
                      <div className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                        <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Requested By</span>
                        <span className="font-medium text-sm">{designRequest.requested_by_name}</span>
                      </div>
                    )}
                    {designRequest.assigned_to_name && (
                      <div className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                        <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Assigned To</span>
                        <span className="font-medium text-sm">{designRequest.assigned_to_name}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Specifications Card */}
            <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-3"
              style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Specifications</span>
              </div>
              <div className="px-6 py-5">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Length</Label>
                        <Input
                          type="number" step="0.01"
                          value={formData.length}
                          onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                          placeholder="Length"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Width</Label>
                        <Input
                          type="number" step="0.01"
                          value={formData.width}
                          onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                          placeholder="Width"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Depth</Label>
                        <Input
                          type="number" step="0.01"
                          value={formData.depth}
                          onChange={(e) => setFormData({ ...formData, depth: e.target.value })}
                          placeholder="Depth"
                          style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Test</Label>
                        <Select value={formData.test} onValueChange={(v) => setFormData({ ...formData, test: v })}>
                          <SelectTrigger><SelectValue placeholder="Select test..." /></SelectTrigger>
                          <SelectContent>
                            {TESTS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Flute</Label>
                        <Select value={formData.flute} onValueChange={(v) => setFormData({ ...formData, flute: v })}>
                          <SelectTrigger><SelectValue placeholder="Select flute..." /></SelectTrigger>
                          <SelectContent>
                            {FLUTES.map((f) => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Paper</Label>
                        <Select value={formData.paper} onValueChange={(v) => setFormData({ ...formData, paper: v })}>
                          <SelectTrigger><SelectValue placeholder="Select paper..." /></SelectTrigger>
                          <SelectContent>
                            {PAPERS.map((p) => (
                              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-x-8 gap-y-0 md:grid-cols-2">
                    <div className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Dimensions (L x W x D)</span>
                      <span className="font-mono text-sm">
                        {[designRequest.length, designRequest.width, designRequest.depth].filter(Boolean).join(' x ') || '\u2014'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Test</span>
                      <span className="text-sm">{designRequest.test ? designRequest.test.toUpperCase() : '\u2014'}</span>
                    </div>
                    <div className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Flute</span>
                      <span className="text-sm">{designRequest.flute ? designRequest.flute.toUpperCase() : '\u2014'}</span>
                    </div>
                    <div className="flex justify-between py-2.5" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <span className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Paper</span>
                      <span className="text-sm">{designRequest.paper === 'k' ? 'Kraft' : designRequest.paper === 'mw' ? 'Mottled White' : '\u2014'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes Card */}
            <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-3"
              style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Notes</span>
              </div>
              <div className="px-6 py-5">
                {isEditing ? (
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Design notes, special instructions..."
                    rows={4}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--so-text-secondary)' }}>
                    {designRequest.notes || 'No notes added.'}
                  </p>
                )}
              </div>
            </div>

            {/* Timestamps footer */}
            <div className="flex gap-6 text-xs px-1" style={{ color: 'var(--so-text-tertiary)' }}>
              <span>Created {format(new Date(designRequest.created_at), 'MMM d, yyyy h:mm a')}</span>
              <span>Updated {format(new Date(designRequest.updated_at), 'MMM d, yyyy h:mm a')}</span>
            </div>
          </div>

          {/* RIGHT: Checklist + Attachments (1 col wide) */}
          <div>

            {/* Design Checklist Card */}
            <div className="rounded-[14px] border overflow-hidden animate-in delay-2"
              style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Design Checklist</span>
                  <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>{checklistDone}/{CHECKLIST_ITEMS.length}</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden mt-2" style={{ background: 'var(--so-border-light)' }}>
                  <div
                    className="h-full transition-all rounded-full"
                    style={{
                      width: `${(checklistDone / CHECKLIST_ITEMS.length) * 100}%`,
                      background: checklistDone === CHECKLIST_ITEMS.length ? 'var(--so-success-text)' : 'var(--so-accent)',
                    }}
                  />
                </div>
              </div>
              <div className="px-4 py-3">
                {CHECKLIST_ITEMS.map((item) => {
                  const isChecked = designRequest[item.key]
                  return (
                    <label
                      key={item.key}
                      className="flex items-center gap-3 px-2 py-2.5 rounded-md transition-colors cursor-pointer"
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleCheckboxToggle(item.key, isChecked)}
                        disabled={updateDesignRequest.isPending}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-[13px] font-medium ${isChecked ? 'line-through' : ''}`}
                          style={{ color: isChecked ? 'var(--so-text-tertiary)' : 'var(--so-text-primary)' }}
                        >
                          {item.label}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>{item.description}</div>
                      </div>
                      {isChecked && <CheckCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--so-success-text)' }} />}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Attachments Card */}
            <div className="rounded-[14px] border overflow-hidden mt-4 animate-in delay-3"
              style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold flex items-center gap-2">
                  <Paperclip className="h-3.5 w-3.5" />Attachments
                  {attachments && attachments.length > 0 && (
                    <span className="text-[12px] font-normal" style={{ color: 'var(--so-text-tertiary)' }}>({attachments.length})</span>
                  )}
                </span>
              </div>
              <div className="px-4 py-4">
                {/* Upload Area */}
                <div data-print-hide className="mb-3">
                  <label
                    className="flex flex-col items-center justify-center w-full py-5 rounded-xl cursor-pointer transition-colors"
                    style={{ border: '2px dashed var(--so-border)', color: 'var(--so-text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Upload className="h-5 w-5 mb-1 opacity-40" />
                    <p className="text-[12px]"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>

                {/* File List */}
                <div className="space-y-2">
                  {attachments && attachments.length > 0 ? (
                    attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px]"
                        style={{ border: '1px solid var(--so-border-light)' }}
                      >
                        <Paperclip className="h-3 w-3 shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />
                        <div className="flex-1 min-w-0">
                          <a
                            href={att.file_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium hover:underline truncate block"
                            style={{ color: 'var(--so-text-primary)' }}
                          >
                            {att.filename}
                          </a>
                          <p className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
                            {(att.file_size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <button
                          className="h-7 w-7 inline-flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
                          data-print-hide
                          style={{ color: 'var(--so-danger-text)' }}
                          onClick={() => {
                            setPendingDeleteAttachmentId(att.id)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
                      No attachments yet
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Promote Dialog */}
        <PromoteDialog
          open={promoteDialogOpen}
          onOpenChange={setPromoteDialogOpen}
          designRequestId={designRequest.id}
          fileNumber={designRequest.file_number}
          ident={designRequest.ident}
        />

        {/* Create Estimate Dialog */}
        <CreateEstimateDialog
          open={createEstimateDialogOpen}
          onOpenChange={setCreateEstimateDialogOpen}
          designRequestId={designRequest.id}
          fileNumber={designRequest.file_number}
        />

        <ConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Delete Attachment"
          description="Are you sure you want to delete this attachment? This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={handleConfirmDeleteAttachment}
          loading={deleteAttachment.isPending}
        />
      </div>
    </div>
  )
}

// PromoteDialog sub-component
function PromoteDialog({
  open,
  onOpenChange,
  designRequestId,
  fileNumber,
  ident,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  designRequestId: number
  fileNumber: string
  ident: string
}) {
  const [sku, setSku] = useState('')
  const [uom, setUom] = useState('')
  const promoteMutation = usePromoteDesign()
  const { data: uomsData } = useUnitsOfMeasure()
  const uoms = uomsData?.results ?? []

  useEffect(() => {
    if (open) {
      setSku('')
      setUom('')
    }
  }, [open])

  const handlePromote = async () => {
    if (!sku || !uom) return
    try {
      await promoteMutation.mutateAsync({
        id: designRequestId,
        sku,
        base_uom: Number(uom),
      })
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to promote design:', err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Promote to Item</DialogTitle>
        </DialogHeader>
        <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
          Promote <strong>{fileNumber}</strong> ({ident || 'Untitled'}) to an item in the catalog.
        </p>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="promote-sku">MSPN (required)</Label>
            <Input
              id="promote-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Enter item MSPN"
              style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
            />
          </div>
          <div className="space-y-2">
            <Label>Base UOM (required)</Label>
            <Select value={uom} onValueChange={setUom}>
              <SelectTrigger><SelectValue placeholder="Select UOM" /></SelectTrigger>
              <SelectContent>
                {uoms.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.code} - {u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className={primaryBtnClass}
            style={!sku || !uom || promoteMutation.isPending ? { ...primaryBtnStyle, opacity: 0.6 } : primaryBtnStyle}
            onClick={handlePromote}
            disabled={!sku || !uom || promoteMutation.isPending}
          >
            {promoteMutation.isPending ? 'Promoting...' : 'Promote'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// CreateEstimateDialog sub-component
function CreateEstimateDialog({
  open,
  onOpenChange,
  designRequestId,
  fileNumber,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  designRequestId: number
  fileNumber: string
}) {
  const navigate = useNavigate()
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [notes, setNotes] = useState('')
  const createEstimateMutation = useCreateEstimateFromDesign()

  useEffect(() => {
    if (open) {
      setQuantity('1')
      setUnitPrice('')
      setNotes('')
    }
  }, [open])

  const handleCreate = async () => {
    try {
      const result = await createEstimateMutation.mutateAsync({
        id: designRequestId,
        quantity: quantity ? Number(quantity) : 1,
        unit_price: unitPrice || undefined,
        notes: notes || undefined,
      })
      toast.success(`Estimate ${result.estimate_number} created successfully`)
      onOpenChange(false)
      navigate(`/estimates/${result.id}`)
    } catch (err: any) {
      console.error('Failed to create estimate:', err)
      toast.error(err?.response?.data?.error || 'Failed to create estimate')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Estimate</DialogTitle>
        </DialogHeader>
        <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
          Create an estimate from design <strong>{fileNumber}</strong>.
        </p>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="estimate-quantity">Quantity</Label>
            <Input
              id="estimate-quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
              style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="estimate-unit-price">Unit Price (optional)</Label>
            <Input
              id="estimate-unit-price"
              type="number"
              step="0.01"
              min="0"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
              style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="estimate-notes">Notes (optional)</Label>
            <Textarea
              id="estimate-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for the estimate..."
              rows={3}
              style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
            />
          </div>
        </div>
        <DialogFooter>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className={primaryBtnClass}
            style={createEstimateMutation.isPending ? { ...primaryBtnStyle, opacity: 0.6 } : primaryBtnStyle}
            onClick={handleCreate}
            disabled={createEstimateMutation.isPending}
          >
            {createEstimateMutation.isPending ? 'Creating...' : 'Create Estimate'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
