import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, FileText } from 'lucide-react'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFixedAsset, useDisposeAsset, type FixedAsset } from '@/api/assets'
import { formatCurrency, formatLifeMonths } from '@/lib/format'
import { DISPOSAL_METHODS, DEPRECIATION_METHOD_MAP } from '@/constants/assets'
import { EntryToolbar } from '@/components/common/EntryToolbar'
import { DetailCard } from '@/components/common/DetailCard'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'


export default function FixedAssetDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const assetId = parseInt(id || '0', 10)

  const { data: asset, isLoading } = useFixedAsset(assetId)
  const disposeAsset = useDisposeAsset()

  usePageTitle(asset ? `Asset ${asset.asset_number}` : 'Asset Detail')

  // Prev/next navigation
  const hasPrev = !!asset?.prev_id
  const hasNext = !!asset?.next_id
  const handlePrev = () => { if (asset?.prev_id) navigate(`/fixed-assets/${asset.prev_id}`) }
  const handleNext = () => { if (asset?.next_id) navigate(`/fixed-assets/${asset.next_id}`) }

  // Dispose dialog
  const [disposeOpen, setDisposeOpen] = useState(false)
  const [disposeForm, setDisposeForm] = useState({
    disposal_date: new Date().toISOString().split('T')[0],
    disposal_amount: '0.00',
    disposal_method: 'sold',
    disposal_notes: '',
  })

  const handleDispose = async () => {
    await disposeAsset.mutateAsync({
      id: assetId,
      disposal_date: disposeForm.disposal_date,
      disposal_amount: disposeForm.disposal_amount,
      disposal_method: disposeForm.disposal_method,
      disposal_notes: disposeForm.disposal_notes,
    })
    setDisposeOpen(false)
  }

  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Asset not found</div>
        </div>
      </div>
    )
  }

  const detailItems = [
    { label: 'Asset Number', value: asset.asset_number, mono: true },
    { label: 'Description', value: asset.description },
    { label: 'Category', value: asset.category_name },
    { label: 'Serial Number', value: asset.serial_number || 'N/A', empty: !asset.serial_number },
    { label: 'Location', value: asset.location || 'N/A', empty: !asset.location },
    { label: 'Status', value: asset.status, badge: true },
  ]

  const acquisitionItems = [
    { label: 'Acquisition Date', value: asset.acquisition_date ? new Date(asset.acquisition_date + 'T00:00:00').toLocaleDateString() : '-' },
    { label: 'Acquisition Cost', value: formatCurrency(asset.acquisition_cost), mono: true },
    { label: 'Vendor', value: asset.vendor_name || 'N/A', empty: !asset.vendor_name },
  ]

  const depreciationItems = [
    { label: 'Method', value: DEPRECIATION_METHOD_MAP[asset.depreciation_method] || asset.depreciation_method },
    { label: 'Useful Life', value: formatLifeMonths(asset.useful_life_months) },
    { label: 'Salvage Value', value: formatCurrency(asset.salvage_value), mono: true },
    { label: 'Start Date', value: asset.depreciation_start_date ? new Date(asset.depreciation_start_date + 'T00:00:00').toLocaleDateString() : '-' },
    { label: 'Accumulated Depreciation', value: formatCurrency(asset.accumulated_depreciation), mono: true },
    { label: 'Net Book Value', value: formatCurrency(asset.net_book_value), mono: true },
    { label: 'Monthly Depreciation', value: formatCurrency(asset.monthly_depreciation), mono: true },
    { label: 'Remaining Life', value: formatLifeMonths(asset.remaining_life_months) },
  ]

  const depreciation_entries = asset.depreciation_entries ?? []
  const transactions = asset.transactions ?? []

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/fixed-assets')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Fixed Assets
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{asset.asset_number}</span>
        </div>

        {/* EntryToolbar */}
        <div className="mb-5 animate-in">
          <EntryToolbar
            onPrev={handlePrev}
            onNext={handleNext}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrint={() => window.print()}
          />
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{asset.asset_number}</h1>
              {getStatusBadge(asset.status)}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              {asset.description}
              {asset.category_name && (
                <span style={{ color: 'var(--so-text-tertiary)' }}> &middot; {asset.category_name}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {asset.status === 'active' && (
              <button
                className={outlineBtnClass}
                style={{ ...outlineBtnStyle, color: 'var(--so-danger-text)', borderColor: 'var(--so-danger-text)' }}
                onClick={() => setDisposeOpen(true)}
              >
                Dispose
              </button>
            )}
          </div>
        </div>

        {/* Asset Information */}
        <DetailCard title="Asset Information" animateDelay="delay-2" className="mb-4">
          <div className="grid grid-cols-3" style={{ borderTop: 'none' }}>
            {detailItems.map((item, idx) => (
              <div
                key={idx}
                className="px-5 py-4"
                style={{
                  borderRight: (idx + 1) % 3 !== 0 ? '1px solid var(--so-border-light)' : 'none',
                  borderBottom: idx < 3 ? '1px solid var(--so-border-light)' : 'none',
                }}
              >
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                  {item.label}
                </div>
                {'badge' in item && item.badge ? (
                  getStatusBadge(String(item.value))
                ) : (
                  <div
                    className={`text-sm font-medium ${item.mono ? 'font-mono' : ''}`}
                    style={{
                      color: item.empty ? 'var(--so-text-tertiary)' : 'var(--so-text-primary)',
                      fontStyle: item.empty ? 'italic' : 'normal',
                    }}
                  >
                    {item.value}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DetailCard>

        {/* Acquisition */}
        <DetailCard title="Acquisition" animateDelay="delay-2" className="mb-4">
          <div className="grid grid-cols-3" style={{ borderTop: 'none' }}>
            {acquisitionItems.map((item, idx) => (
              <div
                key={idx}
                className="px-5 py-4"
                style={{
                  borderRight: (idx + 1) % 3 !== 0 ? '1px solid var(--so-border-light)' : 'none',
                }}
              >
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                  {item.label}
                </div>
                <div
                  className={`text-sm font-medium ${item.mono ? 'font-mono' : ''}`}
                  style={{
                    color: item.empty ? 'var(--so-text-tertiary)' : 'var(--so-text-primary)',
                    fontStyle: item.empty ? 'italic' : 'normal',
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </DetailCard>

        {/* Depreciation */}
        <DetailCard title="Depreciation" animateDelay="delay-3" className="mb-4">
          <div className="grid grid-cols-4" style={{ borderTop: 'none' }}>
            {depreciationItems.map((item, idx) => (
              <div
                key={idx}
                className="px-5 py-4"
                style={{
                  borderRight: (idx + 1) % 4 !== 0 ? '1px solid var(--so-border-light)' : 'none',
                  borderBottom: idx < 4 ? '1px solid var(--so-border-light)' : 'none',
                }}
              >
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                  {item.label}
                </div>
                <div
                  className={`text-sm font-medium ${item.mono ? 'font-mono' : ''}`}
                  style={{ color: 'var(--so-text-primary)' }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </DetailCard>

        {/* Depreciation Schedule */}
        <DetailCard
          title="Depreciation Schedule"
          headerRight={<span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>{depreciation_entries.length} entries</span>}
          animateDelay="delay-3"
          className="mb-4"
        >
          {depreciation_entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Period', 'Amount', 'Accumulated', 'Net Book Value'].map((h, i) => (
                      <th
                        key={h}
                        className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 ${i >= 1 ? 'text-right' : 'text-left'} ${i === 0 ? 'pl-6' : ''} ${i === 3 ? 'pr-6' : ''}`}
                        style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depreciation_entries.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <td className="py-3 px-4 pl-6" style={{ color: 'var(--so-text-secondary)' }}>
                        {new Date(entry.period_date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono" style={{ color: 'var(--so-text-primary)' }}>
                        {formatCurrency(entry.amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono" style={{ color: 'var(--so-text-secondary)' }}>
                        {formatCurrency(entry.accumulated_after)}
                      </td>
                      <td className="py-3 px-4 pr-6 text-right font-mono font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                        {formatCurrency(entry.net_book_value_after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
              No depreciation entries yet
            </div>
          )}
        </DetailCard>

        {/* Transaction History */}
        <DetailCard
          title="Transaction History"
          headerRight={<span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>{transactions.length} transactions</span>}
          animateDelay="delay-3"
          className="mb-4"
        >
          {transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Type', 'Amount', 'Description'].map((h, i) => (
                      <th
                        key={h}
                        className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 ${i === 2 ? 'text-right' : 'text-left'} ${i === 0 ? 'pl-6' : ''} ${i === 3 ? 'pr-6' : ''}`}
                        style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <td className="py-3 px-4 pl-6" style={{ color: 'var(--so-text-secondary)' }}>
                        {new Date(tx.transaction_date + 'T00:00:00').toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="capitalize" style={{ color: 'var(--so-text-primary)' }}>
                          {tx.transaction_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono" style={{ color: 'var(--so-text-primary)' }}>
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="py-3 px-4 pr-6" style={{ color: 'var(--so-text-secondary)' }}>
                        {tx.description || '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
              No transactions recorded
            </div>
          )}
        </DetailCard>

        {/* Notes */}
        {asset.notes && (
          <DetailCard title="Notes" animateDelay="delay-3" className="mb-4">
            <div className="flex items-start gap-2.5 px-5 py-4" style={{ background: 'var(--so-bg)' }}>
              <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--so-text-tertiary)', opacity: 0.6 }} />
              <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--so-text-secondary)' }}>{asset.notes}</p>
            </div>
          </DetailCard>
        )}
      </div>

      {/* Dispose Dialog */}
      <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Dispose Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              Record the disposal of <strong>{asset.asset_number}</strong> - {asset.description}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--so-text-secondary)' }}>Disposal Date *</Label>
                <Input
                  type="date"
                  value={disposeForm.disposal_date}
                  onChange={(e) => setDisposeForm(p => ({ ...p, disposal_date: e.target.value }))}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--so-text-secondary)' }}>Disposal Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={disposeForm.disposal_amount}
                  onChange={(e) => setDisposeForm(p => ({ ...p, disposal_amount: e.target.value }))}
                  className="font-mono"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label style={{ color: 'var(--so-text-secondary)' }}>Disposal Method *</Label>
              <Select
                value={disposeForm.disposal_method}
                onValueChange={(v) => setDisposeForm(p => ({ ...p, disposal_method: v }))}
              >
                <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPOSAL_METHODS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label style={{ color: 'var(--so-text-secondary)' }}>Notes</Label>
              <Textarea
                value={disposeForm.disposal_notes}
                onChange={(e) => setDisposeForm(p => ({ ...p, disposal_notes: e.target.value }))}
                placeholder="Disposal notes..."
                rows={3}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid var(--so-border-light)' }}>
              <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setDisposeOpen(false)}>
                Cancel
              </button>
              <button
                className={`${primaryBtnClass}${disposeAsset.isPending ? ' opacity-50 pointer-events-none' : ''}`}
                style={{ ...primaryBtnStyle, background: '#dc2626', borderColor: '#dc2626' }}
                onClick={handleDispose}
                disabled={disposeAsset.isPending}
              >
                {disposeAsset.isPending ? 'Processing...' : 'Dispose Asset'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
