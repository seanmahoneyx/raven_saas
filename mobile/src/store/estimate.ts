import { create } from 'zustand'

export interface EstimateLine {
  itemId: number
  itemSku: string
  itemName: string
  quantity: number
  unitPrice: string
  uomId: number
  uomCode: string
  description: string
}

interface EstimateState {
  customerId: number | null
  customerName: string | null
  lines: EstimateLine[]

  setCustomer: (id: number, name: string) => void
  clearCustomer: () => void
  addLine: (line: EstimateLine) => void
  removeLine: (index: number) => void
  updateLine: (index: number, line: Partial<EstimateLine>) => void
  getTotal: () => number
  reset: () => void
}

export const useEstimateStore = create<EstimateState>((set, get) => ({
  customerId: null,
  customerName: null,
  lines: [],

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),
  clearCustomer: () => set({ customerId: null, customerName: null }),

  addLine: (line) => set((s) => ({ lines: [...s.lines, line] })),

  removeLine: (index) =>
    set((s) => ({ lines: s.lines.filter((_, i) => i !== index) })),

  updateLine: (index, updates) =>
    set((s) => ({
      lines: s.lines.map((l, i) => (i === index ? { ...l, ...updates } : l)),
    })),

  getTotal: () => {
    const { lines } = get()
    return lines.reduce((sum, l) => sum + l.quantity * parseFloat(l.unitPrice || '0'), 0)
  },

  reset: () => set({ customerId: null, customerName: null, lines: [] }),
}))
