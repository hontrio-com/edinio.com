import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Label + control + hint/error wrapper. Replaces the hand-written
 * `<label class="block text-xs font-medium text-muted-foreground mb-1.5">` +
 * `<p class="text-xs text-red-500">` pattern that was duplicated across every
 * dashboard form. Error text uses the `destructive` token (not raw red).
 *
 * Presentational only (no hooks) so it works in server components too. Pass
 * `htmlFor` + an `id` on the control to wire label focus when needed.
 */
function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode
  required?: boolean
  hint?: React.ReactNode
  error?: React.ReactNode
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-xs font-medium text-muted-foreground"
        >
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export { Field }
