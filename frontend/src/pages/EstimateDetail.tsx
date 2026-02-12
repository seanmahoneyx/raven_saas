import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Pencil, DollarSign, Calendar, AlertTriangle,
  ArrowRightLeft, MapPin, Hash, Printer, Save, X, Plus, Trash2,
} from 'lucide-react'
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
import { useEstimate, useUpdateEstimate, useConvertEstimate } from '@/api/estimates'
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import type { EstimateStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

const statusVariant: Record<EstimateStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  sent: 'default',
  accepted: 'success',
  rejected: 'destructive',
  converted: 'outline',
}

const ESTIMATE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
]

interface LineForm {
  id?: number
  item: string
  description: string
  quantity: string
  uom: string
  unit_price: string
  notes: string
}

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const estimateId = parseInt(id || '0', 10)

  const { data: estimate, isLoading } = useEstimate(estimateId)
  const updateEstimate = useUpdateEstimate()
  const convertEstimate = useConvertEstimate()

  const [isEditing, setIsEditing] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    status: 'draft' as EstimateStatus,
    date: '',
    expiration_date: '',
    customer: '',
    ship_to: '',
    bill_to: '',
    customer_po: '',
    notes: '',
    terms_and_conditions: '',
    tax_rate: '0.00',
  })
  const [lines, setLines] = useState<LineForm[]>([])

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  usePageTitle(estimate ? `Estimate ${estimate.estimate_number}` : 'Estimate Detail')

  useEffect(() => {
    if (isEditing && estimate) {
      setFormData({
        status: estimate.status,
        date: estimate.date,
        expiration_date: estimate.expiration_date ?? '',
        customer: String(estimate.customer),
        ship_to: estimate.ship_to ? String(estimate.ship_to) : '',
        bill_to: estimate.bill_to ? String(estimate.bill_to) : '',
        customer_po: estimate.customer_po,
        notes: estimate.notes,
        terms_and_conditions: estimate.terms_and_conditions,
        tax_rate: estimate.tax_rate ?? '0.00',
      })
      setLines(
        (estimate.lines ?? []).map((line) => ({
          id: line.id,
          item: String(line.item),
          description: line.description,
          quantity: String(line.quantity),
          uom: String(line.uom),
          unit_price: line.unit_price,
          notes: line.notes,
        }))
      )
    }
  }, [isEditing, estimate])

  const customers = customersData?.results ?? []
  const locations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  const selectedCustomer = customers.find((c) => String(c.id) === formData.customer)
  const customerLocations = selectedCustomer
    ? locations.filter((l) => l.party === selectedCustomer.party)
    : []

  const handleAddLine = () => {
    setLines([
      ...lines,
      { item: '', description: '', quantity: '1', uom: '', unit_price: '0.00', notes: '' },
    ])
  }

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: keyof LineForm, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }

    if (field === 'item' && value) {
      const selectedItem = itemsData?.results.find((i) => String(i.id) === value)
      if (selectedItem) {
        newLines[index].uom = String(selectedItem.base_uom)
        newLines[index].description = selectedItem.sell_desc || selectedItem.name
      }
    }

    setLines(newLines)
  }

  const handleSave = async () => {
    if (!estimate) return
    const payload = {
      id: estimate.id,
      status: formData.status,
      customer: Number(formData.customer),
      date: formData.date,
      expiration_date: formData.expiration_date || null,
      ship_to: formData.ship_to ? Number(formData.ship_to) : null,
      bill_to: formData.bill_to ? Number(formData.bill_to) : null,
      customer_po: formData.customer_po,
      notes: formData.notes,
      terms_and_conditions: formData.terms_and_conditions,
      tax_rate: formData.tax_rate,
      lines: lines.map((line, index) => ({
        ...(line.id ? { id: line.id } : {}),
        line_number: (index + 1) * 10,
        item: Number(line.item),
        description: line.description,
        quantity: Number(line.quantity),
        uom: Number(line.uom),
        unit_price: line.unit_price,
        notes: line.notes,
      })),
    }
    try {
      await updateEstimate.mutateAsync(payload as any)
      setIsEditing(false)
      toast.success('Estimate updated successfully')
    } catch (error) {
      console.error('Failed to save estimate:', error)
      toast.error('Failed to save estimate')
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({
      status: 'draft' as EstimateStatus,
      date: '',
      expiration_date: '',
      customer: '',
      ship_to: '',
      bill_to: '',
      customer_po: '',
      notes: '',
      terms_and_conditions: '',
      tax_rate: '0.00',
    })
    setLines([])
  }

  const handleConfirmConvert = async () => {
    if (!estimate) return
    try {
      await convertEstimate.mutateAsync(estimate.id)
      toast.success('Estimate converted to Sales Order')
      setConvertDialogOpen(false)
    } catch (error) {
      toast.error('Failed to convert estimate')
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!estimate) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Estimate not found</div>
      </div>
    )
  }

  const formatCurrency = (value: string) => {
    return `$${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No expiration'
    return format(new Date(dateStr), 'MMM d, yyyy')
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/estimates')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold font-mono">{estimate.estimate_number}</h1>
            {isEditing ? (
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as EstimateStatus })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTIMATE_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={statusVariant[estimate.status]}>
                {estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)}
              </Badge>
            )}
          </div>
          <button
            onClick={() => navigate(`/customers/${estimate.customer}`)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {estimate.customer_name}
          </button>
        </div>
        <div className="flex gap-2" data-print-hide>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateEstimate.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateEstimate.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              {estimate.is_editable && (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
              )}
              {estimate.is_convertible && (
                <Button variant="default" onClick={() => setConvertDialogOpen(true)}>
                  <ArrowRightLeft className="h-4 w-4 mr-2" /> Convert to Sales Order
                </Button>
              )}
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
            <CardTitle className="text-sm font-medium">Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(estimate.date)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiration</CardTitle>
            {estimate.is_expired ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <Calendar className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${estimate.is_expired ? 'text-destructive' : ''}`}>
              {formatDate(estimate.expiration_date)}
            </div>
            {estimate.is_expired && (
              <p className="text-xs text-destructive mt-1">Expired</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(estimate.total_amount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lines</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{estimate.num_lines}</div>
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
                  <Label>Customer PO</Label>
                  <Input
                    value={formData.customer_po}
                    onChange={(e) => setFormData({ ...formData, customer_po: e.target.value })}
                    placeholder="Customer's PO reference"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Estimate Date</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expiration Date</Label>
                  <Input
                    type="date"
                    value={formData.expiration_date}
                    onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Ship To</Label>
                  <Select
                    value={formData.ship_to}
                    onValueChange={(value) => setFormData({ ...formData, ship_to: value })}
                    disabled={!formData.customer}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customerLocations.map((location) => (
                        <SelectItem key={location.id} value={String(location.id)}>
                          {location.code} - {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bill To</Label>
                  <Select
                    value={formData.bill_to}
                    onValueChange={(value) => setFormData({ ...formData, bill_to: value })}
                    disabled={!formData.customer}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Same as ship to" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerLocations.map((location) => (
                        <SelectItem key={location.id} value={String(location.id)}>
                          {location.code} - {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Estimate notes..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Terms & Conditions</Label>
                <Textarea
                  value={formData.terms_and_conditions}
                  onChange={(e) => setFormData({ ...formData, terms_and_conditions: e.target.value })}
                  placeholder="Terms and conditions..."
                  rows={3}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {estimate.customer_po && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Customer PO</div>
                    <div className="font-mono">{estimate.customer_po}</div>
                  </div>
                )}
                {estimate.ship_to_name && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Ship To
                    </div>
                    <div>{estimate.ship_to_name}</div>
                  </div>
                )}
                {estimate.bill_to_name && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      Bill To
                    </div>
                    <div>{estimate.bill_to_name}</div>
                  </div>
                )}
              </div>

              {estimate.converted_order_number && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Converted to Sales Order</div>
                  <Badge variant="outline" className="font-mono">
                    {estimate.converted_order_number}
                  </Badge>
                </div>
              )}

              {estimate.design_request && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Linked Design Request</div>
                  <Badge variant="outline">#{estimate.design_request}</Badge>
                </div>
              )}

              {estimate.notes && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Notes</div>
                  <div className="text-sm whitespace-pre-wrap">{estimate.notes}</div>
                </div>
              )}

              {estimate.terms_and_conditions && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Terms & Conditions</div>
                  <div className="text-sm whitespace-pre-wrap">{estimate.terms_and_conditions}</div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            {isEditing && (
              <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
                <Plus className="h-4 w-4 mr-1" /> Add Line
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            lines.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No lines. Click &quot;Add Line&quot; to begin.
              </p>
            ) : (
              <div className="space-y-3">
                {lines.map((line, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/50 rounded-lg">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Item</Label>
                      <Select
                        value={line.item}
                        onValueChange={(v) => handleLineChange(index, 'item', v)}
                      >
                        <SelectTrigger className="h-9">
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
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input
                        value={line.description}
                        onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">UOM</Label>
                      <Select
                        value={line.uom}
                        onValueChange={(v) => handleLineChange(index, 'uom', v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="UOM" />
                        </SelectTrigger>
                        <SelectContent>
                          {uoms.map((uom) => (
                            <SelectItem key={uom.id} value={String(uom.id)}>
                              {uom.code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.unit_price}
                        onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
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
                <div className="flex justify-end pr-3 pt-2 border-t">
                  <span className="text-sm text-muted-foreground mr-4">Subtotal:</span>
                  <span className="font-medium font-mono">
                    ${lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50 dark:bg-muted/20">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Line
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Item
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Qty
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      UOM
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Unit Price
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {estimate.lines?.map((line) => (
                    <tr key={line.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm">{line.line_number}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-mono text-xs text-muted-foreground">{line.item_sku}</div>
                        <div>{line.item_name}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{line.description}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{line.quantity}</td>
                      <td className="px-4 py-3 text-sm">{line.uom_code}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{formatCurrency(line.unit_price)}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-medium">{formatCurrency(line.amount)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{line.notes}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 dark:bg-muted/20">
                  <tr className="border-t border-border">
                    <td colSpan={6} className="px-4 py-3 text-sm font-medium text-right">
                      Subtotal
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-medium">
                      {formatCurrency(estimate.subtotal)}
                    </td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-sm font-medium text-right">
                      Tax ({parseFloat(estimate.tax_rate).toFixed(2)}%)
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-medium">
                      {formatCurrency(estimate.tax_amount)}
                    </td>
                    <td></td>
                  </tr>
                  <tr className="border-t border-border">
                    <td colSpan={6} className="px-4 py-3 text-sm font-bold text-right">
                      Total
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-bold">
                      {formatCurrency(estimate.total_amount)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        title="Convert to Sales Order"
        description="Convert this estimate to a Sales Order? This action cannot be undone."
        confirmLabel="Convert"
        variant="default"
        onConfirm={handleConfirmConvert}
        loading={convertEstimate.isPending}
      />
    </div>
  )
}
