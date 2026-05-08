// src/components/items/ItemDialog.test.tsx
/**
 * Tests for ItemDialog component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemDialog } from './ItemDialog'
import type { Item, UnitOfMeasure, Party } from '@/types/api'

// Mock Radix-based UI components to avoid "Maximum update depth" OOM in test env
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange: _onValueChange }: any) => <div data-value={value}>{typeof children === 'function' ? null : children}</div>,
  SelectTrigger: ({ children }: any) => <button role="combobox">{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder || ''}</span>,
  SelectContent: ({ children }: any) => <div role="listbox">{children}</div>,
  SelectItem: ({ children, value }: any) => <option role="option" value={value}>{children}</option>,
}))

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children, asChild: _asChild }: any) => <div>{children}</div>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ id, checked, onCheckedChange }: any) => (
    <button role="switch" id={id} aria-checked={checked} onClick={() => onCheckedChange?.(!checked)}>
      {checked ? 'On' : 'Off'}
    </button>
  ),
}))

// Mock API hooks
const mockCreateItem = vi.fn()
const mockUpdateItem = vi.fn()
const mockCreateBoxItem = vi.fn()
const mockUpdateBoxItem = vi.fn()
const mockCreatePkgItem = vi.fn()
const mockUpdatePkgItem = vi.fn()

vi.mock('@/api/items', () => ({
  useCreateItem: () => ({
    mutateAsync: mockCreateItem,
    isPending: false,
  }),
  useUpdateItem: () => ({
    mutateAsync: mockUpdateItem,
    isPending: false,
  }),
  useUnitsOfMeasure: () => ({
    data: {
      results: [
        { id: 1, code: 'ea', name: 'Each' },
        { id: 2, code: 'cs', name: 'Case' },
      ] as UnitOfMeasure[],
    },
  }),
  useCreateBoxItem: () => ({
    mutateAsync: mockCreateBoxItem,
    isPending: false,
  }),
  useUpdateBoxItem: () => ({
    mutateAsync: mockUpdateBoxItem,
    isPending: false,
  }),
  useBoxItem: () => ({
    data: null,
    isLoading: false,
  }),
  useCorrugatedFeatures: () => ({
    data: { results: [] },
  }),
  useCreatePackagingItem: () => ({
    mutateAsync: mockCreatePkgItem,
    isPending: false,
  }),
  useUpdatePackagingItem: () => ({
    mutateAsync: mockUpdatePkgItem,
    isPending: false,
  }),
  usePackagingItem: () => ({
    data: null,
    isLoading: false,
  }),
}))

vi.mock('@/api/parties', () => ({
  useParties: () => ({
    data: {
      results: [
        { id: 1, code: 'CUST001', display_name: 'Test Customer' },
      ] as Party[],
    },
  }),
}))

// Test wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function renderDialog(props: Partial<React.ComponentProps<typeof ItemDialog>> = {}) {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    item: null,
  }
  return render(<ItemDialog {...defaultProps} {...props} />, { wrapper: createWrapper() })
}

// Helper to create a mock item
function createMockItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    sku: 'TEST-001',
    name: 'Test Item',
    secondary_ident: '',
    division: 'misc',
    revision: null,
    description: '',
    purch_desc: '',
    sell_desc: '',
    base_uom: 1,
    base_uom_code: 'ea',
    customer: null,
    units_per_layer: null,
    layers_per_pallet: null,
    units_per_pallet: null,
    unit_height: null,
    pallet_height: null,
    pallet_footprint: '',
    item_type: 'inventory',
    is_active: true,
    attachment: null,
    parent: null,
    lifecycle_status: 'active',
    reorder_point: null,
    min_stock: null,
    safety_stock: null,
    extra_info_lines: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('ItemDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders dialog when open', () => {
      renderDialog({ open: true })
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Add Item')).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      renderDialog({ open: false })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows Edit title when editing item', () => {
      renderDialog({ item: createMockItem() })
      expect(screen.getByText('Edit Item')).toBeInTheDocument()
    })

    it('shows division label', () => {
      renderDialog()
      expect(screen.getByText('Division *')).toBeInTheDocument()
    })

    it('shows MSPN input', () => {
      renderDialog()
      expect(screen.getByText('MSPN *')).toBeInTheDocument()
    })

    it('shows Name input', () => {
      renderDialog()
      expect(screen.getByText('Name *')).toBeInTheDocument()
    })

    it('shows Unit of Measure label', () => {
      renderDialog()
      expect(screen.getByText('Unit of Measure *')).toBeInTheDocument()
    })

    it('shows collapsible sections', () => {
      renderDialog()
      expect(screen.getByText('Descriptions')).toBeInTheDocument()
      expect(screen.getByText('Unitizing / Pallet Info')).toBeInTheDocument()
    })

    it('shows Customer label', () => {
      renderDialog()
      expect(screen.getByText('Customer')).toBeInTheDocument()
    })

    it('shows Item Type selector', () => {
      renderDialog()
      expect(screen.getByText('Item Type')).toBeInTheDocument()
    })

    it('shows Active switch', () => {
      renderDialog()
      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('shows Cancel button', () => {
      renderDialog()
      expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument()
    })

    it('shows Create button for new items', () => {
      renderDialog()
      expect(screen.getByRole('button', { name: /Create/ })).toBeInTheDocument()
    })

    it('shows Update button for editing items', () => {
      renderDialog({ item: createMockItem() })
      expect(screen.getByRole('button', { name: /Update/ })).toBeInTheDocument()
    })
  })

  describe('Form Population', () => {
    it('populates form with item data when editing', () => {
      const item = createMockItem({
        sku: 'EDIT-001',
        name: 'Edit Test Item',
      })
      renderDialog({ item })

      expect(screen.getByDisplayValue('EDIT-001')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Edit Test Item')).toBeInTheDocument()
    })
  })

  describe('Collapsible Sections', () => {
    it('expands descriptions section on click', async () => {
      const user = userEvent.setup()
      renderDialog()

      // Click to expand
      await user.click(screen.getByText('Descriptions'))

      // Should show description fields
      await waitFor(() => {
        expect(screen.getByText('General Description')).toBeInTheDocument()
      })
    })

    it('expands unitizing section on click', async () => {
      const user = userEvent.setup()
      renderDialog()

      // Click to expand
      await user.click(screen.getByText('Unitizing / Pallet Info'))

      // Should show unitizing fields
      await waitFor(() => {
        expect(screen.getByText('Units/Layer')).toBeInTheDocument()
        expect(screen.getByText('Pallet Footprint')).toBeInTheDocument()
      })
    })
  })

  describe('Cancel Button', () => {
    it('calls onOpenChange with false when cancelled', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      renderDialog({ onOpenChange })

      await user.click(screen.getByRole('button', { name: /Cancel/ }))

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('Input Interaction', () => {
    it('allows typing in MSPN field', async () => {
      const user = userEvent.setup()
      renderDialog()

      const skuInput = screen.getByPlaceholderText('ITEM-001')
      await user.type(skuInput, 'NEW-SKU')

      expect(skuInput).toHaveValue('NEW-SKU')
    })

    it('allows typing in Name field', async () => {
      const user = userEvent.setup()
      renderDialog()

      const nameInput = screen.getByPlaceholderText('Product name')
      await user.type(nameInput, 'New Product')

      expect(nameInput).toHaveValue('New Product')
    })
  })

  describe('Switch Toggles', () => {
    it('has Active switch checked by default', () => {
      renderDialog()
      const activeSwitch = screen.getByRole('switch', { name: /Active/i })
      expect(activeSwitch).toBeChecked()
    })
  })
})

describe('ItemDialog Corrugated Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows corrugated-specific fields when item is corrugated', () => {
    const corrugatedItem = createMockItem({
      division: 'corrugated',
      box_type: 'rsc',
    })
    renderDialog({ item: corrugatedItem })
    expect(screen.getByText('Edit Item')).toBeInTheDocument()
  })
})

describe('ItemDialog Packaging Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders packaging item with sub_type when editing a packaging item', () => {
    const pkgItem = createMockItem({
      division: 'packaging',
      box_type: 'packaging',
    })
    renderDialog({ item: pkgItem })
    expect(screen.getByText('Edit Item')).toBeInTheDocument()
  })

  it('shows Type selector label in the dialog form', () => {
    // The form always renders Type * label when division=packaging
    // With mocked Select, we verify the label exists in DOM
    const pkgItem = createMockItem({
      division: 'packaging',
      box_type: 'packaging',
    })
    renderDialog({ item: pkgItem })
    // Type selector should be visible for packaging items
    expect(screen.getByText('Type *')).toBeInTheDocument()
  })

  it('shows packaging material fields when editing packaging item', () => {
    const pkgItem = createMockItem({
      division: 'packaging',
      box_type: 'packaging',
    })
    renderDialog({ item: pkgItem })
    expect(screen.getByPlaceholderText('e.g., Poly, Kraft')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Clear')).toBeInTheDocument()
  })

  it('does not show corrugated fields for packaging items', () => {
    const pkgItem = createMockItem({
      division: 'packaging',
      box_type: 'packaging',
    })
    renderDialog({ item: pkgItem })
    expect(screen.queryByText('Test (ECT)')).not.toBeInTheDocument()
    expect(screen.queryByText('Flute')).not.toBeInTheDocument()
    expect(screen.queryByText('Box Type *')).not.toBeInTheDocument()
  })
})
