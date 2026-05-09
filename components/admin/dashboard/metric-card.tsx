import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  color?: 'zinc' | 'green' | 'blue' | 'purple' | 'orange'
}

const COLOR_MAP = {
  zinc:   { bg: 'bg-zinc-100',   icon: 'text-zinc-600' },
  green:  { bg: 'bg-green-50',   icon: 'text-green-600' },
  blue:   { bg: 'bg-blue-50',    icon: 'text-blue-600' },
  purple: { bg: 'bg-purple-50',  icon: 'text-purple-600' },
  orange: { bg: 'bg-orange-50',  icon: 'text-orange-600' },
}

export function MetricCard({ title, value, subtitle, icon: Icon, trend, color = 'zinc' }: MetricCardProps) {
  const colors = COLOR_MAP[color]
  const isPositive = (trend?.value ?? 0) >= 0

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{title}</p>
        <div className={cn('p-2 rounded-lg', colors.bg)}>
          <Icon className={cn('h-4 w-4', colors.icon)} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-zinc-900 tracking-tight">{value}</p>
        {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {trend && (
        <div className={cn(
          'flex items-center gap-1 text-xs font-medium',
          isPositive ? 'text-green-600' : 'text-red-500'
        )}>
          {isPositive
            ? <TrendingUp className="h-3.5 w-3.5" />
            : <TrendingDown className="h-3.5 w-3.5" />
          }
          <span>{isPositive ? '+' : ''}{trend.value}% {trend.label}</span>
        </div>
      )}
    </div>
  )
}
