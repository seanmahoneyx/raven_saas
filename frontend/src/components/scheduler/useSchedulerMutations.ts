import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useUpdateSchedule,
  useBatchUpdateSchedule,
  useCreateDeliveryRun,
  useUpdateDeliveryRun,
  useDeleteDeliveryRun
} from '@/api/scheduling'
import { useSchedulerStore, type CellId } from './useSchedulerStore'

// Helper to parse cellId into truckId and date
function parseCellId(cellId: CellId): { truckId: number | null; date: string } | null {
  const pipeIdx = cellId.lastIndexOf('|')
  if (pipeIdx === -1) return null
  const truckIdStr = cellId.slice(0, pipeIdx)
  const date = cellId.slice(pipeIdx + 1)
  const truckId = truckIdStr === 'unassigned' ? null : parseInt(truckIdStr, 10)
  return { truckId, date }
}

export function useSchedulerMutations() {
  const queryClient = useQueryClient()

  // Store actions
  const moveOrder = useSchedulerStore((s) => s.moveOrder)
  const moveOrderLoose = useSchedulerStore((s) => s.moveOrderLoose)
  const moveRun = useSchedulerStore((s) => s.moveRun)
  // const createRunStore = useSchedulerStore((s) => s.createRun)
  // const dissolveRun = useSchedulerStore((s) => s.dissolveRun)
  const orders = useSchedulerStore((s) => s.orders)
  const runs = useSchedulerStore((s) => s.runs)
  const runToCell = useSchedulerStore((s) => s.runToCell)

  // API mutations
  const updateScheduleMutation = useUpdateSchedule()
  const batchUpdateMutation = useBatchUpdateSchedule()
  const createRunMutation = useCreateDeliveryRun()
  const updateRunMutation = useUpdateDeliveryRun()
  const deleteRunMutation = useDeleteDeliveryRun()

  // Schedule an order to a cell (as loose)
  const scheduleOrderToCell = useCallback(async (orderId: string, cellId: CellId) => {
    const order = orders[orderId]
    if (!order) return { success: false, reason: 'Order not found' }

    const parsed = parseCellId(cellId)
    if (!parsed) return { success: false, reason: 'Invalid cell' }

    // Optimistic update
    const result = moveOrderLoose(orderId, cellId)
    if (!result.success) return result

    // API call
    try {
      await updateScheduleMutation.mutateAsync({
        orderType: order.type,
        orderId: parseInt(orderId, 10),
        scheduledDate: parsed.date,
        scheduledTruckId: parsed.truckId,
        deliveryRunId: null,
      })
      return { success: true }
    } catch (error) {
      // Refetch to revert
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      return { success: false, reason: 'API error' }
    }
  }, [orders, moveOrderLoose, updateScheduleMutation, queryClient])

  // Add order to a run
  const addOrderToRun = useCallback(async (orderId: string, runId: string, insertIndex?: number) => {
    const order = orders[orderId]
    const run = runs[runId]
    if (!order || !run) return { success: false, reason: 'Not found' }

    const cellId = runToCell[runId]
    const parsed = cellId ? parseCellId(cellId) : null
    if (!parsed) return { success: false, reason: 'Invalid cell' }

    // Optimistic update
    const result = moveOrder(orderId, runId, insertIndex)
    if (!result.success) return result

    // API call
    try {
      await updateScheduleMutation.mutateAsync({
        orderType: order.type,
        orderId: parseInt(orderId, 10),
        scheduledDate: parsed.date,
        scheduledTruckId: parsed.truckId,
        deliveryRunId: parseInt(runId, 10),
      })
      return { success: true }
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      return { success: false, reason: 'API error' }
    }
  }, [orders, runs, runToCell, moveOrder, updateScheduleMutation, queryClient])

  // Unschedule an order (remove from calendar)
  const unscheduleOrder = useCallback(async (orderId: string) => {
    const order = orders[orderId]
    if (!order) return { success: false, reason: 'Order not found' }

    // API call to clear schedule
    try {
      await updateScheduleMutation.mutateAsync({
        orderType: order.type,
        orderId: parseInt(orderId, 10),
        scheduledDate: null,
        scheduledTruckId: null,
        deliveryRunId: null,
      })
      // Store will be updated via hydrate on query invalidation
      return { success: true }
    } catch (error) {
      return { success: false, reason: 'API error' }
    }
  }, [orders, updateScheduleMutation])

  // Move a run to a different cell
  const moveRunToCell = useCallback(async (runId: string, targetCellId: CellId) => {
    const run = runs[runId]
    if (!run) return { success: false, reason: 'Run not found' }

    const parsed = parseCellId(targetCellId)
    if (!parsed) return { success: false, reason: 'Invalid cell' }

    // Optimistic update
    const result = moveRun(runId, targetCellId)
    if (!result.success) return result

    // API call to update run's date/truck
    try {
      await updateRunMutation.mutateAsync({
        runId: parseInt(runId, 10),
        scheduledDate: parsed.date,
        truckId: parsed.truckId ?? undefined,
      })

      // Also update all orders in the run
      if (run.orderIds.length > 0) {
        const orderUpdates = run.orderIds.map((oid) => {
          const order = orders[oid]
          return {
            orderType: order?.type ?? 'SO' as const,
            orderId: parseInt(oid, 10),
            scheduledDate: parsed.date,
            scheduledTruckId: parsed.truckId,
            deliveryRunId: parseInt(runId, 10),
          }
        })
        await batchUpdateMutation.mutateAsync({ orders: orderUpdates })
      }
      return { success: true }
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      return { success: false, reason: 'API error' }
    }
  }, [runs, orders, moveRun, updateRunMutation, batchUpdateMutation, queryClient])

  // Create a new run in a cell
  const createRun = useCallback(async (cellId: CellId, name?: string) => {
    const parsed = parseCellId(cellId)
    if (!parsed || !parsed.truckId) return { success: false, runId: null, reason: 'Invalid cell or no truck' }

    // API call first (to get real ID)
    try {
      const apiRun = await createRunMutation.mutateAsync({
        name: name ?? 'New Run',
        truckId: parsed.truckId,
        scheduledDate: parsed.date,
      })
      // Store will sync via query invalidation
      return { success: true, runId: apiRun.id.toString() }
    } catch (error) {
      return { success: false, runId: null, reason: 'API error' }
    }
  }, [createRunMutation])

  // Delete/dissolve a run
  const deleteRun = useCallback(async (runId: string) => {
    const run = runs[runId]
    if (!run) return { success: false, reason: 'Run not found' }

    // First unassign all orders from the run
    if (run.orderIds.length > 0) {
      const cellId = runToCell[runId]
      const parsed = cellId ? parseCellId(cellId) : null

      const orderUpdates = run.orderIds.map((oid) => {
        const order = orders[oid]
        return {
          orderType: order?.type ?? 'SO' as const,
          orderId: parseInt(oid, 10),
          scheduledDate: parsed?.date ?? null,
          scheduledTruckId: parsed?.truckId ?? null,
          deliveryRunId: null, // Remove from run
        }
      })

      try {
        await batchUpdateMutation.mutateAsync({ orders: orderUpdates })
      } catch (error) {
        return { success: false, reason: 'Failed to unassign orders' }
      }
    }

    // Then delete the run
    try {
      await deleteRunMutation.mutateAsync(parseInt(runId, 10))
      return { success: true }
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      return { success: false, reason: 'API error' }
    }
  }, [runs, orders, runToCell, batchUpdateMutation, deleteRunMutation, queryClient])

  return {
    scheduleOrderToCell,
    addOrderToRun,
    unscheduleOrder,
    moveRunToCell,
    createRun,
    deleteRun,
    // Loading states
    isScheduling: updateScheduleMutation.isPending || batchUpdateMutation.isPending,
    isCreatingRun: createRunMutation.isPending,
    isDeletingRun: deleteRunMutation.isPending,
  }
}
