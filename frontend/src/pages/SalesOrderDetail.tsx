import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Pencil, Calendar, MapPin, ShoppingCart, Package, DollarSign, Hash,
  Printer, Save, X, Paperclip,
} from 'lucide-react'
import FileUpload from '@/components/common/FileUpload'
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
import { useSalesOrder, useUpdateSalesOrder } from '@/api/orders'
import type { OrderStatus, SalesOrder } from '@/types/api'
import { format } from 'date-fns'

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
  { value: 'picking', label: 'Picking' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function SalesOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orderId = parseInt(id || '0', 10)

  const { data: order, isLoading } = useSalesOrder(orderId)
  const updateOrder = useUpdateSalesOrder()

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    status: 'draft' as OrderStatus,
    customer_po: '',
    scheduled_date: '',
    priority: '5',
    notes: '',
  })

  usePageTitle(order ? `Sales Order ${order.order_number}` : 'Sales Order Detail')

  useEffect(() => {
    if (isEditing && order) {
      setFormData({
        status: order.status,
        customer_po: order.customer_po || '',
        scheduled_date: order.scheduled_date || '',
        priority: String(order.priority),
        notes: order.notes || '',
      })
    }
  }, [isEditing, order])

  const handleSave = async () => {
    if (!order) return
    const payload = {
      id: order.id,
      status: formData.status,
      customer_po: formData.customer_po,
      scheduled_date: formData.scheduled_date || null,
      priority: Number(formData.priority),
      notes: formData.notes,
    }
    try {
      await updateOrder.mutateAsync(payload as any)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save sales order:', error)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({
      status: 'draft' as OrderStatus,
      customer_po: '',
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
        <div className="text-center py-8 text-muted-foreground">Sales order not found</div>
      </div>
    )
  }

  const fmtCurrency = (val: string | number) => {
    const num = parseFloat(String(val))
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold font-mono">{order.order_number}</h1>
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
            onClick={() => navigate(`/customers/${order.customer}`)}
            className="text-muted-foreground hover:text-foreground hover:underline text-lg"
          >
            {order.customer_name}
          </button>
        </div>
        <div className="flex items-center gap-2" data-print-hide>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateOrder.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateOrder.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Print
              </Button>
              {order.is_editable && (
                <Button onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Order Date */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Order Date</p>
                <p className="text-lg font-bold">
                  {format(new Date(order.order_date + 'T00:00:00'), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scheduled Date */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Scheduled Date</p>
                <p className="text-lg font-bold">
                  {order.scheduled_date
                    ? format(new Date(order.scheduled_date + 'T00:00:00'), 'MMM d, yyyy')
                    : 'Not scheduled'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ship To */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <MapPin className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ship To</p>
                <p className="text-lg font-bold truncate">{order.ship_to_name}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subtotal */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p className="text-lg font-bold font-mono">${fmtCurrency(order.subtotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Details */}
      <Card>
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer PO</Label>
                  <Input
                    value={formData.customer_po}
                    onChange={(e) => setFormData({ ...formData, customer_po: e.target.value })}
                    placeholder="Customer's PO reference"
                  />
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
              </div>
              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
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
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Customer PO</p>
                  <p className="font-medium">{order.customer_po || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Priority</p>
                  <p className="font-medium">{order.priority}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Bill To</p>
                  <p className="font-medium">{order.bill_to_name || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Number of Lines</p>
                  <p className="font-medium">{order.num_lines}</p>
                </div>
              </div>
              {order.notes && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
                </div>
              )}
              {order.contract_reference && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground mb-1">Contract Reference</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {order.contract_reference.contract_number}
                    </Badge>
                    {order.contract_reference.blanket_po && (
                      <span className="text-sm text-muted-foreground">
                        Blanket PO: {order.contract_reference.blanket_po}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            Attachments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FileUpload appLabel="orders" modelName="salesorder" objectId={orderId} />
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          {order.lines && order.lines.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-sm text-muted-foreground">
                    <th className="p-3 text-left bg-muted/50">Line #</th>
                    <th className="p-3 text-left bg-muted/50">Item</th>
                    <th className="p-3 text-right bg-muted/50">Qty</th>
                    <th className="p-3 text-left bg-muted/50">UOM</th>
                    <th className="p-3 text-right bg-muted/50">Unit Price</th>
                    <th className="p-3 text-right bg-muted/50">Line Total</th>
                    <th className="p-3 text-left bg-muted/50">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => (
                    <tr key={line.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-sm">{line.line_number}</td>
                      <td className="p-3">
                        <div>
                          <span className="font-mono text-sm">{line.item_sku}</span>
                          <span className="text-sm text-muted-foreground ml-2">{line.item_name}</span>
                        </div>
                        {line.contract_number && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            Contract: {line.contract_number}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">{line.quantity_ordered.toLocaleString()}</td>
                      <td className="p-3">{line.uom_code}</td>
                      <td className="p-3 text-right font-mono">${fmtCurrency(line.unit_price)}</td>
                      <td className="p-3 text-right font-mono">${fmtCurrency(line.line_total)}</td>
                      <td className="p-3 text-sm text-muted-foreground">{line.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-bold">
                    <td colSpan={5} className="p-3 text-right">Subtotal:</td>
                    <td className="p-3 text-right font-mono">${fmtCurrency(order.subtotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No line items
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
