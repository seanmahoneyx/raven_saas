import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreatePurchaseOrder } from '@/api/orders'
import { useCostLookup } from '@/api/costLists'
import { useVendors, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Plus, Trash2, X, Save } from 'lucide-react'

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

const ORDER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function CreatePurchaseOrder() {
  const navigate = useNavigate()
  const location = useLocation()
  const copyData = (location.state as any)?.copyFrom
  usePageTitle(copyData ? 'Copy Purchase Order' : 'Create Purchase Order')
  const createOrder = useCreatePurchaseOrder()

  const { data: vendorsData } = useVendors()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const [error, setError] = useState('')
  const [costLookupLine, setCostLookupLine] = useState<number | null>(null)

  const [formData, setFormData] = useState({
    po_number: copyData?.po_number || '',
    status: copyData?.status || 'draft',
    vendor: copyData?.vendor || '',
    ship_to: copyData?.ship_to || '',
    order_date: copyData?.order_date || new Date().toISOString().split('T')[0],
    expected_date: copyData?.expected_date || '',
    scheduled_date: copyData?.scheduled_date || '',
    notes: copyData?.notes || '',
  })
  const [linesFormData, setLinesFormData] = useState<
    { item: string; quantity_ordered: string; uom: string; unit_cost: string; notes: string }[]
  >(copyData?.lines?.map((l: any) => ({ ...l, notes: l.notes || '' })) || [])

  const vendors = vendorsData?.results ?? []
  const locations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  const warehouseLocations = locations.filter((l) => l.location_type === 'WAREHOUSE')

  const selectedVendor = vendors.find((v) => String(v.id) === formData.vendor)

  const lookupLine = costLookupLine !== null ? linesFormData[costLookupLine] : null
  const { data: costData, isFetching: isCostFetching } = useCostLookup(
    formData.vendor ? Number(formData.vendor) : undefined,
    lookupLine?.item ? Number(lookupLine.item) : undefined,
    lookupLine?.quantity_ordered ? Number(lookupLine.quantity_ordered) : undefined,
  )

  useEffect(() => {
    if (costLookupLine === null || isCostFetching) return
    if (costLookupLine >= linesFormData.length) {
      setCostLookupLine(null)
      return
    }
    if (costData?.unit_cost) {
      const currentLine = linesFormData[costLookupLine]
      if (currentLine.unit_cost === '0.00' || currentLine.unit_cost === '') {
        setLinesFormData(prev => prev.map((line, i) =>
          i === costLookupLine ? { ...line, unit_cost: costData.unit_cost } : line
        ))
      }
    }
    setCostLookupLine(null)
  }, [costData, costLookupLine, linesFormData, isCostFetching])

  const isPending = createOrder.isPending

  const handleAddLine = () => {
    setLinesFormData(prev => [...prev, { item: '', quantity_ordered: '1', uom: '', unit_cost: '0.00', notes: '' }])
  }

  const handleRemoveLine = (index: number) => {
    setLinesFormData(prev => prev.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: string, value: string) => {
    setLinesFormData(prev => prev.map((line, i) =>
      i === index ? { ...line, [field]: value } : line
    ))
  }

  const handleLineItemChange = (index: number, value: string) => {
    const selectedItem = items.find(i => String(i.id) === value)
    setLinesFormData(prev => prev.map((line, i) => {
      if (i !== index) return line
      return {
        ...line,
        item: value,
        uom: selectedItem ? String(selectedItem.base_uom) : line.uom,
        unit_cost: '0.00',
      }
    }))
    if (value && formData.vendor) {
      setCostLookupLine(index)
    }
  }

  const handleLineQtyChange = (index: number, value: string) => {
    setLinesFormData(prev => prev.map((line, i) =>
      i === index ? { ...line, quantity_ordered: value, unit_cost: '0.00' } : line
    ))
    if (value && formData.vendor && linesFormData[index]?.item) {
      setCostLookupLine(index)
    }
  }

  const formatCurrency = (value: string) => {
    const num = parseFloat(value)
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const calcLineAmount = (qty: string, cost: string) => {
    return (parseFloat(qty) || 0) * (parseFloat(cost) || 0)
  }

  const editTotal = linesFormData.reduce(
    (sum, line) => sum + calcLineAmount(line.quantity_ordered, line.unit_cost),
    0
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await createOrder.mutateAsync({
        po_number: formData.po_number || undefined,
        status: formData.status,
        vendor: Number(formData.vendor),
        order_date: formData.order_date,
        expected_date: formData.expected_date || null,
        scheduled_date: formData.scheduled_date || null,
        ship_to: Number(formData.ship_to),
        notes: formData.notes || '',
        priority: 5,
        lines: linesFormData.map((line, idx) => ({
          line_number: idx + 1,
          item: Number(line.item),
          quantity_ordered: Number(line.quantity_ordered),
          uom: Number(line.uom),
          unit_cost: line.unit_cost,
        })),
      } as any)
      navigate('/orders?tab=purchase')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create purchase order'))
      }
    }
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-7 animate-in">
          <button className={outlineBtnClass + ' !px-2'} style={outlineBtnStyle} onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{copyData ? 'Copy Purchase Order' : 'New Purchase Order'}</h1>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVendor && (
                <span className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
                  {selectedVendor.party_display_name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Main Card */}
        <form onSubmit={onSubmit}>
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Details</span>
              <div className="flex items-center gap-2">
                <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
                <button
                  type="submit"
                  className={`${primaryBtnClass} ${isPending ? 'opacity-50 pointer-events-none' : ''}`}
                  style={primaryBtnStyle}
                  disabled={isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  {isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
            <div className="px-6 pt-0 pb-4">
              {/* Error */}
              {error && (
                <div className="text-[13px] rounded-md px-3 py-2.5 mb-4 mt-4"
                  style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>
                  {error}
                </div>
              )}

              {/* Field Strip */}
              <div className="rounded-lg p-4 flex flex-wrap items-end gap-4 mt-4" style={{ background: 'var(--so-bg)' }}>
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Vendor *</span>
                  <Select
                    value={formData.vendor}
                    onValueChange={(value) => setFormData({ ...formData, vendor: value })}
                  >
                    <SelectTrigger className="h-9 text-sm w-[220px]" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue placeholder="Select vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.party_code} - {v.party_display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Ship To Warehouse *</span>
                  <Select
                    value={formData.ship_to}
                    onValueChange={(value) => setFormData({ ...formData, ship_to: value })}
                  >
                    <SelectTrigger className="h-9 text-sm w-[220px]" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue placeholder="Select warehouse..." />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouseLocations.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.code} - {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Order Date</span>
                  <Input
                    type="date"
                    className="h-9 text-sm w-[150px]"
                    value={formData.order_date}
                    onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Expected Date</span>
                  <Input
                    type="date"
                    className="h-9 text-sm w-[150px]"
                    value={formData.expected_date}
                    onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Scheduled Date</span>
                  <Input
                    type="date"
                    className="h-9 text-sm w-[150px]"
                    value={formData.scheduled_date}
                    onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="flex flex-col flex-1 min-w-[200px]">
                  <span className="text-[11px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--so-text-tertiary)' }}>Notes</span>
                  <Input
                    className="h-9 text-sm"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Order notes..."
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>

              {/* Line Items Table */}
              <div className="mt-4 overflow-x-auto -mx-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderTop: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}>
                      <th className="text-left py-2 px-3 pl-6 text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Item</th>
                      <th className="text-left py-2 px-3 text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Description</th>
                      <th className="text-right py-2 px-3 text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Qty</th>
                      <th className="text-left py-2 px-3 text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>UOM</th>
                      <th className="text-right py-2 px-3 text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Rate</th>
                      <th className="text-right py-2 px-3 text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Amount</th>
                      <th className="text-left py-2 px-3 text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Notes</th>
                      <th className="py-2 px-3 pr-6" style={{ background: 'var(--so-bg)' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linesFormData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-6 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                          No lines. Click &quot;Add Line&quot; to add items.
                        </td>
                      </tr>
                    ) : (
                      linesFormData.map((line, index) => {
                        const selectedItem = items.find(i => String(i.id) === line.item)
                        const lineAmount = calcLineAmount(line.quantity_ordered, line.unit_cost)
                        return (
                          <tr key={index} style={{ borderBottom: '1px solid var(--so-border-light)', background: index % 2 === 1 ? 'var(--so-bg)' : 'transparent' }}>
                            <td className="py-1.5 px-1 pl-6">
                              <Select
                                value={line.item}
                                onValueChange={(v) => handleLineItemChange(index, v)}
                              >
                                <SelectTrigger className="h-9 text-sm border-0 bg-transparent shadow-none">
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
                            </td>
                            <td className="py-1.5 px-1 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                              {selectedItem?.name || ''}
                            </td>
                            <td className="py-1.5 px-1">
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={line.quantity_ordered}
                                onChange={(e) => handleLineQtyChange(index, e.target.value)}
                                className="h-9 text-sm text-right border-0 bg-transparent shadow-none font-mono"
                              />
                            </td>
                            <td className="py-1.5 px-1">
                              <Select
                                value={line.uom}
                                onValueChange={(v) => handleLineChange(index, 'uom', v)}
                              >
                                <SelectTrigger className="h-9 text-sm border-0 bg-transparent shadow-none">
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
                            </td>
                            <td className="py-1.5 px-1">
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={line.unit_cost}
                                onChange={(e) => handleLineChange(index, 'unit_cost', e.target.value)}
                                className="h-9 text-sm text-right border-0 bg-transparent shadow-none font-mono"
                              />
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-sm" style={{ color: 'var(--so-text-primary)' }}>
                              {formatCurrency(lineAmount.toFixed(2))}
                            </td>
                            <td className="py-1.5 px-1">
                              <Input
                                value={line.notes}
                                onChange={(e) => handleLineChange(index, 'notes', e.target.value)}
                                className="h-9 text-sm border-0 bg-transparent shadow-none"
                                placeholder="Notes..."
                              />
                            </td>
                            <td className="py-1.5 px-1 pr-6">
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(index)}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors cursor-pointer"
                                style={{ color: 'var(--so-danger-text)' }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={8} className="py-2 px-2 pl-6">
                        <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={handleAddLine}>
                          <Plus className="h-3.5 w-3.5" /> Add Line
                        </button>
                      </td>
                    </tr>
                    <tr style={{ borderTop: '2px solid var(--so-border)' }}>
                      <td colSpan={5} className="py-2 px-3 text-right text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>TOTAL</td>
                      <td className="py-2 px-3 text-right font-mono text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                        {formatCurrency(editTotal.toFixed(2))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
