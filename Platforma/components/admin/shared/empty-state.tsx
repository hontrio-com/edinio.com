import { LucideIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
}

export function EmptyState({ icon: Icon, title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
      <div className="p-4 rounded-full bg-zinc-100">
        <Icon className="h-8 w-8 text-zinc-400" />
      </div>
      <div>
        <p className="font-medium text-zinc-900">{title}</p>
        <p className="text-sm text-zinc-500 mt-0.5 max-w-sm">{description}</p>
      </div>
      {actionLabel && actionHref && (
        <Link href={actionHref} className={buttonVariants({ size: 'sm' })}>
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
