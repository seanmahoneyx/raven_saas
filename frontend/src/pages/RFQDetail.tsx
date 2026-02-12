import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Pencil, Calendar, MapPin, Hash, Clock,
  Printer, Save, X, Send, ArrowRightLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { useRFQ, useUpdateRFQ, useConvertRFQ, useSendRFQ } from '@/api/rfqs'
import type { RFQStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

const statusVariant: Record<RFQStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success'> = {
  draft: 'secondary',
  sent: 'default',
  received: 'success',
  converted: 'outline',
  cancelled: 'destructive',
}

const RFQ_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
  { value: 'converted', label: 'Converted' },
  { value: 'cancelled', label: 'Cancelled' },
]

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
      await updateRFQ.mutateAsync(payload as any)
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
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to send RFQ')
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
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to convert RFQ')
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

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!rfq) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">RFQ not found</div>
      </div>
    )
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not set'
    return format(new Date(dateStr), 'MMM d, yyyy')
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold">{rfq.rfq_number}</h1>
            {isEditing ? (
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as RFQStatus })}
              >
                <SelectTrigger className="w-[140px]">
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
              <Badge variant={statusVariant[rfq.status]}>
                {rfq.status.charAt(0).toUpperCase() + rfq.status.slice(1)}
              </Badge>
            )}
          </div>
          <button
            onClick={() => navigate(`/vendors/${rfq.vendor}`)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {rfq.vendor_name}
          </button>
        </div>
        <div className="flex gap-2" data-print-hide>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateRFQ.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateRFQ.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              {rfq.status === 'draft' && (
                <Button
                  variant="default"
                  onClick={handleSend}
                  disabled={sendRFQ.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendRFQ.isPending ? 'Sending...' : 'Send'}
                </Button>
              )}
              {(rfq.status === 'sent' || rfq.status === 'received') && rfq.is_convertible && (
                <Button
                  variant="default"
                  onClick={() => setConvertDialogOpen(true)}
                  disabled={convertRFQ.isPending}
                >
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Convert to PO
                </Button>
              )}
              {rfq.is_editable && (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
              )}
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Print
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(rfq.date)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expected Date</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(rfq.expected_date)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Line Count</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rfq.num_lines}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rfq.status.charAt(0).toUpperCase() + rfq.status.slice(1)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details Section */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="space-y-2">
                <Label>Expected Date</Label>
                <Input
                  type="date"
                  value={formData.expected_date}
                  onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="RFQ notes..."
                  rows={3}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rfq.ship_to_name && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium mb-1">
                      <MapPin className="h-4 w-4" />
                      Ship To
                    </div>
                    <div className="text-sm text-muted-foreground">{rfq.ship_to_name}</div>
                  </div>
                )}
              </div>

              {rfq.notes && (
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium mb-1">
                    Notes
                  </div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">{rfq.notes}</div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          {!rfq.lines || rfq.lines.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No line items</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-medium">Line</th>
                    <th className="text-left p-3 font-medium">Item</th>
                    <th className="text-right p-3 font-medium">Qty</th>
                    <th className="text-left p-3 font-medium">UOM</th>
                    <th className="text-right p-3 font-medium">Target Price</th>
                    <th className="text-right p-3 font-medium">Quoted Price</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.lines.map((line) => (
                    <tr key={line.id} className="border-b border-border last:border-0">
                      <td className="p-3">{line.line_number}</td>
                      <td className="p-3">
                        <div>
                          <div className="font-medium">{line.item_sku}</div>
                          <div className="text-sm text-muted-foreground">{line.item_name}</div>
                        </div>
                      </td>
                      <td className="p-3 text-right">{line.quantity}</td>
                      <td className="p-3">{line.uom_code}</td>
                      <td className="p-3 text-right">
                        {line.target_price ? `$${parseFloat(line.target_price).toFixed(2)}` : '-'}
                      </td>
                      <td className="p-3 text-right">
                        {line.quoted_price ? `$${parseFloat(line.quoted_price).toFixed(2)}` : '-'}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{line.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
