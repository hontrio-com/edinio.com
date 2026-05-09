import { formatPrice } from '@/lib/utils'

interface CountryStats {
  roRevenue: number
  enRevenue: number
  roSales: number
  enSales: number
  totalRevenue: number
  totalSales: number
}

interface StatsCountryBreakdownProps {
  current: CountryStats
  trends: {
    roRevenue: number
    enRevenue: number
  }
}

function TrendBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-[10px] text-zinc-400"> - </span>
  const positive = value > 0
  return (
    <span className={`text-[10px] font-medium ${positive ? 'text-green-600' : 'text-red-500'}`}>
      {positive ? '+' : ''}{value}%
    </span>
  )
}

function CountryRow({
  flag, name, revenue, sales, totalRevenue, trend, color,
}: {
  flag: string
  name: string
  revenue: number
  sales: number
  totalRevenue: number
  trend: number
  color: string
}) {
  const pct = totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 100) : 0

  return (
    <div className="flex items-center gap-3 py-3 border-b border-zinc-100 last:border-none">
      <span className="text-base w-6 text-center flex-shrink-0">{flag}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-zinc-800">{name}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">{sales} vânz.</span>
            <span className="text-sm font-semibold text-zinc-900">{formatPrice(revenue, 'ron')}</span>
            <TrendBadge value={trend} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="text-[10px] text-zinc-400 w-7 text-right">{pct}%</span>
        </div>
      </div>
    </div>
  )
}

export function StatsCountryBreakdown({ current, trends }: StatsCountryBreakdownProps) {
  const roEurEquiv = Math.round(current.roRevenue / 497)
  const enEurEquiv = Math.round(current.enRevenue / 100)

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-zinc-900">RO vs Internațional</p>
        <p className="text-xs text-zinc-400 mt-0.5">
          Distribuție după valuta plății · {current.totalSales} vânzări totale
        </p>
      </div>

      {current.totalRevenue === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-400">Fără date</div>
      ) : (
        <>
          <CountryRow
            flag="🇷🇴"
            name="România"
            revenue={current.roRevenue}
            sales={current.roSales}
            totalRevenue={current.totalRevenue}
            trend={trends.roRevenue}
            color="#18181b"
          />
          <CountryRow
            flag="🌍"
            name="Internațional"
            revenue={current.enRevenue}
            sales={current.enSales}
            totalRevenue={current.totalRevenue}
            trend={trends.enRevenue}
            color="#a1a1aa"
          />

          <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-100">
            <div className="flex-1 bg-zinc-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1">
                Echiv. EUR · RO
              </p>
              <p className="text-sm font-semibold text-zinc-900">~{roEurEquiv.toLocaleString('ro-RO')} €</p>
            </div>
            <div className="flex-1 bg-zinc-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1">
                EUR · Internațional
              </p>
              <p className="text-sm font-semibold text-zinc-900">{enEurEquiv.toLocaleString('ro-RO')} €</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
