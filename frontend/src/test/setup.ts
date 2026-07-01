// src/test/setup.ts
/**
 * Test setup file for Vitest.
 * Configures testing-library and any global test utilities.
 */
import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver as a class
class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

// Mock IntersectionObserver as a class (used by SearchableCombobox's
// infinite-scroll sentinel in browse mode; absent in jsdom).
class IntersectionObserverMock {
  root = null
  rootMargin = ''
  thresholds = []
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn(() => [])
  constructor(_cb: unknown, _opts?: unknown) {}
}
globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

// Mock Pointer Capture API (used by Radix UI Select/Popover; absent in jsdom).
// Without these, Radix dropdowns never open under userEvent in tests.
Element.prototype.hasPointerCapture = vi.fn(() => false)
Element.prototype.setPointerCapture = vi.fn()
Element.prototype.releasePointerCapture = vi.fn()
