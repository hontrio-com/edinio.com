import { formatPrice } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, CircleDollarSign, ShoppingBag, Calculator, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsMetricCardsProps {
  current: {
    totalRevenue: number
    totalSales: number
    avgPerSale: number
    newUsers: number
  }
  trends: {
    revenue: number
    sales: number
    avgPerSale: number
    newUsers: number
  }
}

function TrendIndicator({ value }: { value: number }) {
  if (value === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-zinc-400 mt-1.5">
        <Minus className="h-3 w-3" />
        <span>Fără schimbare</span>
      </div>
    )
  }
  const positive = value > 0
  return (
    <div className={cn('flex items-center gap-1 text-xs mt-1.5', positive ? 'text-green-600' : 'text-red-500')}>
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      <span>{positive ? '+' : ''}{value}% vs anterior</span>
    </div>
  )
}

export function StatsMetricCards({ current, trends }: StatsMetricCardsProps) {
  const cards = [
    {
      title: 'Venit total',
      value: formatPrice(current.totalRevenue, 'ron'),
      trend: trends.revenue,
      icon: CircleDollarSign,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
    },
    {
      title: 'Vânzări',
      value: current.totalSales.toLocaleString('ro-RO'),
      trend: trends.sales,
      icon: ShoppingBag,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      title: 'Medie / vânzare',
      value: formatPrice(current.avgPerSale, 'ron'),
      trend: trends.avgPerSale,
      icon: Calculator,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
    },
    {
      title: 'Utilizatori noi',
      value: current.newUsers.toLocaleString('ro-RO'),
      trend: trends.newUsers,
      icon: Users,
      iconBg: 'bg-orange-50',
      iconColor: 'text-orange-500',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => {
        const Icon = card.icon
        return (
          <div key={card.title} className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                {card.title}
              </p>
              <div className={cn('p-1.5 rounded-lg', card.iconBg)}>
                <Icon className={cn('h-3.5 w-3.5', card.iconColor)} />
              </div>
            </div>
            <p className="text-2xl font-bold text-zinc-900 tracking-tight">{card.value}</p>
            <TrendIndicator value={card.trend} />
          </div>
        )
      })}
    </div>
  )
}
