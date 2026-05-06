import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { apiClient } from '@/api/client'
import {
  DollarSign, ShoppingCart, PackageX, AlertTriangle,
  Plus, FileText, ClipboardList, ArrowUpRight, ArrowDownRight,
  TrendingUp,
} from 'lucide-react'
import PendingApprovals from '@/components/dashboard/PendingApprovals'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts'

import { formatCurrency } from '@/lib/format'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PageHeader, KpiGrid, KpiCard } from '@/components/page'

interface DashboardData {
  kpis: {
    revenue_today: string
    revenue_trend: number
    open_orders_count: number
    low_stock_count: number
    overdue_invoices_amount: string
    overdue_invoices_count: number
  }
  charts: {
    sales_trend: { date: string; amount: string }[]
    top_items: { sku: string; name: string; revenue: string }[]
  }
  low_stock_items: {
    sku: string
    item_name: string
    warehouse_code: string
    on_hand_qty: number
    allocated_qty: number
    on_order_qty: number
  }[]
  recent_activity: {
    type: string
    icon: string
    message: string
    timestamp: string
  }[]
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function timeAgo(timestamp: string) {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case 'order': return <ShoppingCart className="h-4 w-4" style={{ color: 'var(--so-accent)' }} />
    case 'invoice': return <FileText className="h-4 w-4" style={{ color: 'var(--so-success-text)' }} />
    case 'shipment': return <ClipboardList className="h-4 w-4" style={{ color: 'var(--so-info-text)' }} />
    default: return <FileText className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
  }
}

export default function Dashboard() {
  usePageTitle('Dashboard')
  const navigate = useNavigate()

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get('/dashboard/').then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  })

  const chartData = useMemo(() => {
    if (!data?.charts.sales_trend) return []
    return data.charts.sales_trend.map(d => ({
      date: formatShortDate(d.date),
      amount: parseFloat(d.amount),
    }))
  }, [data])

  const topItemsData = useMemo(() => {
    if (!data?.charts.top_items) return []
    return data.charts.top_items.map(d => ({
      name: d.sku,
      fullName: d.name,
      revenue: parseFloat(d.revenue),
    }))
  }, [data])

  const kpis = data?.kpis
  const trend = kpis?.revenue_trend ?? 0
  const trendUp = trend >= 0
  const lowStockCount = kpis?.low_stock_count ?? 0
  const overdueCount = kpis?.overdue_invoices_count ?? 0

  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">

        <PageHeader
          title="Dashboard"
          description={`Business pulse — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
        />

        {/* KPI Cards Row */}
        <div className="mb-5 animate-in delay-1">
          <KpiGrid columns={4}>
            <KpiCard
              label="Revenue Today"
              value={<span className="font-mono">{formatCurrency(kpis?.revenue_today || '0')}</span>}
              icon={DollarSign}
              hint={
                <span className="inline-flex items-center gap-1 font-medium" style={{ color: trendUp ? 'var(--so-success-text)' : 'var(--so-danger-text)' }}>
                  {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(trend)}% vs last week
                </span>
              }
              onClick={() => navigate('/invoices?date=today')}
            />
            <KpiCard
              label="Open Orders"
              value={<span className="font-mono">{kpis?.open_orders_count ?? 0}</span>}
              icon={ShoppingCart}
              hint="Confirmed / In Progress"
              onClick={() => navigate('/orders?tab=sales&status=open')}
            />
            <KpiCard
              label="Low Stock Items"
              value={<span className="font-mono">{lowStockCount}</span>}
              icon={PackageX}
              tone={lowStockCount > 0 ? 'warning' : 'default'}
              hint={lowStockCount === 0 ? 'All stocked' : 'Need attention'}
              onClick={() => navigate('/inventory')}
            />
            <KpiCard
              label="Overdue Invoices"
              value={<span className="font-mono">{formatCurrency(kpis?.overdue_invoices_amount || '0')}</span>}
              icon={AlertTriangle}
              tone={overdueCount > 0 ? 'negative' : 'default'}
              hint={overdueCount > 0 ? `${overdueCount} invoices past due` : 'All current'}
              onClick={() => navigate('/invoices?status=overdue')}
            />
          </KpiGrid>
        </div>

        {/* Main Chart: Sales Trend */}
        <div className="rounded-[14px] border overflow-hidden mb-5 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-4 md:px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingUp className="h-4 w-4" style={{ color: 'var(--so-accent)' }} />
              <span className="text-sm font-semibold">Sales Trend (30 Days)</span>
              <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>Daily invoice revenue</span>
            </div>
          </div>
          <div className="px-2 md:px-6 py-5">
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--so-accent)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--so-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--so-border-light)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--so-text-tertiary)' }}
                    axisLine={{ stroke: 'var(--so-border-light)' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--so-text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--so-surface)',
                      borderColor: 'var(--so-border)',
                      borderRadius: '8px',
                      color: 'var(--so-text-primary)',
                      fontSize: '12px',
                    }}
                    formatter={((value: number) => [formatCurrency(value), 'Revenue']) as any}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="var(--so-accent)"
                    fill="url(#salesGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Approvals + Top Items + Low Stock + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 mb-5 animate-in delay-3">

          <PendingApprovals />

          {/* Top Items by Revenue */}
          <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-4 md:px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Top Items (30 Days)</span>
            </div>
            <div className="px-2 md:px-6 py-5">
              {topItemsData.length > 0 ? (
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topItemsData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--so-border-light)" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: 'var(--so-text-tertiary)' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11, fill: 'var(--so-text-tertiary)' }}
                        axisLine={false}
                        tickLine={false}
                        width={70}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--so-surface)',
                          borderColor: 'var(--so-border)',
                          borderRadius: '8px',
                          color: 'var(--so-text-primary)',
                          fontSize: '12px',
                        }}
                        formatter={((value: number) => [formatCurrency(value), 'Revenue']) as any}
                      />
                      <Bar dataKey="revenue" fill="var(--so-accent)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>No sales data yet</p>
              )}
            </div>
          </div>

          {/* Items to Reorder */}
          <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-4 md:px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Items to Reorder</span>
            </div>
            <div className="px-4 md:px-6 py-5">
              {data?.low_stock_items && data.low_stock_items.length > 0 ? (
                <div className="space-y-0 max-h-[200px] overflow-y-auto">
                  {data.low_stock_items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2.5 gap-3"
                      style={{ borderBottom: i < data.low_stock_items.length - 1 ? '1px solid var(--so-border-light)' : 'none' }}
                    >
                      <div className="min-w-0">
                        <span className="text-[12.5px] font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>{item.sku}</span>
                        <span className="text-[11.5px] ml-2" style={{ color: 'var(--so-text-tertiary)' }}>{item.warehouse_code}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className="text-[12.5px] font-semibold font-mono"
                          style={{ color: item.on_hand_qty <= 0 ? 'var(--so-danger-text)' : 'var(--so-warning-text)' }}
                        >
                          {item.on_hand_qty}
                        </span>
                        <span className="text-[11.5px] ml-1" style={{ color: 'var(--so-text-tertiary)' }}>on hand</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm" style={{ color: 'var(--so-success-text)' }}>All items adequately stocked</div>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-4 md:px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Recent Activity</span>
            </div>
            <div className="px-4 md:px-6 py-5">
              {data?.recent_activity && data.recent_activity.length > 0 ? (
                <div className="max-h-[200px] overflow-y-auto">
                  {data.recent_activity.map((activity, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 py-2.5"
                      style={{ borderBottom: i < data.recent_activity.length - 1 ? '1px solid var(--so-border-light)' : 'none' }}
                    >
                      <div className="mt-0.5 shrink-0">
                        <ActivityIcon type={activity.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] truncate" style={{ color: 'var(--so-text-primary)' }}>{activity.message}</p>
                        <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--so-text-secondary)' }}>{timeAgo(activity.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>No recent activity</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions Row */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-4 md:px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Quick Actions</span>
          </div>
          <div className="px-4 md:px-6 py-5">
            <div className="flex flex-wrap gap-2">
              <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/orders')}>
                <Plus className="h-3.5 w-3.5" /> New Order
              </button>
              <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/receive-payment')}>
                <DollarSign className="h-3.5 w-3.5" /> Receive Payment
              </button>
              <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/invoices')}>
                <FileText className="h-3.5 w-3.5" /> Invoices
              </button>
              <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/inventory')}>
                <ClipboardList className="h-3.5 w-3.5" /> Inventory
              </button>
              <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate('/admin/import')}>
                <Plus className="h-3.5 w-3.5" /> Import Data
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
