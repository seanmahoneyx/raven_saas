/**
 * WebSocket hook for real-time scheduler updates.
 *
 * Connects to the scheduler WebSocket endpoint and dispatches
 * incoming updates to the Zustand store.
 *
 * Uses ticket-based authentication for security - tokens are not
 * passed in URL query strings (which would be logged).
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useSchedulerStore } from '@/components/scheduler/useSchedulerStore'
import { apiClient } from '@/api/client'

// Conditional logging - only in development
const isDev = import.meta.env.DEV
function log(...args: unknown[]) {
  if (isDev) console.log('[WS]', ...args)
}
function logWarn(...args: unknown[]) {
  if (isDev) console.warn('[WS]', ...args)
}
function logError(...args: unknown[]) {
  // Always log errors, even in production
  console.error('[WS]', ...args)
}

// Build WebSocket URL based on current location
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // In development, Django runs on port 8000
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

interface WebSocketMessage {
  type?: string
  event?: string
  action?: string
  order_id?: number
  order?: Record<string, unknown>
  run_id?: number
  run?: Record<string, unknown>
  note_id?: number
  note?: Record<string, unknown>
  orders?: Array<{ action: string; order: Record<string, unknown> }>
  runs?: Array<{ action: string; run: Record<string, unknown> }>
  notes?: Array<{ action: string; note: Record<string, unknown> }>
}

export interface UseSchedulerWebSocketReturn {
  isConnected: boolean
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error'
  reconnectAttempts: number
}

export function useSchedulerWebSocket(): UseSchedulerWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)

  const [isConnected, setIsConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  // Get store actions for handling incoming updates
  const applyOrderUpdate = useSchedulerStore((s) => s.applyOrderUpdate)
  const applyRunUpdate = useSchedulerStore((s) => s.applyRunUpdate)
  const applyNoteUpdate = useSchedulerStore((s) => s.applyNoteUpdate)

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WebSocketMessage = JSON.parse(event.data)

      // Handle different event types
      switch (data.event) {
        case 'order_updated':
          if (data.action && data.order) {
            applyOrderUpdate(data.action, data.order)
          }
          break

        case 'run_updated':
          if (data.action && data.run) {
            applyRunUpdate(data.action, data.run)
          }
          break

        case 'note_updated':
          if (data.action && data.note) {
            applyNoteUpdate(data.action, data.note)
          }
          break

        case 'bulk_update':
          // Handle multiple updates in a single message
          if (data.orders) {
            for (const { action, order } of data.orders) {
              applyOrderUpdate(action, order)
            }
          }
          if (data.runs) {
            for (const { action, run } of data.runs) {
              applyRunUpdate(action, run)
            }
          }
          if (data.notes) {
            for (const { action, note } of data.notes) {
              applyNoteUpdate(action, note)
            }
          }
          break

        case 'connection_established':
          log('Connection confirmed by server')
          break

        default:
          // Handle pong and other messages
          if (data.type === 'pong') {
            // Heartbeat response, connection is healthy
          }
      }
    } catch (err) {
      logError('Failed to parse message:', err)
    }
  }, [applyOrderUpdate, applyRunUpdate, applyNoteUpdate])

  const connect = useCallback(async () => {
    // Get a secure ticket for WebSocket authentication
    const ticket = await getWebSocketTicket()
    if (!ticket) {
      logWarn('Failed to get WebSocket ticket, skipping connection')
      setConnectionState('error')
      return
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close()
    }

    setConnectionState('connecting')

    // Use ticket-based auth (more secure than token in URL)
    const wsUrl = `${getWebSocketUrl()}?ticket=${ticket}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      log('Connected to scheduler updates')
      setIsConnected(true)
      setConnectionState('connected')
      reconnectAttemptsRef.current = 0
      setReconnectAttempts(0)
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
        setReconnectAttempts(reconnectAttemptsRef.current)
        log(`Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`)

        reconnectTimeoutRef.current = window.setTimeout(() => {
          void connect()
        }, RECONNECT_DELAY_MS)
      }
    }

    ws.onerror = (err) => {
      logError('WebSocket error:', err)
      setConnectionState('error')
      // onclose will be called after onerror, which handles reconnection
    }
  }, [handleMessage])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    void connect()

    return () => {
      // Clean up on unmount
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
    }, 30000) // Ping every 30 seconds

    return () => clearInterval(pingInterval)
  }, [isConnected])

  return {
    isConnected,
    connectionState,
    reconnectAttempts,
  }
}
