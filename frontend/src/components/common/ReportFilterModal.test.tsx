// src/components/common/ReportFilterModal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportFilterModal, type ReportFilterConfig } from './ReportFilterModal'

const defaultConfig: ReportFilterConfig = {
  title: 'Test Report',
  columns: [
    { key: 'name', header: 'Name' },
    { key: 'code', header: 'Code' },
    { key: 'amount', header: 'Amount' },
    { key: 'total', header: 'Total' },
  ],
  rowFilters: [
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
  ],
}

function renderModal(props: Partial<React.ComponentProps<typeof ReportFilterModal>> = {}) {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    config: defaultConfig,
    mode: 'print' as const,
    onConfirm: vi.fn(),
  }
  return { ...render(<ReportFilterModal {...defaultProps} {...props} />), props: { ...defaultProps, ...props } }
}

describe('ReportFilterModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders dialog when open', () => {
      renderModal()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      renderModal({ open: false })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows Print title in print mode', () => {
      renderModal({ mode: 'print' })
      expect(screen.getByText('Print Test Report')).toBeInTheDocument()
    })

    it('shows Export title in export mode', () => {
      renderModal({ mode: 'export' })
      expect(screen.getByText('Export Test Report')).toBeInTheDocument()
    })

    it('shows date range inputs by default', () => {
      renderModal()
      expect(screen.getByText('Date Range')).toBeInTheDocument()
      expect(screen.getByText('From')).toBeInTheDocument()
      expect(screen.getByText('To')).toBeInTheDocument()
    })

    it('hides date range when showDateRange is false', () => {
      renderModal({ config: { ...defaultConfig, showDateRange: false } })
      expect(screen.queryByText('Date Range')).not.toBeInTheDocument()
    })

    it('shows column checkboxes', () => {
      renderModal()
      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Code')).toBeInTheDocument()
      expect(screen.getByText('Amount')).toBeInTheDocument()
      expect(screen.getByText('Total')).toBeInTheDocument()
    })

    it('shows row filter dropdown', () => {
      renderModal()
      expect(screen.getByText('Status')).toBeInTheDocument() // filter label
    })

    it('shows Columns header', () => {
      renderModal()
      expect(screen.getByText('Columns')).toBeInTheDocument()
    })

    it('shows Select All / Deselect All toggle', () => {
      renderModal()
      expect(screen.getByText('Deselect All')).toBeInTheDocument() // all checked by default
    })

    it('shows Print button in print mode', () => {
      renderModal({ mode: 'print' })
      expect(screen.getByRole('button', { name: /Print/i })).toBeInTheDocument()
    })

    it('shows Export CSV button in export mode', () => {
      renderModal({ mode: 'export' })
      expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument()
    })

    it('shows Cancel button', () => {
      renderModal()
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    })

    it('shows row filters section when config has rowFilters', () => {
      renderModal()
      expect(screen.getByText('Filters')).toBeInTheDocument()
    })

    it('hides row filters section when config has no rowFilters', () => {
      renderModal({ config: { ...defaultConfig, rowFilters: [] } })
      expect(screen.queryByText('Filters')).not.toBeInTheDocument()
    })
  })

  describe('Column Toggling', () => {
    it('all columns checked by default', () => {
      renderModal()
      const checkboxes = screen.getAllByRole('checkbox')
      // All 4 column checkboxes should be checked
      checkboxes.forEach(cb => {
        expect(cb).toBeChecked()
      })
    })

    it('toggling Deselect All unchecks all columns', async () => {
      const user = userEvent.setup()
      renderModal()

      await user.click(screen.getByText('Deselect All'))

      // After deselecting all, button should say "Select All"
      expect(screen.getByText('Select All')).toBeInTheDocument()
    })

    it('toggling Select All checks all columns', async () => {
      const user = userEvent.setup()
      renderModal()

      // Deselect all first
      await user.click(screen.getByText('Deselect All'))
      // Then select all
      await user.click(screen.getByText('Select All'))

      expect(screen.getByText('Deselect All')).toBeInTheDocument()
    })
  })

  describe('Confirm / Cancel', () => {
    it('calls onConfirm with filter results on confirm', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      renderModal({ onConfirm })

      // Click the Print button (last button matching /Print/)
      const buttons = screen.getAllByRole('button', { name: /Print/i })
      await user.click(buttons[buttons.length - 1])

      expect(onConfirm).toHaveBeenCalledTimes(1)
      const result = onConfirm.mock.calls[0][0]
      expect(result.visibleColumns).toEqual(['name', 'code', 'amount', 'total'])
      expect(result.dateFrom).toBeTruthy()
      expect(result.dateTo).toBeTruthy()
      expect(result.dateRangeLabel).toBeTruthy()
      expect(result.rowFilters).toEqual({ status: 'all' })
    })

    it('calls onOpenChange(false) on cancel', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      renderModal({ onOpenChange })

      await user.click(screen.getByRole('button', { name: /Cancel/i }))

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('disables confirm when no columns selected', async () => {
      const user = userEvent.setup()
      renderModal()

      // Deselect all columns
      await user.click(screen.getByText('Deselect All'))

      // The confirm button should be disabled
      const buttons = screen.getAllByRole('button', { name: /Print/i })
      const confirmBtn = buttons[buttons.length - 1]
      expect(confirmBtn).toBeDisabled()
    })
  })

  describe('No rowFilters config', () => {
    it('works with no row filters', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      renderModal({
        onConfirm,
        config: { title: 'Simple', columns: [{ key: 'a', header: 'A' }] },
      })

      const buttons = screen.getAllByRole('button', { name: /Print/i })
      await user.click(buttons[buttons.length - 1])

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onConfirm.mock.calls[0][0].visibleColumns).toEqual(['a'])
    })
  })
})
