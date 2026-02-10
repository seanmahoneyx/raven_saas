import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Package, History, Users, Printer, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useItem, useItemVendors, useDuplicateItem } from '@/api/items'
import { ItemHistoryTab } from '@/components/items/ItemHistoryTab'
import type { ItemVendor } from '@/types/api'

type Tab = 'history' | 'vendors'

export default function ItemDetail() {
  usePageTitle('Item Details')

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const itemId = parseInt(id || '0', 10)

  const { data: item, isLoading } = useItem(itemId)
  const { data: vendors } = useItemVendors(itemId)
  const duplicateItem = useDuplicateItem()
  const [activeTab, setActiveTab] = useState<Tab>('history')

  const handleDuplicate = () => {
    if (!itemId) return
    duplicateItem.mutate(itemId, {
      onSuccess: (newItem) => {
        navigate(`/items/${newItem.id}`)
      },
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
            <Badge variant={item.is_active ? 'success' : 'secondary'}>
              {item.is_active ? 'Active' : 'Inactive'}
            </Badge>
            {item.is_inventory && <Badge variant="outline">Inventory</Badge>}
          </div>
          <p className="text-muted-foreground">{item.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
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
        </CardContent>
      </Card>
    </div>
  )
}
