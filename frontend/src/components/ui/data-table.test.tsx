// src/components/ui/data-table.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from './data-table'

interface TestRow {
  id: number
  name: string
  code: string
  status: string
}

const testData: TestRow[] = [
  { id: 1, name: 'Alice', code: 'A001', status: 'active' },
  { id: 2, name: 'Bob', code: 'B002', status: 'inactive' },
  { id: 3, name: 'Charlie', code: 'C003', status: 'active' },
]

const testColumns: ColumnDef<TestRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'code', header: 'Code' },
  { accessorKey: 'status', header: 'Status' },
]

describe('DataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('Basic Rendering', () => {
    it('renders table with data', () => {
      render(<DataTable columns={testColumns} data={testData} />)
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
      expect(screen.getByText('Charlie')).toBeInTheDocument()
    })

    it('renders column headers', () => {
      render(<DataTable columns={testColumns} data={testData} />)
      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Code')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
    })

    it('shows No results when data is empty', () => {
      render(<DataTable columns={testColumns} data={[]} />)
      expect(screen.getByText('No results.')).toBeInTheDocument()
    })

    it('renders row count', () => {
      render(<DataTable columns={testColumns} data={testData} />)
      expect(screen.getByText('3 row(s)')).toBeInTheDocument()
    })
  })

  describe('Column Picker', () => {
    it('does not show Columns button without storageKey', () => {
      render(<DataTable columns={testColumns} data={testData} />)
      expect(screen.queryByText('Columns')).not.toBeInTheDocument()
    })

    it('shows Columns button when storageKey is set', () => {
      render(<DataTable columns={testColumns} data={testData} storageKey="test-table" />)
      expect(screen.getByText('Columns')).toBeInTheDocument()
    })

    it('opens column picker dropdown on click', async () => {
      const user = userEvent.setup()
      render(<DataTable columns={testColumns} data={testData} storageKey="test-table" />)

      await user.click(screen.getByText('Columns'))

      expect(screen.getByText('Toggle Columns')).toBeInTheDocument()
      expect(screen.getByText('Reset to Default')).toBeInTheDocument()
    })

    it('shows checkboxes for each hideable column', async () => {
      const user = userEvent.setup()
      render(<DataTable columns={testColumns} data={testData} storageKey="test-table" />)

      await user.click(screen.getByText('Columns'))

      // Should find column labels in the picker
      const pickerDropdown = screen.getByText('Toggle Columns').parentElement!.parentElement!
      expect(within(pickerDropdown).getByText('Name')).toBeInTheDocument()
      expect(within(pickerDropdown).getByText('Code')).toBeInTheDocument()
      expect(within(pickerDropdown).getByText('Status')).toBeInTheDocument()
    })

    it('hides a column when unchecked', async () => {
      const user = userEvent.setup()
      render(<DataTable columns={testColumns} data={testData} storageKey="test-table" />)

      await user.click(screen.getByText('Columns'))

      // Find the checkbox for "Code" column in the picker and click it
      const pickerDropdown = screen.getByText('Toggle Columns').parentElement!.parentElement!
      const codeLabel = within(pickerDropdown).getByText('Code')
      const codeCheckbox = codeLabel.closest('label')!.querySelector('[role="checkbox"]')!
      await user.click(codeCheckbox)

      // The Code column header should no longer be visible in the table
      // But "Code" text still exists in the picker, so check the table headers specifically
      const table = screen.getByRole('table')
      expect(within(table).queryByText('Code')).not.toBeInTheDocument()
      // Data from the code column should be hidden
      expect(within(table).queryByText('A001')).not.toBeInTheDocument()
    })

    it('excludes actions column from picker', async () => {
      const user = userEvent.setup()
      const columnsWithActions: ColumnDef<TestRow>[] = [
        ...testColumns,
        { id: 'actions', header: 'Actions', cell: () => <button>Edit</button> },
      ]
      render(<DataTable columns={columnsWithActions} data={testData} storageKey="test-table" />)

      await user.click(screen.getByText('Columns'))

      const pickerDropdown = screen.getByText('Toggle Columns').parentElement!.parentElement!
      expect(within(pickerDropdown).queryByText('Actions')).not.toBeInTheDocument()
    })
  })

  describe('localStorage Persistence', () => {
    it('saves column visibility to localStorage', async () => {
      const user = userEvent.setup()
      render(<DataTable columns={testColumns} data={testData} storageKey="test-persist" />)

      // Open picker and hide Code column
      await user.click(screen.getByText('Columns'))
      const pickerDropdown = screen.getByText('Toggle Columns').parentElement!.parentElement!
      const codeLabel = within(pickerDropdown).getByText('Code')
      const codeCheckbox = codeLabel.closest('label')!.querySelector('[role="checkbox"]')!
      await user.click(codeCheckbox)

      // Check localStorage
      const stored = JSON.parse(localStorage.getItem('raven-table-test-persist') || '{}')
      expect(stored.code).toBe(false)
    })

    it('restores column visibility from localStorage', () => {
      localStorage.setItem('raven-table-test-restore', JSON.stringify({ code: false }))

      render(<DataTable columns={testColumns} data={testData} storageKey="test-restore" />)

      // Code column should be hidden
      const table = screen.getByRole('table')
      expect(within(table).queryByText('Code')).not.toBeInTheDocument()
      expect(within(table).queryByText('A001')).not.toBeInTheDocument()
      // Name and Status should still be visible
      expect(within(table).getByText('Name')).toBeInTheDocument()
      expect(within(table).getByText('Status')).toBeInTheDocument()
    })

    it('uses defaultColumnVisibility when no localStorage entry', () => {
      render(
        <DataTable
          columns={testColumns}
          data={testData}
          storageKey="test-default"
          defaultColumnVisibility={{ status: false }}
        />
      )

      const table = screen.getByRole('table')
      expect(within(table).queryByText('Status')).not.toBeInTheDocument()
      expect(within(table).getByText('Name')).toBeInTheDocument()
      expect(within(table).getByText('Code')).toBeInTheDocument()
    })

    it('does not save to localStorage without storageKey', () => {
      render(<DataTable columns={testColumns} data={testData} />)
      expect(localStorage.getItem('raven-table-undefined')).toBeNull()
    })
  })

  describe('Reset to Default', () => {
    it('shows all columns after reset', async () => {
      const user = userEvent.setup()
      localStorage.setItem('raven-table-test-reset', JSON.stringify({ code: false, status: false }))

      render(<DataTable columns={testColumns} data={testData} storageKey="test-reset" />)

      // Initially Code and Status should be hidden
      const table = screen.getByRole('table')
      expect(within(table).queryByText('Code')).not.toBeInTheDocument()

      // Open picker and click Reset
      await user.click(screen.getByText('Columns'))
      await user.click(screen.getByText('Reset to Default'))

      // All columns should be visible now
      expect(within(table).getByText('Code')).toBeInTheDocument()
      expect(within(table).getByText('Status')).toBeInTheDocument()
    })
  })

  describe('Search', () => {
    it('renders search input when searchColumn is set', () => {
      render(<DataTable columns={testColumns} data={testData} searchColumn="name" searchPlaceholder="Search names..." />)
      expect(screen.getByPlaceholderText('Search names...')).toBeInTheDocument()
    })

    it('does not render search without searchColumn', () => {
      render(<DataTable columns={testColumns} data={testData} />)
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument()
    })

    it('filters rows on search', async () => {
      const user = userEvent.setup()
      render(<DataTable columns={testColumns} data={testData} searchColumn="name" />)

      await user.type(screen.getByPlaceholderText('Search...'), 'Alice')

      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.queryByText('Bob')).not.toBeInTheDocument()
      expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
    })
  })

  describe('Row Click', () => {
    it('calls onRowClick when row is clicked', async () => {
      const user = userEvent.setup()
      const onRowClick = vi.fn()
      render(<DataTable columns={testColumns} data={testData} onRowClick={onRowClick} />)

      await user.click(screen.getByText('Alice'))

      expect(onRowClick).toHaveBeenCalledWith(testData[0])
    })
  })

  describe('Combined Search and Column Picker', () => {
    it('shows both search and column picker when both props set', () => {
      render(
        <DataTable
          columns={testColumns}
          data={testData}
          searchColumn="name"
          storageKey="test-combined"
        />
      )

      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
      expect(screen.getByText('Columns')).toBeInTheDocument()
    })
  })
})
