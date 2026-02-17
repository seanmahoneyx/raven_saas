import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { apiClient } from '@/api/client'
import { generateItemLabels, generateBinLabels } from '@/api/labels'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Printer, Tag, MapPin, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ItemOption {
  id: number
  sku: string
  name: string
}

interface WarehouseOption {
  id: number
  code: string
  name: string
}

function openPdfInNewTab(blob: Blob) {
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function downloadZpl(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function PrintLabels() {
  usePageTitle('Print Center - Labels')

  // Item Labels state
  const [itemSearch, setItemSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null)
  const [labelQty, setLabelQty] = useState('1')
  const [itemFormat, setItemFormat] = useState('PDF')
  const [itemLoading, setItemLoading] = useState(false)

  // Bin Labels state
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [binFormat, setBinFormat] = useState('PDF')
  const [binLoading, setBinLoading] = useState(false)

  // Fetch items for search
  const { data: items } = useQuery<{ results: ItemOption[] }>({
    queryKey: ['items', 'label-search', itemSearch],
    queryFn: () => apiClient.get('/items/', { params: { search: itemSearch, page_size: 20 } }).then(r => r.data),
    enabled: itemSearch.length >= 1,
  })

  // Fetch warehouses
  const { data: warehouses } = useQuery<{ results: WarehouseOption[] }>({
    queryKey: ['warehouses'],
    queryFn: () => apiClient.get('/warehouses/').then(r => r.data),
  })

  const handlePrintItemLabels = async () => {
    if (!selectedItem) {
      toast.error('Select an item first')
      return
    }
    const qty = parseInt(labelQty) || 1
    if (qty < 1 || qty > 300) {
      toast.error('Quantity must be between 1 and 300')
      return
    }

    setItemLoading(true)
    try {
      const result = await generateItemLabels(selectedItem.id, qty, itemFormat)
      if (itemFormat === 'ZPL') {
        downloadZpl(result, `labels-${selectedItem.sku}.zpl`)
        toast.success('ZPL file downloaded')
      } else {
        openPdfInNewTab(result)
        toast.success(`${qty} label(s) generated`)
      }
    } catch {
      toast.error('Failed to generate labels')
    } finally {
      setItemLoading(false)
    }
  }

  const handlePrintBinLabels = async () => {
    if (!selectedWarehouse) {
      toast.error('Select a warehouse first')
      return
    }

    setBinLoading(true)
    try {
      const result = await generateBinLabels({
        warehouse_id: parseInt(selectedWarehouse),
        format: binFormat,
      })
      if (binFormat === 'ZPL') {
        downloadZpl(result, 'bin-labels.zpl')
        toast.success('ZPL file downloaded')
      } else {
        openPdfInNewTab(result)
        toast.success('Bin labels generated')
      }
    } catch {
      toast.error('Failed to generate bin labels')
    } finally {
      setBinLoading(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Printer className="h-8 w-8" />
          Print Center
        </h1>
        <p className="text-muted-foreground mt-1">Generate barcode labels for items, bins, and pallets</p>
      </div>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="items" className="gap-2">
            <Tag className="h-4 w-4" /> Item Labels
          </TabsTrigger>
          <TabsTrigger value="bins" className="gap-2">
            <MapPin className="h-4 w-4" /> Bin Labels
          </TabsTrigger>
        </TabsList>

        {/* Item Labels Tab */}
        <TabsContent value="items">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle>Item Barcode Labels</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Search Item (SKU or Name)</Label>
                <Input
                  placeholder="Type to search..."
                  value={itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value)
                    setSelectedItem(null)
                  }}
                />
                {items?.results && items.results.length > 0 && !selectedItem && (
                  <div className="border rounded-md max-h-48 overflow-y-auto">
                    {items.results.map((item) => (
                      <button
                        key={item.id}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
                        onClick={() => {
                          setSelectedItem(item)
                          setItemSearch(item.sku)
                        }}
                      >
                        <span className="font-mono font-medium">{item.sku}</span>
                        <span className="text-muted-foreground ml-2">{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedItem && (
                  <p className="text-sm text-green-600">
                    Selected: <span className="font-mono font-semibold">{selectedItem.sku}</span> - {selectedItem.name}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    value={labelQty}
                    onChange={(e) => setLabelQty(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={itemFormat} onValueChange={setItemFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PDF">PDF (Avery 5160)</SelectItem>
                      <SelectItem value="ZPL">ZPL (Thermal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handlePrintItemLabels}
                disabled={!selectedItem || itemLoading}
                className="w-full gap-2"
              >
                {itemLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Print {labelQty} Label{parseInt(labelQty) !== 1 ? 's' : ''}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bin Labels Tab */}
        <TabsContent value="bins">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle>Bin Location Labels</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Warehouse</Label>
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse..." />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.results?.map((wh) => (
                      <SelectItem key={wh.id} value={String(wh.id)}>
                        {wh.code} - {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={binFormat} onValueChange={setBinFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PDF">PDF (Avery 5160)</SelectItem>
                    <SelectItem value="ZPL">ZPL (Thermal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handlePrintBinLabels}
                disabled={!selectedWarehouse || binLoading}
                className="w-full gap-2"
              >
                {binLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Print All Bin Labels
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
