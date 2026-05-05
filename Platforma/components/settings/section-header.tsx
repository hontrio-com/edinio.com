interface SectionHeaderProps {
  label: string
  title: string
  description?: string
  action?: React.ReactNode
}

export function SectionHeader({ label, title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          {label}
        </p>
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed pt-0.5">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </div>
  )
}
