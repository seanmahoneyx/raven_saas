import { memo } from 'react'

interface KicksIndicatorProps {
  scheduled: number
  allotment: number
  isOverride: boolean
  onEditOverride?: (e?: React.MouseEvent) => void
}

/**
 * Visual indicator showing kick allotment usage.
 * Displays a progress bar and numeric values.
 */
export const KicksIndicator = memo(function KicksIndicator({
  scheduled,
  allotment,
  isOverride,
  onEditOverride,
}: KicksIndicatorProps) {
  const remaining = Math.max(0, allotment - scheduled)
  const percentage = allotment > 0 ? Math.min(100, (scheduled / allotment) * 100) : 0
  const isOverCapacity = scheduled > allotment

  // Color based on capacity usage
  let barColor = 'bg-green-500'
  if (percentage >= 80) barColor = 'bg-yellow-500'
  if (percentage >= 100) barColor = 'bg-red-500'

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Progress bar */}
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>

      {/* Remaining kicks */}
      <span className="text-gray-500">
        ({remaining.toLocaleString()} left)
      </span>

      {/* Override indicator */}
      {isOverride && (
        <span
          className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium cursor-pointer hover:bg-blue-200"
          onClick={onEditOverride}
          title="Daily override active - click to edit"
        >
          Override
        </span>
      )}

      {/* Edit button */}
      {onEditOverride && !isOverride && (
        <button
          className="text-gray-400 hover:text-gray-600"
          onClick={onEditOverride}
          title="Set daily override"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}

      {/* Numeric display - rightmost for alignment with row kicks */}
      <span className={`w-20 text-right font-mono ${isOverCapacity ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
        {scheduled.toLocaleString()}/{allotment.toLocaleString()}
      </span>
    </div>
  )
})
