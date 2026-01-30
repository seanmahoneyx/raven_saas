// src/components/scheduler/OrderCard.test.tsx
/**
 * Tests for the OrderCard component.
 *
 * OrderCard is a draggable card that displays order information in the scheduler.
 * It shows order status, party name, order number, and quantity.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import OrderCard from './OrderCard'
import { createMockOrder, createMockPurchaseOrder } from '@/test/mocks'

// Wrapper with DnD context
function DndWrapper({ children }: { children: ReactNode }) {
  return <DndContext>{children}</DndContext>
}

describe('OrderCard', () => {
  describe('Rendering', () => {
    it('renders order number', () => {
      const order = createMockOrder({ number: 'SO-123' })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      expect(screen.getByText('SO-123')).toBeInTheDocument()
    })

    it('renders party name', () => {
      const order = createMockOrder({ party_name: 'Acme Corp' })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })

    it('renders total pallets when available', () => {
      const order = createMockOrder({ total_pallets: 10, total_quantity: 100 })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      expect(screen.getByText('10')).toBeInTheDocument()
    })

    it('renders total quantity when pallets not available', () => {
      const order = createMockOrder({ total_pallets: undefined, total_quantity: 250 })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      expect(screen.getByText('250')).toBeInTheDocument()
    })

    it('renders notes indicator when notes exist', () => {
      const order = createMockOrder({ notes: 'Some delivery notes' })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      // Notes indicator is an Info icon - check for presence
      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      expect(card?.querySelector('.text-yellow-600')).toBeInTheDocument()
    })

    it('does not render notes indicator when notes empty', () => {
      const order = createMockOrder({ notes: '' })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      expect(card?.querySelector('.text-yellow-600')).not.toBeInTheDocument()
    })
  })

  describe('Styling by order type', () => {
    it('applies blue styling for sales orders', () => {
      const order = createMockOrder({ order_type: 'SO' })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      // SOs have blue border color
      expect(card).toHaveClass('border-blue-400')
    })

    it('applies green styling for purchase orders', () => {
      const order = createMockPurchaseOrder({ order_type: 'PO' })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      // POs have green border color
      expect(card).toHaveClass('border-green-400')
    })

    it('applies red styling for cancelled orders', () => {
      const order = createMockOrder({ status: 'cancelled' })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      // Cancelled orders have red background
      expect(card).toHaveClass('bg-red-100')
    })
  })

  describe('Status indicator', () => {
    it('renders status dot with scheduled color', () => {
      const order = createMockOrder({ status: 'scheduled' })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      const statusDot = card?.querySelector('.rounded-full')
      expect(statusDot).toHaveClass('bg-white')
      expect(statusDot).toHaveClass('border')
      expect(statusDot).toHaveClass('border-gray-400')
    })

    it('renders status dot with picking color', () => {
      const order = createMockOrder({ status: 'picking' })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      const statusDot = card?.querySelector('.rounded-full')
      expect(statusDot).toHaveClass('bg-yellow-500')
    })

    it('renders status dot with shipped color', () => {
      const order = createMockOrder({ status: 'shipped' })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      const statusDot = card?.querySelector('.rounded-full')
      expect(statusDot).toHaveClass('bg-green-600')
    })
  })

  describe('Interaction', () => {
    it('calls onClick when clicked', () => {
      const onClick = vi.fn()
      const order = createMockOrder()
      render(<OrderCard order={order} onClick={onClick} />, { wrapper: DndWrapper })

      fireEvent.click(screen.getByText(order.party_name))
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('sets data-order-id attribute correctly', () => {
      const order = createMockOrder({ order_type: 'SO', id: 42 })
      render(<OrderCard order={order} />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      expect(card).toHaveAttribute('data-order-id', 'SO-42')
    })

    it('applies cursor-grab on drag handle when draggable', () => {
      const order = createMockOrder()
      render(<OrderCard order={order} disableDrag={false} />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      const dragHandle = card?.querySelector('.cursor-grab')
      expect(dragHandle).toBeInTheDocument()
    })

    it('applies cursor-pointer on content when drag disabled', () => {
      const order = createMockOrder()
      render(<OrderCard order={order} disableDrag={true} />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      const content = card?.querySelector('.cursor-pointer')
      expect(content).toBeInTheDocument()
    })
  })

  describe('Drag overlay mode', () => {
    it('applies overlay styling for sales orders', () => {
      const order = createMockOrder({ order_type: 'SO' })
      render(<OrderCard order={order} isOverlay />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      expect(card).toHaveClass('ring-blue-500')
    })

    it('applies overlay styling for purchase orders', () => {
      const order = createMockPurchaseOrder({ order_type: 'PO' })
      render(<OrderCard order={order} isOverlay />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      expect(card).toHaveClass('ring-green-500')
    })

    it('applies dragging opacity', () => {
      const order = createMockOrder()
      render(<OrderCard order={order} isDragging />, { wrapper: DndWrapper })

      const card = screen.getByText(order.party_name).closest('[data-order-card]')
      expect(card).toHaveClass('opacity-30')
    })
  })
})
