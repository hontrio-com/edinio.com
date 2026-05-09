'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarDays, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const PERIODS = [
  { label: '7 zile', value: '7d' },
  { label: '30 zile', value: '30d' },
  { label: '90 zile', value: '90d' },
  { label: '1 an', value: '1y' },
  { label: 'Tot timpul', value: 'all' },
] as const

type PeriodValue = (typeof PERIODS)[number]['value'] | 'custom'

interface StatsFiltersProps {
  currentPeriod: string
  currentFrom?: string
  currentTo?: string
}

export function StatsFilters({ currentPeriod, currentFrom, currentTo }: StatsFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [customFrom, setCustomFrom] = useState(currentFrom ?? '')
  const [customTo, setCustomTo] = useState(currentTo ?? '')

  function navigate(params: Record<string, string>) {
    const sp = new URLSearchParams(params)
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`)
    })
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    navigate({ period: 'custom', from: customFrom, to: customTo })
  }

  const activePeriod = currentPeriod as PeriodValue

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Perioade predefinite */}
      <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => navigate({ period: p.value })}
            disabled={isPending}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              activePeriod === p.value
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-zinc-200" />

      {/* Date picker custom — PopoverTrigger renders as <button> in base-ui */}
      <Popover>
        <PopoverTrigger
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-all',
            activePeriod === 'custom'
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {activePeriod === 'custom' && currentFrom && currentTo
            ? `${formatDate(currentFrom)} → ${formatDate(currentTo)}`
            : 'Perioadă custom'
          }
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-4">
          <p className="text-xs font-semibold text-zinc-700 mb-3">Selectează intervalul</p>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                De la
              </label>
              <Input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="h-8 text-xs"
                max={customTo || undefined}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Până la
              </label>
              <Input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="h-8 text-xs"
                min={customFrom || undefined}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={applyCustom}
              disabled={!customFrom || !customTo || isPending}
            >
              Aplică
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {isPending && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    })
  } catch {
    return dateStr
  }
}
