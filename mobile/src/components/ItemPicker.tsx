import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { searchItems } from '../api/estimates'
import type { EstimateLine } from '../store/estimate'

interface Item {
  id: number
  sku: string
  name: string
  description: string
  base_uom: number
  base_uom_code: string
}

interface Props {
  visible: boolean
  onClose: () => void
  onAdd: (line: EstimateLine) => void
}

export default function ItemPicker({ visible, onClose, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Item | null>(null)
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')

  useEffect(() => {
    if (!visible) {
      setQuery('')
      setResults([])
      setSelected(null)
      setQty('1')
      setPrice('')
    }
  }, [visible])

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchItems(query)
        setResults(data)
      } catch {
        setResults([])
      }
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleSelectItem = (item: Item) => {
    setSelected(item)
    setQuery(item.sku)
    setResults([])
  }

  const handleAdd = () => {
    if (!selected || !qty || !price) return
    onAdd({
      itemId: selected.id,
      itemSku: selected.sku,
      itemName: selected.name,
      quantity: parseInt(qty, 10) || 1,
      unitPrice: parseFloat(price).toFixed(2),
      uomId: selected.base_uom,
      uomCode: selected.base_uom_code || 'EA',
      description: selected.description || selected.name,
    })
    onClose()
  }

  const adjustQty = (delta: number) => {
    const current = parseInt(qty, 10) || 0
    const next = Math.max(1, current + delta)
    setQty(String(next))
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-end"
      >
        <Pressable className="flex-1" onPress={onClose} />
        <View className="bg-slate-900 border-t border-slate-700 rounded-t-3xl px-6 pt-4 pb-8 max-h-[85%]">
          {/* Handle bar */}
          <View className="w-10 h-1 bg-slate-600 rounded-full self-center mb-5" />

          <Text className="text-white text-lg font-bold mb-4">Add Item</Text>

          {/* Search */}
          <View className="flex-row items-center bg-slate-800 border border-slate-700 rounded-xl px-4 mb-3">
            <Feather name="search" size={18} color="#64748b" />
            <TextInput
              className="flex-1 text-white text-base py-3 ml-3"
              placeholder="Search by SKU or name..."
              placeholderTextColor="#475569"
              value={query}
              onChangeText={(text) => {
                setQuery(text)
                if (selected && text !== selected.sku) setSelected(null)
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            {loading && <ActivityIndicator size="small" color="#e02424" />}
          </View>

          {/* Search Results */}
          {!selected && results.length > 0 && (
            <View className="bg-slate-800 border border-slate-700 rounded-xl mb-3 max-h-48">
              <FlatList
                data={results}
                keyExtractor={(item) => item.id.toString()}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelectItem(item)}
                    className="px-4 py-3 border-b border-slate-700 active:bg-slate-700"
                  >
                    <Text className="text-white text-sm font-semibold">{item.sku}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5">{item.name}</Text>
                  </Pressable>
                )}
              />
            </View>
          )}

          {/* Selected Item Form */}
          {selected && (
            <View className="bg-slate-800 border border-slate-700 rounded-2xl p-4 mb-4">
              <Text className="text-white text-base font-semibold">{selected.sku}</Text>
              <Text className="text-slate-400 text-sm mb-4">{selected.name}</Text>

              {/* Quantity Stepper */}
              <View className="mb-4">
                <Text className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
                  Quantity
                </Text>
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => adjustQty(-1)}
                    className="w-11 h-11 bg-slate-700 rounded-xl items-center justify-center active:bg-slate-600"
                  >
                    <Feather name="minus" size={18} color="#fff" />
                  </Pressable>
                  <TextInput
                    className="flex-1 text-white text-center text-xl font-bold mx-3 bg-slate-900 rounded-xl py-2"
                    value={qty}
                    onChangeText={setQty}
                    keyboardType="number-pad"
                    selectTextOnFocus
                  />
                  <Pressable
                    onPress={() => adjustQty(1)}
                    className="w-11 h-11 bg-slate-700 rounded-xl items-center justify-center active:bg-slate-600"
                  >
                    <Feather name="plus" size={18} color="#fff" />
                  </Pressable>
                </View>
              </View>

              {/* Unit Price */}
              <View className="mb-4">
                <Text className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
                  Unit Price
                </Text>
                <View className="flex-row items-center bg-slate-900 rounded-xl px-4">
                  <Text className="text-slate-400 text-lg mr-1">$</Text>
                  <TextInput
                    className="flex-1 text-white text-lg font-semibold py-3"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#475569"
                    selectTextOnFocus
                  />
                  <Text className="text-slate-500 text-sm">/ {selected.base_uom_code || 'EA'}</Text>
                </View>
              </View>

              {/* Line Total */}
              {price && (
                <View className="bg-slate-900 rounded-xl p-3 mb-4">
                  <Text className="text-slate-400 text-xs text-center">Line Total</Text>
                  <Text className="text-white text-xl font-bold text-center mt-1">
                    ${((parseInt(qty, 10) || 0) * (parseFloat(price) || 0)).toFixed(2)}
                  </Text>
                </View>
              )}

              {/* Add Button */}
              <Pressable
                onPress={handleAdd}
                disabled={!price}
                className="bg-rose-600 active:bg-rose-700 py-4 rounded-xl items-center disabled:opacity-40"
              >
                <Text className="text-white text-base font-semibold">Add to Quote</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
