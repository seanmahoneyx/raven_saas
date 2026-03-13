import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useTrackEntityView } from '@/api/favorites'
import {
  DollarSign, Package, MapPin, FileText, History,
  Paperclip, Phone, Plus, AlertCircle, ListOrdered,
} from 'lucide-react'
import { useVendor, useLocations, useVendorTimeline, useVendorAttachments, useUploadVendorAttachment, useDeleteVendorAttachment } from '@/api/parties'
import { usePurchaseOrders } from '@/api/orders'
import { useContacts } from '@/api/contacts'
import type { PurchaseOrder } from '@/types/api'
import { format } from 'date-fns'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PartyDetailLayout } from '@/components/parties/PartyDetailLayout'

export default function VendorDetail() {
  usePageTitle('Vendor 360')

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const vendorId = parseInt(id || '0', 10)

  const { data: vendor, isLoading } = useVendor(vendorId)
  const { data: ordersData } = usePurchaseOrders({ vendor: vendorId })
  const { data: locationsData } = useLocations(vendor?.party)
  const { data: attachments } = useVendorAttachments(vendorId)
  const uploadAttachment = useUploadVendorAttachment()
  const deleteAttachment = useDeleteVendorAttachment()
  const { data: contactsData } = useContacts(vendor?.party)

  const [timelineFilter, setTimelineFilter] = useState<string | undefined>(undefined)
  const { data: timeline } = useVendorTimeline(vendorId, timelineFilter)

  const trackView = useTrackEntityView()
  useEffect(() => {
    if (vendorId) {
      trackView.mutate({ entity_type: 'vendor', object_id: vendorId })
    }
  }, [vendorId]) // eslint-disable-line react-hooks/exhaustive-deps

  const vendorLocations = locationsData?.results ?? []
  const orders = ordersData?.results ?? []
  const contacts = contactsData?.results ?? []

  const fmtCurrency = (val: string | number | null | undefined) => {
    const num = parseFloat(String(val || '0'))
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const hasOverdue = parseFloat(String(vendor?.overdue_bill_balance || '0')) > 0

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadAttachment.mutate({ vendorId, file })
      e.target.value = ''
    }
  }

  const handleDeleteAttachment = (attachmentId: number) => {
    deleteAttachment.mutate({ vendorId, attachmentId })
  }

  return (
    <PartyDetailLayout
      pageTitle="Vendor 360"
      backLabel="Vendors"
      backPath="/vendors"
      notFoundLabel="Vendor not found"
      party={vendor}
      isLoading={isLoading}
      partyName={vendor?.party_display_name ?? ''}
      partyCode={vendor?.party_code ?? ''}
      subtitle={vendor?.payment_terms ? `Terms: ${vendor.payment_terms}` : 'Vendor'}
      notes={vendor?.notes}
      partyId={vendor?.party ?? 0}
      kpiItems={[
        { label: 'Open PO Total', value: `$${fmtCurrency(vendor?.open_po_total)}`, mono: true, onClick: () => navigate('/orders?tab=purchase') },
        { label: 'Open POs', value: String(vendor?.open_po_count ?? 0), onClick: () => navigate('/orders?tab=purchase') },
        { label: 'Overdue Bills', value: `$${fmtCurrency(vendor?.overdue_bill_balance)}`, mono: true, danger: hasOverdue, onClick: () => navigate('/invoices') },
        { label: 'Active RFQs', value: String(vendor?.active_rfq_count ?? 0), onClick: () => navigate('/rfqs') },
        { label: 'Next Incoming', value: vendor?.next_incoming ? format(new Date(vendor.next_incoming + 'T00:00:00'), 'MMM d, yyyy') : '\u2014', onClick: () => navigate('/scheduler') },
        { label: 'Locations', value: String(vendorLocations.length), onClick: () => {} },
      ]}
      primaryAction={
        <div className="flex items-center gap-2">
          <button
            className={outlineBtnClass}
            style={outlineBtnStyle}
            onClick={() => navigate(`/vendors/${vendorId}/priority-list`)}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Priority List
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
      }
      tabs={[
        { id: 'timeline', label: 'Timeline', icon: History },
        { id: 'orders', label: 'Purchase Orders', icon: Package },
        { id: 'contacts', label: 'Contacts', icon: Phone },
        { id: 'locations', label: 'Locations', icon: MapPin },
        { id: 'documents', label: 'Documents', icon: Paperclip },
        { id: 'rfqs', label: 'RFQs', icon: FileText },
        { id: 'price-lists', label: 'Price Lists', icon: DollarSign },
      ]}
      timeline={timeline}
      timelineFilter={timelineFilter}
      setTimelineFilter={setTimelineFilter}
      timelineFilters={[
        { key: undefined, label: 'All' },
        { key: 'po', label: 'POs' },
        { key: 'rfq', label: 'RFQs' },
        { key: 'bill', label: 'Bills' },
        { key: 'payment', label: 'Payments' },
      ]}
      ordersTabContent={
        <div
          className="rounded-[14px] animate-in delay-3"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
        >
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>Purchase Orders</h2>
            <button
              className={primaryBtnClass}
              style={primaryBtnStyle}
              onClick={() => navigate('/orders/purchase/new')}
            >
              <Plus className="h-3.5 w-3.5" />
              New Purchase Order
            </button>
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
                      {po.expected_date ? format(new Date(po.expected_date + 'T00:00:00'), 'MMM d') : '\u2014'}
                    </td>
                    <td className="px-6 py-3 text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                      {po.scheduled_date ? format(new Date(po.scheduled_date + 'T00:00:00'), 'MMM d') : '\u2014'}
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
      }
      extraTabContent={(activeTab) => (
        <>
          {/* RFQs Tab */}
          {activeTab === 'rfqs' && (
            <div
              className="rounded-[14px] animate-in delay-3"
              style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
            >
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <h2 className="text-[14px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>RFQs</h2>
                <button
                  className={primaryBtnClass}
                  style={primaryBtnStyle}
                  onClick={() => navigate('/rfqs/new')}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New RFQ
                </button>
              </div>
              <div className="p-6 text-center py-10">
                <p className="text-[13px] mb-4" style={{ color: 'var(--so-text-tertiary)' }}>
                  RFQ history is available in the timeline above.
                </p>
                <button
                  className={outlineBtnClass}
                  style={outlineBtnStyle}
                  onClick={() => {/* setActiveTab handled by layout -- navigate to timeline filter */}}
                >
                  <History className="h-3.5 w-3.5" />
                  View Timeline
                </button>
              </div>
            </div>
          )}
        </>
      )}
      locations={vendorLocations}
      contacts={contacts}
      attachments={attachments}
      onUploadFile={handleFileUpload}
      onDeleteAttachment={handleDeleteAttachment}
      isDeleteAttachmentPending={deleteAttachment.isPending}
      locationPartyId={vendor?.party ?? 0}
      entityLabel="vendor"
    />
  )
}
