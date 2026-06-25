import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const calloutVariants = cva(
  "flex items-start gap-3 rounded-xl border p-4 text-sm",
  {
    variants: {
      variant: {
        success: "border-success/20 bg-success/5",
        warning: "border-warning/20 bg-warning/5",
        danger: "border-destructive/20 bg-destructive/5",
        info: "border-info/20 bg-info/5",
        neutral: "border-border bg-muted/40",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

const iconColor: Record<NonNullable<VariantProps<typeof calloutVariants>["variant"]>, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  neutral: "text-muted-foreground",
}

/**
 * Semantic status / alert block. Replaces the hardcoded `bg-green-50
 * border-green-200` (and red/amber/blue equivalents) cards repeated ~189×
 * across the dashboard. The variant drives border, soft fill and icon tint
 * from semantic tokens, so the whole app shifts state colors in one place.
 */
function Callout({
  variant = "info",
  icon: Icon,
  title,
  action,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof calloutVariants> & {
    icon?: LucideIcon
    title?: React.ReactNode
    action?: React.ReactNode
  }) {
  const v = variant ?? "info"
  return (
    <div
      data-slot="callout"
      className={cn(calloutVariants({ variant }), className)}
      {...props}
    >
      {Icon && <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconColor[v])} />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        {children && (
          <div className={cn("text-muted-foreground", title && "mt-0.5")}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export { Callout, calloutVariants }
