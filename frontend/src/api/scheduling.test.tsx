// src/api/scheduling.test.ts
/**
 * Tests for the scheduling API hooks.
 *
 * These tests verify the React Query hooks correctly call the API
 * and handle responses/errors appropriately.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  useCalendarRange,
  useUnscheduledOrders,
  useTrucks,
  useUpdateSchedule,
  useUpdateStatus,
  useUpdateNotes,
  useGlobalHistory,
} from './scheduling'
import api from './client'

// Mock the API client
vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

// Create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useCalendarRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches calendar data for date range', async () => {
    const mockData = [
      { truck_id: 1, truck_name: 'Truck 1', days: [] },
    ]
    vi.mocked(api.get).mockResolvedValue({ data: mockData })

    const { result } = renderHook(
      () => useCalendarRange('2025-01-15', '2025-01-20'),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.get).toHaveBeenCalledWith('/calendar/range/', {
      params: { start_date: '2025-01-15', end_date: '2025-01-20' },
    })
    expect(result.current.data).toEqual(mockData)
  })

  it('handles fetch error', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(
      () => useCalendarRange('2025-01-15', '2025-01-20'),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeDefined()
  })
})

describe('useUnscheduledOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches unscheduled orders', async () => {
    const mockData = [
      { id: 1, order_type: 'SO', number: 'SO-001' },
      { id: 2, order_type: 'PO', number: 'PO-001' },
    ]
    vi.mocked(api.get).mockResolvedValue({ data: mockData })

    const { result } = renderHook(
      () => useUnscheduledOrders(),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.get).toHaveBeenCalledWith('/calendar/unscheduled/')
    expect(result.current.data).toEqual(mockData)
  })
})

describe('useTrucks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches active trucks', async () => {
    const mockData = [
      { id: 1, name: 'Truck 1', capacity_pallets: 20 },
      { id: 2, name: 'Truck 2', capacity_pallets: 30 },
    ]
    vi.mocked(api.get).mockResolvedValue({ data: mockData })

    const { result } = renderHook(
      () => useTrucks(),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.get).toHaveBeenCalledWith('/calendar/trucks/')
    expect(result.current.data).toEqual(mockData)
  })
})

describe('useUpdateSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends schedule update request', async () => {
    const mockResponse = { id: 1, scheduled_date: '2025-01-20', scheduled_truck_id: 1 }
    vi.mocked(api.post).mockResolvedValue({ data: mockResponse })

    const { result } = renderHook(
      () => useUpdateSchedule(),
      { wrapper: createWrapper() }
    )

    result.current.mutate({
      orderType: 'SO',
      orderId: 1,
      scheduledDate: '2025-01-20',
      scheduledTruckId: 1,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.post).toHaveBeenCalledWith(
      '/calendar/update/SO/1/',
      { scheduled_date: '2025-01-20', scheduled_truck_id: 1 }
    )
  })

  it('handles unscheduling (null values)', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })

    const { result } = renderHook(
      () => useUpdateSchedule(),
      { wrapper: createWrapper() }
    )

    result.current.mutate({
      orderType: 'SO',
      orderId: 1,
      scheduledDate: null,
      scheduledTruckId: null,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.post).toHaveBeenCalledWith(
      '/calendar/update/SO/1/',
      { scheduled_date: null, scheduled_truck_id: null }
    )
  })
})

describe('useUpdateStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends status update request for sales order', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { status: 'picking' } })

    const { result } = renderHook(
      () => useUpdateStatus(),
      { wrapper: createWrapper() }
    )

    result.current.mutate({
      orderType: 'SO',
      orderId: 42,
      status: 'picking',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.patch).toHaveBeenCalledWith('/sales-orders/42/', { status: 'picking' })
  })

  it('sends status update request for purchase order', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { status: 'shipped' } })

    const { result } = renderHook(
      () => useUpdateStatus(),
      { wrapper: createWrapper() }
    )

    result.current.mutate({
      orderType: 'PO',
      orderId: 99,
      status: 'shipped',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.patch).toHaveBeenCalledWith('/purchase-orders/99/', { status: 'shipped' })
  })
})

describe('useUpdateNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends notes update request', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { notes: 'New notes' } })

    const { result } = renderHook(
      () => useUpdateNotes(),
      { wrapper: createWrapper() }
    )

    result.current.mutate({
      orderType: 'SO',
      orderId: 1,
      notes: 'New delivery instructions',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.patch).toHaveBeenCalledWith('/sales-orders/1/', {
      notes: 'New delivery instructions',
    })
  })
})

describe('useGlobalHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches history with default limit', async () => {
    const mockHistory = [
      { id: 1, order_type: 'SO', number: 'SO-001', history_type: '+' },
    ]
    vi.mocked(api.get).mockResolvedValue({ data: mockHistory })

    const { result } = renderHook(
      () => useGlobalHistory(),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.get).toHaveBeenCalledWith('/calendar/history/', {
      params: { limit: 50 },
    })
    expect(result.current.data).toEqual(mockHistory)
  })

  it('fetches history with custom limit', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] })

    const { result } = renderHook(
      () => useGlobalHistory(25),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.get).toHaveBeenCalledWith('/calendar/history/', {
      params: { limit: 25 },
    })
  })
})
