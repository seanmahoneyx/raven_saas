import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, DollarSign, ShoppingCart, MapPin, FileText, Calendar,
  AlertCircle, Plus, Eye, History, Paperclip, Trash2, Upload,
  Printer, BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCustomer, useLocations, useCustomerTimeline, useCustomerAttachments, useUploadCustomerAttachment, useDeleteCustomerAttachment } from '@/api/parties'
import { useSalesOrders } from '@/api/orders'
import { useContractsByCustomer } from '@/api/contracts'
import type { SalesOrder, Location, Contract, TimelineEvent } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

type Tab = 'timeline' | 'orders' | 'locations' | 'documents' | 'contracts'

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  confirmed: 'outline',
  scheduled: 'default',
  picking: 'warning',
  shipped: 'success',
  complete: 'success',
  cancelled: 'destructive',
  sent: 'outline',
  accepted: 'success',
  rejected: 'destructive',
  converted: 'success',
  posted: 'outline',
  paid: 'success',
  partial: 'warning',
  overdue: 'destructive',
  void: 'secondary',
  received: 'success',
}

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

  const [activeTab, setActiveTab] = useState<Tab>('timeline')
  const [timelineFilter, setTimelineFilter] = useState<string | undefined>(undefined)
  const { data: timeline } = useCustomerTimeline(customerId, timelineFilter)
  const [deleteAttachmentDialogOpen, setDeleteAttachmentDialogOpen] = useState(false)
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState<number | null>(null)

  const customerLocations = locationsData?.results ?? []
  const orders = ordersData?.results ?? []

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Customer not found</div>
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
  ]

  const timelineFilters = [
    { key: undefined, label: 'All' },
    { key: 'order', label: 'Orders' },
    { key: 'estimate', label: 'Estimates' },
    { key: 'invoice', label: 'Invoices' },
    { key: 'payment', label: 'Payments' },
  ] as const

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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/customers')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{customer.party_display_name}</h1>
            <Badge variant="outline" className="font-mono">{customer.party_code}</Badge>
          </div>
          <p className="text-muted-foreground">
            {customer.payment_terms ? `Terms: ${customer.payment_terms}` : 'Customer'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/reports/item-quick-report')}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Quick Report
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button size="sm" onClick={() => navigate('/estimates/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Quote
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-6">
        {/* Open Sales */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/orders?tab=sales')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open Sales</p>
                <p className="text-lg font-bold font-mono">${fmtCurrency(customer.open_sales_total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Open Orders */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/orders?tab=sales')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open Orders</p>
                <p className="text-lg font-bold">{customer.open_order_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overdue Balance */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/invoices')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${parseFloat(String(customer.overdue_balance || '0')) > 0 ? 'bg-red-500/10' : 'bg-muted'}`}>
                <AlertCircle className={`h-5 w-5 ${parseFloat(String(customer.overdue_balance || '0')) > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overdue Balance</p>
                <p className={`text-lg font-bold font-mono ${parseFloat(String(customer.overdue_balance || '0')) > 0 ? 'text-red-600' : ''}`}>
                  ${fmtCurrency(customer.overdue_balance)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Estimates */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/estimates')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Estimates</p>
                <p className="text-lg font-bold">{customer.active_estimate_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Delivery */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/scheduler')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next Delivery</p>
                <p className="text-lg font-bold">
                  {customer.next_expected_delivery
                    ? format(new Date(customer.next_expected_delivery + 'T00:00:00'), 'MMM d, yyyy')
                    : '\u2014'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Locations */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('locations')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-500/10 rounded-lg">
                <MapPin className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Locations</p>
                <p className="text-lg font-bold">{customerLocations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions Bar */}
      <div className="flex flex-wrap gap-2 mb-6" data-print-hide>
        <Button variant="outline" size="sm" onClick={() => navigate('/orders/sales/new')}>
          <Plus className="h-4 w-4 mr-1" />
          New Sales Order
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/estimates/new')}>
          <Plus className="h-4 w-4 mr-1" />
          New Estimate
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/contracts/new')}>
          <Plus className="h-4 w-4 mr-1" />
          New Contract
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/price-lists')}>
          <Eye className="h-4 w-4 mr-1" />
          View Price Lists
        </Button>
        <Button variant="outline" size="sm" onClick={() => setActiveTab('contracts')}>
          <Eye className="h-4 w-4 mr-1" />
          View Contracts
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Filter Chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              {timelineFilters.map((f) => (
                <Button
                  key={f.label}
                  variant={timelineFilter === f.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimelineFilter(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </div>

            {/* Timeline Items */}
            <div className="space-y-3">
              {timeline && timeline.length > 0 ? (
                timeline.map((event: TimelineEvent) => (
                  <div
                    key={event.id}
                    className={`flex items-start gap-4 p-3 rounded-lg border-l-4 hover:bg-muted/50 cursor-pointer ${
                      event.type === 'order' ? 'border-l-blue-500' :
                      event.type === 'estimate' ? 'border-l-purple-500' :
                      event.type === 'invoice' ? 'border-l-amber-500' :
                      'border-l-green-500'
                    }`}
                    onClick={() => navigate(event.link)}
                  >
                    <div className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                      {format(new Date(event.date), 'MMM d, yyyy')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{event.title}</span>
                        <Badge variant={statusVariant[event.status] || 'outline'} className="text-xs">
                          {event.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                    </div>
                    <div className="text-sm font-mono font-medium">
                      ${parseFloat(String(event.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No transactions found
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales Orders Tab */}
      {activeTab === 'orders' && (
        <Card>
          <CardHeader>
            <CardTitle>Sales Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b text-muted-foreground text-sm">
                    <th className="p-3 text-left">Order #</th>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Scheduled</th>
                    <th className="p-3 text-left">Customer PO</th>
                    <th className="p-3 text-right">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((so: SalesOrder) => (
                    <tr key={so.id} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-medium font-mono">{so.order_number}</td>
                      <td className="p-3 text-sm">
                        {format(new Date(so.order_date + 'T00:00:00'), 'MMM d, yyyy')}
                      </td>
                      <td className="p-3">
                        <Badge variant={
                          so.status === 'complete' ? 'success' :
                          so.status === 'cancelled' ? 'destructive' :
                          so.status === 'draft' ? 'secondary' : 'default'
                        }>
                          {so.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm">
                        {so.scheduled_date
                          ? format(new Date(so.scheduled_date + 'T00:00:00'), 'MMM d, yyyy')
                          : '\u2014'}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{so.customer_po || '\u2014'}</td>
                      <td className="p-3 text-right font-mono">{so.num_lines ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No sales orders for this customer
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Locations Tab */}
      {activeTab === 'locations' && (
        <Card>
          <CardHeader>
            <CardTitle>Locations</CardTitle>
          </CardHeader>
          <CardContent>
            {customerLocations.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b text-muted-foreground text-sm">
                    <th className="p-3 text-left">Code</th>
                    <th className="p-3 text-left">Name</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-left">Address</th>
                    <th className="p-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customerLocations.map((loc: Location) => (
                    <tr key={loc.id} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-medium font-mono">{loc.code}</td>
                      <td className="p-3">{loc.name}</td>
                      <td className="p-3">
                        <Badge variant="outline">{loc.location_type}</Badge>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.full_address || '\u2014'}
                      </td>
                      <td className="p-3">
                        <Badge variant={loc.is_active ? 'success' : 'secondary'}>
                          {loc.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No locations for this customer
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Upload Area */}
            <div data-print-hide className="mb-6">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
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
                  <div key={att.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <a
                        href={att.file_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sm hover:underline"
                      >
                        {att.filename}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {att.category} &middot; {(att.file_size / 1024).toFixed(0)} KB &middot; {format(new Date(att.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setPendingDeleteAttachmentId(att.id)
                        setDeleteAttachmentDialogOpen(true)
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No documents uploaded
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contracts Tab */}
      {activeTab === 'contracts' && (
        <Card>
          <CardHeader>
            <CardTitle>Contracts</CardTitle>
          </CardHeader>
          <CardContent>
            {contracts && contracts.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b text-muted-foreground text-sm">
                    <th className="p-3 text-left">Contract #</th>
                    <th className="p-3 text-left">Blanket PO</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Start Date</th>
                    <th className="p-3 text-left">End Date</th>
                    <th className="p-3 text-right">Committed Qty</th>
                    <th className="p-3 text-right">Released Qty</th>
                    <th className="p-3 text-right">Completion %</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c: Contract) => (
                    <tr key={c.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                      <td className="p-3 font-medium font-mono">{c.contract_number}</td>
                      <td className="p-3 text-sm">{c.blanket_po || '\u2014'}</td>
                      <td className="p-3">
                        <Badge variant={
                          c.status === 'active' ? 'success' :
                          c.status === 'draft' ? 'secondary' :
                          c.status === 'complete' ? 'outline' :
                          c.status === 'cancelled' ? 'destructive' : 'default'
                        }>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm">
                        {c.start_date ? format(new Date(c.start_date + 'T00:00:00'), 'MMM d, yyyy') : '\u2014'}
                      </td>
                      <td className="p-3 text-sm">
                        {c.end_date ? format(new Date(c.end_date + 'T00:00:00'), 'MMM d, yyyy') : '\u2014'}
                      </td>
                      <td className="p-3 text-right font-mono">{c.total_committed_qty.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono">{c.total_released_qty.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono">{c.completion_percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No contracts for this customer
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
