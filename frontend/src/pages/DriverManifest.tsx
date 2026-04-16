import { useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { primaryBtnClass, primaryBtnStyle, outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import { useDriverManifest, useStartRun, useArriveAtStop } from '@/api/logistics'
import { ChevronDown, ChevronRight, MapPin, Package, Truck } from 'lucide-react'

export default function DriverManifest() {
  usePageTitle('Driver Manifest')

  const [expandedStops, setExpandedStops] = useState<Set<number>>(new Set())

  const { data: manifest, isLoading, isError } = useDriverManifest()
  const startRun = useStartRun()
  const arriveAtStop = useArriveAtStop()

  function toggleStop(id: number) {
    setExpandedStops((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Driver Manifest</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>{today}</p>
          </div>
          {manifest && !manifest.is_complete && manifest.stops.every((s) => s.arrived_at === null) && (
            <button
              className={primaryBtnClass}
              style={primaryBtnStyle}
              onClick={() => startRun.mutate()}
              disabled={startRun.isPending}
            >
              <Truck className="h-3.5 w-3.5" />
              {startRun.isPending ? 'Starting...' : 'Start Run'}
            </button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4 animate-in">
            <Skeleton className="h-32 w-full rounded-[14px]" />
            <Skeleton className="h-48 w-full rounded-[14px]" />
            <Skeleton className="h-48 w-full rounded-[14px]" />
          </div>
        )}

        {/* Error */}
        {isError && (
          <Card className="animate-in">
            <CardContent className="py-10 text-center">
              <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                Failed to load manifest. Please try again.
              </p>
            </CardContent>
          </Card>
        )}

        {/* No run */}
        {!isLoading && !isError && !manifest && (
          <Card className="animate-in">
            <CardContent className="py-14 text-center">
              <Truck className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--so-text-tertiary)' }} />
              <p className="text-base font-medium" style={{ color: 'var(--so-text-primary)' }}>
                No run scheduled for today
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
                Check back later or contact your dispatcher.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Run content */}
        {!isLoading && !isError && manifest && (
          <div className="space-y-5 animate-in delay-1">

            {/* Summary card */}
            <div className="rounded-[14px] overflow-hidden"
              style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
              <div className="px-6 py-4"
                style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4" style={{ color: 'var(--so-accent)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                    {manifest.run_name}
                  </span>
                  {getStatusBadge(manifest.is_complete ? 'COMPLETED' : 'PENDING')}
                </div>
              </div>
              <div className="grid grid-cols-4 divide-x px-0"
                style={{ borderColor: 'var(--so-border)' }}>
                <div className="px-6 py-5">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--so-text-tertiary)' }}>Truck</div>
                  <div className="text-lg font-bold" style={{ color: 'var(--so-text-primary)' }}>
                    {manifest.truck_name}
                  </div>
                </div>
                <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--so-text-tertiary)' }}>Total Stops</div>
                  <div className="text-lg font-bold" style={{ color: 'var(--so-text-primary)' }}>
                    {manifest.total_stops}
                  </div>
                </div>
                <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--so-text-tertiary)' }}>Total Weight</div>
                  <div className="text-lg font-bold" style={{ color: 'var(--so-text-primary)' }}>
                    {parseFloat(manifest.total_weight_lbs).toLocaleString(undefined, { minimumFractionDigits: 1 })} lbs
                  </div>
                </div>
                <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--so-text-tertiary)' }}>Completed</div>
                  <div className="text-lg font-bold" style={{ color: 'var(--so-text-primary)' }}>
                    {manifest.stops.filter((s) => s.delivered_at !== null).length} / {manifest.total_stops}
                  </div>
                </div>
              </div>
            </div>

            {/* Stops list */}
            <div className="space-y-3">
              {manifest.stops.map((stop) => {
                const isExpanded = expandedStops.has(stop.id)
                const isPending = stop.status === 'PENDING'

                return (
                  <div key={stop.id} className="rounded-[14px] overflow-hidden"
                    style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>

                    {/* Stop header */}
                    <div className="px-6 py-4"
                      style={{ background: 'var(--so-surface-raised)', borderBottom: isExpanded ? '1px solid var(--so-border-light)' : undefined }}>
                      <div className="flex items-start gap-4">

                        {/* Sequence number */}
                        <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                          style={{ background: 'var(--so-accent)', color: '#fff' }}>
                          {stop.sequence}
                        </div>

                        {/* Stop info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold text-base" style={{ color: 'var(--so-text-primary)' }}>
                              {stop.customer_name}
                            </span>
                            {getStatusBadge(stop.status)}
                          </div>
                          <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{stop.address}{stop.city ? `, ${stop.city}` : ''}</span>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--so-text-secondary)' }}>
                            <span className="flex items-center gap-1">
                              <Package className="h-3.5 w-3.5" />
                              {stop.orders.length} {stop.orders.length === 1 ? 'order' : 'orders'}
                            </span>
                            <span>{stop.pallet_count} {stop.pallet_count === 1 ? 'pallet' : 'pallets'}</span>
                            {stop.arrived_at && (
                              <span>Arrived {new Date(stop.arrived_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                            {stop.delivered_at && (
                              <span>Delivered {new Date(stop.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isPending && (
                            <button
                              className={primaryBtnClass}
                              style={primaryBtnStyle}
                              onClick={() => arriveAtStop.mutate({ id: stop.id })}
                              disabled={arriveAtStop.isPending}
                            >
                              Mark Arrived
                            </button>
                          )}
                          <button
                            className={outlineBtnClass}
                            style={outlineBtnStyle}
                            onClick={() => toggleStop(stop.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable order details */}
                    {isExpanded && (
                      <div className="px-6 py-4">
                        {stop.orders.length === 0 ? (
                          <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>No orders for this stop.</p>
                        ) : (
                          <div className="space-y-4">
                            {stop.orders.map((order) => (
                              <div key={order.id}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="font-mono text-sm font-semibold" style={{ color: 'var(--so-accent)' }}>
                                    {order.order_number}
                                  </span>
                                  {order.customer_po && (
                                    <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
                                      PO: {order.customer_po}
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-1 pl-3"
                                  style={{ borderLeft: '2px solid var(--so-border)' }}>
                                  {order.lines.map((line, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-sm">
                                      <span style={{ color: 'var(--so-text-secondary)' }}>
                                        {line.item_name}
                                        {line.item_sku && (
                                          <span className="ml-1 font-mono text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
                                            ({line.item_sku})
                                          </span>
                                        )}
                                      </span>
                                      <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
                                        {line.quantity} {line.uom_code}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {stop.delivery_notes && (
                          <div className="mt-4 px-4 py-3 rounded-lg text-sm"
                            style={{ background: 'var(--so-surface-raised)', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border-light)' }}>
                            <span className="font-semibold" style={{ color: 'var(--so-text-tertiary)' }}>Notes: </span>
                            {stop.delivery_notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
