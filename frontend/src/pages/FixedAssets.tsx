import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Building2, FolderOpen, Calculator, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  useFixedAssets,
  useAssetCategories,
  useCreateAssetCategory,
  useUpdateAssetCategory,
  useRunDepreciation,
  type FixedAsset,
  type AssetCategory,
} from '@/api/assets'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { FolderTabs } from '@/components/ui/folder-tabs'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

const fmtCurrency = (val: string | number) => {
  const num = parseFloat(String(val))
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

const fmtLife = (months: number) => {
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years === 0) return `${rem} months`
  if (rem === 0) return `${years} year${years > 1 ? 's' : ''}`
  return `${years}y ${rem}m`
}

const DEPRECIATION_METHODS = [
  { value: 'straight_line', label: 'Straight Line' },
  { value: 'declining_balance', label: 'Declining Balance' },
  { value: 'double_declining', label: 'Double Declining' },
  { value: 'sum_of_years', label: 'Sum of Years' },
  { value: 'units_of_production', label: 'Units of Production' },
]

const methodLabel = (method: string) =>
  DEPRECIATION_METHODS.find(m => m.value === method)?.label ?? method

export default function FixedAssets() {
  usePageTitle('Fixed Assets')
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<'assets' | 'categories' | 'depreciation'>('assets')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Data
  const { data: assetsData, isLoading: assetsLoading } = useFixedAssets()
  const { data: categoriesData, isLoading: categoriesLoading } = useAssetCategories()
  const createCategory = useCreateAssetCategory()
  const updateCategory = useUpdateAssetCategory()
  const runDepreciation = useRunDepreciation()

  // Category dialog
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<AssetCategory | null>(null)
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    code: '',
    default_useful_life_months: '60',
    default_depreciation_method: 'straight_line',
    default_salvage_rate: '0.00',
  })

  // Depreciation
  const [deprPeriod, setDeprPeriod] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [deprResult, setDeprResult] = useState<{ assets_processed: number; total_depreciation: string } | null>(null)

  const assets = assetsData?.results ?? []
  const categories = categoriesData?.results ?? []

  // Filtered assets
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        if (
          !a.asset_number.toLowerCase().includes(term) &&
          !a.description.toLowerCase().includes(term) &&
          !(a.location || '').toLowerCase().includes(term)
        ) return false
      }
      if (selectedStatus !== 'all' && a.status !== selectedStatus) return false
      if (selectedCategory !== 'all' && String(a.category) !== selectedCategory) return false
      return true
    })
  }, [assets, searchTerm, selectedStatus, selectedCategory])

  // KPI
  const activeCount = assets.filter(a => a.status === 'active').length
  const totalCost = assets.reduce((s, a) => s + (parseFloat(a.acquisition_cost) || 0), 0)
  const totalNBV = assets.reduce((s, a) => s + (parseFloat(a.net_book_value) || 0), 0)

  // Assets columns
  const assetColumns: ColumnDef<FixedAsset>[] = useMemo(() => [
    {
      accessorKey: 'asset_number',
      header: 'Asset #',
      cell: ({ row }) => (
        <button
          className="font-medium font-mono hover:underline whitespace-nowrap"
          style={{ color: 'var(--so-accent)' }}
          onClick={() => navigate(`/fixed-assets/${row.original.id}`)}
        >
          {row.getValue('asset_number')}
        </button>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span style={{ color: 'var(--so-text-primary)' }}>{row.getValue('description')}</span>
      ),
    },
    {
      accessorKey: 'category_name',
      header: 'Category',
      cell: ({ row }) => (
        <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('category_name')}</span>
      ),
    },
    {
      accessorKey: 'location',
      header: 'Location',
      cell: ({ row }) => (
        <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('location') || '-'}</span>
      ),
    },
    {
      accessorKey: 'acquisition_date',
      header: 'Acquired',
      cell: ({ row }) => {
        const date = row.getValue('acquisition_date') as string
        return (
          <span className="whitespace-nowrap" style={{ color: 'var(--so-text-secondary)' }}>
            {date ? new Date(date + 'T00:00:00').toLocaleDateString() : '-'}
          </span>
        )
      },
    },
    {
      accessorKey: 'acquisition_cost',
      header: 'Cost',
      cell: ({ row }) => (
        <span className="font-mono whitespace-nowrap" style={{ color: 'var(--so-text-primary)' }}>
          {fmtCurrency(row.getValue('acquisition_cost'))}
        </span>
      ),
    },
    {
      accessorKey: 'accumulated_depreciation',
      header: 'Accum Depr',
      cell: ({ row }) => (
        <span className="font-mono whitespace-nowrap" style={{ color: 'var(--so-text-secondary)' }}>
          {fmtCurrency(row.getValue('accumulated_depreciation'))}
        </span>
      ),
    },
    {
      accessorKey: 'net_book_value',
      header: 'Net Book Value',
      cell: ({ row }) => (
        <span className="font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--so-text-primary)' }}>
          {fmtCurrency(row.getValue('net_book_value'))}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
    },
  ], [navigate])

  // Category columns
  const categoryColumns: ColumnDef<AssetCategory>[] = useMemo(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => (
        <span className="font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>{row.getValue('code')}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span style={{ color: 'var(--so-text-primary)' }}>{row.getValue('name')}</span>
      ),
    },
    {
      accessorKey: 'default_useful_life_months',
      header: 'Useful Life',
      cell: ({ row }) => (
        <span style={{ color: 'var(--so-text-secondary)' }}>
          {fmtLife(row.getValue('default_useful_life_months') as number)}
        </span>
      ),
    },
    {
      accessorKey: 'default_depreciation_method',
      header: 'Depr Method',
      cell: ({ row }) => (
        <span style={{ color: 'var(--so-text-secondary)' }}>
          {methodLabel(row.getValue('default_depreciation_method') as string)}
        </span>
      ),
    },
    {
      accessorKey: 'default_salvage_rate',
      header: 'Salvage Rate',
      cell: ({ row }) => (
        <span className="font-mono" style={{ color: 'var(--so-text-secondary)' }}>
          {parseFloat(row.getValue('default_salvage_rate') as string).toFixed(1)}%
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <button
          className="h-7 w-7 inline-flex items-center justify-center rounded transition-colors cursor-pointer"
          style={{ color: 'var(--so-text-tertiary)' }}
          onClick={(e) => {
            e.stopPropagation()
            const cat = row.original
            setEditingCategory(cat)
            setCategoryForm({
              name: cat.name,
              code: cat.code,
              default_useful_life_months: String(cat.default_useful_life_months),
              default_depreciation_method: cat.default_depreciation_method,
              default_salvage_rate: cat.default_salvage_rate,
            })
            setCategoryDialogOpen(true)
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ], [])

  const handleOpenNewCategory = () => {
    setEditingCategory(null)
    setCategoryForm({
      name: '',
      code: '',
      default_useful_life_months: '60',
      default_depreciation_method: 'straight_line',
      default_salvage_rate: '0.00',
    })
    setCategoryDialogOpen(true)
  }

  const handleSaveCategory = async () => {
    const payload = {
      name: categoryForm.name,
      code: categoryForm.code,
      default_useful_life_months: Number(categoryForm.default_useful_life_months),
      default_depreciation_method: categoryForm.default_depreciation_method,
      default_salvage_rate: categoryForm.default_salvage_rate,
    }
    if (editingCategory) {
      await updateCategory.mutateAsync({ id: editingCategory.id, ...payload })
    } else {
      await createCategory.mutateAsync(payload)
    }
    setCategoryDialogOpen(false)
  }

  const handleRunDepreciation = async () => {
    const result = await runDepreciation.mutateAsync({ period_date: deprPeriod + '-01' })
    setDeprResult(result)
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Fixed Assets</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              Manage fixed assets, categories, and depreciation
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'assets' && (
              <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate('/fixed-assets/new')}>
                <Plus className="h-4 w-4" />
                Add Asset
              </button>
            )}
            {activeTab === 'categories' && (
              <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleOpenNewCategory}>
                <Plus className="h-4 w-4" />
                New Category
              </button>
            )}
          </div>
        </div>

        {/* Tab Bar */}
        <div className="mb-6 animate-in">
          <FolderTabs
            tabs={[
              { id: 'assets', label: 'Assets' },
              { id: 'categories', label: 'Categories' },
              { id: 'depreciation', label: 'Depreciation' },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as 'assets' | 'categories' | 'depreciation')}
          />
        </div>

        {/* ═══════════ Assets Tab ═══════════ */}
        {activeTab === 'assets' && (
          <>
            {/* KPI Summary */}
            <div className="rounded-[14px] mb-6 overflow-hidden animate-in delay-1"
              style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
              <div className="grid grid-cols-4 divide-x" style={{ borderColor: 'var(--so-border)' }}>
                <div className="px-6 py-5">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                    Total Assets
                  </div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>
                    {assets.length}
                  </div>
                </div>
                <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                    Active
                  </div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--so-success-text)' }}>
                    {activeCount}
                  </div>
                </div>
                <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                    Total Cost
                  </div>
                  <div className="text-2xl font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>
                    {fmtCurrency(totalCost)}
                  </div>
                </div>
                <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                    Net Book Value
                  </div>
                  <div className="text-2xl font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>
                    {fmtCurrency(totalNBV)}
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-5 animate-in delay-2">
              <div className="py-3">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search</label>
                    <Input
                      placeholder="Asset #, description, or location..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Category</label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={String(cat.id)}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Status</label>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="fully_depreciated">Fully Depreciated</SelectItem>
                        <SelectItem value="disposed">Disposed</SelectItem>
                        <SelectItem value="written_off">Written Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* DataTable */}
            <div className="rounded-[14px] overflow-hidden animate-in delay-3"
              style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
              <div className="px-6 py-4 flex items-center gap-2"
                style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
                <Building2 className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                  Asset Register
                </span>
              </div>
              <div className="p-4">
                {assetsLoading ? (
                  <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
                ) : (
                  <DataTable
                    storageKey="fixed-assets"
                    columns={assetColumns}
                    data={filteredAssets}
                    onRowClick={(asset) => navigate(`/fixed-assets/${asset.id}`)}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {/* ═══════════ Categories Tab ═══════════ */}
        {activeTab === 'categories' && (
          <div className="rounded-[14px] overflow-hidden animate-in delay-1"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
            <div className="px-6 py-4 flex items-center gap-2"
              style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
              <FolderOpen className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                Asset Categories
              </span>
            </div>
            <div className="p-4">
              {categoriesLoading ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
              ) : (
                <DataTable
                  storageKey="asset-categories"
                  columns={categoryColumns}
                  data={categories}
                />
              )}
            </div>
          </div>
        )}

        {/* ═══════════ Depreciation Tab ═══════════ */}
        {activeTab === 'depreciation' && (
          <div className="space-y-6">
            {/* Run Depreciation Card */}
            <div className="rounded-[14px] overflow-hidden animate-in delay-1"
              style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
              <div className="px-6 py-4 flex items-center gap-2"
                style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
                <Calculator className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                  Run Depreciation
                </span>
              </div>
              <div className="px-6 py-5">
                <div className="flex items-end gap-4">
                  <div className="space-y-1.5">
                    <Label style={{ color: 'var(--so-text-secondary)' }}>Period</Label>
                    <Input
                      type="month"
                      value={deprPeriod}
                      onChange={(e) => setDeprPeriod(e.target.value)}
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)', width: 220 }}
                    />
                  </div>
                  <button
                    className={`${primaryBtnClass}${runDepreciation.isPending ? ' opacity-50 pointer-events-none' : ''}`}
                    style={primaryBtnStyle}
                    onClick={handleRunDepreciation}
                    disabled={runDepreciation.isPending}
                  >
                    <Calculator className="h-4 w-4" />
                    {runDepreciation.isPending ? 'Running...' : 'Run Depreciation'}
                  </button>
                </div>

                {deprResult && (
                  <div className="mt-5 rounded-[10px] p-4" style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border-light)' }}>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--so-text-tertiary)' }}>
                          Assets Processed
                        </div>
                        <div className="text-xl font-bold" style={{ color: 'var(--so-text-primary)' }}>
                          {deprResult.assets_processed}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--so-text-tertiary)' }}>
                          Total Depreciation
                        </div>
                        <div className="text-xl font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>
                          {fmtCurrency(deprResult.total_depreciation)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'New Asset Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--so-text-secondary)' }}>Code *</Label>
                <Input
                  value={categoryForm.code}
                  onChange={(e) => setCategoryForm(p => ({ ...p, code: e.target.value }))}
                  placeholder="e.g. VEHICLE"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--so-text-secondary)' }}>Name *</Label>
                <Input
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Vehicles"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--so-text-secondary)' }}>Useful Life (months)</Label>
                <Input
                  type="number"
                  min="1"
                  value={categoryForm.default_useful_life_months}
                  onChange={(e) => setCategoryForm(p => ({ ...p, default_useful_life_months: e.target.value }))}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--so-text-secondary)' }}>Depr Method</Label>
                <Select
                  value={categoryForm.default_depreciation_method}
                  onValueChange={(v) => setCategoryForm(p => ({ ...p, default_depreciation_method: v }))}
                >
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPRECIATION_METHODS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--so-text-secondary)' }}>Salvage Rate (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={categoryForm.default_salvage_rate}
                  onChange={(e) => setCategoryForm(p => ({ ...p, default_salvage_rate: e.target.value }))}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid var(--so-border-light)' }}>
              <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setCategoryDialogOpen(false)}>
                Cancel
              </button>
              <button
                className={`${primaryBtnClass}${!categoryForm.name || !categoryForm.code ? ' opacity-50 pointer-events-none' : ''}`}
                style={primaryBtnStyle}
                onClick={handleSaveCategory}
                disabled={createCategory.isPending || updateCategory.isPending || !categoryForm.name || !categoryForm.code}
              >
                {(createCategory.isPending || updateCategory.isPending) ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
