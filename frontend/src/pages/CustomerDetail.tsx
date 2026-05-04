import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useTrackEntityView } from '@/api/favorites'
import { formatCurrency } from '@/lib/format'
import {
  DollarSign, ShoppingCart, MapPin, FileText, History,
  Paperclip, BarChart3, Users, Phone, Plus,
} from 'lucide-react'
import { useCustomer, useLocations, useCustomerTimeline, useCustomerAttachments, useUploadCustomerAttachment, useDeleteCustomerAttachment } from '@/api/parties'
import api from '@/api/client'
import { useSalesOrders } from '@/api/orders'
import { useContractsByCustomer } from '@/api/contracts'
import { useContacts } from '@/api/contacts'
import type { SalesOrder, Contract } from '@/types/api'
import { format } from 'date-fns'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PartyDetailLayout } from '@/components/parties/PartyDetailLayout'

export default function CustomerDetail() {
  usePageTitle('Customer 360')

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const customerId = parseInt(id || '0', 10)

  const { data: customer, isLoading } = useCustomer(customerId)
  const { data: ordersData } = useSalesOrders({ customer: customerId })
  const { data: locationsData } = useLocations(customer?.party)
  const { data: contracts } = useContractsByCustomer(customerId)
  const { data: contactsData } = useContacts(customer?.party)
  const { data: attachments } = useCustomerAttachments(customerId)
  const uploadAttachment = useUploadCustomerAttachment()
  const deleteAttachment = useDeleteCustomerAttachment()
  const { data: childCustomers } = useQuery({
    queryKey: ['customers', customerId, 'children'],
    queryFn: async () => {
      const { data } = await api.get('/customers/', { params: { party__parent: customer?.party } })
      return data
    },
    enabled: !!customerId && !!customer?.party,
  })

  const [timelineFilter, setTimelineFilter] = useState<string | undefined>(undefined)
  const { data: timeline } = useCustomerTimeline(customerId, timelineFilter)

  const trackView = useTrackEntityView()
  useEffect(() => {
    if (customerId) {
      trackView.mutate({ entity_type: 'customer', object_id: customerId })
    }
  }, [customerId]) // eslint-disable-line react-hooks/exhaustive-deps

  const customerLocations = locationsData?.results ?? []
  const orders = ordersData?.results ?? []
  const contacts = contactsData?.results ?? []

  const isOverdue = parseFloat(String(customer?.overdue_balance || '0')) > 0

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadAttachment.mutate({ customerId, file })
      e.target.value = ''
    }
  }

  const handleDeleteAttachment = (attachmentId: number) => {
    deleteAttachment.mutate({ customerId, attachmentId })
  }

  return (
    <PartyDetailLayout
      pageTitle="Customer 360"
      backLabel="Customers"
      backPath="/customers"
      notFoundLabel="Customer not found"
      party={customer}
      isLoading={isLoading}
      partyName={customer?.party_display_name ?? ''}
      partyCode={customer?.party_code ?? ''}
      subtitle={
        (customer?.payment_terms ? `Terms: ${customer.payment_terms}` : 'Customer') +
        (customer?.parent_name ? ` \u00b7 Child of ${customer.parent_name}` : '')
      }
      notes={customer?.notes}
      partyId={customer?.party ?? 0}
      kpiItems={[
        { label: 'Open Sales', value: `${formatCurrency(customer?.open_sales_total ?? 0)}`, mono: true, onClick: () => navigate('/orders?tab=sales') },
        { label: 'Open Orders', value: String(customer?.open_order_count ?? 0), onClick: () => navigate('/orders?tab=sales') },
        { label: 'Overdue Balance', value: `${formatCurrency(customer?.overdue_balance ?? 0)}`, mono: true, danger: isOverdue, onClick: () => navigate('/invoices') },
        { label: 'Active Estimates', value: String(customer?.active_estimate_count ?? 0), onClick: () => navigate('/estimates') },
        { label: 'Next Delivery', value: customer?.next_expected_delivery ? format(new Date(customer.next_expected_delivery + 'T00:00:00'), 'MMM d, yyyy') : '\u2014', onClick: () => navigate('/scheduler') },
        { label: 'Locations', value: String(customerLocations.length), onClick: () => {} },
      ]}
      titleActions={
        <button
          className={outlineBtnClass}
          style={outlineBtnStyle}
          onClick={() => navigate('/reports/item-quick-report')}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Quick Report
        </button>
      }
      primaryAction={
        <button
          className={primaryBtnClass}
          style={primaryBtnStyle}
          onClick={() => navigate('/estimates/new')}
        >
          <Plus className="h-3.5 w-3.5" />
          New Quote
        </button>
      }
      tabs={[
        { id: 'timeline', label: 'Timeline', icon: History },
        { id: 'orders', label: 'Sales Orders', icon: ShoppingCart },
        { id: 'contacts', label: 'Contacts', icon: Phone },
        { id: 'locations', label: 'Locations', icon: MapPin },
        { id: 'documents', label: 'Documents', icon: Paperclip },
        { id: 'contracts', label: 'Contracts', icon: FileText },
        { id: 'price-lists', label: 'Price Lists', icon: DollarSign },
        { id: 'children', label: 'Sub-Customers', icon: Users },
      ]}
      timeline={timeline}
      timelineFilter={timelineFilter}
      setTimelineFilter={setTimelineFilter}
      timelineFilters={[
        { key: undefined, label: 'All' },
        { key: 'order', label: 'Orders' },
        { key: 'estimate', label: 'Estimates' },
        { key: 'invoice', label: 'Invoices' },
        { key: 'payment', label: 'Payments' },
      ]}
      ordersTabContent={
        <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Sales Orders</span>
            <div className="flex gap-2">
              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => navigate('/estimates/new')}
              >
                <Plus className="h-3.5 w-3.5" />
                New Estimate
              </button>
              <button
                className={primaryBtnClass}
                style={primaryBtnStyle}
                onClick={() => navigate('/orders/sales/new')}
              >
                <Plus className="h-3.5 w-3.5" />
                New Sales Order
              </button>
            </div>
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
                      className="cursor-pointer"
                      style={{ borderBottom: '1px solid var(--so-border-light)' }}
                      onClick={() => navigate(`/orders/sales/${so.id}`)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="py-3 px-4 font-medium font-mono text-sm">{so.order_number}</td>
                      <td className="py-3 px-4 text-sm">{format(new Date(so.order_date + 'T00:00:00'), 'MMM d, yyyy')}</td>
                      <td className="py-3 px-4">{getStatusBadge(so.status)}</td>
                      <td className="py-3 px-4 text-sm">{so.scheduled_date ? format(new Date(so.scheduled_date + 'T00:00:00'), 'MMM d, yyyy') : '\u2014'}</td>
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
      }
      extraTabContent={(activeTab) => (
        <>
          {/* Contracts Tab */}
          {activeTab === 'contracts' && (
            <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Contracts</span>
                <button
                  className={primaryBtnClass}
                  style={primaryBtnStyle}
                  onClick={() => navigate('/contracts/new')}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Contract
                </button>
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
                          <td className="py-3 px-4">{getStatusBadge(c.status)}</td>
                          <td className="py-3 px-4 text-sm">{c.start_date ? format(new Date(c.start_date + 'T00:00:00'), 'MMM d, yyyy') : '\u2014'}</td>
                          <td className="py-3 px-4 text-sm">{c.end_date ? format(new Date(c.end_date + 'T00:00:00'), 'MMM d, yyyy') : '\u2014'}</td>
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
        </>
      )}
      locations={customerLocations}
      contacts={contacts}
      attachments={attachments}
      onUploadFile={handleFileUpload}
      onDeleteAttachment={handleDeleteAttachment}
      isDeleteAttachmentPending={deleteAttachment.isPending}
      locationPartyId={customer?.party ?? 0}
      entityLabel="customer"
      entityType="customer"
      entityId={customerId}
    />
  )
}
