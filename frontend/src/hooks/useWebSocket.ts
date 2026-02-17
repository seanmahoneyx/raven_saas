import { useEffect, useRef, useState, useCallback } from 'react'

export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

interface UseWebSocketOptions {
  /** Callback when a message is received */
  onMessage?: (data: any) => void
  /** Whether the connection is enabled (default: true) */
  enabled?: boolean
}

interface UseWebSocketReturn {
  /** Send a JSON message through the WebSocket */
  sendMessage: (data: any) => void
  /** Current connection state */
  connectionState: ConnectionState
  /** The last message received */
  lastMessage: any | null
}

/**
 * Generic WebSocket hook with auto-reconnect and heartbeat.
 *
 * Features:
 * - Auto-connect on mount, disconnect on unmount
 * - Exponential backoff reconnect (1s, 2s, 4s, 8s, max 30s)
 * - Ping/pong heartbeat every 30 seconds
 * - Connection state tracking
 *
 * Auth is handled by the ASGI middleware via httpOnly cookies
 * (withCredentials is automatic for same-origin WebSocket connections).
 *
 * @param path - WebSocket path (e.g., 'inventory', 'orders')
 * @param options - Configuration options
 */
export function useWebSocket(
  path: string,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const { onMessage, enabled = true } = options

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [lastMessage, setLastMessage] = useState<any>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const mountedRef = useRef(true)

  // Store the latest onMessage callback in a ref to avoid reconnects on callback changes
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
  }, [])

  const startHeartbeat = useCallback(() => {
    // Send ping every 30 seconds to keep the connection alive
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping' }))
        } catch {
          // Connection may have dropped
        }
      }
    }, 30000)
  }, [])

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return

    // Build WebSocket URL from current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws/${path}/`

    setConnectionState('connecting')

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close()
          return
        }
        setConnectionState('connected')
        reconnectAttemptsRef.current = 0
        startHeartbeat()
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return

        try {
          const data = JSON.parse(event.data)

          // Ignore pong messages (heartbeat responses)
          if (data.type === 'pong' || data.type === 'connection_established') {
            return
          }

          setLastMessage(data)
          onMessageRef.current?.(data)
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (!mountedRef.current) return

        setConnectionState('disconnected')
        clearTimers()

        // Reconnect with exponential backoff
        const attempt = reconnectAttemptsRef.current
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
        reconnectAttemptsRef.current = attempt + 1

        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && enabled) {
            connect()
          }
        }, delay)
      }

      ws.onerror = () => {
        // onclose will fire after onerror, triggering reconnect
      }
    } catch {
      setConnectionState('disconnected')
    }
  }, [path, enabled, clearTimers, startHeartbeat])

  const disconnect = useCallback(() => {
    clearTimers()
    if (wsRef.current) {
      wsRef.current.onclose = null // Prevent reconnect on intentional close
      wsRef.current.close()
      wsRef.current = null
    }
    setConnectionState('disconnected')
  }, [clearTimers])

  const sendMessage = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true

    if (enabled) {
      connect()
    }

    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, [enabled, connect, disconnect])

  return {
    sendMessage,
    connectionState,
    lastMessage,
  }
}
