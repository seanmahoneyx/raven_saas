import { useMemo, useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { PriorityListView } from '@/components/priority-list/PriorityListView'
import { format, addWeeks, startOfWeek } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import { useVendors } from '@/api/parties'

import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'

const MAX_WEEKS = 12

export default function PriorityList() {
  usePageTitle('Priority List')

  const { vendorId } = useParams<{ vendorId?: string }>()
  const navigate = useNavigate()
  const initialVendorId = vendorId ? parseInt(vendorId, 10) : null

  const { data: vendorsData } = useVendors()
  const vendorName = initialVendorId
    ? vendorsData?.results?.find((v) => v.id === initialVendorId)?.party_display_name ?? ''
    : ''

  const [weeksLoaded, setWeeksLoaded] = useState(2)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { startDate, endDate } = useMemo(() => {
    const today = new Date()
    const start = startOfWeek(today, { weekStartsOn: 1 })
    const end = addWeeks(start, weeksLoaded)

    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    }
  }, [weeksLoaded])

  // Infinite scroll: load more weeks when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && weeksLoaded < MAX_WEEKS) {
          setWeeksLoaded((prev) => Math.min(prev + 1, MAX_WEEKS))
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [weeksLoaded])

  const handleToday = () => {
    setWeeksLoaded(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <ErrorBoundary>
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-7 animate-in">
            <div className="min-w-0">
              {initialVendorId && (
                <button
                  className={outlineBtnClass}
                  style={{ ...outlineBtnStyle, marginBottom: '10px' }}
                  onClick={() => navigate(`/vendors/${vendorId}`)}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Vendor
                </button>
              )}
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Priority List</h1>
              <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
                {initialVendorId && vendorName
                  ? `Manage production priorities for ${vendorName}`
                  : 'Manage vendor production priorities'}
              </p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="px-4 py-2 rounded-md text-[13px] font-medium text-center"
                style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-tertiary)' }}>
                From {format(new Date(startDate + 'T00:00:00'), 'MMM d, yyyy')}
              </div>

              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={handleToday}
              >
                Today
              </button>
            </div>
          </div>

          {/* Main content */}
          <div>
            <PriorityListView startDate={startDate} endDate={endDate} initialVendorId={initialVendorId} />
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="py-4 text-center">
            {weeksLoaded < MAX_WEEKS ? (
              <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                Loading more...
              </span>
            ) : (
              <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                Showing {MAX_WEEKS} weeks of upcoming dates
              </span>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
