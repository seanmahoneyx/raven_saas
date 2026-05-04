import { MobileLineItemCard, type MobileLineFields } from './MobileLineItemCard'
import { formatCurrency } from '@/lib/format'

interface MobileLineItemListProps {
  lines: MobileLineFields[]
  items: Array<{ value: string; label: string }>
  uoms: Array<{ value: string; label: string }>
  contracts?: Array<{ value: string; label: string }>
  fulfillmentMethods?: Array<{ value: string; label: string }>
  priceField?: 'unit_price' | 'unit_cost'
  onLineChange: (index: number, field: string, value: string) => void
  onRemove: (index: number) => void
  onAdd: () => void
  total: number
}

export function MobileLineItemList({
  lines,
  items,
  uoms,
  contracts,
  fulfillmentMethods,
  priceField = 'unit_price',
  onLineChange,
  onRemove,
  onAdd,
  total,
}: MobileLineItemListProps) {
  return (
    <div className="px-4 py-4">
      {lines.map((line, index) => {
        const price = parseFloat(line[priceField] ?? '0') || 0
        const amount = (parseFloat(line.quantity_ordered) || 0) * price
        return (
          <MobileLineItemCard
            key={index}
            index={index}
            line={line}
            items={items}
            uoms={uoms}
            contracts={contracts}
            fulfillmentMethods={fulfillmentMethods}
            priceField={priceField}
            onLineChange={onLineChange}
            onRemove={onRemove}
            amount={amount}
          />
        )
      })}

      <button
        type="button"
        onClick={onAdd}
        style={{
          width: '100%',
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          border: '1.5px dashed var(--so-accent)',
          borderRadius: 10,
          background: 'transparent',
          color: 'var(--so-accent)',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
          marginBottom: 16,
        }}
      >
        + Add Line
      </button>

      {lines.length > 0 && (
        <div
          style={{
            borderTop: '2px solid var(--so-border)',
            paddingTop: 12,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--so-text-secondary)',
            }}
          >
            Total
          </span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--so-text-primary)',
            }}
          >
            {formatCurrency(total)}
          </span>
        </div>
      )}
    </div>
  )
}
