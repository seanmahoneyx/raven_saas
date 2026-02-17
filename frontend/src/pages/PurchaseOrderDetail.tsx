import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Pencil, Calendar, MapPin, Package, DollarSign, Hash, Clock,
  Printer, Save, X, Mail,
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
import { usePurchaseOrder, useUpdatePurchaseOrder, useReceivePurchaseOrder } from '@/api/orders'
import type { OrderStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import EmailModal from '@/components/common/EmailModal'

const statusVariant: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  confirmed: 'outline',
  scheduled: 'default',
  picking: 'warning',
  shipped: 'success',
  complete: 'success',
  crossdock: 'warning',
  cancelled: 'destructive',
}

const ORDER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const purchaseOrderId = parseInt(id || '0', 10)

  const { data: order, isLoading } = usePurchaseOrder(purchaseOrderId)
  const updatePurchaseOrder = useUpdatePurchaseOrder()
  const receivePO = useReceivePurchaseOrder()

  const [isEditing, setIsEditing] = useState(false)
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    status: 'draft' as OrderStatus,
    expected_date: '',
    scheduled_date: '',
    priority: '5',
    notes: '',
  })

  usePageTitle(order ? `PO ${order.po_number}` : 'Purchase Order')

  useEffect(() => {
    if (isEditing && order) {
      setFormData({
        status: order.status,
        expected_date: order.expected_date || '',
        scheduled_date: order.scheduled_date || '',
        priority: String(order.priority),
        notes: order.notes,
      })
    }
  }, [isEditing, order])

  const handleSave = async () => {
    if (!order) return
    const payload = {
      id: order.id,
      status: formData.status,
      expected_date: formData.expected_date || null,
      scheduled_date: formData.scheduled_date || null,
      priority: Number(formData.priority),
      notes: formData.notes,
    }
    try {
      await updatePurchaseOrder.mutateAsync(payload as any)
      setIsEditing(false)
      toast.success('Purchase order updated successfully')
    } catch (error) {
      console.error('Failed to save purchase order:', error)
      toast.error('Failed to save purchase order')
    }
  }

  const handleConfirmReceive = async () => {
    if (!order) return
    try {
      await receivePO.mutateAsync({ id: order.id })
      toast.success('Purchase order received successfully')
      setReceiveDialogOpen(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to receive PO')
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({
      status: 'draft' as OrderStatus,
      expected_date: '',
      scheduled_date: '',
      priority: '5',
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

  if (!order) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Purchase order not found</div>
      </div>
    )
  }

  const formatCurrency = (value: string) => {
    const num = parseFloat(value)
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
            <h1 className="text-3xl font-bold">{order.po_number}</h1>
            {isEditing ? (
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as OrderStatus })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={statusVariant[order.status]}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Badge>
            )}
          </div>
          <button
            onClick={() => navigate(`/vendors/${order.vendor}`)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {order.vendor_name}
          </button>
        </div>
        <div className="flex gap-2" data-print-hide>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={updatePurchaseOrder.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updatePurchaseOrder.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              {(order.status === 'confirmed' || order.status === 'scheduled') && (
                <Button
                  variant="default"
                  onClick={() => setReceiveDialogOpen(true)}
                  disabled={receivePO.isPending}
                >
                  <Package className="h-4 w-4 mr-2" />
                  {receivePO.isPending ? 'Receiving...' : 'Receive'}
                </Button>
              )}
              {order.is_editable && (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
              )}
              <Button variant="outline" onClick={() => setEmailModalOpen(true)}>
                <Mail className="h-4 w-4 mr-2" /> Email
              </Button>
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
            <CardTitle className="text-sm font-medium">Order Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(order.order_date)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expected Date</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(order.expected_date)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(order.scheduled_date)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subtotal</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(order.subtotal)}</div>
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
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Expected Date</Label>
                  <Input
                    type="date"
                    value={formData.expected_date}
                    onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scheduled Date</Label>
                  <Input
                    type="date"
                    value={formData.scheduled_date}
                    onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Order notes..."
                  rows={3}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium mb-1">
                    <MapPin className="h-4 w-4" />
                    Ship To
                  </div>
                  <div className="text-sm text-muted-foreground">{order.ship_to_name}</div>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm font-medium mb-1">
                    <Hash className="h-4 w-4" />
                    Priority
                  </div>
                  <div className="text-sm text-muted-foreground">{order.priority}</div>
                </div>
              </div>

              {order.notes && (
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium mb-1">
                    <Package className="h-4 w-4" />
                    Notes
                  </div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</div>
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
          {!order.lines || order.lines.length === 0 ? (
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
                    <th className="text-right p-3 font-medium">Unit Cost</th>
                    <th className="text-right p-3 font-medium">Line Total</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => (
                    <tr key={line.id} className="border-b border-border last:border-0">
                      <td className="p-3">{line.line_number}</td>
                      <td className="p-3">
                        <div>
                          <div className="font-medium">{line.item_sku}</div>
                          <div className="text-sm text-muted-foreground">{line.item_name}</div>
                        </div>
                      </td>
                      <td className="p-3 text-right">{line.quantity_ordered}</td>
                      <td className="p-3">{line.uom_code}</td>
                      <td className="p-3 text-right">{formatCurrency(line.unit_cost)}</td>
                      <td className="p-3 text-right font-medium">{formatCurrency(line.line_total)}</td>
                      <td className="p-3 text-sm text-muted-foreground">{line.notes || '-'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-bold">
                    <td colSpan={5} className="p-3 text-right">Subtotal:</td>
                    <td className="p-3 text-right">{formatCurrency(order.subtotal)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={receiveDialogOpen}
        onOpenChange={setReceiveDialogOpen}
        title="Receive Purchase Order"
        description="Receive all items on this PO? This will create inventory lots and GL entries."
        confirmLabel="Receive"
        variant="default"
        onConfirm={handleConfirmReceive}
        loading={receivePO.isPending}
      />

      <EmailModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        endpoint={`/purchase-orders/${purchaseOrderId}/email/`}
        defaultSubject={`Purchase Order ${order.po_number}`}
        defaultBody={`Please find attached Purchase Order ${order.po_number}.`}
      />
    </div>
  )
}
