import { memo, useState } from 'react'
import { usePriorityListStore } from './usePriorityListStore'
import { useSetDailyOverride, useClearDailyOverride } from '@/api/priorityList'
import type { BoxType } from '@/types/api'

interface OverridePopoverProps {
  vendorId: number
  boxType: BoxType
  date: string
  onClose: () => void
}

/**
 * Popover for editing daily kick overrides.
 */
export const OverridePopover = memo(function OverridePopover({
  vendorId,
  boxType,
  date,
  onClose,
}: OverridePopoverProps) {
  const allotments = usePriorityListStore((s) => s.allotments)
  const overrides = usePriorityListStore((s) => s.overrides)
  const vendors = usePriorityListStore((s) => s.vendors)

  const setOverrideMutation = useSetDailyOverride()
  const clearOverrideMutation = useClearDailyOverride()

  // Get current values
  const allotmentKey = `${vendorId}|${boxType}`
  const overrideKey = `${vendorId}|${boxType}|${date}`
  const defaultAllotment = allotments[allotmentKey]?.daily_allotment ?? 0
  const existingOverride = overrides[overrideKey]

  const [value, setValue] = useState(
    existingOverride?.allotment?.toString() ?? defaultAllotment.toString()
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Format date for display
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  const handleSave = async () => {
    const numValue = parseInt(value, 10)
    if (isNaN(numValue) || numValue < 0) return

    setIsSubmitting(true)
    try {
      await setOverrideMutation.mutateAsync({
        vendor_id: vendorId,
        box_type: boxType,
        date,
        allotment: numValue,
      })
      onClose()
    } catch (error) {
      console.error('Failed to set override:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClear = async () => {
    if (!existingOverride) {
      onClose()
      return
    }

    setIsSubmitting(true)
    try {
      await clearOverrideMutation.mutateAsync({
        vendor_id: vendorId,
        box_type: boxType,
        date,
      })
      onClose()
    } catch (error) {
      console.error('Failed to clear override:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl p-4 w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900 mb-3">
          Daily Override
        </h3>

        <div className="text-sm text-gray-600 mb-4 space-y-1">
          <p><span className="font-medium">Vendor:</span> {vendors[vendorId]?.name}</p>
          <p><span className="font-medium">Box Type:</span> {boxType}</p>
          <p><span className="font-medium">Date:</span> {formatDate(date)}</p>
          <p><span className="font-medium">Default Allotment:</span> {defaultAllotment}</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Override Allotment
          </label>
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter allotment"
          />
          {existingOverride && (
            <p className="mt-1 text-xs text-blue-600">
              Current override: {existingOverride.allotment}
            </p>
          )}
        </div>

        <div className="flex justify-between">
          {existingOverride ? (
            <button
              onClick={handleClear}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
            >
              Clear Override
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})
