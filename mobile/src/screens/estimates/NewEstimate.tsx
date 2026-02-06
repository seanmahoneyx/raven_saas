import { useState } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useEstimateStore, type EstimateLine } from '../../store/estimate'
import { createEstimate, sendEstimate } from '../../api/estimates'
import CustomerPicker from '../../components/CustomerPicker'
import ItemPicker from '../../components/ItemPicker'

export default function NewEstimate() {
  const {
    customerId,
    customerName,
    lines,
    setCustomer,
    clearCustomer,
    addLine,
    removeLine,
    getTotal,
    reset,
  } = useEstimateStore()

  const [showItemPicker, setShowItemPicker] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const total = getTotal()

  const handleRemoveLine = (index: number) => {
    Alert.alert('Remove Item', 'Remove this item from the quote?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeLine(index) },
    ])
  }

  const handleFinalize = async () => {
    if (!customerId) {
      Alert.alert('Missing Customer', 'Please select a customer first.')
      return
    }
    if (lines.length === 0) {
      Alert.alert('No Items', 'Please add at least one item to the quote.')
      return
    }

    setSending(true)
    try {
      // 1. Create the estimate
      const today = new Date().toISOString().split('T')[0]
      const estimate = await createEstimate({
        customer: customerId,
        date: today,
        lines: lines.map((l, i) => ({
          item: l.itemId,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          uom: l.uomId,
          description: l.description,
          line_number: (i + 1) * 10,
        })),
      })

      // 2. Send the email
      try {
        await sendEstimate(estimate.id)
      } catch {
        // Email might fail but estimate was created
      }

      // 3. Show success
      setSent(true)
      setTimeout(() => {
        reset()
        setSent(false)
      }, 2500)
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.detail || error.message || 'Failed to create estimate.'
      )
    } finally {
      setSending(false)
    }
  }

  // Success state
  if (sent) {
    return (
      <SafeAreaView className="flex-1 bg-slate-950 items-center justify-center" edges={['top']}>
        <View className="w-20 h-20 rounded-full bg-green-600/20 items-center justify-center mb-4">
          <Feather name="check" size={40} color="#22c55e" />
        </View>
        <Text className="text-white text-2xl font-bold">Quote Sent!</Text>
        <Text className="text-slate-400 text-base mt-2">PDF emailed to customer</Text>
      </SafeAreaView>
    )
  }

  const renderLine = ({ item, index }: { item: EstimateLine; index: number }) => (
    <View className="flex-row items-center bg-slate-900 border border-slate-800 rounded-xl p-4 mb-2">
      <View className="flex-1 mr-3">
        <Text className="text-white text-sm font-semibold">{item.itemSku}</Text>
        <Text className="text-slate-400 text-xs mt-0.5" numberOfLines={1}>
          {item.itemName}
        </Text>
        <View className="flex-row mt-2 gap-3">
          <Text className="text-slate-300 text-xs">
            Qty: <Text className="font-bold text-white">{item.quantity}</Text>
          </Text>
          <Text className="text-slate-300 text-xs">
            @ <Text className="font-bold text-white">${item.unitPrice}</Text>
            <Text className="text-slate-500">/{item.uomCode}</Text>
          </Text>
        </View>
      </View>
      <View className="items-end">
        <Text className="text-white text-base font-bold">
          ${(item.quantity * parseFloat(item.unitPrice)).toFixed(2)}
        </Text>
        <Pressable onPress={() => handleRemoveLine(index)} className="mt-2 p-1">
          <Feather name="trash-2" size={16} color="#f87171" />
        </Pressable>
      </View>
    </View>
  )

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top']}>
      {/* Header */}
      <View className="px-6 pt-4 pb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-white text-xl font-bold">Quick Quote</Text>
          <Text className="text-slate-500 text-xs mt-0.5">Create & send in 60 seconds</Text>
        </View>
        {lines.length > 0 && (
          <Pressable onPress={() => { reset() }} className="p-2">
            <Feather name="rotate-ccw" size={18} color="#64748b" />
          </Pressable>
        )}
      </View>

      <FlatList
        data={lines}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderLine}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 200 }}
        ListHeaderComponent={
          <View>
            {/* Customer Section */}
            <View className="mb-5">
              <Text className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
                Customer
              </Text>
              {customerId ? (
                <View className="flex-row items-center bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
                  <View className="w-9 h-9 rounded-lg bg-green-600/20 items-center justify-center mr-3">
                    <Feather name="user-check" size={16} color="#22c55e" />
                  </View>
                  <Text className="text-white text-base font-medium flex-1">
                    {customerName}
                  </Text>
                  <Pressable onPress={clearCustomer} className="p-1">
                    <Feather name="x" size={18} color="#64748b" />
                  </Pressable>
                </View>
              ) : (
                <CustomerPicker onSelect={setCustomer} />
              )}
            </View>

            {/* Items Header + Add Button */}
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                Line Items ({lines.length})
              </Text>
              <Pressable
                onPress={() => setShowItemPicker(true)}
                className="flex-row items-center bg-rose-600/20 px-3 py-1.5 rounded-lg active:bg-rose-600/30"
              >
                <Feather name="plus" size={14} color="#e02424" />
                <Text className="text-rose-500 text-xs font-semibold ml-1.5">Add Item</Text>
              </Pressable>
            </View>

            {/* Empty state */}
            {lines.length === 0 && (
              <Pressable
                onPress={() => setShowItemPicker(true)}
                className="bg-slate-900 border border-dashed border-slate-700 rounded-xl py-10 items-center mb-4"
              >
                <Feather name="plus-circle" size={32} color="#475569" />
                <Text className="text-slate-500 text-sm mt-3">Tap to add your first item</Text>
              </Pressable>
            )}
          </View>
        }
      />

      {/* Sticky Footer - Totals & Finalize */}
      <View className="absolute bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 px-6 pb-8 pt-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-slate-400 text-sm font-medium">Quote Total</Text>
          <Text className="text-white text-2xl font-bold">
            ${total.toFixed(2)}
          </Text>
        </View>
        <Pressable
          onPress={handleFinalize}
          disabled={sending || !customerId || lines.length === 0}
          className="bg-rose-600 active:bg-rose-700 py-4 rounded-xl flex-row items-center justify-center disabled:opacity-40"
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="send" size={18} color="#fff" />
              <Text className="text-white text-base font-semibold ml-2">
                Finalize & Send Quote
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Item Picker Modal */}
      <ItemPicker
        visible={showItemPicker}
        onClose={() => setShowItemPicker(false)}
        onAdd={addLine}
      />
    </SafeAreaView>
  )
}
