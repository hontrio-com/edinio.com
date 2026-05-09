import { createClient } from '@/lib/supabase/server'
import { buildStatsData } from '@/lib/admin-stats'
import { StatsFilters } from './stats-filters'
import { StatsRevenueChart } from './stats-revenue-chart'
import { StatsCourseBreakdown } from './stats-course-breakdown'
import { StatsCountryBreakdown } from './stats-country-breakdown'
import { StatsComparisonTable } from './stats-comparison-table'
import { StatsMetricCards } from './stats-metric-cards'

interface AdvancedStatsProps {
  period: string
  from?: string
  to?: string
}

function getPeriodLabel(period: string, from?: string, to?: string): string {
  if (period === 'custom' && from && to) {
    const f = new Date(from).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })
    const t = new Date(to).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })
    return `${f} → ${t} vs perioada anterioară egală`
  }
  const labels: Record<string, string> = {
    '7d': 'Ultimele 7 zile vs 7 zile precedente',
    '30d': 'Ultimele 30 zile vs 30 zile precedente',
    '90d': 'Ultimele 90 zile vs 90 zile precedente',
    '1y': 'Ultimul an vs anul precedent',
    'all': 'Tot timpul vs perioadă anterioară egală',
  }
  return labels[period] ?? 'Comparație cu perioada anterioară'
}

export async function AdvancedStats({ period, from, to }: AdvancedStatsProps) {
  const supabase = await createClient()

  let data: Awaited<ReturnType<typeof buildStatsData>> | null = null
  try {
    data = await buildStatsData(supabase, period, from, to)
  } catch {
    data = null
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">
            Statistici avansate
          </p>
          <h2 className="text-base font-semibold text-zinc-900">Analiză detaliată</h2>
        </div>
        <StatsFilters currentPeriod={period} currentFrom={from} currentTo={to} />
      </div>

      {!data ? (
        <div className="bg-white border border-zinc-200 rounded-xl py-16 text-center">
          <p className="text-sm text-zinc-400">Nu s-au putut încărca datele. Încearcă din nou.</p>
        </div>
      ) : (
        <>
          <StatsMetricCards current={data.current} trends={data.trends} />

          <StatsRevenueChart
            data={data.chartPoints}
            groupByWeek={data.period.groupByWeek}
            currency="RON"
          />

          <div className="grid lg:grid-cols-2 gap-5">
            <StatsCourseBreakdown
              data={data.courseBreakdown}
              totalRevenue={data.current.totalRevenue}
            />
            <StatsCountryBreakdown
              current={{
                ...data.current,
                totalRevenue: data.current.totalRevenue,
                totalSales: data.current.totalSales,
              }}
              trends={data.trends}
            />
          </div>

          <StatsComparisonTable
            current={data.current}
            previous={data.previous}
            trends={data.trends}
            periodLabel={getPeriodLabel(period, from, to)}
          />
        </>
      )}
    </div>
  )
}
