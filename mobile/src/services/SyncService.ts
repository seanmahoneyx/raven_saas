import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { driverApi, PODPayload } from '../api/driver'

const SYNC_QUEUE_KEY = '@raven_sync_queue'

export interface QueuedPOD {
  id: string
  stopId: number
  payload: PODPayload
  timestamp: number
  retries: number
}

class SyncService {
  private isSyncing = false

  async getQueue(): Promise<QueuedPOD[]> {
    const raw = await AsyncStorage.getItem(SYNC_QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  }

  async getQueueCount(): Promise<number> {
    const queue = await this.getQueue()
    return queue.length
  }

  private async saveQueue(queue: QueuedPOD[]): Promise<void> {
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))
  }

  async enqueue(stopId: number, payload: PODPayload): Promise<void> {
    const queue = await this.getQueue()
    queue.push({
      id: `pod_${stopId}_${Date.now()}`,
      stopId,
      payload,
      timestamp: Date.now(),
      retries: 0,
    })
    await this.saveQueue(queue)
  }

  async submitOrQueue(stopId: number, payload: PODPayload): Promise<boolean> {
    const netState = await NetInfo.fetch()

    if (netState.isConnected) {
      try {
        await driverApi.signDelivery(stopId, payload)
        return true // Submitted successfully
      } catch {
        // Failed even though online - queue it
        await this.enqueue(stopId, payload)
        return false
      }
    }

    // Offline - queue it
    await this.enqueue(stopId, payload)
    return false
  }

  async processQueue(): Promise<number> {
    if (this.isSyncing) return 0
    this.isSyncing = true

    try {
      const netState = await NetInfo.fetch()
      if (!netState.isConnected) return 0

      const queue = await this.getQueue()
      if (queue.length === 0) return 0

      let synced = 0
      const remaining: QueuedPOD[] = []

      for (const item of queue) {
        try {
          await driverApi.signDelivery(item.stopId, item.payload)
          synced++
        } catch {
          // Keep in queue, increment retry count
          if (item.retries < 10) {
            remaining.push({ ...item, retries: item.retries + 1 })
          }
          // Drop items with 10+ retries
        }
      }

      await this.saveQueue(remaining)
      return synced
    } finally {
      this.isSyncing = false
    }
  }

  async clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(SYNC_QUEUE_KEY)
  }
}

export const syncService = new SyncService()
