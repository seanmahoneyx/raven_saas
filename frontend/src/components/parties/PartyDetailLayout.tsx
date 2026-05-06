import { useState, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, DollarSign, MapPin, Plus, Eye,
  Paperclip, Trash2, Upload, Pencil, Printer, Phone, StickyNote, Star,
} from 'lucide-react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { LocationDialog } from '@/components/parties/LocationDialog'
import type { Location, TimelineEvent, Contact, CustomerAttachment, EntityType } from '@/types/api'
import { useFavorites, useAddFavorite, useRemoveFavorite } from '@/api/favorites'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { useDeleteLocation } from '@/api/parties'
import { KpiGrid, KpiCard, TabStrip } from '@/components/page'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface KpiItem {
  label: string
  value: string
  mono?: boolean
  danger?: boolean
  onClick: () => void
}


export interface TabDef {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export interface TimelineFilterDef {
  key: string | undefined
  label: string
}

export interface PartyDetailLayoutProps {
  /* identity */
  pageTitle: string
  backLabel: string
  backPath: string
  notFoundLabel: string

  /* data */
  party: object | null | undefined
  isLoading: boolean
  partyName: string
  partyCode: string
  subtitle: string
  notes?: string

  /* party id for contacts / locations */
  partyId: number

  /* KPIs */
  kpiItems: KpiItem[]

  /* title row: extra actions rendered before Print button */
  titleActions?: ReactNode

  /* title row: primary action (far right) */
  primaryAction?: ReactNode

  /* tabs */
  tabs: TabDef[]

  /* timeline */
  timeline: TimelineEvent[] | undefined
  timelineFilter: string | undefined
  setTimelineFilter: (f: string | undefined) => void
  timelineFilters: readonly TimelineFilterDef[]

  /* orders tab content (different for customer vs vendor) */
  ordersTabContent: ReactNode

  /* extra tab content: render function receiving activeTab */
  extraTabContent?: (activeTab: string) => ReactNode

  /* locations */
  locations: Location[]

  /* optional content rendered above the locations table (e.g. customer defaults editor) */
  locationsTabPrefix?: ReactNode

  /* contacts */
  contacts: Contact[]

  /* attachments */
  attachments: CustomerAttachment[] | undefined
  onUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDeleteAttachment: (id: number) => void
  isDeleteAttachmentPending: boolean

  /* location party id (party FK) */
  locationPartyId: number

  /* empty-state entity label ("customer" | "vendor") */
  entityLabel: string

  /* favorite star */
  entityType?: EntityType
  entityId?: number
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PartyDetailLayout(props: PartyDetailLayoutProps) {
  const {
    backLabel,
    backPath,
    notFoundLabel,
    party,
    isLoading,
    partyName,
    partyCode,
    subtitle,
    notes,
    kpiItems,
    titleActions,
    primaryAction,
    tabs,
    timeline,
    timelineFilter,
    setTimelineFilter,
    timelineFilters,
    ordersTabContent,
    extraTabContent,
    locations,
    locationsTabPrefix,
    contacts,
    attachments,
    onUploadFile,
    onDeleteAttachment,
    isDeleteAttachmentPending,
    locationPartyId,
    entityLabel,
    entityType,
    entityId,
  } = props

  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  /* favorites */
  const { data: favorites } = useFavorites(entityType)
  const addFavorite = useAddFavorite()
  const removeFavorite = useRemoveFavorite()
  const favRecord = entityId != null ? favorites?.find(f => f.object_id === entityId) : undefined
  const isFavorited = !!favRecord

  const handleToggleFavorite = () => {
    if (!entityType || entityId == null) return
    if (isFavorited && favRecord) {
      removeFavorite.mutate(favRecord.id)
    } else {
      addFavorite.mutate({ entity_type: entityType, object_id: entityId })
    }
  }

  const [activeTab, setActiveTab] = useState<string>('timeline')

  /* location dialog state */
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [deleteLocationDialogOpen, setDeleteLocationDialogOpen] = useState(false)
  const [pendingDeleteLocationId, setPendingDeleteLocationId] = useState<number | null>(null)
  const deleteLocation = useDeleteLocation()

  /* attachment delete dialog state */
  const [deleteAttachmentDialogOpen, setDeleteAttachmentDialogOpen] = useState(false)
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState<number | null>(null)

  /* handlers */
  const handleConfirmDeleteAttachment = async () => {
    if (!pendingDeleteAttachmentId) return
    try {
      onDeleteAttachment(pendingDeleteAttachmentId)
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

  /* loading */
  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
          <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  /* not found */
  if (!party) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
          <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>{notFoundLabel}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className={isMobile ? 'px-4 py-4 pb-16' : 'max-w-[1080px] mx-auto px-8 py-7 pb-16'} data-print-hide>

        {/* Breadcrumb */}
        {isMobile ? (
          <div className="flex items-center gap-2 mb-4 animate-in">
            <button
              onClick={() => navigate(backPath)}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
              style={{ color: 'var(--so-text-tertiary)', minHeight: 44 }}
            >
              <ArrowLeft className="h-4 w-4" />{backLabel}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-5 animate-in">
            <button
              onClick={() => navigate(backPath)}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
              style={{ color: 'var(--so-text-tertiary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
            >
              <ArrowLeft className="h-3.5 w-3.5" />{backLabel}
            </button>
            <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
            <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{partyName}</span>
          </div>
        )}

        {/* Title Row */}
        {isMobile ? (
          <div className="mb-4 animate-in delay-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold flex-1" style={{ color: 'var(--so-text-primary)' }}>{partyName}</h1>
              {entityType && entityId != null && (
                <button
                  onClick={handleToggleFavorite}
                  title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  className="inline-flex items-center justify-center cursor-pointer"
                  style={{ background: 'none', border: 'none', padding: '4px', minWidth: 44, minHeight: 44 }}
                >
                  <Star
                    style={{
                      width: 20,
                      height: 20,
                      fill: isFavorited ? '#f59e0b' : 'none',
                      color: isFavorited ? '#f59e0b' : 'var(--so-text-tertiary)',
                      transition: 'fill 0.15s, color 0.15s',
                    }}
                  />
                </button>
              )}
              <div className="flex items-center gap-2" data-print-hide>
                {titleActions}
                {primaryAction}
              </div>
            </div>
            <p className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>{subtitle}</p>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4 mb-6 animate-in delay-1">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>{partyName}</h1>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold font-mono"
                  style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border)', color: 'var(--so-text-tertiary)' }}
                >
                  {partyCode}
                </span>
                {entityType && entityId != null && (
                  <button
                    onClick={handleToggleFavorite}
                    title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    className="inline-flex items-center justify-center transition-colors cursor-pointer"
                    style={{ background: 'none', border: 'none', padding: '2px' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    <Star
                      style={{
                        width: 18,
                        height: 18,
                        fill: isFavorited ? '#f59e0b' : 'none',
                        color: isFavorited ? '#f59e0b' : 'var(--so-text-tertiary)',
                        transition: 'fill 0.15s, color 0.15s',
                      }}
                    />
                  </button>
                )}
              </div>
              <p className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>{subtitle}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0" data-print-hide>
              {titleActions}
              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => window.print()}
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </button>
              {primaryAction}
            </div>
          </div>
        )}

        {/* Notes */}
        {notes && (
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-1"
               style={{ background: 'color-mix(in srgb, var(--so-warning) 6%, var(--so-surface))', borderColor: 'color-mix(in srgb, var(--so-warning) 25%, var(--so-border))' }}>
            <div className="px-5 py-3 flex items-start gap-3">
              <StickyNote className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--so-warning)' }} />
              <p className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>{notes}</p>
            </div>
          </div>
        )}

        <div className="mb-6 animate-in delay-2">
          <KpiGrid columns={6}>
            {kpiItems.map((kpi, idx) => (
              <KpiCard
                key={idx}
                label={kpi.label}
                value={kpi.mono ? <span className="font-mono">{kpi.value}</span> : kpi.value}
                tone={kpi.danger ? 'negative' : 'default'}
                onClick={kpi.onClick}
              />
            ))}
          </KpiGrid>
        </div>

        <div className="mb-6 animate-in delay-3">
          <TabStrip
            tabs={tabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon as any }))}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* ============ Timeline Tab ============ */}
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
                          event.type === 'order' ? '#3b82f6' :
                          event.type === 'estimate' ? '#8b5cf6' :
                          event.type === 'invoice' ? '#f59e0b' :
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

        {/* ============ Orders Tab ============ */}
        {activeTab === 'orders' && ordersTabContent}

        {/* ============ Contacts Tab ============ */}
        {activeTab === 'contacts' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-4"
               style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Contacts</span>
              <button
                className={primaryBtnClass}
                style={primaryBtnStyle}
                onClick={() => navigate(`/contacts/new?party=${locationPartyId}`)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Contact
              </button>
            </div>
            <div className={isMobile ? 'px-4 py-4' : 'px-6 py-5'}>
              {contacts.length > 0 ? (
                isMobile ? (
                  <div className="space-y-2">
                    {contacts.map((c: Contact) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-xl cursor-pointer"
                        style={{ border: '1px solid var(--so-border)', background: 'var(--so-bg)' }}
                        onClick={() => navigate(`/contacts/${c.id}`)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[14px]" style={{ color: 'var(--so-text-primary)' }}>
                            {c.first_name} {c.last_name}
                          </span>
                          {c.is_primary && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                              style={{ background: 'var(--so-success-bg)', color: 'var(--so-success-text)' }}
                            >
                              Primary
                            </span>
                          )}
                        </div>
                        {c.title && (
                          <div className="text-[13px] mt-0.5" style={{ color: 'var(--so-text-secondary)' }}>{c.title}</div>
                        )}
                        <div className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
                          {[c.email, c.phone].filter(Boolean).join(' · ') || '\u2014'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: 'var(--so-bg)' }}>
                        <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Name</th>
                        <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Title</th>
                        <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Email</th>
                        <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Phone</th>
                        <th className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left" style={{ color: 'var(--so-text-tertiary)' }}>Primary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c: Contact) => (
                        <tr
                          key={c.id}
                          className="cursor-pointer"
                          style={{ borderBottom: '1px solid var(--so-border-light)' }}
                          onClick={() => navigate(`/contacts/${c.id}`)}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td className="py-3 px-4 text-sm font-medium">{c.first_name} {c.last_name}</td>
                          <td className="py-3 px-4 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>{c.title || '\u2014'}</td>
                          <td className="py-3 px-4 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>{c.email || '\u2014'}</td>
                          <td className="py-3 px-4 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>{c.phone || '\u2014'}</td>
                          <td className="py-3 px-4">
                            {c.is_primary && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                style={{ background: 'var(--so-success-bg)', color: 'var(--so-success-text)' }}
                              >
                                Primary
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>
                  <Phone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No contacts for this {entityLabel}</p>
                  <button
                    className={outlineBtnClass + ' mt-3'}
                    style={outlineBtnStyle}
                    onClick={() => navigate(`/contacts/new?party=${locationPartyId}`)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add First Contact
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ Locations Tab ============ */}
        {activeTab === 'locations' && (
          <>
          {locationsTabPrefix}
          <div
            className="rounded-[14px] animate-in delay-3"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
          >
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <h2 className="text-[14px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>Locations</h2>
              <button
                className={primaryBtnClass}
                style={primaryBtnStyle}
                onClick={() => { setEditingLocation(null); setLocationDialogOpen(true) }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Location
              </button>
            </div>
            <div className={isMobile ? 'px-4 py-4' : 'px-6 py-5'}>
              {locations.length > 0 ? (
                isMobile ? (
                  <div className="space-y-2">
                    {locations.map((loc: Location) => (
                      <div
                        key={loc.id}
                        className="p-3 rounded-xl cursor-pointer"
                        style={{ border: '1px solid var(--so-border)', background: 'var(--so-bg)' }}
                        onClick={() => { setEditingLocation(loc); setLocationDialogOpen(true) }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium font-mono text-[14px]" style={{ color: 'var(--so-text-primary)' }}>
                            {loc.code}
                          </span>
                          <div className="flex items-center gap-1">
                            {getStatusBadge(loc.is_active ? 'active' : 'inactive')}
                            <button
                              className="inline-flex items-center justify-center rounded-md cursor-pointer"
                              style={{ width: 36, height: 36, color: 'var(--so-danger-text)', background: 'transparent', border: 'none' }}
                              onClick={(e) => { e.stopPropagation(); setPendingDeleteLocationId(loc.id); setDeleteLocationDialogOpen(true) }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="text-[13px]" style={{ color: 'var(--so-text-primary)' }}>{loc.name}</div>
                        <div className="text-[13px] mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
                          {loc.location_type}
                          {(loc.city || loc.state) ? ` · ${loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.full_address || ''}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
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
                      {locations.map((loc: Location) => (
                        <tr
                          key={loc.id}
                          className="cursor-pointer"
                          style={{ borderBottom: '1px solid var(--so-border-light)' }}
                          onClick={() => { setEditingLocation(loc); setLocationDialogOpen(true) }}
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
                                onClick={(e) => { e.stopPropagation(); setEditingLocation(loc); setLocationDialogOpen(true) }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer"
                                style={{ color: 'var(--so-danger-text)', background: 'transparent', border: 'none' }}
                                title="Delete location"
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-danger-bg)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                onClick={(e) => { e.stopPropagation(); setPendingDeleteLocationId(loc.id); setDeleteLocationDialogOpen(true) }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                <div className="text-center py-8" style={{ color: 'var(--so-text-tertiary)' }}>
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No locations for this {entityLabel}</p>
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
          </>
        )}

        {/* ============ Documents Tab ============ */}
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
                    onChange={onUploadFile}
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

        {/* ============ Price Lists Tab ============ */}
        {activeTab === 'price-lists' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-4" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Price Lists</span>
              <button
                className={primaryBtnClass}
                style={primaryBtnStyle}
                onClick={() => navigate('/price-lists/new')}
              >
                <Plus className="h-3.5 w-3.5" />
                New Price List
              </button>
            </div>
            <div className="p-6 text-center py-10">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--so-text-tertiary)' }} />
              <p className="text-[13px] mb-4" style={{ color: 'var(--so-text-tertiary)' }}>
                View and manage pricing for this {entityLabel}.
              </p>
              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => navigate('/price-lists')}
              >
                <Eye className="h-3.5 w-3.5" />
                View All Price Lists
              </button>
            </div>
          </div>
        )}

        {/* ============ Extra Tab Content (page-specific) ============ */}
        {extraTabContent?.(activeTab)}

      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={deleteAttachmentDialogOpen}
        onOpenChange={setDeleteAttachmentDialogOpen}
        title="Delete Attachment"
        description="Are you sure you want to delete this attachment? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDeleteAttachment}
        loading={isDeleteAttachmentPending}
      />
      <LocationDialog
        open={locationDialogOpen}
        onOpenChange={(open) => {
          setLocationDialogOpen(open)
          if (!open) setEditingLocation(null)
        }}
        location={editingLocation}
        partyId={locationPartyId}
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
