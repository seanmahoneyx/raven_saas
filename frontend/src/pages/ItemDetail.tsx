import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Package, History, Users, Printer, Copy, BarChart3, Pencil, Save, X, Paperclip } from 'lucide-react'
import FileUpload from '@/components/common/FileUpload'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useItem, useItemVendors, useDuplicateItem, useUpdateItem } from '@/api/items'
import api from '@/api/client'
import { ItemHistoryTab } from '@/components/items/ItemHistoryTab'
import { FieldHistoryTab } from '@/components/common/FieldHistoryTab'
import type { ItemVendor } from '@/types/api'
import { FileText } from 'lucide-react'

type Tab = 'history' | 'vendors' | 'audit' | 'attachments' | 'children'

export default function ItemDetail() {
  usePageTitle('Item Details')

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const itemId = parseInt(id || '0', 10)

  const { data: item, isLoading } = useItem(itemId)
  const { data: vendors } = useItemVendors(itemId)
  const duplicateItem = useDuplicateItem()
  const updateItem = useUpdateItem()
  const { data: childItems } = useQuery({
    queryKey: ['items', itemId, 'children'],
    queryFn: async () => {
      const { data } = await api.get('/items/', { params: { parent: itemId } })
      return data
    },
    enabled: !!itemId,
  })
  const [activeTab, setActiveTab] = useState<Tab>('history')
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    is_active: 'true',
    name: '',
    description: '',
    division: 'corrugated',
    purch_desc: '',
    sell_desc: '',
    is_inventory: 'true',
    reorder_point: '',
    min_stock: '',
    safety_stock: '',
    parent: '',
  })

  useEffect(() => {
    if (isEditing && item) {
      setFormData({
        is_active: String(item.is_active),
        name: item.name,
        description: item.description || '',
        division: item.division || 'corrugated',
        purch_desc: item.purch_desc || '',
        sell_desc: item.sell_desc || '',
        is_inventory: String(item.is_inventory),
        reorder_point: item.reorder_point !== null ? String(item.reorder_point) : '',
        min_stock: item.min_stock !== null ? String(item.min_stock) : '',
        safety_stock: item.safety_stock !== null ? String(item.safety_stock) : '',
        parent: item.parent ? String(item.parent) : '',
      })
    }
  }, [isEditing, item])

  const handleDuplicate = () => {
    if (!itemId) return
    duplicateItem.mutate(itemId, {
      onSuccess: (newItem) => {
        navigate(`/items/${newItem.id}`)
      },
    })
  }

  const handleSave = async () => {
    if (!item) return
    try {
      await updateItem.mutateAsync({
        id: item.id,
        is_active: formData.is_active === 'true',
        name: formData.name,
        description: formData.description,
        division: formData.division as any,
        purch_desc: formData.purch_desc,
        sell_desc: formData.sell_desc,
        is_inventory: formData.is_inventory === 'true',
        reorder_point: formData.reorder_point ? parseInt(formData.reorder_point, 10) : null,
        min_stock: formData.min_stock ? parseInt(formData.min_stock, 10) : null,
        safety_stock: formData.safety_stock ? parseInt(formData.safety_stock, 10) : null,
        parent: formData.parent ? parseInt(formData.parent, 10) : null,
      })
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save item:', error)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({
      is_active: 'true',
      name: '',
      description: '',
      division: 'corrugated',
      purch_desc: '',
      sell_desc: '',
      is_inventory: 'true',
      reorder_point: '',
      min_stock: '',
      safety_stock: '',
      parent: '',
    })
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Item not found</div>
      </div>
    )
  }

  const tabs = [
    { id: 'history' as Tab, label: 'Transaction History', icon: History },
    { id: 'vendors' as Tab, label: 'Vendors', icon: Users },
    { id: 'attachments' as Tab, label: 'Attachments', icon: Paperclip },
    { id: 'audit' as Tab, label: 'Audit History', icon: FileText },
    { id: 'children' as Tab, label: 'Sub-Items', icon: Package },
  ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/items')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold font-mono">{item.sku}</h1>
            {isEditing ? (
              <Select
                value={formData.is_active}
                onValueChange={(v) => setFormData({ ...formData, is_active: v })}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={item.is_active ? 'success' : 'secondary'}>
                {item.is_active ? 'Active' : 'Inactive'}
              </Badge>
            )}
            {item.is_inventory && <Badge variant="outline">Inventory</Badge>}
          </div>
          <p className="text-muted-foreground">{item.name}</p>
        </div>
        <div className="flex items-center gap-2" data-print-hide>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateItem.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateItem.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/reports/item-quick-report?item=${item.id}`)}>
                <BarChart3 className="h-4 w-4 mr-2" />
                Quick Report
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                window.open(`/api/v1/items/${item.id}/spec_sheet/`, '_blank')
              }}>
                <Printer className="h-4 w-4 mr-2" />
                Spec Sheet
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                disabled={duplicateItem.isPending}
              >
                <Copy className="h-4 w-4 mr-2" />
                {duplicateItem.isPending ? 'Duplicating...' : 'Save As Copy'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Base UOM</p>
                <p className="text-lg font-bold">{item.base_uom_code || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Division</p>
              <p className="text-lg font-bold">{item.division || '-'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-sm">{item.description || '-'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Vendors</p>
              <p className="text-lg font-bold">{vendors?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Item name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Division</Label>
                  <Select
                    value={formData.division}
                    onValueChange={(v) => setFormData({ ...formData, division: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="corrugated">Corrugated</SelectItem>
                      <SelectItem value="packaging">Packaging</SelectItem>
                      <SelectItem value="tooling">Tooling</SelectItem>
                      <SelectItem value="janitorial">Janitorial</SelectItem>
                      <SelectItem value="misc">Misc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Parent Item (ID)</Label>
                <Input
                  type="number"
                  value={formData.parent}
                  onChange={(e) => setFormData({ ...formData, parent: e.target.value })}
                  placeholder="Parent item ID (leave blank for top-level)"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="General description..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Purchase Description</Label>
                <Textarea
                  value={formData.purch_desc}
                  onChange={(e) => setFormData({ ...formData, purch_desc: e.target.value })}
                  placeholder="Description for purchase orders..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Sales Description</Label>
                <Textarea
                  value={formData.sell_desc}
                  onChange={(e) => setFormData({ ...formData, sell_desc: e.target.value })}
                  placeholder="Description for sales orders..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Is Inventory Item</Label>
                <Select
                  value={formData.is_inventory}
                  onValueChange={(v) => setFormData({ ...formData, is_inventory: v })}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">Name</div>
                <div>{item.name || '-'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">Division</div>
                <div>{item.division || '-'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">Parent Item</div>
                <div>
                  {item.parent ? (
                    <button
                      onClick={() => navigate(`/items/${item.parent}`)}
                      className="text-primary hover:underline"
                    >
                      {item.parent_sku || `Item #${item.parent}`}
                    </button>
                  ) : '-'}
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-muted-foreground mb-1">Description</div>
                <div className="text-sm whitespace-pre-wrap">{item.description || '-'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-muted-foreground mb-1">Purchase Description</div>
                <div className="text-sm whitespace-pre-wrap">{item.purch_desc || '-'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-muted-foreground mb-1">Sales Description</div>
                <div className="text-sm whitespace-pre-wrap">{item.sell_desc || '-'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">Is Inventory Item</div>
                <div>{item.is_inventory ? 'Yes' : 'No'}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reorder Settings Card */}
      {item.is_inventory && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Reorder Settings</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Reorder Point</Label>
                  <Input
                    type="number"
                    value={formData.reorder_point}
                    onChange={(e) => setFormData({ ...formData, reorder_point: e.target.value })}
                    placeholder="Trigger reorder at this level"
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Alert when on-hand reaches this level
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Min Stock</Label>
                  <Input
                    type="number"
                    value={formData.min_stock}
                    onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                    placeholder="Minimum stock level"
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum acceptable stock level
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Safety Stock</Label>
                  <Input
                    type="number"
                    value={formData.safety_stock}
                    onChange={(e) => setFormData({ ...formData, safety_stock: e.target.value })}
                    placeholder="Safety stock buffer"
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Buffer above min stock
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Reorder Point</div>
                  <div className="text-lg font-semibold">{item.reorder_point ?? '-'}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Alert when on-hand reaches this level
                  </p>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Min Stock</div>
                  <div className="text-lg font-semibold">{item.min_stock ?? '-'}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Minimum acceptable stock level
                  </p>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Safety Stock</div>
                  <div className="text-lg font-semibold">{item.safety_stock ?? '-'}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Buffer above min stock
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      {/* Tab Content */}
      <Card>
        <CardHeader>
          <CardTitle>
            {tabs.find((t) => t.id === activeTab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTab === 'history' && <ItemHistoryTab itemId={itemId} />}
          {activeTab === 'attachments' && <FileUpload appLabel="items" modelName="item" objectId={itemId} />}
          {activeTab === 'audit' && <FieldHistoryTab modelType="item" objectId={itemId} />}
          {activeTab === 'vendors' && (
            <div>
              {vendors && vendors.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-muted-foreground text-sm">
                      <th className="p-3 text-left">Vendor</th>
                      <th className="p-3 text-left">MPN</th>
                      <th className="p-3 text-left">Lead Time</th>
                      <th className="p-3 text-left">Min Order</th>
                      <th className="p-3 text-left">Preferred</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((v: ItemVendor) => (
                      <tr key={v.id} className="border-b hover:bg-muted/50">
                        <td className="p-3 font-medium">{v.vendor_name || `Vendor ${v.vendor}`}</td>
                        <td className="p-3 font-mono">{v.mpn || '-'}</td>
                        <td className="p-3">{v.lead_time_days ? `${v.lead_time_days} days` : '-'}</td>
                        <td className="p-3">{v.min_order_qty ?? '-'}</td>
                        <td className="p-3">
                          {v.is_preferred && <Badge variant="success">Preferred</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No vendors linked to this item
                </div>
              )}
            </div>
          )}
          {activeTab === 'children' && (
            <div>
              {childItems?.results && childItems.results.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-muted-foreground text-sm">
                      <th className="p-3 text-left">SKU</th>
                      <th className="p-3 text-left">Name</th>
                      <th className="p-3 text-left">Division</th>
                      <th className="p-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childItems.results.map((child: any) => (
                      <tr key={child.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/items/${child.id}`)}>
                        <td className="p-3 font-mono font-medium">{child.sku}</td>
                        <td className="p-3">{child.name}</td>
                        <td className="p-3">{child.division || '-'}</td>
                        <td className="p-3">
                          <Badge variant={child.is_active ? 'success' : 'secondary'}>
                            {child.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No sub-items
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
