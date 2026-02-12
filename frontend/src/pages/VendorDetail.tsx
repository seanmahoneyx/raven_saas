import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, DollarSign, Package, MapPin, FileText, Calendar,
  AlertCircle, Plus, Eye, History, Paperclip, Trash2, Upload, Printer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useVendor, useLocations, useVendorTimeline, useVendorAttachments, useUploadVendorAttachment, useDeleteVendorAttachment } from '@/api/parties'
import { usePurchaseOrders } from '@/api/orders'
import type { PurchaseOrder, Location, TimelineEvent } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

type Tab = 'timeline' | 'orders' | 'locations' | 'documents' | 'rfqs'

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  confirmed: 'outline',
  scheduled: 'default',
  picking: 'warning',
  shipped: 'success',
  complete: 'success',
  cancelled: 'destructive',
  sent: 'outline',
  received: 'success',
  converted: 'success',
  posted: 'outline',
  paid: 'success',
  partial: 'warning',
  overdue: 'destructive',
  void: 'secondary',
}

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

  const [activeTab, setActiveTab] = useState<Tab>('timeline')
  const [timelineFilter, setTimelineFilter] = useState<string | undefined>(undefined)
  const { data: timeline } = useVendorTimeline(vendorId, timelineFilter)
  const [deleteAttachmentDialogOpen, setDeleteAttachmentDialogOpen] = useState(false)
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState<number | null>(null)

  const vendorLocations = locationsData?.results ?? []
  const orders = ordersData?.results ?? []

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Vendor not found</div>
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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/vendors')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{vendor.party_display_name}</h1>
            <Badge variant="outline" className="font-mono">{vendor.party_code}</Badge>
          </div>
          <p className="text-muted-foreground">
            {vendor.payment_terms ? `Terms: ${vendor.payment_terms}` : 'Vendor'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button size="sm" onClick={() => navigate('/orders/purchase/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New PO
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-6">
        {/* Open PO Total */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/orders?tab=purchase')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open PO Total</p>
                <p className="text-lg font-bold font-mono">${fmtCurrency(vendor.open_po_total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Open POs */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/orders?tab=purchase')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 rounded-lg">
                <Package className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open POs</p>
                <p className="text-lg font-bold">{vendor.open_po_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overdue Bills */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/invoices')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${parseFloat(String(vendor.overdue_bill_balance || '0')) > 0 ? 'bg-red-500/10' : 'bg-muted'}`}>
                <AlertCircle className={`h-5 w-5 ${parseFloat(String(vendor.overdue_bill_balance || '0')) > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overdue Bills</p>
                <p className={`text-lg font-bold font-mono ${parseFloat(String(vendor.overdue_bill_balance || '0')) > 0 ? 'text-red-600' : ''}`}>
                  ${fmtCurrency(vendor.overdue_bill_balance)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active RFQs */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/rfqs')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active RFQs</p>
                <p className="text-lg font-bold">{vendor.active_rfq_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Incoming */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/scheduler')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next Incoming</p>
                <p className="text-lg font-bold">
                  {vendor.next_incoming
                    ? format(new Date(vendor.next_incoming + 'T00:00:00'), 'MMM d, yyyy')
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
                <p className="text-lg font-bold">{vendorLocations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions Bar */}
      <div className="flex flex-wrap gap-2 mb-6" data-print-hide>
        <Button variant="outline" size="sm" onClick={() => navigate('/orders/purchase/new')}>
          <Plus className="h-4 w-4 mr-1" />
          New Purchase Order
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/rfqs/new')}>
          <Plus className="h-4 w-4 mr-1" />
          New RFQ
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/price-lists/new')}>
          <Plus className="h-4 w-4 mr-1" />
          New Cost List
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/priority-list')}>
          <Eye className="h-4 w-4 mr-1" />
          View Priority List
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
                      event.type === 'po' ? 'border-l-blue-500' :
                      event.type === 'rfq' ? 'border-l-purple-500' :
                      event.type === 'bill' ? 'border-l-amber-500' :
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

      {/* Purchase Orders Tab */}
      {activeTab === 'orders' && (
        <Card>
          <CardHeader>
            <CardTitle>Purchase Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b text-muted-foreground text-sm">
                    <th className="p-3 text-left">PO #</th>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Expected</th>
                    <th className="p-3 text-left">Scheduled</th>
                    <th className="p-3 text-right">Lines</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((po: PurchaseOrder) => (
                    <tr key={po.id} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-medium font-mono">{po.po_number}</td>
                      <td className="p-3 text-sm">
                        {format(new Date(po.order_date + 'T00:00:00'), 'MMM d, yyyy')}
                      </td>
                      <td className="p-3">
                        <Badge variant={statusVariant[po.status] || 'outline'}>
                          {po.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm">
                        {po.expected_date
                          ? format(new Date(po.expected_date + 'T00:00:00'), 'MMM d')
                          : '\u2014'}
                      </td>
                      <td className="p-3 text-sm">
                        {po.scheduled_date
                          ? format(new Date(po.scheduled_date + 'T00:00:00'), 'MMM d')
                          : '\u2014'}
                      </td>
                      <td className="p-3 text-right font-mono">{po.num_lines ?? 0}</td>
                      <td className="p-3 text-right font-mono">
                        ${parseFloat(String(po.subtotal)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No purchase orders for this vendor
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
            {vendorLocations.length > 0 ? (
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
                  {vendorLocations.map((loc: Location) => (
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
                No locations for this vendor
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

      {/* RFQs Tab */}
      {activeTab === 'rfqs' && (
        <Card>
          <CardHeader>
            <CardTitle>RFQs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">RFQ history is available in the timeline above.</p>
              <Button variant="outline" size="sm" onClick={() => setActiveTab('timeline')}>
                <History className="h-4 w-4 mr-2" />
                View Timeline
              </Button>
            </div>
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
