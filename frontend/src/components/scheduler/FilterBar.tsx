import { memo, useMemo } from 'react'
import {
  useSchedulerStore,
  selectFilterCustomerCode,
  selectFilterStatus,
  type OrderStatus,
} from './useSchedulerStore'

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'unscheduled', label: 'Unscheduled' },
  { value: 'picked', label: 'Picked' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'invoiced', label: 'Invoiced' },
]

export const FilterBar = memo(function FilterBar() {
  const filterCustomerCode = useSchedulerStore(selectFilterCustomerCode)
  const filterStatus = useSchedulerStore(selectFilterStatus)
  const orders = useSchedulerStore((s) => s.orders)
  const setFilterCustomerCode = useSchedulerStore((s) => s.setFilterCustomerCode)
  const setFilterStatus = useSchedulerStore((s) => s.setFilterStatus)

  // Memoize customer codes to avoid infinite re-renders
  const customerCodes = useMemo(() => {
    const codes = new Set<string>()
    for (const order of Object.values(orders)) {
      if (order.customerCode) {
        codes.add(order.customerCode)
      }
    }
    return Array.from(codes).sort()
  }, [orders])

  const hasFilters = filterCustomerCode !== null || filterStatus !== null

  const handleClearFilters = () => {
    setFilterCustomerCode(null)
    setFilterStatus(null)
  }

  return (
    <div className="flex items-center gap-4 px-5 py-2 bg-white border-b border-slate-200 shadow-sm">
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-slate-400">
          <path d="M14 2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2.172a2 2 0 0 0 .586 1.414l3.828 3.828A1 1 0 0 1 6.707 10v3.586a.5.5 0 0 0 .707.457l2-.857a.5.5 0 0 0 .293-.457v-2.729a1 1 0 0 1 .293-.707l3.828-3.828A2 2 0 0 0 14 4.172V2Z" />
        </svg>
        <span className="text-xs font-medium text-slate-500">Filter</span>
      </div>

      {/* Customer Filter */}
      <select
        className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors cursor-pointer hover:border-slate-300"
        value={filterCustomerCode ?? ''}
        onChange={(e) => setFilterCustomerCode(e.target.value || null)}
      >
        <option value="">All Customers</option>
        {customerCodes.map((code) => (
          <option key={code} value={code}>{code}</option>
        ))}
      </select>

      {/* Status Filter */}
      <select
        className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors cursor-pointer hover:border-slate-300"
        value={filterStatus ?? ''}
        onChange={(e) => setFilterStatus((e.target.value || null) as OrderStatus | null)}
      >
        <option value="">All Statuses</option>
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Clear Filters Button */}
      {hasFilters && (
        <button
          type="button"
          onClick={handleClearFilters}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
          </svg>
          Clear
        </button>
      )}

      {/* Active Filter Indicator */}
      {hasFilters && (
        <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[10px] text-amber-700 font-medium">
            Filter active
          </span>
        </div>
      )}
    </div>
  )
})
