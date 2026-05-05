import { formatPrice } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatsData {
  totalRevenue: number
  totalSales: number
  avgPerSale: number
  newUsers: number
  roRevenue: number
  enRevenue: number
  roSales: number
  enSales: number
}

interface Trends {
  revenue: number
  sales: number
  avgPerSale: number
  newUsers: number
  roRevenue: number
  enRevenue: number
}

interface StatsComparisonTableProps {
  current: StatsData
  previous: StatsData
  trends: Trends
  periodLabel: string
}

function TrendCell({ value }: { value: number }) {
  if (value === 0) {
    return (
      <div className="flex items-center justify-end gap-1 text-zinc-400">
        <Minus className="h-3 w-3" />
        <span className="text-xs">0%</span>
      </div>
    )
  }
  const positive = value > 0
  return (
    <div className={`flex items-center justify-end gap-1 ${positive ? 'text-green-600' : 'text-red-500'}`}>
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      <span className="text-xs font-medium">{positive ? '+' : ''}{value}%</span>
    </div>
  )
}

const ROWS: {
  label: string
  current: (d: StatsData) => string
  previous: (d: StatsData) => string
  trend: (t: Trends) => number
}[] = [
  {
    label: 'Venit total',
    current: d => formatPrice(d.totalRevenue, 'ron'),
    previous: d => formatPrice(d.totalRevenue, 'ron'),
    trend: t => t.revenue,
  },
  {
    label: 'Număr vânzări',
    current: d => d.totalSales.toString(),
    previous: d => d.totalSales.toString(),
    trend: t => t.sales,
  },
  {
    label: 'Medie per vânzare',
    current: d => formatPrice(d.avgPerSale, 'ron'),
    previous: d => formatPrice(d.avgPerSale, 'ron'),
    trend: t => t.avgPerSale,
  },
  {
    label: 'Utilizatori noi',
    current: d => d.newUsers.toString(),
    previous: d => d.newUsers.toString(),
    trend: t => t.newUsers,
  },
  {
    label: 'Vânzări România',
    current: d => `${d.roSales} vânz. · ${formatPrice(d.roRevenue, 'ron')}`,
    previous: d => `${d.roSales} vânz. · ${formatPrice(d.roRevenue, 'ron')}`,
    trend: t => t.roRevenue,
  },
  {
    label: 'Vânzări Internațional',
    current: d => `${d.enSales} vânz. · ${formatPrice(d.enRevenue, 'ron')}`,
    previous: d => `${d.enSales} vânz. · ${formatPrice(d.enRevenue, 'ron')}`,
    trend: t => t.enRevenue,
  },
]

export function StatsComparisonTable({ current, previous, trends, periodLabel }: StatsComparisonTableProps) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b bg-zinc-50">
        <p className="text-sm font-semibold text-zinc-900">Comparație cu perioada anterioară</p>
        <p className="text-xs text-zinc-400 mt-0.5">{periodLabel}</p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-[40%]">
              Metric
            </th>
            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Curent
            </th>
            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Anterior
            </th>
            <th className="text-right px-5 py-2.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Trend
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {ROWS.map(row => (
            <tr key={row.label} className="hover:bg-zinc-50 transition-colors">
              <td className="px-5 py-3 text-sm font-medium text-zinc-700">{row.label}</td>
              <td className="px-4 py-3 text-sm font-semibold text-zinc-900 text-right">
                {row.current(current)}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400 text-right">
                {row.previous(previous)}
              </td>
              <td className="px-5 py-3">
                <TrendCell value={row.trend(trends)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
