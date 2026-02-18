import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { FieldError } from 'react-hook-form'

interface FormFieldProps {
  label: string
  error?: FieldError
  children: React.ReactNode
  required?: boolean
  className?: string
}

export function FormField({ label, error, children, required, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className={cn(error && 'text-destructive')}>
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error.message}</p>}
    </div>
  )
}
