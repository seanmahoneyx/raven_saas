import { memo, useCallback, useEffect } from 'react'
import { useSchedulerStore, selectSelectedOrder, type Order } from './useSchedulerStore'

const STATUS_COLORS: Record<Order['status'], { bg: string; text: string; label: string }> = {
  unscheduled: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Unscheduled' },
  picked: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Picked' },
  packed: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Packed' },
  shipped: { bg: 'bg-sky-100', text: 'text-sky-800', label: 'Shipped' },
  invoiced: { bg: 'bg-violet-100', text: 'text-violet-800', label: 'Invoiced' },
}

export const OrderDetailModal = memo(function OrderDetailModal() {
  const order = useSchedulerStore(selectSelectedOrder)
  const setSelectedOrderId = useSchedulerStore((s) => s.setSelectedOrderId)

  const handleClose = useCallback(() => {
    setSelectedOrderId(null)
  }, [setSelectedOrderId])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    if (order) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [order, handleClose])

  if (!order) return null

  const statusStyle = STATUS_COLORS[order.status]

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-xl shadow-2xl w-[420px] max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-700">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <div className={`
              w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold
              ${order.type === 'SO' ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'}
            `}>
              {order.type}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">{order.orderNumber}</h2>
              <p className="text-sm text-white/70">{order.customerCode}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
              {statusStyle.label}
            </span>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg px-3 py-2.5">
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-0.5">Pallets</div>
              <div className="text-xl font-bold text-slate-800">{order.palletCount}</div>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2.5">
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-0.5">Scheduled</div>
              <div className="text-sm font-semibold text-slate-800">
                {order.date ? new Date(order.date + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                }) : 'Not scheduled'}
              </div>
            </div>
          </div>

          {/* Order Type Info */}
          <div className="bg-slate-50 rounded-lg px-3 py-2.5">
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-0.5">Type</div>
            <div className="text-sm font-medium text-slate-700">
              {order.type === 'SO' ? 'Sales Order (Outbound)' : 'Purchase Order (Inbound)'}
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M3 4.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM6.25 3a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 7.25a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 11.5a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM4 12.25a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM3 8.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
                </svg>
                Notes
              </div>
              <div className="text-sm text-amber-900">{order.notes}</div>
            </div>
          )}

          {/* Read-only indicator */}
          {order.isReadOnly && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg text-xs text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-slate-400">
                <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
              </svg>
              This order is locked and cannot be moved
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200">
          <button
            type="button"
            onClick={handleClose}
            className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
})
