import { View, Text } from 'react-native'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: '#374151', text: '#9ca3af' },
  confirmed: { label: 'Confirmed', bg: '#1e3a5f', text: '#60a5fa' },
  scheduled: { label: 'Scheduled', bg: '#3b1f6e', text: '#a78bfa' },
  picking: { label: 'In Production', bg: '#5c2d0e', text: '#fb923c' },
  crossdock: { label: 'Crossdock', bg: '#5c2d0e', text: '#fb923c' },
  shipped: { label: 'Shipped', bg: '#14532d', text: '#4ade80' },
  complete: { label: 'Completed', bg: '#14532d', text: '#4ade80' },
  cancelled: { label: 'Cancelled', bg: '#451a1a', text: '#f87171' },
}

interface Props {
  status: string
}

export default function StatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft

  return (
    <View
      className="px-2.5 py-1 rounded-full self-start"
      style={{ backgroundColor: config.bg }}
    >
      <Text className="text-xs font-semibold" style={{ color: config.text }}>
        {config.label}
      </Text>
    </View>
  )
}
