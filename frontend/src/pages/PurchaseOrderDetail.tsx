import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Paperclip, Copy, Plus, Trash2, Clock, Package,
  MoreHorizontal, FileText,
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
import { usePurchaseOrder, useUpdatePurchaseOrder, useReceivePurchaseOrder } from '@/api/orders'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { useCostLookup } from '@/api/costLists'
import type { OrderStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import EmailModal from '@/components/common/EmailModal'

const ORDER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

/* -- Status badge helper ----------------------------------------- */
const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    confirmed: { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    scheduled: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)'    },
    picking:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    shipped:   { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)'    },
    complete:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    crossdock: { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
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

/* -- Shared button styles ---------------------------------------- */
const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

/* ================================================================ */
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
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const { data: attachments } = useAttachments('orders', 'purchaseorder', purchaseOrderId)
  const attachmentCount = attachments?.length ?? 0
  const [formData, setFormData] = useState({
    status: 'draft' as OrderStatus,
    expected_date: '',
    scheduled_date: '',
    priority: '5',
    notes: '',
  })
  const [linesFormData, setLinesFormData] = useState<
    { item: string; quantity_ordered: string; uom: string; unit_cost: string; notes: string }[]
  >([])
  const [costLookupLine, setCostLookupLine] = useState<number | null>(null)

  usePageTitle(order ? `PO ${order.po_number}` : 'Purchase Order')

  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  const lookupLine = costLookupLine !== null ? linesFormData[costLookupLine] : null
  const { data: costData, isFetching: isCostFetching } = useCostLookup(
    order?.vendor ? Number(order.vendor) : undefined,
    lookupLine?.item ? Number(lookupLine.item) : undefined,
    lookupLine?.quantity_ordered ? Number(lookupLine.quantity_ordered) : undefined,
  )

  useEffect(() => {
    if (isEditing && order) {
      setFormData({
        status: order.status,
        expected_date: order.expected_date || '',
        scheduled_date: order.scheduled_date || '',
        priority: String(order.priority),
        notes: order.notes,
      })
      setLinesFormData(
        order.lines?.map(line => ({
          item: String(line.item),
          quantity_ordered: String(line.quantity_ordered),
          uom: String(line.uom),
          unit_cost: line.unit_cost,
          notes: line.notes || '',
        })) || []
      )
    }
  }, [isEditing, order])

  useEffect(() => {
    if (costLookupLine === null || isCostFetching) return
    if (costLookupLine >= linesFormData.length) {
      setCostLookupLine(null)
      return
    }
    if (costData?.unit_cost) {
      const currentLine = linesFormData[costLookupLine]
      if (currentLine.unit_cost === '0.00' || currentLine.unit_cost === '') {
        setLinesFormData(prev => prev.map((line, i) =>
          i === costLookupLine ? { ...line, unit_cost: costData.unit_cost } : line
        ))
      }
    }
    setCostLookupLine(null)
  }, [costData, costLookupLine, linesFormData, isCostFetching])

  const handleAddLine = () => {
    setLinesFormData(prev => [...prev, { item: '', quantity_ordered: '1', uom: '', unit_cost: '0.00', notes: '' }])
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
    setLinesFormData(prev => prev.map((line, i) => {
      if (i !== index) return line
      return {
        ...line,
        item: value,
        uom: selectedItem ? String(selectedItem.base_uom) : line.uom,
        unit_cost: '0.00',
      }
    }))
    if (value && order?.vendor) {
      setCostLookupLine(index)
    }
  }

  const handleLineQtyChange = (index: number, value: string) => {
    setLinesFormData(prev => prev.map((line, i) =>
      i === index ? { ...line, quantity_ordered: value, unit_cost: '0.00' } : line
    ))
    if (value && order?.vendor && linesFormData[index]?.item) {
      setCostLookupLine(index)
    }
  }

  const handleSave = async () => {
    if (!order) return
    const payload: Record<string, unknown> = {
      id: order.id,
      status: formData.status,
      expected_date: formData.expected_date || null,
      scheduled_date: formData.scheduled_date || null,
      priority: Number(formData.priority),
      notes: formData.notes,
      lines: linesFormData.map((line, idx) => ({
        line_number: idx + 1,
        item: Number(line.item),
        quantity_ordered: Number(line.quantity_ordered),
        uom: Number(line.uom),
        unit_cost: line.unit_cost,
        notes: line.notes,
      })),
    }
    try {
      await updatePurchaseOrder.mutateAsync(payload as Parameters<typeof updatePurchaseOrder.mutateAsync>[0])
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
    setLinesFormData([])
  }

  const handleSaveAsCopy = () => {
    if (!order) return
    navigate('/orders/purchase/new', {
      state: {
        copyFrom: {
          vendor: String(order.vendor),
          status: 'draft',
          priority: String(order.priority),
          order_date: new Date().toISOString().split('T')[0],
          expected_date: order.expected_date || '',
          scheduled_date: order.scheduled_date || '',
          ship_to: order.ship_to ? String(order.ship_to) : '',
          notes: order.notes || '',
          lines: order.lines?.map(line => ({
            item: String(line.item),
            quantity_ordered: String(line.quantity_ordered),
            uom: String(line.uom),
            unit_cost: line.unit_cost,
          })) || [],
        }
      }
    })
  }

  /* -- Loading / Not Found ---------------------------------------- */
  if (isLoading) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Purchase order not found</div>
        </div>
      </div>
    )
  }

  /* -- Helpers ---------------------------------------------------- */
  const fmtCurrency = (val: string | number) => {
    const num = parseFloat(String(val))
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const editTotal = linesFormData.reduce((sum, line) => {
    const qty = parseFloat(line.quantity_ordered) || 0
    const cost = parseFloat(line.unit_cost) || 0
    return sum + qty * cost
  }, 0)

  const lineCount = isEditing ? linesFormData.length : (order.lines?.length ?? 0)

  /* -- Detail grid data ------------------------------------------- */
  const detailItems = isEditing
    ? [
        { label: 'Order Date', value: format(new Date(order.order_date + 'T00:00:00'), 'MMM d, yyyy'), empty: false, mono: false, editable: false },
        { label: 'Expected Date', value: formData.expected_date, empty: !formData.expected_date, mono: false, editable: true, editNode: (
          <Input
            type="date"
            value={formData.expected_date}
            onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
            className="h-9 text-sm border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Scheduled Date', value: formData.scheduled_date, empty: !formData.scheduled_date, mono: false, editable: true, editNode: (
          <Input
            type="date"
            value={formData.scheduled_date}
            onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
            className="h-9 text-sm border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Priority', value: order.priority, empty: false, mono: false, editable: false, badge: true },
        { label: 'Ship To', value: order.ship_to_name || 'Not set', empty: !order.ship_to_name, mono: false, editable: false },
      ]
    : [
        { label: 'Order Date', value: format(new Date(order.order_date + 'T00:00:00'), 'MMM d, yyyy'), empty: false, mono: false },
        { label: 'Expected Date', value: order.expected_date ? format(new Date(order.expected_date + 'T00:00:00'), 'MMM d, yyyy') : 'Not set', empty: !order.expected_date, mono: false },
        { label: 'Scheduled Date', value: order.scheduled_date ? format(new Date(order.scheduled_date + 'T00:00:00'), 'MMM d, yyyy') : 'Not scheduled', empty: !order.scheduled_date, mono: false },
        { label: 'Priority', value: order.priority, empty: false, mono: false, badge: true },
        { label: 'Ship To', value: order.ship_to_name || 'Not set', empty: !order.ship_to_name, mono: false },
      ]

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <div className="so-detail-page" style={{ minHeight: '100vh' }}>
      {/* Print Form (hidden on screen, visible in print) */}
      <PrintForm
        title="Purchase Order"
        documentNumber={order.po_number}
        status={order.status.charAt(0).toUpperCase() + order.status.slice(1)}
        fields={[
          { label: 'Vendor', value: order.vendor_name },
          { label: 'Order Date', value: format(new Date(order.order_date + 'T00:00:00'), 'MMM d, yyyy') },
          { label: 'Expected Date', value: order.expected_date ? format(new Date(order.expected_date + 'T00:00:00'), 'MMM d, yyyy') : null },
          { label: 'Scheduled Date', value: order.scheduled_date ? format(new Date(order.scheduled_date + 'T00:00:00'), 'MMM d, yyyy') : null },
          { label: 'Ship To', value: order.ship_to_name },
          { label: 'Priority', value: order.priority },
          { label: 'Lines', value: order.num_lines },
        ]}
        notes={order.notes}
        columns={[
          { header: '#' },
          { header: 'Item' },
          { header: 'Qty', align: 'right' },
          { header: 'UOM' },
          { header: 'Unit Cost', align: 'right' },
          { header: 'Line Total', align: 'right' },
          { header: 'Notes' },
        ]}
        rows={order.lines?.map(line => [
          line.line_number,
          `${line.item_sku} - ${line.item_name}`,
          line.quantity_ordered.toLocaleString(),
          line.uom_code,
          `$${fmtCurrency(line.unit_cost)}`,
          `$${fmtCurrency(line.line_total)}`,
          line.notes || '\u2014',
        ]) || []}
        totals={[
          { label: 'Subtotal:', value: `$${fmtCurrency(order.subtotal)}` },
        ]}
      />

      {/* -- Main content ------------------------------------------ */}
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* -- Breadcrumb ------------------------------------------ */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/vendors/open-orders')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Purchase Orders
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{order.po_number}</span>
        </div>

        {/* -- Title row ------------------------------------------- */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{order.po_number}</h1>
              {isEditing ? (
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as OrderStatus })}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
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
                getStatusBadge(order.status)
              )}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              <strong className="font-semibold" style={{ color: 'var(--so-text-primary)' }}>{order.vendor_name}</strong>
              {' \u00b7 Created '}
              {format(new Date(order.created_at || order.order_date + 'T00:00:00'), 'MMM d, yyyy')}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {isEditing ? (
              <>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleCancel}>
                  Cancel
                </button>
                <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleSave} disabled={updatePurchaseOrder.isPending}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {updatePurchaseOrder.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                {(order.status === 'confirmed' || order.status === 'scheduled') && (
                  <button
                    className={primaryBtnClass}
                    style={{ ...primaryBtnStyle, background: 'var(--so-success-text)', borderColor: 'var(--so-success-text)' }}
                    onClick={() => setReceiveDialogOpen(true)}
                    disabled={receivePO.isPending}
                  >
                    <Package className="h-3.5 w-3.5" />
                    {receivePO.isPending ? 'Receiving...' : 'Receive'}
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
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleSaveAsCopy}>
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </button>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => window.print()}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  More
                </button>
                {order.is_editable && (
                  <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => setIsEditing(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit Order
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* -- Order Details Card ---------------------------------- */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Order Details</span>
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
                ) : item.badge ? (
                  <span
                    className="inline-flex items-center justify-center text-sm font-semibold"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      border: '1px solid var(--so-border)',
                      color: 'var(--so-text-primary)',
                    }}
                  >
                    {item.value}
                  </span>
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
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Order notes..."
                className="h-9 text-sm border rounded-md px-2"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
          ) : order.notes ? (
            <div
              className="flex items-start gap-2.5 px-5 py-4"
              style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
            >
              <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--so-text-tertiary)', opacity: 0.6 }} />
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--so-text-secondary)' }}>{order.notes}</p>
            </div>
          ) : null}
        </div>

        {/* -- Line Items Card ------------------------------------- */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Line Items</span>
            <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
              {lineCount} {lineCount === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* -- EDIT MODE TABLE ----------------------------------- */}
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
                        { label: 'Item', align: 'text-left', cls: 'pl-6 w-[35%]' },
                        { label: 'Qty', align: 'text-right', cls: 'w-20' },
                        { label: 'UOM', align: 'text-left', cls: 'w-20' },
                        { label: 'Rate', align: 'text-right', cls: 'w-24' },
                        { label: 'Amount', align: 'text-right', cls: 'w-28' },
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
                      const selectedItem = items.find(i => String(i.id) === line.item)
                      const lineAmount = (parseFloat(line.quantity_ordered) || 0) * (parseFloat(line.unit_cost) || 0)
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                          {/* Item */}
                          <td className="py-1 px-1 pl-6">
                            <Select value={line.item} onValueChange={(v) => handleLineItemChange(index, v)}>
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
                            {selectedItem && (
                              <div className="px-3 -mt-1 mb-0.5 font-mono text-[11.5px]" style={{ color: 'var(--so-text-secondary)' }}>{selectedItem.sku}</div>
                            )}
                          </td>
                          {/* Qty */}
                          <td className="py-1 px-1">
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={line.quantity_ordered}
                              onChange={(e) => handleLineQtyChange(index, e.target.value)}
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
                          {/* Rate (unit_cost) */}
                          <td className="py-1 px-1">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={line.unit_cost}
                              onChange={(e) => handleLineChange(index, 'unit_cost', e.target.value)}
                              className="h-9 text-right text-[13px] border-0 bg-transparent shadow-none font-mono"
                            />
                            {costLookupLine === index && isCostFetching && (
                              <span className="text-[11px] px-3" style={{ color: 'var(--so-text-tertiary)' }}>Looking up...</span>
                            )}
                          </td>
                          {/* Amount */}
                          <td className="py-1 px-4 text-right font-mono text-[13px] font-semibold">
                            ${fmtCurrency(lineAmount)}
                          </td>
                          {/* Notes */}
                          <td className="py-1 px-1">
                            <Input
                              value={line.notes}
                              onChange={(e) => handleLineChange(index, 'notes', e.target.value)}
                              className="h-9 text-[13px] border-0 bg-transparent shadow-none"
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
            /* -- READ-ONLY TABLE ---------------------------------- */
            order.lines && order.lines.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {[
                        { label: 'Item', align: 'text-left', width: 'w-[40%]' },
                        { label: 'Qty', align: 'text-center', width: '' },
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
                    {order.lines.map((line) => (
                      <tr key={line.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                        {/* Item */}
                        <td className="py-3.5 px-4 pl-6">
                          <div className="font-medium" style={{ color: 'var(--so-text-primary)' }}>{line.item_name}</div>
                          <div className="font-mono text-[12.5px] mt-0.5" style={{ color: 'var(--so-text-secondary)' }}>{line.item_sku}</div>
                        </td>
                        {/* Qty */}
                        <td className="py-3.5 px-4 text-center font-mono font-semibold">
                          {line.quantity_ordered.toLocaleString()}
                        </td>
                        {/* UOM */}
                        <td className="py-3.5 px-4" style={{ color: 'var(--so-text-secondary)' }}>
                          {line.uom_code}
                        </td>
                        {/* Rate */}
                        <td className="py-3.5 px-4 text-right font-mono" style={{ color: 'var(--so-text-secondary)' }}>
                          ${fmtCurrency(line.unit_cost)}
                        </td>
                        {/* Amount */}
                        <td className="py-3.5 px-4 text-right font-mono font-semibold pr-6">
                          ${fmtCurrency(line.line_total)}
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

          {/* Total row */}
          {(isEditing ? linesFormData.length > 0 : (order.lines?.length ?? 0) > 0) && (
            <div
              className="flex items-center justify-end gap-4 px-6 py-4"
              style={{ borderTop: '2px solid var(--so-text-primary)' }}
            >
              <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--so-text-secondary)' }}>
                Total
              </span>
              <span className="font-mono text-xl font-bold" style={{ color: 'var(--so-text-primary)' }}>
                ${fmtCurrency(isEditing ? editTotal : order.subtotal)}
              </span>
            </div>
          )}
        </div>

        {/* -- Two-column: Attachments + Activity ------------------ */}
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

      {/* -- Receive Confirm Dialog -------------------------------- */}
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

      {/* -- Email Modal ------------------------------------------- */}
      <EmailModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        endpoint={`/purchase-orders/${purchaseOrderId}/email/`}
        defaultSubject={`Purchase Order ${order.po_number}`}
        defaultBody={`Please find attached Purchase Order ${order.po_number}.`}
      />

      {/* -- Attachments Dialog ------------------------------------ */}
      <Dialog open={attachmentsOpen} onOpenChange={setAttachmentsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attachments</DialogTitle>
          </DialogHeader>
          <FileUpload appLabel="orders" modelName="purchaseorder" objectId={purchaseOrderId} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
