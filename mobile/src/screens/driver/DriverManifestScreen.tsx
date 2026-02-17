import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, RefreshControl, Alert, ActivityIndicator,
} from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { driverApi, DriverRun, ManifestStop } from '../../api/driver'
import { syncService } from '../../services/SyncService'

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#64748b',
  ARRIVED: '#f59e0b',
  COMPLETED: '#22c55e',
  SKIPPED: '#ef4444',
}

function StopCard({ stop, onPress }: { stop: ManifestStop; onPress: () => void }) {
  const statusColor = STATUS_COLORS[stop.status] || '#64748b'

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardLeft}>
        <View style={[styles.sequenceBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.sequenceText}>{stop.sequence}</Text>
        </View>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.customerName} numberOfLines={1}>{stop.customer_name}</Text>
        <Text style={styles.cityText}>{stop.city || 'No address'}</Text>
        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Feather name="package" size={14} color="#94a3b8" />
            <Text style={styles.metaText}>{stop.pallet_count} pallets</Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="file-text" size={14} color="#94a3b8" />
            <Text style={styles.metaText}>{stop.orders.length} orders</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardRight}>
        {stop.status === 'COMPLETED' ? (
          <Feather name="check-circle" size={28} color="#22c55e" />
        ) : stop.status === 'ARRIVED' ? (
          <Feather name="map-pin" size={28} color="#f59e0b" />
        ) : (
          <Feather name="chevron-right" size={28} color="#475569" />
        )}
      </View>
    </TouchableOpacity>
  )
}

export default function DriverManifestScreen() {
  const navigation = useNavigation<any>()
  const queryClient = useQueryClient()
  const [unsyncedCount, setUnsyncedCount] = useState(0)

  const { data: run, isLoading, isError, refetch } = useQuery<DriverRun>({
    queryKey: ['driver-run'],
    queryFn: driverApi.getMyRun,
    refetchInterval: 60_000, // Refresh every minute
  })

  // Check unsynced queue
  useEffect(() => {
    const checkQueue = async () => {
      const count = await syncService.getQueueCount()
      setUnsyncedCount(count)
      if (count > 0) {
        const synced = await syncService.processQueue()
        if (synced > 0) {
          setUnsyncedCount(await syncService.getQueueCount())
          refetch()
        }
      }
    }
    checkQueue()
    const interval = setInterval(checkQueue, 5 * 60_000) // Every 5 min
    return () => clearInterval(interval)
  }, [refetch])

  const handleStartRun = useCallback(async () => {
    try {
      await driverApi.startRun()
      refetch()
      Alert.alert('Run Started', 'Drive safe!')
    } catch {
      Alert.alert('Error', 'Could not start the run.')
    }
  }, [refetch])

  const handleStopPress = useCallback((stop: ManifestStop) => {
    navigation.navigate('DriverStack', {
      screen: 'StopDetail',
      params: { stop, runId: run?.run_id },
    })
  }, [navigation, run])

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#e02424" />
          <Text style={styles.loadingText}>Loading manifest...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (isError || !run) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Feather name="truck" size={64} color="#334155" />
          <Text style={styles.noRunTitle}>No Run Today</Text>
          <Text style={styles.noRunSubtitle}>You have no deliveries scheduled.</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()}>
            <Feather name="refresh-cw" size={18} color="#fff" />
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const completedStops = run.stops.filter(s => s.status === 'COMPLETED').length

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.truckName}>{run.truck_name}</Text>
          <Text style={styles.runName}>{run.run_name}</Text>
        </View>
        {unsyncedCount > 0 && (
          <View style={styles.syncBadge}>
            <Feather name="upload-cloud" size={14} color="#fbbf24" />
            <Text style={styles.syncBadgeText}>{unsyncedCount} unsynced</Text>
          </View>
        )}
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{run.total_stops}</Text>
          <Text style={styles.statLabel}>Stops</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{completedStops}/{run.total_stops}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {Number(run.total_weight_lbs).toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>lbs</Text>
        </View>
      </View>

      {/* Stop List */}
      <FlatList
        data={run.stops}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <StopCard stop={item} onPress={() => handleStopPress(item)} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => refetch()}
            tintColor="#e02424"
          />
        }
        ListFooterComponent={
          run.stops.every(s => s.status === 'PENDING') ? (
            <TouchableOpacity style={styles.startBtn} onPress={handleStartRun}>
              <Feather name="play" size={22} color="#fff" />
              <Text style={styles.startBtnText}>START RUN</Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { color: '#94a3b8', fontSize: 16, marginTop: 16 },
  noRunTitle: { color: '#e2e8f0', fontSize: 24, fontWeight: '700', marginTop: 20 },
  noRunSubtitle: { color: '#64748b', fontSize: 16, marginTop: 8 },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#e02424', paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 12, marginTop: 24,
  },
  refreshBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  truckName: { color: '#f1f5f9', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  runName: { color: '#64748b', fontSize: 15, marginTop: 2 },
  syncBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#422006', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#92400e',
  },
  syncBadgeText: { color: '#fbbf24', fontSize: 13, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e293b', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, paddingVertical: 16,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: '#f1f5f9', fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#64748b', fontSize: 12, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 32, backgroundColor: '#334155' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e293b', borderRadius: 14,
    padding: 16, marginBottom: 10,
  },
  cardLeft: { marginRight: 14 },
  sequenceBadge: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  sequenceText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  cardContent: { flex: 1 },
  customerName: { color: '#f1f5f9', fontSize: 17, fontWeight: '700' },
  cityText: { color: '#94a3b8', fontSize: 14, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 16, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#94a3b8', fontSize: 13 },
  cardRight: { marginLeft: 8 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#e02424', paddingVertical: 20, borderRadius: 16,
    marginTop: 8, marginBottom: 32,
  },
  startBtnText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 1 },
})
