import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { searchCustomers } from '../api/estimates'

interface Customer {
  id: number
  party?: { display_name: string }
  display_name?: string
}

interface Props {
  onSelect: (id: number, name: string) => void
}

export default function CustomerPicker({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchCustomers(query)
        setResults(data)
      } catch {
        setResults([])
      }
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const getName = (c: Customer) => c.party?.display_name || c.display_name || `Customer #${c.id}`

  return (
    <View>
      <View className="flex-row items-center bg-slate-800 border border-slate-700 rounded-xl px-4">
        <Feather name="search" size={18} color="#64748b" />
        <TextInput
          className="flex-1 text-white text-base py-3.5 ml-3"
          placeholder="Search customers..."
          placeholderTextColor="#475569"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color="#e02424" />}
      </View>

      {results.length > 0 && (
        <View className="bg-slate-800 border border-slate-700 rounded-xl mt-2 max-h-48 overflow-hidden">
          <FlatList
            data={results}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item.id, getName(item))}
                className="px-4 py-3 border-b border-slate-700 active:bg-slate-700"
              >
                <Text className="text-white text-sm font-medium">{getName(item)}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  )
}
