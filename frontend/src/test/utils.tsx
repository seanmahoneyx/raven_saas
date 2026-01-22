// src/test/utils.tsx
/**
 * Test utilities and wrappers for component testing.
 */
import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { DndContext, pointerWithin } from '@dnd-kit/core'

/**
 * Creates a fresh QueryClient for each test.
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

interface WrapperProps {
  children: ReactNode
}

/**
 * Provider wrapper for tests that need React Query.
 */
function QueryWrapper({ children }: WrapperProps) {
  const queryClient = createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

/**
 * Provider wrapper for tests that need routing.
 */
function RouterWrapper({ children }: WrapperProps) {
  return (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  )
}

/**
 * Provider wrapper for tests that need drag-and-drop context.
 */
function DndWrapper({ children }: WrapperProps) {
  return (
    <DndContext
      collisionDetection={pointerWithin}
    >
      {children}
    </DndContext>
  )
}

/**
 * All providers combined for full integration tests.
 */
function AllProviders({ children }: WrapperProps) {
  const queryClient = createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DndContext collisionDetection={pointerWithin}>
          {children}
        </DndContext>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

/**
 * Custom render with React Query provider.
 */
export function renderWithQuery(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: QueryWrapper, ...options })
}

/**
 * Custom render with Router provider.
 */
export function renderWithRouter(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: RouterWrapper, ...options })
}

/**
 * Custom render with DnD provider.
 */
export function renderWithDnd(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: DndWrapper, ...options })
}

/**
 * Custom render with all providers.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

// Re-export everything from testing-library
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
