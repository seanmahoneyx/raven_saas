/**
 * Real-time sync hooks that connect WebSocket events to React Query cache invalidation.
 *
 * Each hook connects to the appropriate WebSocket endpoint and invalidates
 * the relevant React Query cache keys when updates are received, causing
 * the UI to auto-refresh with fresh data.
 */

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWebSocket } from './useWebSocket'

/**
 * Sync inventory data in real-time.
 *
 * Connects to ws/inventory/ and invalidates inventory-related queries
 * when balance changes, lot updates, or stock movements are received.
 */
export function useInventorySync() {
  const queryClient = useQueryClient()

  const onMessage = useCallback(
    (data: any) => {
      switch (data.type) {
        case 'inventory_balance_changed':
          queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
          queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
          queryClient.invalidateQueries({ queryKey: ['reorder-alerts'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          break
        case 'inventory_lot_updated':
          queryClient.invalidateQueries({ queryKey: ['inventory-lots'] })
          queryClient.invalidateQueries({ queryKey: ['inventory-pallets'] })
          break
        case 'inventory_stock_moved':
          queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
          queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
          break
      }
    },
    [queryClient]
  )

  return useWebSocket('inventory', { onMessage })
}

/**
 * Sync order data in real-time.
 *
 * Connects to ws/orders/ and invalidates order-related queries
 * when SO/PO status changes or new orders are created.
 */
export function useOrderSync() {
  const queryClient = useQueryClient()

  const onMessage = useCallback(
    (data: any) => {
      switch (data.type) {
        case 'order_updated':
          if (data.order_type === 'sales_order') {
            queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
          } else if (data.order_type === 'purchase_order') {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
          }
          queryClient.invalidateQueries({ queryKey: ['calendar'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          break
        case 'order_created':
          if (data.order_type === 'sales_order') {
            queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
          } else if (data.order_type === 'purchase_order') {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
          }
          queryClient.invalidateQueries({ queryKey: ['calendar'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          break
      }
    },
    [queryClient]
  )

  return useWebSocket('orders', { onMessage })
}

/**
 * Sync shipment data in real-time.
 *
 * Connects to ws/shipments/ and invalidates shipment-related queries
 * when shipment status changes or deliveries are completed.
 */
export function useShipmentSync() {
  const queryClient = useQueryClient()

  const onMessage = useCallback(
    (data: any) => {
      switch (data.type) {
        case 'shipment_updated':
          queryClient.invalidateQueries({ queryKey: ['shipments'] })
          queryClient.invalidateQueries({ queryKey: ['bols'] })
          // Shipment status changes may affect order status
          queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          break
        case 'shipment_delivered':
          queryClient.invalidateQueries({ queryKey: ['shipments'] })
          queryClient.invalidateQueries({ queryKey: ['bols'] })
          queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
          queryClient.invalidateQueries({ queryKey: ['invoices'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          break
      }
    },
    [queryClient]
  )

  return useWebSocket('shipments', { onMessage })
}

/**
 * Sync invoice data in real-time.
 *
 * Connects to ws/invoices/ and invalidates invoice-related queries
 * when invoice status changes or payments are received.
 */
export function useInvoiceSync() {
  const queryClient = useQueryClient()

  const onMessage = useCallback(
    (data: any) => {
      switch (data.type) {
        case 'invoice_updated':
          queryClient.invalidateQueries({ queryKey: ['invoices'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          break
        case 'invoice_payment_received':
          queryClient.invalidateQueries({ queryKey: ['invoices'] })
          queryClient.invalidateQueries({ queryKey: ['payments'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          break
      }
    },
    [queryClient]
  )

  return useWebSocket('invoices', { onMessage })
}

/**
 * Sync notifications in real-time.
 *
 * Connects to ws/notifications/ (user-scoped, not tenant-scoped)
 * and invalidates the notification query when new notifications arrive.
 * This allows the NotificationBell to update its unread count instantly.
 */
export function useNotificationSync() {
  const queryClient = useQueryClient()

  const onMessage = useCallback(
    (data: any) => {
      if (data.type === 'notification_new') {
        // Invalidate the notifications query to refresh the bell count and list
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      }
    },
    [queryClient]
  )

  return useWebSocket('notifications', { onMessage })
}
