/**
 * Hook for syncing Priority List with WebSocket updates.
 *
 * Subscribes to the scheduler WebSocket (same connection used by scheduler)
 * and handles priority_updated events to keep the store in sync.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'

// Conditional logging - only in development
const isDev = import.meta.env.DEV
function log(...args: unknown[]) {
  if (isDev) console.log('[PriorityWS]', ...args)
}
function logError(...args: unknown[]) {
  console.error('[PriorityWS]', ...args)
}

// Build WebSocket URL based on current location
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = isDev ? 'localhost:8000' : window.location.host
  return `${protocol}//${host}/ws/scheduler/`
}

// Get a WebSocket authentication ticket from the server
async function getWebSocketTicket(): Promise<string | null> {
  try {
    const response = await apiClient.post('/ws/ticket/')
    return response.data.ticket
  } catch (error) {
    logError('Failed to get WebSocket ticket:', error)
    return null
  }
}

// Reconnection configuration
const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

interface PriorityWebSocketMessage {
  type?: string
  event?: string
  action?: string
  vendor_id?: number
  date?: string
  line_id?: number
  line_ids?: number[]
  box_type?: string
  direction?: 'from' | 'to'
  sequence?: number
  created?: number
  deleted?: number
}

export interface UsePriorityListSyncReturn {
  isConnected: boolean
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error'
}

/**
 * Hook that connects to the scheduler WebSocket and handles priority_updated events.
 *
 * When a priority update is received, it invalidates the React Query cache
 * to trigger a refetch of the priority list data.
 */
export function usePriorityListSync(): UsePriorityListSyncReturn {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)

  const [isConnected, setIsConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: PriorityWebSocketMessage = JSON.parse(event.data)

      // Only handle priority_updated events
      if (data.event === 'priority_updated') {
        log('Priority update received:', data.action, data)

        // Invalidate priority list query to trigger refetch
        // This is the simplest approach - could optimize later with store updates
        queryClient.invalidateQueries({ queryKey: ['priority-list'] })

        // If a line was moved to a different date, also invalidate allotments
        if (data.action === 'moved') {
          queryClient.invalidateQueries({ queryKey: ['vendor-allotments'] })
        }

        // If sync was performed, invalidate everything
        if (data.action === 'synced') {
          queryClient.invalidateQueries({ queryKey: ['priority-list'] })
          queryClient.invalidateQueries({ queryKey: ['vendor-allotments'] })
          queryClient.invalidateQueries({ queryKey: ['daily-overrides'] })
        }
      }

      // Handle connection confirmation
      if (data.type === 'connection_established') {
        log('Connection confirmed by server')
      }
    } catch (err) {
      logError('Failed to parse message:', err)
    }
  }, [queryClient])

  const connect = useCallback(async () => {
    // Get a secure ticket for WebSocket authentication
    const ticket = await getWebSocketTicket()
    if (!ticket) {
      setConnectionState('error')
      return
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close()
    }

    setConnectionState('connecting')

    const wsUrl = `${getWebSocketUrl()}?ticket=${ticket}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      log('Connected to priority list updates')
      setIsConnected(true)
      setConnectionState('connected')
      reconnectAttemptsRef.current = 0
    }

    ws.onmessage = handleMessage

    ws.onclose = (event) => {
      log(`Disconnected (code: ${event.code})`)
      setIsConnected(false)
      setConnectionState('disconnected')
      wsRef.current = null

      // Attempt reconnection if not a clean close
      if (event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1
        log(`Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`)

        reconnectTimeoutRef.current = window.setTimeout(() => {
          void connect()
        }, RECONNECT_DELAY_MS)
      }
    }

    ws.onerror = (err) => {
      logError('WebSocket error:', err)
      setConnectionState('error')
    }
  }, [handleMessage])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    void connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted')
      }
    }
  }, [connect])

  // Periodic ping to keep connection alive
  useEffect(() => {
    if (!isConnected) return

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    return () => clearInterval(pingInterval)
  }, [isConnected])

  return {
    isConnected,
    connectionState,
  }
}
