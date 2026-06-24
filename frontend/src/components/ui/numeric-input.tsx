import * as React from "react"

import { Input } from "@/components/ui/input"
import { formatWithCommas, parseNumericInput } from "@/lib/format"

export interface NumericInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "value" | "type"> {
  /** Raw numeric value (comma-free string or number). */
  value: string | number | null | undefined
  /** Called with the raw, comma-stripped string on every edit. */
  onValueChange?: (raw: string) => void
}

/**
 * Text input that displays numbers with thousands separators while the user
 * types, but emits and stores the raw comma-free value — so the float/integer
 * sent to the API is unchanged. Native spinner arrows are stripped globally in
 * index.css; this also renders as type="text" so no spinners appear at all.
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onValueChange, inputMode = "decimal", ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="text"
        inputMode={inputMode}
        value={formatWithCommas(value ?? "")}
        onChange={(e) => onValueChange?.(parseNumericInput(e.target.value))}
        {...props}
      />
    )
  }
)
NumericInput.displayName = "NumericInput"

export { NumericInput }
