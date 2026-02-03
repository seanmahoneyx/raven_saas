import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Package, Ruler, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useItems, useUnitsOfMeasure, useDeleteItem } from '@/api/items'
import { ItemDialog } from '@/components/items/ItemDialog'
import { UOMDialog } from '@/components/items/UOMDialog'
import type { Item, UnitOfMeasure } from '@/types/api'

type Tab = 'items' | 'uom'

export default function Items() {
  usePageTitle('Items')

  const [activeTab, setActiveTab] = useState<Tab>('items')

  // Dialog states
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [uomDialogOpen, setUomDialogOpen] = useState(false)
  const [editingUOM, setEditingUOM] = useState<UnitOfMeasure | null>(null)

  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()
  const deleteItem = useDeleteItem()

  const handleAddNew = () => {
    if (activeTab === 'items') {
      setEditingItem(null)
      setItemDialogOpen(true)
    } else {
      setEditingUOM(null)
      setUomDialogOpen(true)
    }
  }

  const itemColumns: ColumnDef<Item>[] = useMemo(
    () => [
      {
        accessorKey: 'sku',
        header: 'SKU',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('sku')}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => {
          const desc = row.getValue('description') as string
          return desc ? (
            <span className="text-gray-600 truncate max-w-[200px] block">
              {desc}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )
        },
      },
      {
        accessorKey: 'base_uom_code',
        header: 'UOM',
        cell: ({ row }) => (
          <Badge variant="outline">{row.getValue('base_uom_code')}</Badge>
        ),
      },
      {
        accessorKey: 'is_inventory',
        header: 'Inventory',
        cell: ({ row }) => (
          <Badge variant={row.getValue('is_inventory') ? 'success' : 'secondary'}>
            {row.getValue('is_inventory') ? 'Yes' : 'No'}
          </Badge>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.getValue('is_active') ? 'success' : 'secondary'}>
            {row.getValue('is_active') ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const item = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingItem(item)
                  setItemDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this item?')) {
                      deleteItem.mutate(item.id)
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [deleteItem]
  )

  const uomColumns: ColumnDef<UnitOfMeasure>[] = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('code')}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => {
          const desc = row.getValue('description') as string
          return desc || <span className="text-gray-400">-</span>
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.getValue('is_active') ? 'success' : 'secondary'}>
            {row.getValue('is_active') ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const uom = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingUOM(uom)
                  setUomDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    []
  )

  const tabs = [
    { id: 'items' as Tab, label: 'Items', icon: Package },
    { id: 'uom' as Tab, label: 'Units of Measure', icon: Ruler },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Items</h1>
          <p className="text-muted-foreground">
            Manage products and units of measure
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add {activeTab === 'items' ? 'Item' : 'UOM'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle>
            {tabs.find((t) => t.id === activeTab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTab === 'items' && (
            <DataTable
              columns={itemColumns}
              data={itemsData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search items..."
            />
          )}
          {activeTab === 'uom' && (
            <DataTable
              columns={uomColumns}
              data={uomData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search units of measure..."
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
      />
      <UOMDialog
        open={uomDialogOpen}
        onOpenChange={setUomDialogOpen}
        uom={editingUOM}
      />
    </div>
  )
}
