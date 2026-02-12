import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Pencil, Save, X, Printer, DollarSign, Calendar,
  Package, Users, Plus, Trash2, Hash,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePriceList, useUpdatePriceList } from '@/api/priceLists'
import { useCustomers } from '@/api/parties'
import { useItems } from '@/api/items'
import { format } from 'date-fns'

interface LineForm {
  id?: number
  min_quantity: string
  unit_price: string
}

export default function PriceListDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const priceListId = parseInt(id || '0', 10)

  const { data: priceList, isLoading } = usePriceList(priceListId)
  const updatePriceList = useUpdatePriceList()
  const { data: customersData } = useCustomers()
  const { data: itemsData } = useItems()

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    customer: '',
    item: '',
    begin_date: '',
    end_date: '',
    is_active: true,
    notes: '',
  })
  const [lines, setLines] = useState<LineForm[]>([])

  usePageTitle(priceList ? `Price List - ${priceList.customer_name} / ${priceList.item_sku}` : 'Price List')

  useEffect(() => {
    if (isEditing && priceList) {
      setFormData({
        customer: String(priceList.customer),
        item: String(priceList.item),
        begin_date: priceList.begin_date,
        end_date: priceList.end_date ?? '',
        is_active: priceList.is_active,
        notes: priceList.notes || '',
      })
      setLines(
        (priceList.lines ?? []).map((line) => ({
          id: line.id,
          min_quantity: String(line.min_quantity),
          unit_price: line.unit_price,
        }))
      )
    }
  }, [isEditing, priceList])

  const customers = customersData?.results ?? []
  const items = itemsData?.results ?? []

  const handleAddLine = () => {
    setLines([...lines, { min_quantity: '1', unit_price: '0.00' }])
  }

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: keyof LineForm, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }
    setLines(newLines)
  }

  const handleSave = async () => {
    if (!priceList) return
    const payload = {
      id: priceList.id,
      customer: Number(formData.customer),
      item: Number(formData.item),
      begin_date: formData.begin_date,
      end_date: formData.end_date || null,
      is_active: formData.is_active,
      notes: formData.notes,
      lines: lines.map((line) => ({
        min_quantity: Number(line.min_quantity),
        unit_price: line.unit_price,
      })),
    }
    try {
      await updatePriceList.mutateAsync(payload as any)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save price list:', error)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!priceList) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Price list not found</div>
      </div>
    )
  }

  const formatCurrency = (value: string) => {
    return `$${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Ongoing'
    return format(new Date(dateStr + 'T00:00:00'), 'MMM d, yyyy')
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/price-lists')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold">Price List</h1>
            <Badge variant={priceList.is_active ? 'success' : 'secondary'}>
              {priceList.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <button
              onClick={() => navigate(`/customers/${priceList.customer}`)}
              className="hover:text-foreground transition-colors"
            >
              {priceList.customer_name}
            </button>
            <span>/</span>
            <button
              onClick={() => navigate(`/items/${priceList.item}`)}
              className="hover:text-foreground transition-colors font-mono"
            >
              {priceList.item_sku}
            </button>
          </div>
        </div>
        <div className="flex gap-2" data-print-hide>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={updatePriceList.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updatePriceList.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Print
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customer</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{priceList.customer_name}</div>
            <p className="text-xs text-muted-foreground font-mono">{priceList.customer_code}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Item</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate font-mono">{priceList.item_sku}</div>
            <p className="text-xs text-muted-foreground">{priceList.item_name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valid From</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(priceList.begin_date)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tiers</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{priceList.lines?.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Details Section */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select
                    value={formData.customer}
                    onValueChange={(value) => setFormData({ ...formData, customer: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.party_code} - {c.party_display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Item</Label>
                  <Select
                    value={formData.item}
                    onValueChange={(value) => setFormData({ ...formData, item: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select item..." />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.sku} - {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Begin Date</Label>
                  <Input
                    type="date"
                    value={formData.begin_date}
                    onChange={(e) => setFormData({ ...formData, begin_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-is-active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: !!checked })}
                />
                <Label htmlFor="edit-is-active" className="text-sm font-normal cursor-pointer">
                  Active
                </Label>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Internal notes..."
                  rows={3}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Begin Date</div>
                  <div className="font-medium">{formatDate(priceList.begin_date)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">End Date</div>
                  <div className="font-medium">{formatDate(priceList.end_date)}</div>
                </div>
              </div>
              {priceList.notes && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Notes</div>
                  <div className="text-sm whitespace-pre-wrap">{priceList.notes}</div>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2 pt-2 border-t">
                <div>
                  <div className="text-xs text-muted-foreground">Created</div>
                  <div className="text-sm">
                    {format(new Date(priceList.created_at), 'MMM d, yyyy h:mm a')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Last Updated</div>
                  <div className="text-sm">
                    {format(new Date(priceList.updated_at), 'MMM d, yyyy h:mm a')}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Quantity Break Tiers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Quantity Break Tiers
            </CardTitle>
            {isEditing && (
              <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
                <Plus className="h-4 w-4 mr-1" /> Add Tier
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            lines.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No tiers. Click &quot;Add Tier&quot; to begin.
              </p>
            ) : (
              <div className="space-y-3">
                {lines.map((line, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/50 rounded-lg">
                    <div className="col-span-5 space-y-1">
                      <Label className="text-xs">Min Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={line.min_quantity}
                        onChange={(e) => handleLineChange(index, 'min_quantity', e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-5 space-y-1">
                      <Label className="text-xs">Unit Price</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={line.unit_price}
                        onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveLine(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50 dark:bg-muted/20">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Min Quantity
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Unit Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {priceList.lines && priceList.lines.length > 0 ? (
                    priceList.lines.map((line) => (
                      <tr key={line.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono">
                          {line.min_quantity.toLocaleString()}+
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-mono font-medium">
                          {formatCurrency(line.unit_price)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No pricing tiers defined
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
