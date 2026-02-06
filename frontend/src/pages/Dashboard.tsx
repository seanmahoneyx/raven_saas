import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { apiClient } from '@/api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DollarSign, ShoppingCart, PackageX, AlertTriangle,
  Plus, FileText, ClipboardList, ArrowUpRight, ArrowDownRight,
  TrendingUp,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts'

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

function formatCurrency(value: string | number) {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
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
    case 'order': return <ShoppingCart className="h-4 w-4 text-blue-500" />
    case 'invoice': return <FileText className="h-4 w-4 text-green-500" />
    case 'shipment': return <ClipboardList className="h-4 w-4 text-purple-500" />
    default: return <FileText className="h-4 w-4 text-muted-foreground" />
  }
}

export default function Dashboard() {
  usePageTitle('Dashboard')
  const navigate = useNavigate()

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get('/dashboard/').then(r => r.data),
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 min
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

  if (isLoading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Business pulse — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Revenue Today */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Today</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.revenue_today || '0')}</div>
            <div className={`flex items-center text-xs mt-1 ${trendUp ? 'text-green-600' : 'text-red-500'}`}>
              {trendUp ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
              {Math.abs(trend)}% vs last week
            </div>
          </CardContent>
        </Card>

        {/* Open Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis?.open_orders_count ?? 0}</div>
            <CardDescription>Confirmed / In Progress</CardDescription>
          </CardContent>
        </Card>

        {/* Low Stock */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <PackageX className={`h-4 w-4 ${(kpis?.low_stock_count ?? 0) > 0 ? 'text-amber-500' : 'text-green-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(kpis?.low_stock_count ?? 0) > 0 ? 'text-amber-600' : ''}`}>
              {kpis?.low_stock_count ?? 0}
            </div>
            <CardDescription>{(kpis?.low_stock_count ?? 0) === 0 ? 'All stocked' : 'Need attention'}</CardDescription>
          </CardContent>
        </Card>

        {/* Overdue Invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Invoices</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${(kpis?.overdue_invoices_count ?? 0) > 0 ? 'text-red-500' : 'text-green-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(kpis?.overdue_invoices_count ?? 0) > 0 ? 'text-red-600' : ''}`}>
              {formatCurrency(kpis?.overdue_invoices_amount || '0')}
            </div>
            <CardDescription>
              {(kpis?.overdue_invoices_count ?? 0) > 0
                ? `${kpis?.overdue_invoices_count} invoices past due`
                : 'All current'}
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Main Chart: Sales Trend */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Sales Trend (30 Days)
              </CardTitle>
              <CardDescription>Daily invoice revenue</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  className="fill-muted-foreground"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  className="fill-muted-foreground"
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                  }}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(var(--primary))"
                  fill="url(#salesGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Split Row: Top Items + Low Stock + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top Items by Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Items (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {topItemsData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topItemsData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="fill-muted-foreground" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} className="fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                      formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sales data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Items to Reorder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items to Reorder</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.low_stock_items && data.low_stock_items.length > 0 ? (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {data.low_stock_items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                    <div>
                      <span className="text-sm font-mono font-medium">{item.sku}</span>
                      <span className="text-xs text-muted-foreground ml-2">{item.warehouse_code}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-semibold ${item.on_hand_qty <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                        {item.on_hand_qty}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">on hand</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-green-600">All items adequately stocked</div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recent_activity && data.recent_activity.length > 0 ? (
              <div className="space-y-3 max-h-[200px] overflow-y-auto">
                {data.recent_activity.map((activity, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <ActivityIcon type={activity.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{activity.message}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(activity.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions Row */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate('/orders')} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> New Order
            </Button>
            <Button onClick={() => navigate('/receive-payment')} variant="outline" className="gap-2">
              <DollarSign className="h-4 w-4" /> Receive Payment
            </Button>
            <Button onClick={() => navigate('/invoices')} variant="outline" className="gap-2">
              <FileText className="h-4 w-4" /> Invoices
            </Button>
            <Button onClick={() => navigate('/inventory')} variant="outline" className="gap-2">
              <ClipboardList className="h-4 w-4" /> Inventory
            </Button>
            <Button onClick={() => navigate('/admin/import')} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Import Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
