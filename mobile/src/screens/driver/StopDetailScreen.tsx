import { useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Linking, Alert, Platform,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { driverApi, ManifestStop, StopOrder } from '../../api/driver'
import * as Location from 'expo-location'

function OrderCard({ order }: { order: StopOrder }) {
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderNumber}>{order.order_number}</Text>
        {order.customer_po ? (
          <Text style={styles.customerPO}>PO: {order.customer_po}</Text>
        ) : null}
      </View>
      {order.lines.map((line, i) => (
        <View key={i} style={styles.lineRow}>
          <View style={styles.lineLeft}>
            <Text style={styles.lineSku}>{line.item_sku}</Text>
            <Text style={styles.lineName} numberOfLines={1}>{line.item_name}</Text>
          </View>
          <Text style={styles.lineQty}>
            {line.quantity} {line.uom_code}
          </Text>
        </View>
      ))}
    </View>
  )
}

export default function StopDetailScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const queryClient = useQueryClient()
  const { stop, runId } = route.params as { stop: ManifestStop; runId: number }

  const openMaps = useCallback(() => {
    const address = encodeURIComponent(stop.address)
    const url = Platform.select({
      ios: `maps:?daddr=${address}`,
      android: `google.navigation:q=${address}`,
    })
    if (url) {
      Linking.openURL(url).catch(() => {
        // Fallback to Google Maps web
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${address}`)
      })
    }
  }, [stop.address])

  const handleArrive = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      let gps: { lat: number; lng: number } | undefined
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        gps = { lat: loc.coords.latitude, lng: loc.coords.longitude }
      }
      await driverApi.arriveAtStop(stop.id, gps)
      queryClient.invalidateQueries({ queryKey: ['driver-run'] })
      Alert.alert('Arrived', `Arrival logged at ${stop.customer_name}`)
      navigation.goBack()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Could not log arrival.')
    }
  }, [stop, queryClient, navigation])

  const handleCapturePOD = useCallback(() => {
    navigation.navigate('DriverStack', {
      screen: 'PODCapture',
      params: { stopId: stop.id, customerName: stop.customer_name },
    })
  }, [navigation, stop])

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color="#f1f5f9" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Stop {stop.sequence}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Customer Name */}
        <Text style={styles.customerName}>{stop.customer_name}</Text>

        {/* Address - Tappable for Navigation */}
        <TouchableOpacity style={styles.addressCard} onPress={openMaps} activeOpacity={0.7}>
          <Feather name="navigation" size={22} color="#3b82f6" />
          <View style={styles.addressContent}>
            <Text style={styles.addressText}>{stop.address || 'No address on file'}</Text>
            <Text style={styles.addressHint}>Tap to navigate</Text>
          </View>
          <Feather name="external-link" size={18} color="#475569" />
        </TouchableOpacity>

        {/* Instructions */}
        {stop.delivery_notes ? (
          <View style={styles.notesCard}>
            <Feather name="alert-circle" size={18} color="#f59e0b" />
            <Text style={styles.notesText}>{stop.delivery_notes}</Text>
          </View>
        ) : null}

        {/* Orders */}
        <Text style={styles.sectionTitle}>
          ITEMS TO DELIVER ({stop.orders.reduce((sum, o) => sum + o.lines.length, 0)} lines)
        </Text>
        {stop.orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        {stop.status === 'PENDING' ? (
          <TouchableOpacity style={styles.arriveBtn} onPress={handleArrive}>
            <Feather name="map-pin" size={22} color="#fff" />
            <Text style={styles.actionBtnText}>ARRIVED</Text>
          </TouchableOpacity>
        ) : stop.status === 'ARRIVED' ? (
          <TouchableOpacity style={styles.podBtn} onPress={handleCapturePOD}>
            <Feather name="edit-3" size={22} color="#fff" />
            <Text style={styles.actionBtnText}>CAPTURE POD</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.completedBar}>
            <Feather name="check-circle" size={22} color="#22c55e" />
            <Text style={styles.completedText}>DELIVERED</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { color: '#94a3b8', fontSize: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  scrollContent: { padding: 20, paddingBottom: 120 },
  customerName: { color: '#f1f5f9', fontSize: 26, fontWeight: '800', marginBottom: 16 },
  addressCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1e293b', borderRadius: 14, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: '#1e3a5f',
  },
  addressContent: { flex: 1 },
  addressText: { color: '#e2e8f0', fontSize: 17, fontWeight: '600' },
  addressHint: { color: '#3b82f6', fontSize: 13, marginTop: 2 },
  notesCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#422006', borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#92400e',
  },
  notesText: { color: '#fde68a', fontSize: 15, flex: 1, lineHeight: 22 },
  sectionTitle: {
    color: '#64748b', fontSize: 13, fontWeight: '700', letterSpacing: 1,
    marginTop: 16, marginBottom: 10,
  },
  orderCard: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 10,
  },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  orderNumber: { color: '#e2e8f0', fontSize: 16, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  customerPO: { color: '#94a3b8', fontSize: 13 },
  lineRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6,
  },
  lineLeft: { flex: 1, marginRight: 12 },
  lineSku: { color: '#cbd5e1', fontSize: 14, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  lineName: { color: '#64748b', fontSize: 13, marginTop: 1 },
  lineQty: { color: '#f1f5f9', fontSize: 18, fontWeight: '800' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, paddingBottom: 36,
    backgroundColor: '#0f172a', borderTopWidth: 1, borderTopColor: '#1e293b',
  },
  arriveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#f59e0b', paddingVertical: 20, borderRadius: 16,
  },
  podBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#e02424', paddingVertical: 20, borderRadius: 16,
  },
  actionBtnText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  completedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#14532d', paddingVertical: 20, borderRadius: 16,
  },
  completedText: { color: '#22c55e', fontSize: 20, fontWeight: '800', letterSpacing: 1 },
})
