import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useSaveCompanyInfo,
  useSaveWarehouse,
  useSaveUoMs,
  useInviteTeam,
  useCompleteOnboarding,
  useOnboardingUoMPresets,
  type InviteMember,
} from '@/api/onboarding'
import { usePageTitle } from '@/hooks/usePageTitle'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Company', description: 'Tell us about your company' },
  { label: 'Warehouse', description: 'Set up your first warehouse' },
  { label: 'Units', description: 'Choose units of measure' },
  { label: 'Team', description: 'Invite your team' },
  { label: 'Done', description: "You're all set!" },
]

const INDUSTRY_OPTIONS = [
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'corrugated', label: 'Corrugated Packaging' },
  { value: 'food_beverage', label: 'Food & Beverage' },
  { value: 'other', label: 'Other' },
]

const ROLE_OPTIONS: InviteMember['role'][] = ['Admin', 'Sales', 'Warehouse', 'Driver', 'Viewer']

// ---------------------------------------------------------------------------
// Step progress indicator
// ---------------------------------------------------------------------------

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const stepNum = idx + 1
        const done = stepNum < currentStep
        const active = stepNum === currentStep
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={[
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                  done
                    ? 'bg-primary border-primary text-primary-foreground'
                    : active
                    ? 'border-primary text-primary bg-background'
                    : 'border-muted text-muted-foreground bg-background',
                ].join(' ')}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={[
                  'text-xs mt-1 font-medium',
                  active ? 'text-primary' : done ? 'text-muted-foreground' : 'text-muted-foreground',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={[
                  'h-0.5 w-12 mb-4 mx-1 transition-colors',
                  done ? 'bg-primary' : 'bg-muted',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1 - Company Info
// ---------------------------------------------------------------------------

interface CompanyFormState {
  name: string
  company_address: string
  company_phone: string
  industry: string
  company_logo: File | null
}

function StepCompany({
  onNext,
  initialName,
}: {
  onNext: () => void
  initialName: string
}) {
  const saveCompany = useSaveCompanyInfo()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<CompanyFormState>({
    name: initialName,
    company_address: '',
    company_phone: '',
    industry: '',
    company_logo: null,
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function handleFile(file: File) {
    setForm(f => ({ ...f, company_logo: file }))
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleFile(file)
  }, [])

  async function handleNext() {
    if (!form.name.trim()) {
      toast.error('Company name is required')
      return
    }
    await saveCompany.mutateAsync(form)
    onNext()
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="company-name">Company Name *</Label>
        <Input
          id="company-name"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Acme Corp"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="company-address">Address</Label>
        <textarea
          id="company-address"
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          value={form.company_address}
          onChange={e => setForm(f => ({ ...f, company_address: e.target.value }))}
          placeholder="123 Main St, City, State 12345"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="company-phone">Phone</Label>
          <Input
            id="company-phone"
            type="tel"
            value={form.company_phone}
            onChange={e => setForm(f => ({ ...f, company_phone: e.target.value }))}
            placeholder="(555) 000-0000"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Select
            value={form.industry}
            onValueChange={val => setForm(f => ({ ...f, industry: val }))}
          >
            <SelectTrigger id="industry">
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRY_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Logo</Label>
        <div
          className={[
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
          ].join(' ')}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {logoPreview ? (
            <img src={logoPreview} alt="Logo preview" className="h-16 mx-auto object-contain" />
          ) : (
            <div className="text-muted-foreground text-sm">
              <p className="font-medium">Drop logo here or click to upload</p>
              <p className="text-xs mt-1">PNG, JPG, SVG up to 5 MB</p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleNext} disabled={saveCompany.isPending}>
          {saveCompany.isPending ? 'Saving...' : 'Next'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 - Warehouse
// ---------------------------------------------------------------------------

function StepWarehouse({
  onBack,
  onNext,
  companyAddress,
}: {
  onBack: () => void
  onNext: () => void
  companyAddress: string
}) {
  const saveWarehouse = useSaveWarehouse()
  const [form, setForm] = useState({
    name: 'Main Warehouse',
    code: 'WH-01',
    address: '',
  })

  async function handleNext() {
    await saveWarehouse.mutateAsync(form)
    onNext()
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="wh-name">Warehouse Name</Label>
          <Input
            id="wh-name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Main Warehouse"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wh-code">Code</Label>
          <Input
            id="wh-code"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="WH-01"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="wh-address">Warehouse Address</Label>
          {companyAddress && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setForm(f => ({ ...f, address: companyAddress }))}
            >
              Copy from company
            </button>
          )}
        </div>
        <textarea
          id="wh-address"
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          value={form.address}
          onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
          placeholder="Same as company address"
          rows={3}
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={handleNext} disabled={saveWarehouse.isPending}>
          {saveWarehouse.isPending ? 'Saving...' : 'Next'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3 - Units of Measure
// ---------------------------------------------------------------------------

const PRESET_LABELS: Record<string, string> = {
  standard: 'Standard (Manufacturing / Distribution)',
  corrugated: 'Corrugated Packaging',
  food: 'Food & Beverage',
}

function StepUoM({
  onBack,
  onNext,
  suggestedPreset,
}: {
  onBack: () => void
  onNext: () => void
  suggestedPreset: string
}) {
  const saveUoMs = useSaveUoMs()
  const { data: presetsData } = useOnboardingUoMPresets()
  const [selectedPreset, setSelectedPreset] = useState<string>(suggestedPreset || 'standard')
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())

  // When preset changes, default-select all codes
  const presetUoMs = presetsData?.presets?.[selectedPreset] ?? []

  function toggleCode(code: string) {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  // Initialize selection when preset data loads
  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset)
    setSelectedCodes(new Set())
  }

  async function handleNext() {
    const codes = selectedCodes.size > 0
      ? Array.from(selectedCodes)
      : undefined  // backend will use full preset

    await saveUoMs.mutateAsync({
      preset: selectedPreset as 'standard' | 'corrugated' | 'food',
      ...(codes ? { uom_codes: codes } : {}),
    })
    onNext()
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Preset</Label>
        <Select value={selectedPreset} onValueChange={handlePresetChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRESET_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          We'll create these units for you. You can add more later in Settings.
        </p>
      </div>

      <div className="space-y-3">
        {presetUoMs.map(uom => (
          <div key={uom.code} className="flex items-center gap-3">
            <Checkbox
              id={`uom-${uom.code}`}
              checked={selectedCodes.size === 0 || selectedCodes.has(uom.code)}
              onCheckedChange={() => {
                if (selectedCodes.size === 0) {
                  // First toggle: initialize with all-but-this deselected
                  const allCodes = new Set(presetUoMs.map(u => u.code))
                  allCodes.delete(uom.code)
                  setSelectedCodes(allCodes)
                } else {
                  toggleCode(uom.code)
                }
              }}
            />
            <label
              htmlFor={`uom-${uom.code}`}
              className="flex gap-2 items-center cursor-pointer text-sm"
            >
              <span className="font-mono font-semibold text-primary w-10">{uom.code}</span>
              <span className="text-muted-foreground">{uom.name}</span>
            </label>
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={handleNext} disabled={saveUoMs.isPending}>
          {saveUoMs.isPending ? 'Saving...' : 'Next'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4 - Invite Team
// ---------------------------------------------------------------------------

function StepInvite({
  onBack,
  onNext,
}: {
  onBack: () => void
  onNext: () => void
}) {
  const inviteTeam = useInviteTeam()
  const [members, setMembers] = useState<InviteMember[]>([{ email: '', role: 'Viewer' }])

  function addMember() {
    setMembers(m => [...m, { email: '', role: 'Viewer' }])
  }

  function removeMember(idx: number) {
    setMembers(m => m.filter((_, i) => i !== idx))
  }

  function updateMember(idx: number, patch: Partial<InviteMember>) {
    setMembers(m => m.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  async function handleNext() {
    const validInvites = members.filter(m => m.email.trim())
    await inviteTeam.mutateAsync({ invites: validInvites })
    onNext()
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Invite teammates to join your Raven workspace. They'll receive an email with a link to set up their account.
      </p>

      <div className="space-y-3">
        {members.map((member, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="colleague@company.com"
              value={member.email}
              onChange={e => updateMember(idx, { email: e.target.value })}
              className="flex-1"
            />
            <Select
              value={member.role}
              onValueChange={val => updateMember(idx, { role: val as InviteMember['role'] })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(role => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {members.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeMember(idx)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            )}
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={addMember} className="w-full">
        + Add another
      </Button>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onNext}>Skip</Button>
          <Button onClick={handleNext} disabled={inviteTeam.isPending}>
            {inviteTeam.isPending ? 'Sending...' : 'Send invites'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 5 - All Done
// ---------------------------------------------------------------------------

function StepDone({ onComplete }: { onComplete: () => void }) {
  const completeOnboarding = useCompleteOnboarding()
  const navigate = useNavigate()

  async function handleComplete() {
    await completeOnboarding.mutateAsync()
    navigate('/')
  }

  return (
    <div className="text-center space-y-6 py-4">
      <div className="text-6xl">🎉</div>
      <div>
        <h3 className="text-xl font-bold mb-2">You're all set!</h3>
        <p className="text-muted-foreground text-sm">
          Your workspace is configured and ready to go. Here's where to start:
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-left">
        <QuickLink
          href="/admin/import"
          icon="📥"
          title="Import Data"
          description="Upload customers, items, or orders from CSV"
        />
        <QuickLink
          href="/items/new"
          icon="📦"
          title="Create First Item"
          description="Add your first product to the catalog"
        />
        <QuickLink
          href="/"
          icon="📊"
          title="Go to Dashboard"
          description="See your business at a glance"
        />
      </div>

      <Button className="w-full" size="lg" onClick={handleComplete} disabled={completeOnboarding.isPending}>
        {completeOnboarding.isPending ? 'Finishing...' : 'Complete Setup'}
      </Button>
    </div>
  )
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: string
  title: string
  description: string
}) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(href)}
      className="text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="font-medium text-sm">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export default function Onboarding() {
  usePageTitle('Welcome to Raven')
  const [step, setStep] = useState(1)
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyName, setCompanyName] = useState('My Company')
  const { data: presetsData } = useOnboardingUoMPresets()

  function nextStep() {
    setStep(s => Math.min(s + 1, 5))
  }

  function prevStep() {
    setStep(s => Math.max(s - 1, 1))
  }

  const stepDescriptions: Record<number, string> = {
    1: 'Tell us about your company',
    2: 'Set up your first warehouse',
    3: 'Choose units of measure',
    4: 'Invite your team (optional)',
    5: "You're all set!",
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Raven</h1>
          <p className="text-muted-foreground mt-1">Let's get your workspace ready in a few quick steps.</p>
        </div>

        <StepIndicator currentStep={step} />

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{STEPS[step - 1].label}</CardTitle>
            <CardDescription>{stepDescriptions[step]}</CardDescription>
          </CardHeader>
          <CardContent>
            {step === 1 && (
              <StepCompany
                initialName={companyName}
                onNext={() => {
                  nextStep()
                }}
              />
            )}
            {step === 2 && (
              <StepWarehouse
                onBack={prevStep}
                onNext={nextStep}
                companyAddress={companyAddress}
              />
            )}
            {step === 3 && (
              <StepUoM
                onBack={prevStep}
                onNext={nextStep}
                suggestedPreset={presetsData?.suggested_preset ?? 'standard'}
              />
            )}
            {step === 4 && (
              <StepInvite
                onBack={prevStep}
                onNext={nextStep}
              />
            )}
            {step === 5 && (
              <StepDone onComplete={() => {}} />
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Step {step} of {STEPS.length}
        </p>
      </div>
    </div>
  )
}
