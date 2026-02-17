import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  ScanLine, Package, MapPin, Hash, ArrowRight, Check, RotateCcw, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/api/client'

type ScanStep = 'source' | 'item' | 'lot' | 'qty' | 'destination' | 'confirm'

interface LocationResult {
  id: number
  name: string
  barcode: string
  warehouse_code: string
  type: string
}

interface LotResult {
  id: number
  lot_number: string
  expiry_date: string | null
}

interface ItemResult {
  id: number
  sku: string
  name: string
  lots: LotResult[]
}

export default function Scanner() {
  usePageTitle('Scanner - Quick Move')

  const [step, setStep] = useState<ScanStep>('source')
  const [scanInput, setScanInput] = useState('')
  const [error, setError] = useState('')

  // Collected data
  const [sourceLocation, setSourceLocation] = useState<LocationResult | null>(null)
  const [item, setItem] = useState<ItemResult | null>(null)
  const [selectedLot, setSelectedLot] = useState<LotResult | null>(null)
  const [quantity, setQuantity] = useState('')
  const [destLocation, setDestLocation] = useState<LocationResult | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input on step change
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [step])

  const resetAll = useCallback(() => {
    setStep('source')
    setScanInput('')
    setError('')
    setSourceLocation(null)
    setItem(null)
    setSelectedLot(null)
    setQuantity('')
    setDestLocation(null)
  }, [])

  const lookupLocation = async (barcode: string): Promise<LocationResult> => {
    const { data } = await api.get('/warehouse/scanner/location/', { params: { barcode } })
    return data
  }

  const lookupItem = async (sku: string): Promise<ItemResult> => {
    const { data } = await api.get('/warehouse/scanner/item/', { params: { sku } })
    return data
  }

  const submitMove = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/warehouse/move/', {
        item: item!.id,
        quantity: parseFloat(quantity),
        source_location: sourceLocation!.id,
        destination_location: destLocation!.id,
        lot: selectedLot?.id || null,
        reference: 'Scanner Quick Move',
      })
      return data
    },
    onSuccess: () => {
      toast.success('Move completed successfully', { duration: 3000 })
      resetAll()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Move failed'
      setError(msg)
      toast.error(msg)
    },
  })

  const handleScan = async () => {
    const value = scanInput.trim()
    if (!value) return
    setError('')
    setScanInput('')

    try {
      switch (step) {
        case 'source': {
          const loc = await lookupLocation(value)
          setSourceLocation(loc)
          setStep('item')
          break
        }
        case 'item': {
          const result = await lookupItem(value)
          setItem(result)
          if (result.lots.length > 0) {
            setStep('lot')
          } else {
            setStep('qty')
          }
          break
        }
        case 'lot': {
          // Match lot by lot_number scan
          const lot = item?.lots.find((l) => l.lot_number === value)
          if (!lot) {
            setError(`Lot "${value}" not found for this item`)
            return
          }
          setSelectedLot(lot)
          setStep('qty')
          break
        }
        case 'destination': {
          const loc = await lookupLocation(value)
          if (loc.id === sourceLocation?.id) {
            setError('Destination cannot be the same as source')
            return
          }
          setDestLocation(loc)
          setStep('confirm')
          break
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Lookup failed'
      setError(msg)
    }
  }

  const handleQtySubmit = () => {
    const val = parseFloat(quantity)
    if (!val || val <= 0) {
      setError('Enter a valid quantity')
      return
    }
    setError('')
    setStep('destination')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (step === 'qty') {
        handleQtySubmit()
      } else if (step === 'confirm') {
        submitMove.mutate()
      } else {
        handleScan()
      }
    }
  }

  const stepConfig = {
    source: { label: 'SCAN SOURCE BIN', icon: MapPin, color: 'text-blue-400' },
    item: { label: 'SCAN ITEM SKU', icon: Package, color: 'text-green-400' },
    lot: { label: 'SCAN LOT #', icon: Hash, color: 'text-yellow-400' },
    qty: { label: 'ENTER QUANTITY', icon: Hash, color: 'text-orange-400' },
    destination: { label: 'SCAN DESTINATION BIN', icon: ArrowRight, color: 'text-purple-400' },
    confirm: { label: 'CONFIRM MOVE', icon: Check, color: 'text-emerald-400' },
  }

  const currentStep = stepConfig[step]
  const StepIcon = currentStep.icon

  // Progress dots
  const steps: ScanStep[] = ['source', 'item', 'lot', 'qty', 'destination', 'confirm']
  const currentIndex = steps.indexOf(step)

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ScanLine className="h-6 w-6 text-blue-400" />
          <h1 className="text-xl font-bold tracking-tight">QUICK MOVE</h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white"
          onClick={resetAll}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5 mb-6">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= currentIndex ? 'bg-blue-500' : 'bg-gray-800'
            }`}
          />
        ))}
      </div>

      {/* Collected Data Summary */}
      {(sourceLocation || item) && (
        <div className="space-y-2 mb-6">
          {sourceLocation && (
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
              <MapPin className="h-4 w-4 text-blue-400 shrink-0" />
              <span className="text-sm text-gray-400">From:</span>
              <span className="font-mono font-bold">{sourceLocation.warehouse_code}:{sourceLocation.name}</span>
            </div>
          )}
          {item && (
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
              <Package className="h-4 w-4 text-green-400 shrink-0" />
              <span className="text-sm text-gray-400">Item:</span>
              <span className="font-mono font-bold">{item.sku}</span>
              <span className="text-sm text-gray-500 truncate">{item.name}</span>
            </div>
          )}
          {selectedLot && (
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
              <Hash className="h-4 w-4 text-yellow-400 shrink-0" />
              <span className="text-sm text-gray-400">Lot:</span>
              <span className="font-mono font-bold">{selectedLot.lot_number}</span>
              {selectedLot.expiry_date && (
                <Badge variant="outline" className="text-xs">Exp: {selectedLot.expiry_date}</Badge>
              )}
            </div>
          )}
          {quantity && step !== 'qty' && (
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
              <Hash className="h-4 w-4 text-orange-400 shrink-0" />
              <span className="text-sm text-gray-400">Qty:</span>
              <span className="font-mono font-bold text-lg">{quantity}</span>
            </div>
          )}
          {destLocation && (
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
              <ArrowRight className="h-4 w-4 text-purple-400 shrink-0" />
              <span className="text-sm text-gray-400">To:</span>
              <span className="font-mono font-bold">{destLocation.warehouse_code}:{destLocation.name}</span>
            </div>
          )}
        </div>
      )}

      {/* Current Step */}
      <Card className="bg-gray-900 border-gray-800 mb-4">
        <CardContent className="pt-6 pb-4">
          <div className={`flex items-center gap-2 mb-4 ${currentStep.color}`}>
            <StepIcon className="h-6 w-6" />
            <span className="text-lg font-bold tracking-wide">{currentStep.label}</span>
          </div>

          {step === 'confirm' ? (
            <div className="space-y-4">
              <p className="text-gray-300">
                Move <span className="font-bold text-white">{quantity}</span> x{' '}
                <span className="font-mono text-white">{item?.sku}</span> from{' '}
                <span className="font-mono text-blue-400">{sourceLocation?.name}</span> to{' '}
                <span className="font-mono text-purple-400">{destLocation?.name}</span>
                {selectedLot && <> (Lot: <span className="font-mono text-yellow-400">{selectedLot.lot_number}</span>)</>}
              </p>
              <Button
                className="w-full h-16 text-xl font-bold bg-emerald-600 hover:bg-emerald-700"
                onClick={() => submitMove.mutate()}
                disabled={submitMove.isPending}
              >
                {submitMove.isPending ? 'MOVING...' : 'CONFIRM MOVE'}
              </Button>
            </div>
          ) : step === 'qty' ? (
            <div className="space-y-4">
              <Input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="0"
                className="h-16 text-3xl font-mono text-center bg-gray-800 border-gray-700 text-white"
                autoFocus
              />
              <Button
                className="w-full h-14 text-lg font-bold"
                onClick={handleQtySubmit}
                disabled={!quantity || parseFloat(quantity) <= 0}
              >
                NEXT
              </Button>
            </div>
          ) : step === 'lot' ? (
            <div className="space-y-3">
              <Input
                ref={inputRef}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scan or type lot number..."
                className="h-14 text-lg font-mono bg-gray-800 border-gray-700 text-white"
                autoFocus
              />
              <Button
                variant="outline"
                className="w-full border-gray-700 text-gray-400"
                onClick={() => {
                  setSelectedLot(null)
                  setStep('qty')
                }}
              >
                Skip (No Lot)
              </Button>
              {item && item.lots.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Available Lots:</p>
                  {item.lots.map((lot) => (
                    <button
                      key={lot.id}
                      className="w-full flex items-center justify-between bg-gray-800 hover:bg-gray-750 rounded-lg px-3 py-2 text-left transition-colors"
                      onClick={() => {
                        setSelectedLot(lot)
                        setStep('qty')
                      }}
                    >
                      <span className="font-mono font-bold">{lot.lot_number}</span>
                      {lot.expiry_date && (
                        <Badge variant="outline" className="text-xs">Exp: {lot.expiry_date}</Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                ref={inputRef}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={step === 'source' || step === 'destination' ? 'Scan bin barcode...' : 'Scan item SKU...'}
                className="h-14 text-lg font-mono bg-gray-800 border-gray-700 text-white"
                autoFocus
              />
              <Button className="w-full h-12 text-base font-bold" onClick={handleScan}>
                LOOKUP
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 bg-red-950 border border-red-800 rounded-lg px-4 py-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <span className="text-red-300 text-sm">{error}</span>
        </div>
      )}
    </div>
  )
}
