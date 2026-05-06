import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useDesignRequests, useCheckoutDesign, useReleaseDesign } from '@/api/design'
import { useAuth } from '@/hooks/useAuth'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { primaryBtnClass, primaryBtnStyle, outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import type { DesignRequest } from '@/types/api'

type FilterTab = 'pending' | 'my-work' | 'all'

function DesignRequestCard({ dr, currentUserId }: { dr: DesignRequest; currentUserId: number | undefined }) {
  const navigate = useNavigate()
  const checkoutMutation = useCheckoutDesign()
  const releaseMutation = useReleaseDesign()

  const dims = [dr.length, dr.width, dr.depth].filter(Boolean).join(' x ')
  const styleAndDims = [dr.style, dims].filter(Boolean).join(' ')

  return (
    <div
      className="rounded-[14px] p-5 flex flex-col gap-3"
      style={{
        border: '1px solid var(--so-border)',
        background: 'var(--so-surface)',
      }}
    >
      {/* Top row: file number + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold font-mono text-[15px]" style={{ color: 'var(--so-text-primary)' }}>
              {dr.file_number}
            </span>
            {dr.ident && (
              <span className="text-[13px] font-medium truncate" style={{ color: 'var(--so-text-secondary)' }}>
                {dr.ident}
              </span>
            )}
          </div>
          {dr.customer_name && (
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              {dr.customer_name}
            </p>
          )}
        </div>
        {getStatusBadge(dr.status)}
      </div>

      {/* Style + dimensions */}
      {styleAndDims && (
        <p className="text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
          {styleAndDims}
        </p>
      )}

      {/* Checked out info */}
      {dr.checked_out_by && (
        <p className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
          Checked out by {dr.checked_out_by_name || 'someone'}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1">
        {dr.status === 'pending' && !dr.checked_out_by && (
          <button
            className={primaryBtnClass}
            style={checkoutMutation.isPending ? { ...primaryBtnStyle, opacity: 0.6 } : primaryBtnStyle}
            onClick={() => checkoutMutation.mutate(dr.id)}
            disabled={checkoutMutation.isPending}
          >
            {checkoutMutation.isPending ? 'Checking out...' : 'Check Out'}
          </button>
        )}
        {dr.checked_out_by === currentUserId && (
          <button
            className={outlineBtnClass}
            style={releaseMutation.isPending ? { ...outlineBtnStyle, opacity: 0.6 } : outlineBtnStyle}
            onClick={() => releaseMutation.mutate(dr.id)}
            disabled={releaseMutation.isPending}
          >
            {releaseMutation.isPending ? 'Releasing...' : 'Release'}
          </button>
        )}
        <button
          className={outlineBtnClass}
          style={outlineBtnStyle}
          onClick={() => navigate(`/design-requests/${dr.id}`)}
        >
          Open
        </button>
      </div>
    </div>
  )
}

export default function DesignWorkbench() {
  usePageTitle('Design Workbench')
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<FilterTab>('pending')

  // Fetch all requests to compute counts, then filter client-side
  const { data: allData, isLoading } = useDesignRequests()
  const allRequests = allData?.results ?? []

  const pendingRequests = allRequests.filter((dr) => dr.status === 'pending')
  const myWorkRequests = allRequests.filter((dr) => user?.id && dr.checked_out_by === user.id)

  const displayedRequests: DesignRequest[] =
    activeTab === 'pending'
      ? pendingRequests
      : activeTab === 'my-work'
      ? myWorkRequests
      : allRequests

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: pendingRequests.length },
    { key: 'my-work', label: 'My Work', count: myWorkRequests.length },
    { key: 'all', label: 'All', count: allRequests.length },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">

        {/* Header */}
        <div className="mb-8 animate-in">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Design Workbench</h1>
          <p className="mt-1 text-[13.5px]" style={{ color: 'var(--so-text-muted)' }}>
            Check out and work on design requests
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap items-center gap-1 mb-6 animate-in delay-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-all cursor-pointer"
                style={
                  isActive
                    ? { background: 'var(--so-accent)', color: '#fff', border: '1px solid var(--so-accent)' }
                    : { background: 'transparent', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border)' }
                }
              >
                {tab.label}
                <span
                  className="inline-flex items-center justify-center rounded-full text-[11px] font-semibold px-1.5 min-w-[20px] h-4"
                  style={
                    isActive
                      ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                      : { background: 'var(--so-border-light)', color: 'var(--so-text-tertiary)' }
                  }
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Card grid */}
        {isLoading ? (
          <div className="text-center py-16 text-sm animate-in delay-2" style={{ color: 'var(--so-text-muted)' }}>
            Loading...
          </div>
        ) : displayedRequests.length === 0 ? (
          <div
            className="rounded-[14px] py-16 text-center animate-in delay-2"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
          >
            <p className="text-[13px]" style={{ color: 'var(--so-text-muted)' }}>
              {activeTab === 'pending'
                ? 'No pending design requests'
                : activeTab === 'my-work'
                ? 'You have no design requests checked out'
                : 'No design requests found'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in delay-2">
            {displayedRequests.map((dr) => (
              <DesignRequestCard key={dr.id} dr={dr} currentUserId={user?.id} />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
