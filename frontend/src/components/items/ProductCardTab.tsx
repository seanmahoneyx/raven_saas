import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, TrendingDown, FileText, Package, Clock, Star, Boxes, Printer, Mail, Download, Users, Save, Loader2 } from 'lucide-react'
import { useItemProductCard, useUpdateItem } from '@/api/items'
import type {
  ProductCardPriceList,
  ProductCardCostList,
  ProductCardRFQQuote,
  ProductCardEstimate,
  ProductCardVendorInfo,
} from '@/api/items'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import PrintReportHeader, { PrintFooter } from '@/components/common/PrintReportHeader'
import { useSettings } from '@/api/settings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const key = keyFn(item)
    ;(acc[key] ||= []).push(item)
    return acc
  }, {} as Record<string, T[]>)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

function formatTierPrice(price: string | undefined): string {
  if (!price) return ''
  return `$${parseFloat(price).toFixed(4)}`
}

function formatPrice(price: string | null): string {
  if (!price) return '—'
  return `$${parseFloat(price).toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Section 1: Item Header Bar
// ---------------------------------------------------------------------------

function ItemHeaderBar({
  details,
}: {
  details: NonNullable<ReturnType<typeof useItemProductCard>['data']>['item_details']
}) {
  return (
    <div
      className="rounded-[14px] border overflow-hidden mb-4"
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
    >
      <div className="px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* SKU */}
        <div className="flex items-center gap-2">
          <span
            className="font-mono font-bold text-[18px] tracking-tight"
            style={{ color: 'var(--so-text-primary)' }}
          >
            {details.sku}
          </span>
        </div>

        {/* Name */}
        <div className="flex-1 min-w-[160px]">
          <span className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>
            {details.name}
          </span>
        </div>

        {/* Customer */}
        {details.customer_name && (
          <div className="flex items-center gap-1.5">
            <span
              className="text-[11.5px] font-medium uppercase tracking-widest"
              style={{ color: 'var(--so-text-tertiary)' }}
            >
              Customer
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              {details.customer_name}
            </span>
            {details.customer_code && (
              <span className="font-mono text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
                {details.customer_code}
              </span>
            )}
          </div>
        )}

        {/* Badges row */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Division */}
          {details.division && (
            <span
              className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
              style={{ background: 'var(--so-bg)', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border-light)' }}
            >
              {details.division}
            </span>
          )}

          {/* Inventory / Non-Inventory */}
          <span
            className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1"
            style={{
              background: details.is_inventory ? 'rgba(74,144,92,0.1)' : 'var(--so-bg)',
              color: details.is_inventory ? 'var(--so-success, #4a905c)' : 'var(--so-text-tertiary)',
              border: '1px solid var(--so-border-light)',
            }}
          >
            <Boxes className="h-3 w-3" />
            {details.is_inventory ? 'Inventory' : 'Non-Inventory'}
          </span>

          {/* Active / Inactive */}
          {getStatusBadge(details.is_active ? 'active' : 'inactive')}

          {/* UOM */}
          {details.base_uom_code && (
            <span
              className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full"
              style={{ background: 'var(--so-bg)', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border-light)' }}
            >
              {details.base_uom_code}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 2: Quick Stats Row
// ---------------------------------------------------------------------------

function QuickStatsRow({
  data,
}: {
  data: NonNullable<ReturnType<typeof useItemProductCard>['data']>
}) {
  const { last_buy, last_sell, vendors, price_lists } = data
  const activePriceLists = price_lists.filter((pl) => pl.is_active).length

  return (
    <div
      className="rounded-[14px] border overflow-hidden mb-4 grid grid-cols-2 sm:grid-cols-4 divide-x"
      style={{
        background: 'var(--so-bg)',
        borderColor: 'var(--so-border)',
        divideColor: 'var(--so-border-light)',
      }}
    >
      {/* Last Buy */}
      <div className="px-5 py-4">
        <div
          className="text-[11.5px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5"
          style={{ color: 'var(--so-text-tertiary)' }}
        >
          <TrendingDown className="h-3 w-3" />
          Last Buy
        </div>
        {last_buy ? (
          <>
            <div className="font-mono font-bold text-[17px]" style={{ color: 'var(--so-text-primary)' }}>
              {formatPrice(last_buy.price)}
            </div>
            <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              {formatDate(last_buy.date)}
              {last_buy.vendor_name && (
                <span className="ml-1">· {last_buy.vendor_name}</span>
              )}
            </div>
            {last_buy.po_number && (
              <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
                PO {last_buy.po_number}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>No history</div>
        )}
      </div>

      {/* Last Sell */}
      <div className="px-5 py-4">
        <div
          className="text-[11.5px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5"
          style={{ color: 'var(--so-text-tertiary)' }}
        >
          <DollarSign className="h-3 w-3" />
          Last Sell
        </div>
        {last_sell ? (
          <>
            <div className="font-mono font-bold text-[17px]" style={{ color: 'var(--so-text-primary)' }}>
              {formatPrice(last_sell.price)}
            </div>
            <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              {formatDate(last_sell.date)}
              {last_sell.customer_name && (
                <span className="ml-1">· {last_sell.customer_name}</span>
              )}
            </div>
            {last_sell.so_number && (
              <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
                SO {last_sell.so_number}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>No history</div>
        )}
      </div>

      {/* Vendors */}
      <div className="px-5 py-4">
        <div
          className="text-[11.5px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5"
          style={{ color: 'var(--so-text-tertiary)' }}
        >
          <Package className="h-3 w-3" />
          Vendors
        </div>
        <div className="font-bold text-[17px]" style={{ color: 'var(--so-text-primary)' }}>
          {vendors.length}
        </div>
        {vendors.length > 0 && (
          <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
            {vendors.filter((v) => v.is_preferred).length > 0
              ? `${vendors.filter((v) => v.is_preferred).length} preferred`
              : 'No preferred vendor'}
          </div>
        )}
      </div>

      {/* Active Price Lists */}
      <div className="px-5 py-4">
        <div
          className="text-[11.5px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5"
          style={{ color: 'var(--so-text-tertiary)' }}
        >
          <FileText className="h-3 w-3" />
          Active Lists
        </div>
        <div className="font-bold text-[17px]" style={{ color: 'var(--so-text-primary)' }}>
          {activePriceLists}
        </div>
        <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
          of {price_lists.length} price list{price_lists.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tier rows renderer (shared by buy & sell)
// ---------------------------------------------------------------------------

function TierRows({ tiers, side }: { tiers: { min_quantity: number; unit_price?: string; unit_cost?: string }[]; side: 'buy' | 'sell' }) {
  if (tiers.length === 0) return <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>

  return (
    <div className="space-y-0.5 mt-1">
      {tiers.map((t, i) => {
        const price = side === 'buy' ? t.unit_cost : t.unit_price
        return (
          <div key={i} className="flex items-baseline justify-between gap-4">
            <span
              className="font-mono text-[12px] font-medium tabular-nums"
              style={{ color: 'var(--so-text-tertiary)' }}
            >
              {t.min_quantity.toLocaleString()}+
            </span>
            <span
              className="font-mono text-[13px] font-semibold tabular-nums"
              style={{ color: 'var(--so-text-primary)' }}
            >
              {formatTierPrice(price)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 3: Two-Column Buy/Sell Layout
// ---------------------------------------------------------------------------

function BuySideColumn({
  costLists,
  navigate,
}: {
  costLists: ProductCardCostList[]
  navigate: ReturnType<typeof useNavigate>
}) {
  const grouped = groupBy(costLists, (cl) => cl.vendor_name)

  return (
    <div
      className="rounded-[14px] border overflow-hidden"
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
    >
      {/* Column header */}
      <div
        className="px-5 py-3 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
      >
        <TrendingDown className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
        <span
          className="text-[11.5px] font-bold uppercase tracking-widest"
          style={{ color: 'var(--so-text-tertiary)' }}
        >
          Buy Price
        </span>
        <span
          className="ml-auto text-[11.5px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: 'var(--so-surface)', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border-light)' }}
        >
          {costLists.length}
        </span>
      </div>

      {costLists.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
          No cost lists
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--so-border-light)' }}>
          {Object.entries(grouped).map(([vendorName, items]) => (
            <div key={vendorName}>
              {/* Vendor sub-header */}
              <div
                className="px-5 py-2.5 flex items-center gap-2"
                style={{ background: 'var(--so-bg)', borderBottom: '1px solid var(--so-border-light)' }}
              >
                <span
                  className="text-[13px] font-semibold cursor-pointer hover:underline"
                  style={{ color: 'var(--so-accent)' }}
                  onClick={() => navigate(`/vendors/${items[0].vendor_id}`)}
                >
                  {vendorName}
                </span>
                <span className="font-mono text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
                  {items[0].vendor_code}
                </span>
              </div>

              {/* Cost list entries */}
              {items.map((cl) => (
                <div
                  key={cl.id}
                  className="px-5 py-3 cursor-pointer hover:bg-[var(--so-bg)] transition-colors"
                  onClick={() => navigate(`/cost-lists/${cl.id}`)}
                >
                  {/* Date range + status */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-[11.5px]" style={{ color: 'var(--so-text-secondary)' }}>
                      {formatDate(cl.begin_date)}
                    </span>
                    <span style={{ color: 'var(--so-text-tertiary)' }}>→</span>
                    <span className="font-mono text-[11.5px]" style={{ color: 'var(--so-text-secondary)' }}>
                      {cl.end_date ? formatDate(cl.end_date) : 'Open'}
                    </span>
                    <span className="ml-auto">{getStatusBadge(cl.is_active ? 'active' : 'inactive')}</span>
                  </div>

                  {/* Tiers */}
                  <TierRows tiers={cl.tiers} side="buy" />

                  {/* Notes */}
                  {cl.notes && (
                    <div
                      className="mt-2 text-[11.5px] italic"
                      style={{ color: 'var(--so-text-tertiary)' }}
                    >
                      {cl.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SellSideColumn({
  priceLists,
  navigate,
}: {
  priceLists: ProductCardPriceList[]
  navigate: ReturnType<typeof useNavigate>
}) {
  const grouped = groupBy(priceLists, (pl) => pl.customer_name)

  return (
    <div
      className="rounded-[14px] border overflow-hidden"
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
    >
      {/* Column header */}
      <div
        className="px-5 py-3 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
      >
        <DollarSign className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
        <span
          className="text-[11.5px] font-bold uppercase tracking-widest"
          style={{ color: 'var(--so-text-tertiary)' }}
        >
          Sell Price
        </span>
        <span
          className="ml-auto text-[11.5px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: 'var(--so-surface)', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border-light)' }}
        >
          {priceLists.length}
        </span>
      </div>

      {priceLists.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
          No price lists
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--so-border-light)' }}>
          {Object.entries(grouped).map(([customerName, items]) => (
            <div key={customerName}>
              {/* Customer sub-header */}
              <div
                className="px-5 py-2.5 flex items-center gap-2"
                style={{ background: 'var(--so-bg)', borderBottom: '1px solid var(--so-border-light)' }}
              >
                <span
                  className="text-[13px] font-semibold cursor-pointer hover:underline"
                  style={{ color: 'var(--so-accent)' }}
                  onClick={() => navigate(`/customers/${items[0].customer_id}`)}
                >
                  {customerName}
                </span>
                <span className="font-mono text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
                  {items[0].customer_code}
                </span>
              </div>

              {/* Price list entries */}
              {items.map((pl) => (
                <div
                  key={pl.id}
                  className="px-5 py-3 cursor-pointer hover:bg-[var(--so-bg)] transition-colors"
                  onClick={() => navigate(`/price-lists/${pl.id}`)}
                >
                  {/* Date range + status */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-[11.5px]" style={{ color: 'var(--so-text-secondary)' }}>
                      {formatDate(pl.begin_date)}
                    </span>
                    <span style={{ color: 'var(--so-text-tertiary)' }}>→</span>
                    <span className="font-mono text-[11.5px]" style={{ color: 'var(--so-text-secondary)' }}>
                      {pl.end_date ? formatDate(pl.end_date) : 'Open'}
                    </span>
                    <span className="ml-auto">{getStatusBadge(pl.is_active ? 'active' : 'inactive')}</span>
                  </div>

                  {/* Tiers */}
                  <TierRows tiers={pl.tiers} side="sell" />

                  {/* Notes */}
                  {pl.notes && (
                    <div
                      className="mt-2 text-[11.5px] italic"
                      style={{ color: 'var(--so-text-tertiary)' }}
                    >
                      {pl.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 4: Supplier Quotes (RFQ History)
// ---------------------------------------------------------------------------

function SupplierQuotesSection({
  rfqQuotes,
  vendors,
  navigate,
}: {
  rfqQuotes: ProductCardRFQQuote[]
  vendors: ProductCardVendorInfo[]
  navigate: ReturnType<typeof useNavigate>
}) {
  if (rfqQuotes.length === 0) return null

  const grouped = groupBy(rfqQuotes, (q) => q.vendor_name)

  // Build vendor info lookup by vendor_id
  const vendorInfoMap = vendors.reduce<Record<number, ProductCardVendorInfo>>((acc, v) => {
    acc[v.vendor_id] = v
    return acc
  }, {})

  return (
    <div
      className="rounded-[14px] border overflow-hidden mb-4"
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
    >
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--so-border-light)' }}
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
          <span className="text-sm font-semibold">Supplier Quotes</span>
        </div>
        <span
          className="text-[11.5px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: 'var(--so-bg)', color: 'var(--so-text-secondary)' }}
        >
          {rfqQuotes.length}
        </span>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--so-border-light)' }}>
        {Object.entries(grouped).map(([vendorName, quotes]) => {
          const vendorInfo = vendorInfoMap[quotes[0].vendor_id]
          return (
            <div key={vendorName}>
              {/* Vendor card header */}
              <div
                className="px-6 py-3 flex items-center gap-3 flex-wrap"
                style={{ background: 'var(--so-bg)' }}
              >
                <span
                  className="text-[13px] font-semibold cursor-pointer hover:underline"
                  style={{ color: 'var(--so-accent)' }}
                  onClick={() => navigate(`/vendors/${quotes[0].vendor_id}`)}
                >
                  {vendorName}
                </span>
                <span className="font-mono text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
                  {quotes[0].vendor_code}
                </span>

                {vendorInfo?.is_preferred && (
                  <span
                    className="text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{
                      background: 'rgba(212,175,55,0.15)',
                      color: '#a07d20',
                      border: '1px solid rgba(212,175,55,0.3)',
                    }}
                  >
                    <Star className="h-2.5 w-2.5" />
                    Preferred
                  </span>
                )}

                {vendorInfo?.lead_time_days != null && (
                  <span
                    className="text-[11.5px] flex items-center gap-1"
                    style={{ color: 'var(--so-text-tertiary)' }}
                  >
                    <Clock className="h-3 w-3" />
                    {vendorInfo.lead_time_days}d lead
                  </span>
                )}

                {vendorInfo?.min_order_qty != null && (
                  <span className="text-[11.5px]" style={{ color: 'var(--so-text-tertiary)' }}>
                    MOQ: {vendorInfo.min_order_qty.toLocaleString()}
                  </span>
                )}

                {vendorInfo?.mpn && (
                  <span className="font-mono text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
                    MPN: {vendorInfo.mpn}
                  </span>
                )}
              </div>

              {/* Quotes table */}
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['RFQ #', 'Date', 'Qty', 'Target', 'Quoted', 'Status', 'Notes'].map((col) => (
                      <th
                        key={col}
                        className="text-[11px] font-semibold uppercase tracking-widest py-2 px-4 text-left"
                        style={{
                          background: 'var(--so-bg)',
                          color: 'var(--so-text-tertiary)',
                          borderBottom: '1px solid var(--so-border-light)',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.rfq_id} className="hover:bg-[var(--so-bg)] transition-colors">
                      <td className="py-2.5 px-4">
                        <span
                          className="font-mono text-[12px] cursor-pointer hover:underline"
                          style={{ color: 'var(--so-accent)' }}
                          onClick={() => navigate(`/rfqs/${q.rfq_id}`)}
                        >
                          {q.rfq_number}
                        </span>
                      </td>
                      <td
                        className="py-2.5 px-4 font-mono text-[12px]"
                        style={{ color: 'var(--so-text-primary)' }}
                      >
                        {formatDate(q.date)}
                      </td>
                      <td
                        className="py-2.5 px-4 text-sm font-medium tabular-nums"
                        style={{ color: 'var(--so-text-primary)' }}
                      >
                        {q.quantity.toLocaleString()}
                      </td>
                      <td
                        className="py-2.5 px-4 font-mono text-[12px]"
                        style={{ color: 'var(--so-text-secondary)' }}
                      >
                        {formatPrice(q.target_price)}
                      </td>
                      <td
                        className="py-2.5 px-4 font-mono text-[13px] font-bold"
                        style={{
                          color: q.quoted_price ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)',
                        }}
                      >
                        {formatPrice(q.quoted_price)}
                      </td>
                      <td className="py-2.5 px-4">{getStatusBadge(q.status)}</td>
                      <td
                        className="py-2.5 px-4 text-sm max-w-[200px] truncate"
                        style={{ color: 'var(--so-text-secondary)' }}
                        title={q.notes}
                      >
                        {q.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 4b: Customer Estimates
// ---------------------------------------------------------------------------

function CustomerEstimatesSection({
  estimates,
  navigate,
}: {
  estimates: ProductCardEstimate[]
  navigate: ReturnType<typeof useNavigate>
}) {
  if (estimates.length === 0) return null

  const grouped = groupBy(estimates, (e) => e.customer_name)

  return (
    <div
      className="rounded-[14px] border overflow-hidden mb-4"
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
    >
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--so-border-light)' }}
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
          <span className="text-sm font-semibold">Customer Estimates</span>
        </div>
        <span
          className="text-[11.5px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: 'var(--so-bg)', color: 'var(--so-text-secondary)' }}
        >
          {estimates.length}
        </span>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--so-border-light)' }}>
        {Object.entries(grouped).map(([customerName, items]) => (
          <div key={customerName}>
            {/* Customer header */}
            <div
              className="px-6 py-3 flex items-center gap-3 flex-wrap"
              style={{ background: 'var(--so-bg)' }}
            >
              <span
                className="text-[13px] font-semibold cursor-pointer hover:underline"
                style={{ color: 'var(--so-accent)' }}
                onClick={() => navigate(`/customers/${items[0].customer_id}`)}
              >
                {customerName}
              </span>
              <span className="font-mono text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
                {items[0].customer_code}
              </span>
            </div>

            {/* Estimates table */}
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Est #', 'Date', 'Expires', 'Qty', 'Price', 'Status', 'Notes'].map((col) => (
                    <th
                      key={col}
                      className="text-[11px] font-semibold uppercase tracking-widest py-2 px-4 text-left"
                      style={{
                        background: 'var(--so-bg)',
                        color: 'var(--so-text-tertiary)',
                        borderBottom: '1px solid var(--so-border-light)',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={`${e.estimate_id}-${e.quantity}`} className="hover:bg-[var(--so-bg)] transition-colors">
                    <td className="py-2.5 px-4">
                      <span
                        className="font-mono text-[12px] cursor-pointer hover:underline"
                        style={{ color: 'var(--so-accent)' }}
                        onClick={() => navigate(`/estimates/${e.estimate_id}`)}
                      >
                        {e.estimate_number}
                      </span>
                    </td>
                    <td
                      className="py-2.5 px-4 font-mono text-[12px]"
                      style={{ color: 'var(--so-text-primary)' }}
                    >
                      {formatDate(e.date)}
                    </td>
                    <td
                      className="py-2.5 px-4 font-mono text-[12px]"
                      style={{ color: 'var(--so-text-secondary)' }}
                    >
                      {e.expiration_date ? formatDate(e.expiration_date) : '—'}
                    </td>
                    <td
                      className="py-2.5 px-4 text-sm font-medium tabular-nums"
                      style={{ color: 'var(--so-text-primary)' }}
                    >
                      {e.quantity.toLocaleString()}
                    </td>
                    <td
                      className="py-2.5 px-4 font-mono text-[13px] font-bold"
                      style={{ color: 'var(--so-text-primary)' }}
                    >
                      {formatPrice(e.unit_price)}
                    </td>
                    <td className="py-2.5 px-4">{getStatusBadge(e.status)}</td>
                    <td
                      className="py-2.5 px-4 text-sm max-w-[200px] truncate"
                      style={{ color: 'var(--so-text-secondary)' }}
                      title={e.notes}
                    >
                      {e.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 5: Notes & Description
// ---------------------------------------------------------------------------

function NotesSection({
  details,
  priceLists,
  costLists,
  itemId,
}: {
  details: NonNullable<ReturnType<typeof useItemProductCard>['data']>['item_details']
  priceLists: ProductCardPriceList[]
  costLists: ProductCardCostList[]
  itemId: number
}) {
  const [notes, setNotes] = useState(details.product_card_notes || '')
  const [saved, setSaved] = useState(false)
  const updateItem = useUpdateItem()

  useEffect(() => {
    setNotes(details.product_card_notes || '')
  }, [details.product_card_notes])

  const isDirty = notes !== (details.product_card_notes || '')

  function handleSave() {
    updateItem.mutate(
      { id: itemId, product_card_notes: notes },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        },
      }
    )
  }

  const hasPurchDesc = !!details.purch_desc
  const hasSellDesc = !!details.sell_desc
  const priceListNotes = priceLists.filter((pl) => pl.notes)
  const costListNotes = costLists.filter((cl) => cl.notes)

  return (
    <div
      className="rounded-[14px] border overflow-hidden mb-4"
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
    >
      <div
        className="px-6 py-4"
        style={{ borderBottom: '1px solid var(--so-border-light)' }}
      >
        <span className="text-sm font-semibold">Notes &amp; Descriptions</span>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Editable product card notes */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div
              className="text-[11.5px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--so-text-tertiary)' }}
            >
              Product Card Notes
            </div>
            {isDirty && (
              <button
                type="button"
                onClick={handleSave}
                disabled={updateItem.isPending}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                style={{
                  background: 'var(--so-accent)',
                  color: 'white',
                  opacity: updateItem.isPending ? 0.6 : 1,
                }}
              >
                {updateItem.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save
              </button>
            )}
            {saved && !isDirty && (
              <span className="text-xs font-medium" style={{ color: 'var(--so-success-text, #16a34a)' }}>
                Saved
              </span>
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes to this product card..."
            rows={3}
            className="w-full rounded-md px-3 py-2 text-sm outline-none resize-y transition-colors"
            style={{
              border: '1px solid var(--so-border)',
              background: 'var(--so-bg)',
              color: 'var(--so-text-primary)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--so-accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--so-border)' }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                if (isDirty) handleSave()
              }
            }}
          />
        </div>

        {/* Purchase description */}
        {hasPurchDesc && (
          <div>
            <div
              className="text-[11.5px] font-bold uppercase tracking-widest mb-1"
              style={{ color: 'var(--so-text-tertiary)' }}
            >
              Purchase Item Description
            </div>
            <p className="text-sm" style={{ color: 'var(--so-text-primary)' }}>
              {details.purch_desc}
            </p>
          </div>
        )}

        {/* Sell description */}
        {hasSellDesc && (
          <div>
            <div
              className="text-[11.5px] font-bold uppercase tracking-widest mb-1"
              style={{ color: 'var(--so-text-tertiary)' }}
            >
              Sales Item Description
            </div>
            <p className="text-sm" style={{ color: 'var(--so-text-primary)' }}>
              {details.sell_desc}
            </p>
          </div>
        )}

        {/* Cost list notes */}
        {costListNotes.length > 0 && (
          <div>
            <div
              className="text-[11.5px] font-bold uppercase tracking-widest mb-2"
              style={{ color: 'var(--so-text-tertiary)' }}
            >
              Cost List Notes
            </div>
            <div className="space-y-1.5">
              {costListNotes.map((cl) => (
                <div key={cl.id} className="flex gap-2 text-sm">
                  <span className="font-semibold shrink-0" style={{ color: 'var(--so-text-secondary)' }}>
                    {cl.vendor_name}:
                  </span>
                  <span style={{ color: 'var(--so-text-primary)' }}>{cl.notes}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Price list notes */}
        {priceListNotes.length > 0 && (
          <div>
            <div
              className="text-[11.5px] font-bold uppercase tracking-widest mb-2"
              style={{ color: 'var(--so-text-tertiary)' }}
            >
              Price List Notes
            </div>
            <div className="space-y-1.5">
              {priceListNotes.map((pl) => (
                <div key={pl.id} className="flex gap-2 text-sm">
                  <span className="font-semibold shrink-0" style={{ color: 'var(--so-text-secondary)' }}>
                    {pl.customer_name}:
                  </span>
                  <span style={{ color: 'var(--so-text-primary)' }}>{pl.notes}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 6: Inventory & Reorder
// ---------------------------------------------------------------------------

function InventorySection({
  details,
}: {
  details: NonNullable<ReturnType<typeof useItemProductCard>['data']>['item_details']
}) {
  if (!details.is_inventory) return null

  const hasAny =
    details.reorder_point != null ||
    details.min_stock != null ||
    details.safety_stock != null

  if (!hasAny) return null

  const fields = [
    { label: 'Reorder Point', value: details.reorder_point },
    { label: 'Min Stock', value: details.min_stock },
    { label: 'Safety Stock', value: details.safety_stock },
  ]

  return (
    <div
      className="rounded-[14px] border overflow-hidden mb-4"
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
    >
      <div
        className="px-6 py-3 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--so-border-light)' }}
      >
        <Boxes className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
        <span className="text-sm font-semibold">Inventory &amp; Reorder</span>
      </div>

      <div className="px-6 py-4 grid grid-cols-3 gap-6">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <div
              className="text-[11.5px] font-bold uppercase tracking-widest mb-0.5"
              style={{ color: 'var(--so-text-tertiary)' }}
            >
              {label}
            </div>
            <div
              className="text-sm font-semibold font-mono"
              style={{ color: value != null ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}
            >
              {value != null ? value.toLocaleString() : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function ProductCardTab({ itemId }: { itemId: number }) {
  const { data, isLoading } = useItemProductCard(itemId)
  const navigate = useNavigate()
  const { data: settings } = useSettings()

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-[14px]"
            style={{ height: i === 0 ? '64px' : '120px', background: 'var(--so-bg)' }}
          />
        ))}
      </div>
    )
  }

  if (!data) return null

  const { item_details, last_buy, last_sell, vendors, price_lists, cost_lists, rfq_quotes, estimates } = data

  // Fallback: if item_details is missing (old API shape), render legacy-style empty state
  if (!item_details) {
    const hasAny = price_lists.length > 0 || cost_lists.length > 0 || rfq_quotes.length > 0
    if (!hasAny) {
      return (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
          No pricing history found for this item
        </div>
      )
    }
  }

  function handlePrint() {
    window.print()
  }

  function handleExport() {
    // Build CSV from product card data
    const rows: string[] = ['Section,Name,Code,Date,Qty/Tier,Price,Status,Notes']
    price_lists.forEach((pl) => {
      pl.tiers.forEach((t) => {
        rows.push(`Price List,"${pl.customer_name}",${pl.customer_code},${pl.begin_date},${t.min_quantity},${t.unit_price},${pl.is_active ? 'Active' : 'Inactive'},"${pl.notes || ''}"`)
      })
    })
    cost_lists.forEach((cl) => {
      cl.tiers.forEach((t) => {
        rows.push(`Cost List,"${cl.vendor_name}",${cl.vendor_code},${cl.begin_date},${t.min_quantity},${t.unit_cost},${cl.is_active ? 'Active' : 'Inactive'},"${cl.notes || ''}"`)
      })
    })
    rfq_quotes.forEach((q) => {
      rows.push(`RFQ,"${q.vendor_name}",${q.vendor_code},${q.date},${q.quantity},${q.quoted_price || ''},${q.status},"${q.notes || ''}"`)
    })
    ;(estimates ?? []).forEach((e) => {
      rows.push(`Estimate,"${e.customer_name}",${e.customer_code},${e.date},${e.quantity},${e.unit_price},${e.status},"${e.notes || ''}"`)
    })

    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `product-card-${item_details?.sku || 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Print-only product card */}
      <div className="print-only" style={{ color: 'black' }}>
        {/* Letterhead */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '16px', borderBottom: '3px solid #333' }}>
          <div>
            <div style={{ fontSize: '22pt', fontWeight: 700, letterSpacing: '-0.5px' }}>
              {settings?.company_name || 'Company'}
            </div>
            {settings?.company_address && (
              <div style={{ fontSize: '9pt', color: '#555', whiteSpace: 'pre-line', marginTop: '4px' }}>
                {settings.company_address}
              </div>
            )}
            {(settings?.company_phone || settings?.company_email) && (
              <div style={{ fontSize: '9pt', color: '#555', marginTop: '2px' }}>
                {[settings?.company_phone, settings?.company_email].filter(Boolean).join(' | ')}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>
              Product Card
            </div>
            {item_details && (
              <>
                <div style={{ fontSize: '14pt', fontWeight: 600, marginTop: '4px', fontFamily: 'monospace' }}>
                  {item_details.sku}
                </div>
                <div style={{ fontSize: '10pt', color: '#555', marginTop: '2px' }}>
                  {item_details.name}
                </div>
                {item_details.customer_name && (
                  <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>
                    {item_details.customer_name}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '10pt' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 12px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'center' }}>Last Buy</th>
              <th style={{ padding: '6px 12px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'center' }}>Last Sell</th>
              <th style={{ padding: '6px 12px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'center' }}>Vendors</th>
              <th style={{ padding: '6px 12px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'center' }}>Active Price Lists</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px 12px', border: '1px solid #ccc', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>
                {last_buy ? `$${parseFloat(last_buy.price || '0').toFixed(2)}` : '—'}
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #ccc', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>
                {last_sell ? `$${parseFloat(last_sell.price || '0').toFixed(2)}` : '—'}
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #ccc', textAlign: 'center', fontWeight: 700 }}>
                {vendors.length}
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #ccc', textAlign: 'center', fontWeight: 700 }}>
                {price_lists.filter(pl => pl.is_active).length} of {price_lists.length}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Buy Side - Cost Lists */}
        {cost_lists.length > 0 && (
          <>
            <div style={{ fontSize: '9pt', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', color: '#555' }}>
              Buy Prices ({cost_lists.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: '20px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Vendor</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Begin</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>End</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'right' }}>Tiers</th>
                </tr>
              </thead>
              <tbody>
                {cost_lists.map(cl => (
                  <tr key={cl.id}>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{cl.vendor_name} ({cl.vendor_code})</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{new Date(cl.begin_date).toLocaleDateString()}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{cl.end_date ? new Date(cl.end_date).toLocaleDateString() : 'Open'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{cl.is_active ? 'Active' : 'Inactive'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace' }}>
                      {cl.tiers.map(t => `${t.min_quantity}+ @ $${parseFloat(t.unit_cost || '0').toFixed(4)}`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Sell Side - Price Lists */}
        {price_lists.length > 0 && (
          <>
            <div style={{ fontSize: '9pt', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', color: '#555' }}>
              Sell Prices ({price_lists.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: '20px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Customer</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Begin</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>End</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'right' }}>Tiers</th>
                </tr>
              </thead>
              <tbody>
                {price_lists.map(pl => (
                  <tr key={pl.id}>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{pl.customer_name} ({pl.customer_code})</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{new Date(pl.begin_date).toLocaleDateString()}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{pl.end_date ? new Date(pl.end_date).toLocaleDateString() : 'Open'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{pl.is_active ? 'Active' : 'Inactive'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace' }}>
                      {pl.tiers.map(t => `${t.min_quantity}+ @ $${parseFloat(t.unit_price || '0').toFixed(4)}`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Supplier Quotes */}
        {rfq_quotes.length > 0 && (
          <>
            <div style={{ fontSize: '9pt', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', color: '#555' }}>
              Supplier Quotes ({rfq_quotes.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: '20px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>RFQ #</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Vendor</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'right' }}>Target</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'right' }}>Quoted</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rfq_quotes.map(q => (
                  <tr key={q.rfq_id}>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontFamily: 'monospace' }}>{q.rfq_number}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{q.vendor_name}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{new Date(q.date).toLocaleDateString()}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc', textAlign: 'right' }}>{q.quantity.toLocaleString()}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace' }}>{q.target_price ? `$${parseFloat(q.target_price).toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{q.quoted_price ? `$${parseFloat(q.quoted_price).toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{q.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Customer Estimates */}
        {(estimates ?? []).length > 0 && (
          <>
            <div style={{ fontSize: '9pt', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', color: '#555' }}>
              Customer Estimates ({estimates.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: '20px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Est #</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Customer</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '5px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {estimates.map(e => (
                  <tr key={`${e.estimate_id}-${e.quantity}`}>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontFamily: 'monospace' }}>{e.estimate_number}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{e.customer_name}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{new Date(e.date).toLocaleDateString()}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc', textAlign: 'right' }}>{e.quantity.toLocaleString()}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{e.unit_price ? `$${parseFloat(e.unit_price).toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Notes */}
        {item_details && (item_details.purch_desc || item_details.sell_desc) && (
          <div style={{ marginBottom: '20px', padding: '8px 12px', border: '1px solid #ccc', fontSize: '10pt' }}>
            {item_details.purch_desc && (
              <div><span style={{ fontWeight: 600 }}>Purchase Description: </span>{item_details.purch_desc}</div>
            )}
            {item_details.sell_desc && (
              <div style={{ marginTop: item_details.purch_desc ? '4px' : 0 }}><span style={{ fontWeight: 600 }}>Sales Description: </span>{item_details.sell_desc}</div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '40px', paddingTop: '12px', borderTop: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#999' }}>
          <span>Printed {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
          <span>{settings?.company_name || ''}</span>
        </div>
      </div>

      <div className="py-4 space-y-4" data-print-hide>
        {/* Toolbar */}
        <div
          className="flex items-center gap-1 px-3 py-2 rounded-[14px] border"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
        >
          <div className="flex items-center gap-1 ml-auto">
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={handlePrint}
              title="Print product card"
            >
              <Printer size={14} />
              Print
            </button>
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={handleExport}
              title="Export as CSV"
            >
              <Download size={14} />
              Export
            </button>
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => {
                const subject = encodeURIComponent(`Product Card - ${item_details?.sku || ''}`)
                const body = encodeURIComponent(`Product card for ${item_details?.sku} - ${item_details?.name}\n\n${window.location.href}`)
                window.open(`mailto:?subject=${subject}&body=${body}`)
              }}
              title="Email product card"
            >
              <Mail size={14} />
              Email
            </button>
          </div>
        </div>

        {/* Section 1: Item Header */}
        {item_details && <ItemHeaderBar details={item_details} />}

        {/* Section 2: Quick Stats */}
        <QuickStatsRow data={data} />

        {/* Section 3: Two-column Buy/Sell */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BuySideColumn costLists={cost_lists} navigate={navigate} />
          <SellSideColumn priceLists={price_lists} navigate={navigate} />
        </div>

        {/* Section 4a: Supplier Quotes */}
        <SupplierQuotesSection rfqQuotes={rfq_quotes} vendors={vendors ?? []} navigate={navigate} />

        {/* Section 4b: Customer Estimates */}
        <CustomerEstimatesSection estimates={estimates ?? []} navigate={navigate} />

        {/* Section 5: Notes & Descriptions */}
        {item_details && (
          <NotesSection
            details={item_details}
            priceLists={price_lists}
            costLists={cost_lists}
            itemId={itemId}
          />
        )}

        {/* Section 6: Inventory & Reorder */}
        {item_details && <InventorySection details={item_details} />}
      </div>
    </>
  )
}
