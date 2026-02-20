import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, DollarSign, Package, MapPin, FileText, Calendar,
  AlertCircle, Plus, Eye, History, Paperclip, Trash2, Upload, Printer, Copy,
} from 'lucide-react'
import { useVendor, useLocations, useVendorTimeline, useVendorAttachments, useUploadVendorAttachment, useDeleteVendorAttachment, useDuplicateVendor } from '@/api/parties'
import { usePurchaseOrders } from '@/api/orders'
import type { PurchaseOrder, Location, TimelineEvent } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

type Tab = 'timeline' | 'orders' | 'locations' | 'documents' | 'rfqs'

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    confirmed: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    scheduled: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    picking:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    shipped:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    complete:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    cancelled: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    active:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    inactive:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    sent:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    received:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    converted: { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    posted:    { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    paid:      { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    partial:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    overdue:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    void:      { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  }
  const c = configs[status] || { bg: 'var(--so-warning-bg)', border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' }
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

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function VendorDetail() {
  usePageTitle('Vendor 360')

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const vendorId = parseInt(id || '0', 10)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: vendor, isLoading } = useVendor(vendorId)
  const { data: ordersData } = usePurchaseOrders({ vendor: vendorId })
  const { data: locationsData } = useLocations(vendor?.party)
  const { data: attachments } = useVendorAttachments(vendorId)
  const uploadAttachment = useUploadVendorAttachment()
  const deleteAttachment = useDeleteVendorAttachment()
  const duplicateVendor = useDuplicateVendor()

  const [activeTab, setActiveTab] = useState<Tab>('timeline')
  const [timelineFilter, setTimelineFilter] = useState<string | undefined>(undefined)
  const { data: timeline } = useVendorTimeline(vendorId, timelineFilter)
  const [deleteAttachmentDialogOpen, setDeleteAttachmentDialogOpen] = useState(false)
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState<number | null>(null)

  const vendorLocations = locationsData?.results ?? []
  const orders = ordersData?.results ?? []

  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
          <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
          <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>Vendor not found</div>
        </div>
      </div>
    )
  }

  const fmtCurrency = (val: string | number | null | undefined) => {
    const num = parseFloat(String(val || '0'))
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const tabs = [
    { id: 'timeline' as Tab, label: 'Timeline', icon: History },
    { id: 'orders' as Tab, label: 'Purchase Orders', icon: Package },
    { id: 'locations' as Tab, label: 'Locations', icon: MapPin },
    { id: 'documents' as Tab, label: 'Documents', icon: Paperclip },
    { id: 'rfqs' as Tab, label: 'RFQs', icon: FileText },
  ]

  const timelineFilters = [
    { key: undefined, label: 'All' },
    { key: 'po', label: 'POs' },
    { key: 'rfq', label: 'RFQs' },
    { key: 'bill', label: 'Bills' },
    { key: 'payment', label: 'Payments' },
  ] as const

  const handleDuplicate = () => {
    if (!vendorId) return
    duplicateVendor.mutate(vendorId, {
      onSuccess: (newVendor) => {
        navigate(`/vendors/${newVendor.id}`)
      },
    })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadAttachment.mutate({ vendorId, file })
      e.target.value = ''
    }
  }

  const handleConfirmDeleteAttachment = async () => {
    if (!pendingDeleteAttachmentId) return
    try {
      await deleteAttachment.mutateAsync({ vendorId, attachmentId: pendingDeleteAttachmentId })
      toast.success('Attachment deleted successfully')
      setDeleteAttachmentDialogOpen(false)
      setPendingDeleteAttachmentId(null)
    } catch (error) {
      console.error('Failed to delete attachment:', error)
      toast.error('Failed to delete attachment')
    }
  }

  const hasOverdue = parseFloat(String(vendor.overdue_bill_balance || '0')) > 0

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/vendors')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />Vendors
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{vendor.party_display_name}</span>
        </div>

        {/* Title Row */}
        <div className="flex items-start justify-between gap-4 mb-6 animate-in delay-1">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>{vendor.party_display_name}</h1>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold font-mono"
                style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border)', color: 'var(--so-text-tertiary)' }}
              >
                {vendor.party_code}
              </span>
            </div>
            <p className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {vendor.payment_terms ? `Terms: ${vendor.payment_terms}` : 'Vendor'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={handleDuplicate}
              disabled={duplicateVendor.isPending}
            >
              <Copy className="h-3.5 w-3.5" />
              {duplicateVendor.isPending ? 'Duplicating...' : 'Save As Copy'}
            </button>
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            <button
              className={primaryBtnClass}
              style={primaryBtnStyle}
              onClick={() => navigate('/orders/purchase/new')}
            >
              <Plus className="h-3.5 w-3.5" />
              New PO
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div
          className="rounded-[14px] mb-6 animate-in delay-2 overflow-hidden"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
        >
          <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-y md:divide-y-0" style={{ borderColor: 'var(--so-border-light)' }}>
            {/* Open PO Total */}
            <div
              className="p-5 cursor-pointer transition-colors"
              style={{ borderColor: 'var(--so-border-light)' }}
              onClick={() => navigate('/orders?tab=purchase')}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <p className="text-[11px] font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--so-text-tertiary)' }}>Open PO Total</p>
              <p className="text-lg font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>${fmtCurrency(vendor.open_po_total)}</p>
            </div>

            {/* Open POs */}
            <div
              className="p-5 cursor-pointer transition-colors"
              style={{ borderColor: 'var(--so-border-light)' }}
              onClick={() => navigate('/orders?tab=purchase')}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <p className="text-[11px] font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--so-text-tertiary)' }}>Open POs</p>
              <p className="text-lg font-bold" style={{ color: 'var(--so-text-primary)' }}>{vendor.open_po_count}</p>
            </div>

            {/* Overdue Bills */}
            <div
              className="p-5 cursor-pointer transition-colors"
              style={{ borderColor: 'var(--so-border-light)' }}
              onClick={() => navigate('/invoices')}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div className="flex items-center gap-1.5 mb-2">
                {hasOverdue && <AlertCircle className="h-3 w-3" style={{ color: 'var(--so-danger-text)' }} />}
                <p className="text-[11px] font-medium uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Overdue Bills</p>
              </div>
              <p className="text-lg font-bold font-mono" style={{ color: hasOverdue ? 'var(--so-danger-text)' : 'var(--so-text-primary)' }}>
                ${fmtCurrency(vendor.overdue_bill_balance)}
              </p>
            </div>

            {/* Active RFQs */}
            <div
              className="p-5 cursor-pointer transition-colors"
              style={{ borderColor: 'var(--so-border-light)' }}
              onClick={() => navigate('/rfqs')}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <p className="text-[11px] font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--so-text-tertiary)' }}>Active RFQs</p>
              <p className="text-lg font-bold" style={{ color: 'var(--so-text-primary)' }}>{vendor.active_rfq_count}</p>
            </div>

            {/* Next Incoming */}
            <div
              className="p-5 cursor-pointer transition-colors"
              style={{ borderColor: 'var(--so-border-light)' }}
              onClick={() => navigate('/scheduler')}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <p className="text-[11px] font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--so-text-tertiary)' }}>Next Incoming</p>
              <p className="text-lg font-bold" style={{ color: 'var(--so-text-primary)' }}>
                {vendor.next_incoming
                  ? format(new Date(vendor.next_incoming + 'T00:00:00'), 'MMM d, yyyy')
                  : '\u2014'}
              </p>
            </div>

            {/* Locations */}
            <div
              className="p-5 cursor-pointer transition-colors"
              style={{ borderColor: 'var(--so-border-light)' }}
              onClick={() => setActiveTab('locations')}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <p className="text-[11px] font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--so-text-tertiary)' }}>Locations</p>
              <p className="text-lg font-bold" style={{ color: 'var(--so-text-primary)' }}>{vendorLocations.length}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap gap-2 mb-6 animate-in delay-2" data-print-hide>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/orders/purchase/new')}>
            <Plus className="h-3.5 w-3.5" />
            New Purchase Order
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/rfqs/new')}>
            <Plus className="h-3.5 w-3.5" />
            New RFQ
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/price-lists/new')}>
            <Plus className="h-3.5 w-3.5" />
            New Cost List
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/priority-list')}>
            <Eye className="h-3.5 w-3.5" />
            View Priority List
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 animate-in delay-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors cursor-pointer"
                style={{
                  borderColor: active ? 'var(--so-accent)' : 'transparent',
                  color: active ? 'var(--so-accent)' : 'var(--so-text-tertiary)',
                }}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div
            className="rounded-[14px] animate-in delay-3"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <h2 className="text-[14px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>Timeline</h2>
            </div>
            <div className="p-6">
              {/* Filter Chips */}
              <div className="flex flex-wrap gap-2 mb-5">
                {timelineFilters.map((f) => {
                  const active = timelineFilter === f.key
                  return (
                    <button
                      key={f.label}
                      className="px-3 py-1 rounded-full text-[12px] font-medium transition-all cursor-pointer"
                      style={{
                        background: active ? 'var(--so-accent)' : 'var(--so-bg)',
                        border: `1px solid ${active ? 'var(--so-accent)' : 'var(--so-border)'}`,
                        color: active ? '#fff' : 'var(--so-text-secondary)',
                      }}
                      onClick={() => setTimelineFilter(f.key)}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>

              {/* Timeline Items */}
              <div className="space-y-2">
                {timeline && timeline.length > 0 ? (
                  timeline.map((event: TimelineEvent) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-4 p-3 rounded-lg border-l-4 cursor-pointer transition-colors"
                      style={{
                        borderLeftColor:
                          event.type === 'po' ? '#3b82f6' :
                          event.type === 'rfq' ? '#8b5cf6' :
                          event.type === 'bill' ? '#f59e0b' :
                          '#10b981',
                        background: 'transparent',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => navigate(event.link)}
                    >
                      <div className="text-[12px] whitespace-nowrap pt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
                        {format(new Date(event.date), 'MMM d, yyyy')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-[13px]" style={{ color: 'var(--so-text-primary)' }}>{event.title}</span>
                          {getStatusBadge(event.status)}
                        </div>
                        <p className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>{event.description}</p>
                      </div>
                      <div className="text-[13px] font-mono font-medium" style={{ color: 'var(--so-text-secondary)' }}>
                        ${parseFloat(String(event.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
                    No transactions found
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Purchase Orders Tab */}
        {activeTab === 'orders' && (
          <div
            className="rounded-[14px] animate-in delay-3"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <h2 className="text-[14px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>Purchase Orders</h2>
            </div>
            {orders.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--so-bg)', borderBottom: '1px solid var(--so-border-light)' }}>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>PO #</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Date</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Status</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Expected</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Scheduled</th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Lines</th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((po: PurchaseOrder) => (
                    <tr
                      key={po.id}
                      className="transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid var(--so-border-light)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => navigate(`/orders/purchase/${po.id}`)}
                    >
                      <td className="px-6 py-3 font-medium font-mono text-[13px]" style={{ color: 'var(--so-text-primary)' }}>{po.po_number}</td>
                      <td className="px-6 py-3 text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                        {format(new Date(po.order_date + 'T00:00:00'), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-3">{getStatusBadge(po.status)}</td>
                      <td className="px-6 py-3 text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                        {po.expected_date
                          ? format(new Date(po.expected_date + 'T00:00:00'), 'MMM d')
                          : '\u2014'}
                      </td>
                      <td className="px-6 py-3 text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                        {po.scheduled_date
                          ? format(new Date(po.scheduled_date + 'T00:00:00'), 'MMM d')
                          : '\u2014'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>{po.num_lines ?? 0}</td>
                      <td className="px-6 py-3 text-right font-mono text-[13px]" style={{ color: 'var(--so-text-primary)' }}>
                        ${parseFloat(String(po.subtotal)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
                No purchase orders for this vendor
              </div>
            )}
          </div>
        )}

        {/* Locations Tab */}
        {activeTab === 'locations' && (
          <div
            className="rounded-[14px] animate-in delay-3"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <h2 className="text-[14px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>Locations</h2>
            </div>
            {vendorLocations.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--so-bg)', borderBottom: '1px solid var(--so-border-light)' }}>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Code</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Name</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Type</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Address</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorLocations.map((loc: Location) => (
                    <tr
                      key={loc.id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--so-border-light)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-6 py-3 font-medium font-mono text-[13px]" style={{ color: 'var(--so-text-primary)' }}>{loc.code}</td>
                      <td className="px-6 py-3 text-[13px]" style={{ color: 'var(--so-text-primary)' }}>{loc.name}</td>
                      <td className="px-6 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
                          style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border)', color: 'var(--so-text-secondary)' }}
                        >
                          {loc.location_type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
                        {loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.full_address || '\u2014'}
                      </td>
                      <td className="px-6 py-3">{getStatusBadge(loc.is_active ? 'active' : 'inactive')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
                No locations for this vendor
              </div>
            )}
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div
            className="rounded-[14px] animate-in delay-3"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <h2 className="text-[14px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>Documents</h2>
            </div>
            <div className="p-6">
              {/* Upload Area */}
              <div data-print-hide className="mb-6">
                <label
                  className="flex flex-col items-center justify-center w-full h-32 rounded-xl cursor-pointer transition-colors"
                  style={{
                    border: '2px dashed var(--so-border)',
                    background: 'var(--so-bg)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--so-accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--so-border)')}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-7 w-7 mb-2" style={{ color: 'var(--so-text-tertiary)' }} />
                    <p className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
                      <span className="font-semibold" style={{ color: 'var(--so-text-secondary)' }}>Click to upload</span> or drag and drop
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>

              {/* Attachments List */}
              <div className="space-y-2">
                {attachments && attachments.length > 0 ? (
                  attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ border: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
                    >
                      <Paperclip className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />
                      <div className="flex-1 min-w-0">
                        <a
                          href={att.file_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[13px] hover:underline"
                          style={{ color: 'var(--so-text-primary)' }}
                        >
                          {att.filename}
                        </a>
                        <p className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                          {att.category} &middot; {(att.file_size / 1024).toFixed(0)} KB &middot; {format(new Date(att.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <button
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer"
                        style={{ color: 'var(--so-danger-text)', background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-danger-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        onClick={() => {
                          setPendingDeleteAttachmentId(att.id)
                          setDeleteAttachmentDialogOpen(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
                    No documents uploaded
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* RFQs Tab */}
        {activeTab === 'rfqs' && (
          <div
            className="rounded-[14px] animate-in delay-3"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <h2 className="text-[14px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>RFQs</h2>
            </div>
            <div className="p-6 text-center py-10">
              <p className="text-[13px] mb-4" style={{ color: 'var(--so-text-tertiary)' }}>
                RFQ history is available in the timeline above.
              </p>
              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => setActiveTab('timeline')}
              >
                <History className="h-3.5 w-3.5" />
                View Timeline
              </button>
            </div>
          </div>
        )}

      </div>

      <ConfirmDialog
        open={deleteAttachmentDialogOpen}
        onOpenChange={setDeleteAttachmentDialogOpen}
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
