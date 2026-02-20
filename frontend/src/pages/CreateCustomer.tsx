import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreateParty, useCreateCustomer, useCreateLocation } from '@/api/parties'
import { useUsers } from '@/api/users'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Plus, Trash2, MapPin, UserPlus, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }
const inputStyle: React.CSSProperties = { borderColor: 'var(--so-border)', background: 'var(--so-surface)' }
const labelClass = 'text-sm font-medium'
const labelStyle: React.CSSProperties = { color: 'var(--so-text-secondary)' }

const PAYMENT_TERMS = [
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'NET45', label: 'Net 45' },
  { value: 'NET60', label: 'Net 60' },
  { value: 'NET90', label: 'Net 90' },
  { value: 'DUE_ON_RECEIPT', label: 'Due on Receipt' },
  { value: 'COD', label: 'Cash on Delivery' },
  { value: 'PREPAID', label: 'Prepaid' },
]

const INVOICE_DELIVERY_METHODS = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'MAIL', label: 'Mail' },
  { value: 'FAX', label: 'Fax' },
  { value: 'PORTAL', label: 'Customer Portal' },
]

const CUSTOMER_TYPES = [
  { value: 'BEAUTY_HEALTH', label: 'Beauty/Health' },
  { value: 'CLEANING_RESTORATION', label: 'Cleaning/Restoration' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
  { value: 'FOOD', label: 'Food' },
  { value: 'FREIGHT', label: 'Freight' },
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'INDUSTRIAL', label: 'Industrial' },
  { value: 'JANITORIAL', label: 'Janitorial' },
  { value: 'MANUFACTURER', label: 'Manufacturer' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'PHARMACEUTICAL', label: 'Pharmaceutical' },
  { value: 'PIZZA', label: 'Pizza' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'TEXTILE', label: 'Textile' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'AUTOMOTIVE', label: 'Automotive' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'HOSPITALITY', label: 'Hospitality' },
  { value: 'OTHER', label: 'Other' },
]

const LOCATION_TYPES = [
  { value: 'SHIP_TO', label: 'Ship To' },
  { value: 'BILL_TO', label: 'Bill To' },
  { value: 'WAREHOUSE', label: 'Warehouse' },
  { value: 'OFFICE', label: 'Office' },
]

const CONTACT_ROLES = [
  { value: 'AP', label: 'Accounts Payable' },
  { value: 'SHIPPING', label: 'Shipping Manager' },
  { value: 'PURCHASING', label: 'Purchasing Agent' },
  { value: 'OWNER', label: 'Owner / Principal' },
  { value: 'SALES', label: 'Sales Contact' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'OTHER', label: 'Other' },
]

interface InlineLocation {
  key: number
  location_type: string
  name: string
  code: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  phone: string
  email: string
  is_default: boolean
}

interface InlineContact {
  key: number
  name: string
  role: string
  phone: string
  email: string
}

function emptyLocation(key: number): InlineLocation {
  return { key, location_type: 'SHIP_TO', name: '', code: '', address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: 'USA', phone: '', email: '', is_default: false }
}

function emptyContact(key: number): InlineContact {
  return { key, name: '', role: 'AP', phone: '', email: '' }
}

export default function CreateCustomer() {
  usePageTitle('Create Customer')
  const navigate = useNavigate()
  const createParty = useCreateParty()
  const createCustomer = useCreateCustomer()
  const createLocation = useCreateLocation()
  const { data: users } = useUsers()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    // Party fields
    code: '',
    display_name: '',
    legal_name: '',
    main_phone: '',
    main_email: '',
    notes: '',
    // Customer fields
    payment_terms: 'NET30',
    invoice_delivery_method: 'EMAIL',
    customer_type: '',
    credit_limit: '',
    tax_code: '',
    resale_number: '',
    sales_rep: '',
    csr: '',
    charge_freight: true,
    // Bill-to address (stored as a location)
    bill_to_address_line1: '',
    bill_to_city: '',
    bill_to_state: '',
    bill_to_postal_code: '',
  })

  const [locations, setLocations] = useState<InlineLocation[]>([])
  const [locationsOpen, setLocationsOpen] = useState(false)
  const [locationKeyCounter, setLocationKeyCounter] = useState(1)

  const [contacts, setContacts] = useState<InlineContact[]>([])
  const [contactsOpen, setContactsOpen] = useState(false)
  const [contactKeyCounter, setContactKeyCounter] = useState(1)

  const isPending = createParty.isPending || createCustomer.isPending || createLocation.isPending

  const update = (field: string, value: string | boolean) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const updateLocation = (key: number, field: string, value: string | boolean) =>
    setLocations((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l))

  const updateContact = (key: number, field: string, value: string) =>
    setContacts((prev) => prev.map((c) => c.key === key ? { ...c, [field]: value } : c))

  const addLocation = () => {
    setLocations((prev) => [...prev, emptyLocation(locationKeyCounter)])
    setLocationKeyCounter((c) => c + 1)
    setLocationsOpen(true)
  }

  const removeLocation = (key: number) =>
    setLocations((prev) => prev.filter((l) => l.key !== key))

  const addContact = () => {
    setContacts((prev) => [...prev, emptyContact(contactKeyCounter)])
    setContactKeyCounter((c) => c + 1)
    setContactsOpen(true)
  }

  const removeContact = (key: number) =>
    setContacts((prev) => prev.filter((c) => c.key !== key))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      // Step 1: Create the Party
      const party = await createParty.mutateAsync({
        code: formData.code,
        display_name: formData.display_name,
        legal_name: formData.legal_name,
        main_phone: formData.main_phone,
        main_email: formData.main_email,
        party_type: 'CUSTOMER',
        is_active: true,
        notes: formData.notes,
      })

      // Step 2: Create the Customer record
      const newCustomer = await createCustomer.mutateAsync({
        party: party.id,
        payment_terms: formData.payment_terms,
        invoice_delivery_method: formData.invoice_delivery_method,
        customer_type: formData.customer_type || undefined,
        credit_limit: formData.credit_limit ? Number(formData.credit_limit) : undefined,
        tax_code: formData.tax_code,
        resale_number: formData.resale_number || undefined,
        sales_rep: formData.sales_rep ? Number(formData.sales_rep) : undefined,
        csr: formData.csr ? Number(formData.csr) : undefined,
        charge_freight: formData.charge_freight,
      } as any)

      // Step 3: Create Bill-To location if address provided
      if (formData.bill_to_address_line1) {
        await createLocation.mutateAsync({
          party: party.id,
          location_type: 'BILL_TO',
          name: 'Bill To',
          code: 'BILL-TO',
          address_line1: formData.bill_to_address_line1,
          city: formData.bill_to_city,
          state: formData.bill_to_state,
          postal_code: formData.bill_to_postal_code,
          country: 'USA',
          is_default: true,
          is_active: true,
        } as any)
      }

      // Step 4: Create inline locations
      for (const loc of locations) {
        if (!loc.name && !loc.address_line1) continue
        await createLocation.mutateAsync({
          party: party.id,
          location_type: loc.location_type,
          name: loc.name,
          code: loc.code,
          address_line1: loc.address_line1,
          address_line2: loc.address_line2,
          city: loc.city,
          state: loc.state,
          postal_code: loc.postal_code,
          country: loc.country || 'USA',
          phone: loc.phone,
          email: loc.email,
          is_default: loc.is_default,
          is_active: true,
        } as any)
      }

      // Step 5: Store contacts in party notes (until Contact model exists)
      if (contacts.length > 0) {
        const contactLines = contacts
          .filter((c) => c.name)
          .map((c) => `[${CONTACT_ROLES.find((r) => r.value === c.role)?.label || c.role}] ${c.name}${c.phone ? ' | ' + c.phone : ''}${c.email ? ' | ' + c.email : ''}`)
        if (contactLines.length > 0) {
          const existingNotes = formData.notes ? formData.notes + '\n\n' : ''
          const contactBlock = '--- Contacts ---\n' + contactLines.join('\n')
          // Append contacts to the party notes
          await createParty.mutateAsync({
            ...party,
            notes: existingNotes + contactBlock,
          } as any).catch(() => {/* best effort */})
        }
      }

      toast.success('Customer created successfully')
      navigate(`/customers/${newCustomer.id}`)
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create customer'))
      }
    }
  }

  const activeUsers = (users ?? []).filter((u) => u.is_active)

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/customers')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Customers
          </button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Create New Customer</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Add a new customer to your system</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Company Information ── */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Company Information</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="display_name" className={labelClass} style={labelStyle}>Customer Name *</Label>
                  <Input id="display_name" value={formData.display_name} onChange={(e) => update('display_name', e.target.value)} placeholder="Company name as it appears" required style={inputStyle} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="legal_name" className={labelClass} style={labelStyle}>Company Legal Name</Label>
                  <Input id="legal_name" value={formData.legal_name} onChange={(e) => update('legal_name', e.target.value)} placeholder="Legal entity name (for invoices)" style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="code" className={labelClass} style={labelStyle}>Customer Code *</Label>
                  <Input id="code" value={formData.code} onChange={(e) => update('code', e.target.value)} placeholder="e.g., ACME" required style={inputStyle} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="main_phone" className={labelClass} style={labelStyle}>Main Phone</Label>
                  <Input id="main_phone" value={formData.main_phone} onChange={(e) => update('main_phone', e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="main_email" className={labelClass} style={labelStyle}>Main Email</Label>
                  <Input id="main_email" type="email" value={formData.main_email} onChange={(e) => update('main_email', e.target.value)} placeholder="info@company.com" style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="customer_type" className={labelClass} style={labelStyle}>Customer Type</Label>
                  <Select value={formData.customer_type} onValueChange={(v) => update('customer_type', v)}>
                    <SelectTrigger style={inputStyle}><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sales_rep" className={labelClass} style={labelStyle}>Sales Rep</Label>
                  <Select value={formData.sales_rep} onValueChange={(v) => update('sales_rep', v)}>
                    <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {activeUsers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name || u.username}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="csr" className={labelClass} style={labelStyle}>CSR</Label>
                  <Select value={formData.csr} onValueChange={(v) => update('csr', v)}>
                    <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {activeUsers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name || u.username}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* ── Billing & Terms ── */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Billing & Terms</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="payment_terms" className={labelClass} style={labelStyle}>Payment Terms</Label>
                  <Select value={formData.payment_terms} onValueChange={(v) => update('payment_terms', v)}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invoice_delivery_method" className={labelClass} style={labelStyle}>Invoice Delivery</Label>
                  <Select value={formData.invoice_delivery_method} onValueChange={(v) => update('invoice_delivery_method', v)}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INVOICE_DELIVERY_METHODS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="credit_limit" className={labelClass} style={labelStyle}>Credit Limit</Label>
                  <Input id="credit_limit" type="number" step="0.01" min="0" value={formData.credit_limit} onChange={(e) => update('credit_limit', e.target.value)} placeholder="0.00" style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tax_code" className={labelClass} style={labelStyle}>Tax Code</Label>
                  <Input id="tax_code" value={formData.tax_code} onChange={(e) => update('tax_code', e.target.value)} placeholder="e.g., TAXABLE" style={inputStyle} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="resale_number" className={labelClass} style={labelStyle}>Resale # (optional)</Label>
                  <Input id="resale_number" value={formData.resale_number} onChange={(e) => update('resale_number', e.target.value)} placeholder="Certificate number" style={inputStyle} />
                </div>
                <div className="flex items-end pb-1">
                  <div className="flex items-center space-x-2">
                    <Switch id="charge_freight" checked={formData.charge_freight} onCheckedChange={(v) => update('charge_freight', v)} />
                    <Label htmlFor="charge_freight" className={labelClass} style={labelStyle}>Charge Freight</Label>
                  </div>
                </div>
              </div>

              {/* Bill-To Address */}
              <div className="pt-2">
                <Label className={labelClass} style={labelStyle}>Bill To Address</Label>
                <div className="grid grid-cols-1 gap-3 mt-1.5">
                  <Input value={formData.bill_to_address_line1} onChange={(e) => update('bill_to_address_line1', e.target.value)} placeholder="Street address" style={inputStyle} />
                  <div className="grid grid-cols-3 gap-3">
                    <Input value={formData.bill_to_city} onChange={(e) => update('bill_to_city', e.target.value)} placeholder="City" style={inputStyle} />
                    <Input value={formData.bill_to_state} onChange={(e) => update('bill_to_state', e.target.value)} placeholder="State" style={inputStyle} />
                    <Input value={formData.bill_to_postal_code} onChange={(e) => update('bill_to_postal_code', e.target.value)} placeholder="Zip" style={inputStyle} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Shipping Locations ── */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <button
              type="button"
              className="flex items-center justify-between w-full px-6 py-4 cursor-pointer"
              style={{ borderBottom: locations.length > 0 && locationsOpen ? '1px solid var(--so-border-light)' : 'none', background: 'transparent', border: 'none' }}
              onClick={() => setLocationsOpen(!locationsOpen)}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-3.5 w-3.5" style={{ color: 'var(--so-text-tertiary)' }} />
                Shipping Locations
                {locations.length > 0 && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--so-accent-muted)', color: 'var(--so-accent)' }}>
                    {locations.length}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={outlineBtnClass + ' text-[12px] px-2.5 py-1'}
                  style={outlineBtnStyle}
                  onClick={(e) => { e.stopPropagation(); addLocation() }}
                >
                  <Plus className="h-3 w-3" /> Add
                </span>
                {locationsOpen ? <ChevronDown className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} /> : <ChevronRight className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />}
              </span>
            </button>
            {locationsOpen && locations.length > 0 && (
              <div className="px-6 py-4 space-y-4">
                {locations.map((loc, idx) => (
                  <div key={loc.key} className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>Location {idx + 1}</span>
                      <button
                        type="button"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer"
                        style={{ color: 'var(--so-danger-text)', background: 'transparent', border: 'none' }}
                        onClick={() => removeLocation(loc.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[12px]" style={labelStyle}>Type</Label>
                        <Select value={loc.location_type} onValueChange={(v) => updateLocation(loc.key, 'location_type', v)}>
                          <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LOCATION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[12px]" style={labelStyle}>Name *</Label>
                        <Input value={loc.name} onChange={(e) => updateLocation(loc.key, 'name', e.target.value)} placeholder="e.g., Main Warehouse" style={inputStyle} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[12px]" style={labelStyle}>Code</Label>
                        <Input value={loc.code} onChange={(e) => updateLocation(loc.key, 'code', e.target.value)} placeholder="LOC001" style={inputStyle} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[12px]" style={labelStyle}>Address *</Label>
                      <Input value={loc.address_line1} onChange={(e) => updateLocation(loc.key, 'address_line1', e.target.value)} placeholder="Street address" style={inputStyle} />
                    </div>
                    <Input value={loc.address_line2} onChange={(e) => updateLocation(loc.key, 'address_line2', e.target.value)} placeholder="Suite, unit, etc. (optional)" style={inputStyle} />
                    <div className="grid grid-cols-3 gap-3">
                      <Input value={loc.city} onChange={(e) => updateLocation(loc.key, 'city', e.target.value)} placeholder="City" style={inputStyle} />
                      <Input value={loc.state} onChange={(e) => updateLocation(loc.key, 'state', e.target.value)} placeholder="State" style={inputStyle} />
                      <Input value={loc.postal_code} onChange={(e) => updateLocation(loc.key, 'postal_code', e.target.value)} placeholder="Zip" style={inputStyle} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input value={loc.phone} onChange={(e) => updateLocation(loc.key, 'phone', e.target.value)} placeholder="Phone" style={inputStyle} />
                      <Input value={loc.email} onChange={(e) => updateLocation(loc.key, 'email', e.target.value)} placeholder="Email" style={inputStyle} />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch checked={loc.is_default} onCheckedChange={(v) => updateLocation(loc.key, 'is_default', v)} />
                      <Label className="text-[12px]" style={labelStyle}>Default shipping location</Label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {locationsOpen && locations.length === 0 && (
              <div className="px-6 py-6 text-center" style={{ color: 'var(--so-text-tertiary)' }}>
                <MapPin className="h-6 w-6 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No shipping locations yet</p>
                <button type="button" className={outlineBtnClass + ' mt-2'} style={outlineBtnStyle} onClick={addLocation}>
                  <Plus className="h-3.5 w-3.5" /> Add Location
                </button>
              </div>
            )}
          </div>

          {/* ── Contacts ── */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <button
              type="button"
              className="flex items-center justify-between w-full px-6 py-4 cursor-pointer"
              style={{ borderBottom: contacts.length > 0 && contactsOpen ? '1px solid var(--so-border-light)' : 'none', background: 'transparent', border: 'none' }}
              onClick={() => setContactsOpen(!contactsOpen)}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <UserPlus className="h-3.5 w-3.5" style={{ color: 'var(--so-text-tertiary)' }} />
                Contacts
                {contacts.length > 0 && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--so-accent-muted)', color: 'var(--so-accent)' }}>
                    {contacts.length}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={outlineBtnClass + ' text-[12px] px-2.5 py-1'}
                  style={outlineBtnStyle}
                  onClick={(e) => { e.stopPropagation(); addContact() }}
                >
                  <Plus className="h-3 w-3" /> Add
                </span>
                {contactsOpen ? <ChevronDown className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} /> : <ChevronRight className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />}
              </span>
            </button>
            {contactsOpen && contacts.length > 0 && (
              <div className="px-6 py-4 space-y-3">
                {contacts.map((contact, idx) => (
                  <div key={contact.key} className="rounded-lg p-4 flex items-start gap-3" style={{ border: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}>
                    <div className="flex-1 grid grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[12px]" style={labelStyle}>Name *</Label>
                        <Input value={contact.name} onChange={(e) => updateContact(contact.key, 'name', e.target.value)} placeholder="Full name" style={inputStyle} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[12px]" style={labelStyle}>Role</Label>
                        <Select value={contact.role} onValueChange={(v) => updateContact(contact.key, 'role', v)}>
                          <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CONTACT_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[12px]" style={labelStyle}>Phone</Label>
                        <Input value={contact.phone} onChange={(e) => updateContact(contact.key, 'phone', e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[12px]" style={labelStyle}>Email</Label>
                        <Input value={contact.email} onChange={(e) => updateContact(contact.key, 'email', e.target.value)} placeholder="email@company.com" style={inputStyle} />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer mt-6"
                      style={{ color: 'var(--so-danger-text)', background: 'transparent', border: 'none' }}
                      onClick={() => removeContact(contact.key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {contactsOpen && contacts.length === 0 && (
              <div className="px-6 py-6 text-center" style={{ color: 'var(--so-text-tertiary)' }}>
                <UserPlus className="h-6 w-6 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No contacts yet</p>
                <button type="button" className={outlineBtnClass + ' mt-2'} style={outlineBtnStyle} onClick={addContact}>
                  <Plus className="h-3.5 w-3.5" /> Add Contact
                </button>
              </div>
            )}
          </div>

          {/* ── Notes ── */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Notes</span>
            </div>
            <div className="px-6 py-5">
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Internal notes about this customer..."
                rows={3}
                style={inputStyle}
              />
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div
              className="text-sm rounded-md p-3"
              style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)', border: '1px solid var(--so-danger-text)' }}
            >
              {error}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/customers')}>
              Cancel
            </button>
            <button
              type="submit"
              className={`${primaryBtnClass}${isPending ? ' opacity-50 pointer-events-none' : ''}`}
              style={primaryBtnStyle}
              disabled={isPending}
            >
              {isPending ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
