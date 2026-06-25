import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Standard dashboard surface: `rounded-xl border border-border bg-surface`.
 * Consolidates the card chrome that was hand-written across ~40 dashboard
 * files, so radius/border/elevation live in one place. Padding is left to the
 * caller (headered panels need a flush header, simple panels use `p-4`).
 */
function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel"
      className={cn("rounded-xl border border-border bg-surface", className)}
      {...props}
    />
  )
}

function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border px-5 py-4",
        className
      )}
      {...props}
    />
  )
}

function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="panel-title"
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  )
}

export { Panel, PanelHeader, PanelTitle }
