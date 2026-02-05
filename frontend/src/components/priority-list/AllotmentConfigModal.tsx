import { memo, useState, useEffect } from 'react'
import { useVendorAllotments, useSetVendorAllotment } from '@/api/priorityList'
import { useVendors } from '@/api/parties'
import type { BoxType } from '@/types/api'

const BOX_TYPES: BoxType[] = ['RSC', 'DC', 'HSC', 'FOL', 'TELE', 'OTHER']

interface AllotmentConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Modal for configuring vendor kick allotments.
 */
export const AllotmentConfigModal = memo(function AllotmentConfigModal({
  isOpen,
  onClose,
}: AllotmentConfigModalProps) {
  const { data: allotments, isLoading: allotmentsLoading } = useVendorAllotments()
  const { data: vendorsData, isLoading: vendorsLoading } = useVendors()
  const setAllotmentMutation = useSetVendorAllotment()
  const vendors = vendorsData?.results ?? []

  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<Record<BoxType, string>>({
    RSC: '0',
    DC: '0',
    HSC: '0',
    FOL: '0',
    TELE: '0',
    OTHER: '0',
  })
  const [isSaving, setIsSaving] = useState(false)

  // Update edit values when vendor selection changes
  useEffect(() => {
    if (!selectedVendorId || !allotments) {
      setEditValues({
        RSC: '0', DC: '0', HSC: '0', FOL: '0', TELE: '0', OTHER: '0',
      })
      return
    }

    const vendorAllotments = allotments.filter((a) => a.vendor === selectedVendorId)
    const values: Record<BoxType, string> = {
      RSC: '0', DC: '0', HSC: '0', FOL: '0', TELE: '0', OTHER: '0',
    }

    for (const allotment of vendorAllotments) {
      values[allotment.box_type] = String(allotment.daily_allotment)
    }

    setEditValues(values)
  }, [selectedVendorId, allotments])

  const handleSave = async () => {
    if (!selectedVendorId) return

    setIsSaving(true)
    try {
      for (const boxType of BOX_TYPES) {
        const value = parseInt(editValues[boxType], 10)
        if (!isNaN(value) && value >= 0) {
          await setAllotmentMutation.mutateAsync({
            vendor_id: selectedVendorId,
            box_type: boxType,
            daily_allotment: value,
          })
        }
      }
      onClose()
    } catch (error) {
      console.error('Failed to save allotments:', error)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  const isLoading = allotmentsLoading || vendorsLoading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Configure Vendor Allotments
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Set default daily kick allotments per box type
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Vendor selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Vendor
                </label>
                <select
                  value={selectedVendorId ?? ''}
                  onChange={(e) => setSelectedVendorId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select a vendor --</option>
                  {vendors?.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.party_display_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Allotment inputs */}
              {selectedVendorId && (
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-800">Daily Allotments by Box Type</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {BOX_TYPES.map((boxType) => (
                      <div key={boxType}>
                        <label className="block text-sm text-gray-600 mb-1">
                          {boxType}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={editValues[boxType]}
                          onChange={(e) =>
                            setEditValues((prev) => ({
                              ...prev,
                              [boxType]: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedVendorId || isSaving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Allotments'}
          </button>
        </div>
      </div>
    </div>
  )
})
