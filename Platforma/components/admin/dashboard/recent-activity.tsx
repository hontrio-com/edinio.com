import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { ShoppingBag } from 'lucide-react'

interface ActivityItem {
  id: string
  amount_paid: number
  currency: string
  purchased_at: string
  status: string
  profiles: { email: string | null; full_name: string | null } | null
  courses: { title_ro: string | null } | null
}

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl">
      <div className="px-5 py-4 border-b">
        <p className="text-sm font-semibold text-zinc-900">Activitate recentă</p>
        <p className="text-xs text-zinc-500 mt-0.5">Ultimele achiziții</p>
      </div>
      {items.length === 0 ? (
        <div className="py-12 text-center text-sm text-zinc-400">
          Nicio activitate înregistrată.
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {items.map(item => {
            const profile = item.profiles as any
            const course = item.courses as any
            return (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                  <ShoppingBag className="h-3.5 w-3.5 text-zinc-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {profile?.full_name || profile?.email || 'Utilizator anonim'}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {course?.title_ro ?? 'Curs'} · {format(new Date(item.purchased_at), 'd MMM, HH:mm', { locale: ro })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-zinc-900">
                    {formatPrice(item.amount_paid, item.currency as 'ron' | 'eur')}
                  </span>
                  <Badge
                    variant={item.status === 'completed' ? 'default' : 'secondary'}
                    className="text-[10px] h-4 px-1.5"
                  >
                    {item.status === 'completed' ? 'OK' : item.status}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
