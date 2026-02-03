import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Truck, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { useShipments, useBillsOfLading, type Shipment, type BillOfLading } from '@/api/shipping'
import { format } from 'date-fns'

type Tab = 'shipments' | 'bols'

const shipmentStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  pending: 'secondary',
  in_transit: 'warning',
  delivered: 'success',
  cancelled: 'destructive',
}

const bolStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  printed: 'outline',
  signed: 'warning',
  complete: 'success',
}

export default function Shipping() {
  usePageTitle('Shipping')

  const [activeTab, setActiveTab] = useState<Tab>('shipments')

  const { data: shipmentsData } = useShipments()
  const { data: bolsData } = useBillsOfLading()

  const shipmentColumns: ColumnDef<Shipment>[] = useMemo(
    () => [
      {
        accessorKey: 'shipment_number',
        header: 'Shipment #',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('shipment_number')}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string
          return (
            <Badge variant={shipmentStatusVariant[status] || 'outline'}>
              {status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'ship_from_name',
        header: 'From',
      },
      {
        accessorKey: 'ship_to_name',
        header: 'To',
      },
      {
        accessorKey: 'carrier',
        header: 'Carrier',
        cell: ({ row }) => row.getValue('carrier') || '-',
      },
      {
        accessorKey: 'ship_date',
        header: 'Ship Date',
        cell: ({ row }) => {
          const date = row.getValue('ship_date') as string | null
          return date ? format(new Date(date), 'MMM d, yyyy') : '-'
        },
      },
      {
        accessorKey: 'delivery_date',
        header: 'Delivery Date',
        cell: ({ row }) => {
          const date = row.getValue('delivery_date') as string | null
          return date ? format(new Date(date), 'MMM d, yyyy') : '-'
        },
      },
      {
        accessorKey: 'tracking_number',
        header: 'Tracking',
        cell: ({ row }) => {
          const tracking = row.getValue('tracking_number') as string
          return tracking ? (
            <span className="font-mono text-xs">{tracking}</span>
          ) : (
            '-'
          )
        },
      },
    ],
    []
  )

  const bolColumns: ColumnDef<BillOfLading>[] = useMemo(
    () => [
      {
        accessorKey: 'bol_number',
        header: 'BOL #',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('bol_number')}</span>
        ),
      },
      {
        accessorKey: 'shipment_number',
        header: 'Shipment',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string
          return (
            <Badge variant={bolStatusVariant[status] || 'outline'}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'carrier',
        header: 'Carrier',
      },
      {
        accessorKey: 'trailer_number',
        header: 'Trailer #',
        cell: ({ row }) => row.getValue('trailer_number') || '-',
      },
      {
        accessorKey: 'driver_name',
        header: 'Driver',
        cell: ({ row }) => row.getValue('driver_name') || '-',
      },
      {
        accessorKey: 'pickup_date',
        header: 'Pickup',
        cell: ({ row }) => {
          const date = row.getValue('pickup_date') as string | null
          return date ? format(new Date(date), 'MMM d, yyyy') : '-'
        },
      },
      {
        accessorKey: 'freight_charge',
        header: 'Freight',
        cell: ({ row }) => {
          const charge = row.getValue('freight_charge') as string
          return charge ? `$${parseFloat(charge).toFixed(2)}` : '-'
        },
      },
    ],
    []
  )

  const tabs = [
    { id: 'shipments' as Tab, label: 'Shipments', icon: Truck },
    { id: 'bols' as Tab, label: 'Bills of Lading', icon: FileText },
  ]

  // Summary stats
  const pendingShipments = shipmentsData?.results.filter((s) => s.status === 'pending').length ?? 0
  const inTransit = shipmentsData?.results.filter((s) => s.status === 'in_transit').length ?? 0
  const delivered = shipmentsData?.results.filter((s) => s.status === 'delivered').length ?? 0

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Shipping</h1>
          <p className="text-muted-foreground">
            Manage shipments and bills of lading
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New {activeTab === 'shipments' ? 'Shipment' : 'BOL'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{pendingShipments}</div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{inTransit}</div>
            <div className="text-sm text-muted-foreground">In Transit</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{delivered}</div>
            <div className="text-sm text-muted-foreground">Delivered</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle>
            {tabs.find((t) => t.id === activeTab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTab === 'shipments' && (
            <DataTable
              columns={shipmentColumns}
              data={shipmentsData?.results ?? []}
              searchColumn="shipment_number"
              searchPlaceholder="Search shipments..."
            />
          )}
          {activeTab === 'bols' && (
            <DataTable
              columns={bolColumns}
              data={bolsData?.results ?? []}
              searchColumn="bol_number"
              searchPlaceholder="Search BOLs..."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
