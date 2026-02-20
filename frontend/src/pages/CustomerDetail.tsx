import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, DollarSign, ShoppingCart, MapPin, FileText, Calendar,
  AlertCircle, Plus, Eye, History, Paperclip, Trash2, Upload, Pencil,
  Printer, BarChart3, Copy, Users,
} from 'lucide-react'
import { useCustomer, useLocations, useDeleteLocation, useCustomerTimeline, useCustomerAttachments, useUploadCustomerAttachment, useDeleteCustomerAttachment, useDuplicateCustomer } from '@/api/parties'
import { LocationDialog } from '@/components/parties/LocationDialog'
import api from '@/api/client'
import { useSalesOrders } from '@/api/orders'
import { useContractsByCustomer } from '@/api/contracts'
import type { SalesOrder, Location, Contract, TimelineEvent } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

type Tab = 'timeline' | 'orders' | 'locations' | 'documents' | 'contracts' | 'children'

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
    accepted:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    rejected:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    converted: { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    posted:    { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    paid:      { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    partial:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    overdue:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    void:      { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    received:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
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

export default function CustomerDetail() {
  usePageTitle('Customer 360')

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const customerId = parseInt(id || '0', 10)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: customer, isLoading } = useCustomer(customerId)
  const { data: ordersData } = useSalesOrders({ customer: customerId })
  const { data: locationsData } = useLocations(customer?.party)
  const { data: contracts } = useContractsByCustomer(customerId)
  const { data: attachments } = useCustomerAttachments(customerId)
  const uploadAttachment = useUploadCustomerAttachment()
  const deleteAttachment = useDeleteCustomerAttachment()
  const duplicateCustomer = useDuplicateCustomer()
  const { data: childCustomers } = useQuery({
    queryKey: ['customers', customerId, 'children'],
    queryFn: async () => {
      const { data } = await api.get('/customers/', { params: { party__parent: customer?.party } })
      return data
    },
    enabled: !!customerId && !!customer?.party,
  })

  const [activeTab, setActiveTab] = useState<Tab>('timeline')
  const [timelineFilter, setTimelineFilter] = useState<string | undefined>(undefined)
  const { data: timeline } = useCustomerTimeline(customerId, timelineFilter)
  const [deleteAttachmentDialogOpen, setDeleteAttachmentDialogOpen] = useState(false)
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState<number | null>(null)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [deleteLocationDialogOpen, setDeleteLocationDialogOpen] = useState(false)
  const [pendingDeleteLocationId, setPendingDeleteLocationId] = useState<number | null>(null)
  const deleteLocation = useDeleteLocation()

  const customerLocations = locationsData?.results ?? []
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

  if (!customer) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
          <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>Customer not found</div>
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
    { id: 'orders' as Tab, label: 'Sales Orders', icon: ShoppingCart },
    { id: 'locations' as Tab, label: 'Locations', icon: MapPin },
    { id: 'documents' as Tab, label: 'Documents', icon: Paperclip },
    { id: 'contracts' as Tab, label: 'Contracts', icon: FileText },
    { id: 'children' as Tab, label: 'Sub-Customers', icon: Users },
  ]

  const timelineFilters = [
    { key: undefined, label: 'All' },
    { key: 'order', label: 'Orders' },
    { key: 'estimate', label: 'Estimates' },
    { key: 'invoice', label: 'Invoices' },
    { key: 'payment', label: 'Payments' },
  ] as const

  const isOverdue = parseFloat(String(customer.overdue_balance || '0')) > 0

  const kpiItems = [
    {
      label: 'Open Sales',
      value: `$${fmtCurrency(customer.open_sales_total)}`,
      mono: true,
      danger: false,
      onClick: () => navigate('/orders?tab=sales'),
    },
    {
      label: 'Open Orders',
      value: String(customer.open_order_count),
      mono: false,
      danger: false,
      onClick: () => navigate('/orders?tab=sales'),
    },
    {
      label: 'Overdue Balance',
      value: `$${fmtCurrency(customer.overdue_balance)}`,
      mono: true,
      danger: isOverdue,
      onClick: () => navigate('/invoices'),
    },
    {
      label: 'Active Estimates',
      value: String(customer.active_estimate_count),
      mono: false,
      danger: false,
      onClick: () => navigate('/estimates'),
    },
    {
      label: 'Next Delivery',
      value: customer.next_expected_delivery
        ? format(new Date(customer.next_expected_delivery + 'T00:00:00'), 'MMM d, yyyy')
        : '\u2014',
      mono: false,
      danger: false,
      onClick: () => navigate('/scheduler'),
    },
    {
      label: 'Locations',
      value: String(customerLocations.length),
      mono: false,
      danger: false,
      onClick: () => setActiveTab('locations'),
    },
  ]

  const handleDuplicate = () => {
    if (!customerId) return
    duplicateCustomer.mutate(customerId, {
      onSuccess: (newCustomer) => {
        navigate(`/customers/${newCustomer.id}`)
      },
    })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadAttachment.mutate({ customerId, file })
      e.target.value = ''
    }
  }

  const handleConfirmDeleteAttachment = async () => {
    if (!pendingDeleteAttachmentId) return
    try {
      await deleteAttachment.mutateAsync({ customerId, attachmentId: pendingDeleteAttachmentId })
      toast.success('Attachment deleted successfully')
      setDeleteAttachmentDialogOpen(false)
      setPendingDeleteAttachmentId(null)
    } catch (error) {
      console.error('Failed to delete attachment:', error)
      toast.error('Failed to delete attachment')
    }
  }

  const handleConfirmDeleteLocation = async () => {
    if (!pendingDeleteLocationId) return
    try {
      await deleteLocation.mutateAsync(pendingDeleteLocationId)
      setDeleteLocationDialogOpen(false)
      setPendingDeleteLocationId(null)
    } catch {
      // error toast handled by the hook
    }
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/customers')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Customers
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{customer.party_display_name}</span>
        </div>

        {/* Title Row */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{customer.party_display_name}</h1>
              <span
                className="font-mono text-[12px] px-2 py-0.5 rounded"
                style={{ background: 'var(--so-bg)', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border-light)' }}
              >
                {customer.party_code}
              </span>
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              {customer.payment_terms ? `Terms: ${customer.payment_terms}` : 'Customer'}
              {customer.parent_name && (
                <span style={{ color: 'var(--so-text-tertiary)' }}> · Child of {customer.parent_name}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0" data-print-hide>
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={handleDuplicate}
              disabled={duplicateCustomer.isPending}
            >
              <Copy className="h-3.5 w-3.5" />
              {duplicateCustomer.isPending ? 'Duplicating...' : 'Save As Copy'}
            </button>
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => navigate('/reports/item-quick-report')}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Quick Report
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
              onClick={() => navigate('/estimates/new')}
            >
              <Plus className="h-3.5 w-3.5" />
              New Quote
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="grid grid-cols-6">
            {kpiItems.map((kpi, idx) => (
              <button
                key={idx}
                onClick={kpi.onClick}
                className="px-4 py-4 text-left transition-colors cursor-pointer"
                style={{ borderRight: idx < 5 ? '1px solid var(--so-border-light)' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="text-[11px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>{kpi.label}</div>
                <div className={`text-lg font-bold ${kpi.mono ? 'font-mono' : ''}`} style={{ color: kpi.danger ? 'var(--so-danger-text)' : 'var(--so-text-primary)' }}>{kpi.value}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap gap-2 mb-6 animate-in delay-2" data-print-hide>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/orders/sales/new')}>
            <Plus className="h-3.5 w-3.5" />
            New Sales Order
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/estimates/new')}>
            <Plus className="h-3.5 w-3.5" />
            New Estimate
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/contracts/new')}>
            <Plus className="h-3.5 w-3.5" />
            New Contract
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/price-lists')}>
            <Eye className="h-3.5 w-3.5" />
            View Price Lists
          </button>
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setActiveTab('contracts')}>
            <Eye className="h-3.5 w-3.5" />
            View Contracts
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 animate-in delay-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors cursor-pointer"
              style={{
                borderColor: activeTab === tab.id ? 'var(--so-accent)' : 'transparent',
                color: activeTab === tab.id ? 'var(--so-accent)' : 'var(--so-text-tertiary)',
              }}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Timeline</span>
            </div>
            <div className="px-6 py-5">
              {/* Filter Chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                {timelineFilters.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => setTimelineFilter(f.key)}
                    className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all cursor-pointer"
                    style={
                      timelineFilter === f.key
                        ? { background: 'var(--so-accent)', color: '#fff', border: '1px solid var(--so-accent)' }
                        : { background: 'var(--so-surface)', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border)' }
                    }
                  >
                    {f.label}
                  </button>
                ))}
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
                          event.type === 'order' ? '#3b82f6' :
                          event.type === 'estimate' ? '#a855f7' :
                          event.type === 'invoice' ? '#f59e0b' :
                          '#22c55e',
                      }}
                      onClick={() => navigate(event.link)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div className="text-xs whitespace-nowrap pt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
                        {format(new Date(event.date), 'MMM d, yyyy')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{event.title}</span>
                          {getStatusBadge(event.status)}
                        </div>
                        <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>{event.description}</p>
                      </div>
                      <div className="text-sm font-mono font-medium">
                        ${parseFloat(String(event.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>
                    No transactions found
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sales Orders Tab */}
        {activeTab === 'orders' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Sales Orders</span>
            </div>
            <div className="px-6 py-5">
              {orders.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--so-bg)' }}>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Order #</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Date</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Status</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Scheduled</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Customer PO</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-right" style={{ color: 'var(--so-text-tertiary)' }}>Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((so: SalesOrder) => (
                      <tr
                        key={so.id}
                        style={{ borderBottom: '1px solid var(--so-border-light)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="py-3 px-4 font-medium font-mono text-sm">{so.order_number}</td>
                        <td className="py-3 px-4 text-sm">
                          {format(new Date(so.order_date + 'T00:00:00'), 'MMM d, yyyy')}
                        </td>
                        <td className="py-3 px-4">
                          {getStatusBadge(so.status)}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {so.scheduled_date
                            ? format(new Date(so.scheduled_date + 'T00:00:00'), 'MMM d, yyyy')
                            : '\u2014'}
                        </td>
                        <td className="py-3 px-4 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>{so.customer_po || '\u2014'}</td>
                        <td className="py-3 px-4 text-right font-mono text-sm">{so.num_lines ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>
                  No sales orders for this customer
                </div>
              )}
            </div>
          </div>
        )}

        {/* Locations Tab */}
        {activeTab === 'locations' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Locations</span>
              <button
                className={primaryBtnClass}
                style={primaryBtnStyle}
                onClick={() => { setEditingLocation(null); setLocationDialogOpen(true) }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Location
              </button>
            </div>
            <div className="px-6 py-5">
              {customerLocations.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--so-bg)' }}>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Code</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Name</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Type</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Address</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Status</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-right" style={{ color: 'var(--so-text-tertiary)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerLocations.map((loc: Location) => (
                      <tr
                        key={loc.id}
                        style={{ borderBottom: '1px solid var(--so-border-light)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="py-3 px-4 font-medium font-mono text-sm">{loc.code}</td>
                        <td className="py-3 px-4 text-sm">{loc.name}</td>
                        <td className="py-3 px-4">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
                            style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border)', color: 'var(--so-text-secondary)' }}
                          >
                            {loc.location_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                          {loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.full_address || '\u2014'}
                        </td>
                        <td className="py-3 px-4">
                          {getStatusBadge(loc.is_active ? 'active' : 'inactive')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer"
                              style={{ color: 'var(--so-text-tertiary)', background: 'transparent', border: 'none' }}
                              title="Edit location"
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              onClick={() => { setEditingLocation(loc); setLocationDialogOpen(true) }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer"
                              style={{ color: 'var(--so-danger-text)', background: 'transparent', border: 'none' }}
                              title="Delete location"
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-danger-bg)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              onClick={() => { setPendingDeleteLocationId(loc.id); setDeleteLocationDialogOpen(true) }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No locations for this customer</p>
                  <button
                    className={outlineBtnClass + ' mt-3'}
                    style={outlineBtnStyle}
                    onClick={() => { setEditingLocation(null); setLocationDialogOpen(true) }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add First Location
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Documents</span>
            </div>
            <div className="px-6 py-5">
              {/* Upload Area */}
              <div data-print-hide className="mb-6">
                <label
                  className="flex flex-col items-center justify-center w-full h-32 cursor-pointer transition-colors"
                  style={{ border: '2px dashed var(--so-border)', borderRadius: '12px' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 mb-2" style={{ color: 'var(--so-text-tertiary)' }} />
                    <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                      <span className="font-semibold">Click to upload</span> or drag and drop
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
                      className="flex items-center gap-3 p-3"
                      style={{ border: '1px solid var(--so-border-light)', borderRadius: '10px' }}
                    >
                      <Paperclip className="h-4 w-4 shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />
                      <div className="flex-1 min-w-0">
                        <a
                          href={att.file_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-sm hover:underline"
                        >
                          {att.filename}
                        </a>
                        <p className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
                          {att.category} &middot; {(att.file_size / 1024).toFixed(0)} KB &middot; {format(new Date(att.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <button
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer"
                        style={{ color: 'var(--so-danger-text)', background: 'transparent', border: 'none' }}
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
                  <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>
                    No documents uploaded
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Contracts Tab */}
        {activeTab === 'contracts' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Contracts</span>
            </div>
            <div className="px-6 py-5">
              {contracts && contracts.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--so-bg)' }}>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Contract #</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Blanket PO</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Status</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Start Date</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>End Date</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-right" style={{ color: 'var(--so-text-tertiary)' }}>Committed Qty</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-right" style={{ color: 'var(--so-text-tertiary)' }}>Released Qty</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-right" style={{ color: 'var(--so-text-tertiary)' }}>Completion %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c: Contract) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer"
                        style={{ borderBottom: '1px solid var(--so-border-light)' }}
                        onClick={() => navigate(`/contracts/${c.id}`)}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="py-3 px-4 font-medium font-mono text-sm">{c.contract_number}</td>
                        <td className="py-3 px-4 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>{c.blanket_po || '\u2014'}</td>
                        <td className="py-3 px-4">
                          {getStatusBadge(c.status)}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {c.start_date ? format(new Date(c.start_date + 'T00:00:00'), 'MMM d, yyyy') : '\u2014'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {c.end_date ? format(new Date(c.end_date + 'T00:00:00'), 'MMM d, yyyy') : '\u2014'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-sm">{c.total_committed_qty.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono text-sm">{c.total_released_qty.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono text-sm">{c.completion_percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>
                  No contracts for this customer
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sub-Customers Tab */}
        {activeTab === 'children' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Sub-Customers / Jobs</span>
            </div>
            <div className="px-6 py-5">
              {childCustomers?.results && childCustomers.results.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--so-bg)' }}>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Code</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Name</th>
                      <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Terms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childCustomers.results.map((child: any) => (
                      <tr
                        key={child.id}
                        className="cursor-pointer"
                        style={{ borderBottom: '1px solid var(--so-border-light)' }}
                        onClick={() => navigate(`/customers/${child.id}`)}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="py-3 px-4 font-mono font-medium text-sm">{child.party_code}</td>
                        <td className="py-3 px-4 text-sm">{child.party_display_name}</td>
                        <td className="py-3 px-4 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>{child.payment_terms || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>
                  No sub-customers or jobs
                </div>
              )}
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
      <LocationDialog
        open={locationDialogOpen}
        onOpenChange={(open) => {
          setLocationDialogOpen(open)
          if (!open) setEditingLocation(null)
        }}
        location={editingLocation}
        partyId={customer.party}
      />
      <ConfirmDialog
        open={deleteLocationDialogOpen}
        onOpenChange={setDeleteLocationDialogOpen}
        title="Delete Location"
        description="Are you sure you want to delete this location? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDeleteLocation}
        loading={deleteLocation.isPending}
      />
    </div>
  )
}
