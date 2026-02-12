import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Pencil, Save, X, Printer, Rocket,
  CheckCircle, XCircle, Clock, Loader2, Check,
  Paperclip, Upload, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

const statusColors: Record<DesignRequestStatus, 'default' | 'success' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  in_progress: 'default',
  approved: 'success',
  rejected: 'destructive',
  completed: 'outline',
}

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
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!designRequest) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Design request not found</div>
      </div>
    )
  }

  const StatusIcon = statusIcons[designRequest.status]
  const checklistDone = CHECKLIST_ITEMS.filter((item) => designRequest[item.key]).length

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/design-requests')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold font-mono">{designRequest.file_number}</h1>
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
              <Badge variant={statusColors[designRequest.status]} className="gap-1">
                <StatusIcon className="h-3 w-3" />
                {statusLabels[designRequest.status]}
              </Badge>
            )}
            {designRequest.generated_item_sku && (
              <Badge variant="outline" className="font-mono gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                Item: {designRequest.generated_item_sku}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {designRequest.customer_name ? (
              <button
                onClick={() => navigate(`/customers/${designRequest.customer}`)}
                className="hover:text-foreground transition-colors"
              >
                {designRequest.customer_name}
              </button>
            ) : (
              <span>No customer assigned</span>
            )}
            {designRequest.ident && (
              <>
                <span>•</span>
                <span>{designRequest.ident}</span>
              </>
            )}
            {designRequest.assigned_to_name && (
              <>
                <span>•</span>
                <span>Assigned to {designRequest.assigned_to_name}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2" data-print-hide>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateDesignRequest.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateDesignRequest.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </Button>
              {designRequest.status === 'approved' && !designRequest.generated_item && (
                <Button variant="default" onClick={() => setPromoteDialogOpen(true)}>
                  <Rocket className="h-4 w-4 mr-2" /> Promote to Item
                </Button>
              )}
              {(designRequest.status === 'completed' || designRequest.status === 'approved') && designRequest.generated_item && (
                <Button variant="default" onClick={() => setCreateEstimateDialogOpen(true)}>
                  <Rocket className="h-4 w-4 mr-2" /> Create Estimate
                </Button>
              )}
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Print
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Two-column layout: Form details on left, Checklist + Attachments on right */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT: Request Details (2 cols wide) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Request Info */}
          <Card>
            <CardHeader>
              <CardTitle>Request Information</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Identifier</Label>
                      <Input
                        value={formData.ident}
                        onChange={(e) => setFormData({ ...formData, ident: e.target.value })}
                        placeholder="Design identifier"
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
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Identifier</span>
                    <span className="font-medium">{designRequest.ident || '\u2014'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Style</span>
                    <span className="font-medium">{designRequest.style || '\u2014'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Customer</span>
                    <span className="font-medium">
                      {designRequest.customer_name ? (
                        <button
                          onClick={() => navigate(`/customers/${designRequest.customer}`)}
                          className="hover:underline"
                        >
                          {designRequest.customer_name}
                        </button>
                      ) : '\u2014'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Sample Qty</span>
                    <span className="font-mono">{designRequest.sample_quantity ?? '\u2014'}</span>
                  </div>
                  {designRequest.requested_by_name && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Requested By</span>
                      <span className="font-medium">{designRequest.requested_by_name}</span>
                    </div>
                  )}
                  {designRequest.assigned_to_name && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Assigned To</span>
                      <span className="font-medium">{designRequest.assigned_to_name}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Specifications */}
          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
            </CardHeader>
            <CardContent>
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
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Width</Label>
                      <Input
                        type="number" step="0.01"
                        value={formData.width}
                        onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                        placeholder="Width"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Depth</Label>
                      <Input
                        type="number" step="0.01"
                        value={formData.depth}
                        onChange={(e) => setFormData({ ...formData, depth: e.target.value })}
                        placeholder="Depth"
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
                <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Dimensions (L x W x D)</span>
                    <span className="font-mono">
                      {[designRequest.length, designRequest.width, designRequest.depth].filter(Boolean).join(' x ') || '\u2014'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Test</span>
                    <span>{designRequest.test ? designRequest.test.toUpperCase() : '\u2014'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Flute</span>
                    <span>{designRequest.flute ? designRequest.flute.toUpperCase() : '\u2014'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Paper</span>
                    <span>{designRequest.paper === 'k' ? 'Kraft' : designRequest.paper === 'mw' ? 'Mottled White' : '\u2014'}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Design notes, special instructions..."
                  rows={4}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">
                  {designRequest.notes || 'No notes added.'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Timestamps - small footer */}
          <div className="flex gap-6 text-xs text-muted-foreground px-1">
            <span>Created {format(new Date(designRequest.created_at), 'MMM d, yyyy h:mm a')}</span>
            <span>Updated {format(new Date(designRequest.updated_at), 'MMM d, yyyy h:mm a')}</span>
          </div>
        </div>

        {/* RIGHT: Checklist + Attachments (1 col wide) */}
        <div className="space-y-6">
          {/* Design Checklist - ALWAYS LIVE */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Design Checklist</CardTitle>
                <span className="text-sm text-muted-foreground">{checklistDone}/{CHECKLIST_ITEMS.length}</span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full transition-all ${checklistDone === CHECKLIST_ITEMS.length ? 'bg-green-500' : 'bg-primary'}`}
                  style={{ width: `${(checklistDone / CHECKLIST_ITEMS.length) * 100}%` }}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {CHECKLIST_ITEMS.map((item) => {
                  const isChecked = designRequest[item.key]
                  return (
                    <label
                      key={item.key}
                      className="flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleCheckboxToggle(item.key, isChecked)}
                        disabled={updateDesignRequest.isPending}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                          {item.label}
                        </div>
                        <div className="text-xs text-muted-foreground">{item.description}</div>
                      </div>
                      {isChecked && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                    </label>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Attachments
                {attachments && attachments.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">({attachments.length})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Upload Area */}
              <div data-print-hide className="mb-4">
                <label className="flex flex-col items-center justify-center w-full py-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>

              {/* File List */}
              <div className="space-y-2">
                {attachments && attachments.length > 0 ? (
                  attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2 p-2 border rounded-md text-sm">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <a
                          href={att.file_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline truncate block"
                        >
                          {att.filename}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {(att.file_size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        data-print-hide
                        onClick={() => {
                          setPendingDeleteAttachmentId(att.id)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No attachments yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
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
        <p className="text-sm text-muted-foreground">
          Promote <strong>{fileNumber}</strong> ({ident || 'Untitled'}) to an item in the catalog.
        </p>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="promote-sku">MSPN (required)</Label>
            <Input id="promote-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Enter item MSPN" />
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePromote} disabled={!sku || !uom || promoteMutation.isPending}>
            {promoteMutation.isPending ? 'Promoting...' : 'Promote'}
          </Button>
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
        <p className="text-sm text-muted-foreground">
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
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createEstimateMutation.isPending}>
            {createEstimateMutation.isPending ? 'Creating...' : 'Create Estimate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
