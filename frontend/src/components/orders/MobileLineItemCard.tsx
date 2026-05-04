import { useState } from 'react'
import { ChevronRight, ChevronDown, X } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

export interface MobileLineFields {
  item: string
  quantity_ordered: string
  uom: string
  notes: string
  fulfillment_method: string
  contract?: string
  unit_price?: string
  unit_cost?: string
}

interface MobileLineItemCardProps {
  index: number
  line: MobileLineFields
  items: Array<{ value: string; label: string }>
  uoms: Array<{ value: string; label: string }>
  contracts?: Array<{ value: string; label: string }>
  fulfillmentMethods?: Array<{ value: string; label: string }>
  priceField?: 'unit_price' | 'unit_cost'
  onLineChange: (index: number, field: string, value: string) => void
  onRemove: (index: number) => void
  amount: number
}

const fieldLabel: React.CSSProperties = {
  color: 'var(--so-text-secondary)',
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--so-border)',
  borderRadius: 8,
  background: 'var(--so-surface)',
  color: 'var(--so-text-primary)',
  fontSize: 14,
  padding: '0 12px',
  width: '100%',
  minHeight: 44,
  outline: 'none',
  boxSizing: 'border-box',
}

export function MobileLineItemCard({
  index,
  line,
  items,
  uoms,
  contracts,
  fulfillmentMethods,
  priceField = 'unit_price',
  onLineChange,
  onRemove,
  amount,
}: MobileLineItemCardProps) {
  const [expanded, setExpanded] = useState(false)
  const priceValue = line[priceField] ?? ''

  return (
    <div
      className="mb-3"
      style={{
        borderRadius: 12,
        border: '1px solid var(--so-border)',
        background: 'var(--so-surface)',
        padding: 16,
      }}
    >
      {/* Header row: Line N + Remove */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[13px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--so-text-tertiary)' }}
        >
          Line {index + 1}
        </span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--so-danger-text)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 8,
            marginRight: -8,
            marginTop: -8,
          }}
          aria-label="Remove line"
        >
          <X size={18} />
        </button>
      </div>

      {/* Item */}
      <div className="mb-3">
        <label style={fieldLabel}>Item</label>
        <select
          value={line.item}
          onChange={(e) => onLineChange(index, 'item', e.target.value)}
          style={inputStyle}
        >
          <option value="">Select item...</option>
          {items.map((it) => (
            <option key={it.value} value={it.value}>
              {it.label}
            </option>
          ))}
        </select>
      </div>

      {/* Qty + UOM */}
      <div className="flex gap-3 mb-3">
        <div style={{ flex: '0 0 60%' }}>
          <label style={fieldLabel}>Qty</label>
          <input
            type="text"
            inputMode="decimal"
            value={line.quantity_ordered}
            onChange={(e) => onLineChange(index, 'quantity_ordered', e.target.value)}
            placeholder="0"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: '0 0 calc(40% - 12px)' }}>
          <label style={fieldLabel}>UOM</label>
          <select
            value={line.uom}
            onChange={(e) => onLineChange(index, 'uom', e.target.value)}
            style={inputStyle}
          >
            <option value="">UOM</option>
            {uoms.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Rate + Amount */}
      <div className="flex gap-3 mb-3">
        <div style={{ flex: '0 0 60%' }}>
          <label style={fieldLabel}>Rate</label>
          <input
            type="text"
            inputMode="decimal"
            value={priceValue}
            onChange={(e) => onLineChange(index, priceField, e.target.value)}
            placeholder="0.00"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
        </div>
        <div style={{ flex: '0 0 calc(40% - 12px)' }}>
          <label style={fieldLabel}>Amount</label>
          <div
            style={{
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'monospace',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--so-text-primary)',
            }}
          >
            {formatCurrency(amount)}
          </div>
        </div>
      </div>

      {/* More options toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          color: 'var(--so-accent)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          marginBottom: expanded ? 12 : 0,
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        More options
      </button>

      {/* Expanded: Contract, Fulfillment, Notes */}
      {expanded && (
        <div>
          {contracts && contracts.length > 0 && (
            <div className="mb-3">
              <label style={fieldLabel}>Contract</label>
              <select
                value={line.contract ?? ''}
                onChange={(e) => onLineChange(index, 'contract', e.target.value)}
                style={inputStyle}
              >
                <option value="">No contract</option>
                {contracts.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {fulfillmentMethods && fulfillmentMethods.length > 0 && (
            <div className="mb-3">
              <label style={fieldLabel}>Fulfillment</label>
              <select
                value={line.fulfillment_method}
                onChange={(e) => onLineChange(index, 'fulfillment_method', e.target.value)}
                style={inputStyle}
              >
                <option value="">Select...</option>
                {fulfillmentMethods.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-1">
            <label style={fieldLabel}>Notes</label>
            <input
              type="text"
              value={line.notes}
              onChange={(e) => onLineChange(index, 'notes', e.target.value)}
              placeholder="Notes..."
              style={inputStyle}
            />
          </div>
        </div>
      )}
    </div>
  )
}
