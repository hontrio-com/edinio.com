import { createClient } from '@/lib/supabase/server'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { Search } from 'lucide-react'

export const metadata = { title: 'Vânzări - Admin Edinio' }

const STATUS_FILTERS = [
  { label: 'Toate', value: undefined },
  { label: 'Confirmate', value: 'completed' },
  { label: 'Rambursate', value: 'refunded' },
]

interface Props {
  searchParams: Promise<{ q?: string; status?: string; period?: string }>
}

export default async function AdminSalesPage({ searchParams }: Props) {
  const { q, status, period } = await searchParams
  const supabase = await createClient()

  const now = new Date()
  let query = supabase
    .from('purchases')
    .select(`
      id, amount_paid, currency, purchased_at, status, stripe_session_id,
      profiles (id, email, full_name),
      courses (id, title_ro, slug)
    `)
    .order('purchased_at', { ascending: false })
    .limit(100)

  if (status) query = (query as any).eq('status', status)

  if (period === '7d') {
    query = (query as any).gte('purchased_at', new Date(Date.now() - 7 * 86400000).toISOString())
  } else if (period === '30d') {
    query = (query as any).gte('purchased_at', new Date(Date.now() - 30 * 86400000).toISOString())
  } else if (period === 'month') {
    query = (query as any).gte('purchased_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
  }

  const { data: purchases } = await query

  const filtered = q
    ? purchases?.filter(p => {
        const profile = p.profiles as any
        const lq = q.toLowerCase()
        return (
          profile?.email?.toLowerCase().includes(lq) ||
          profile?.full_name?.toLowerCase().includes(lq)
        )
      })
    : purchases

  const totalRevenue = filtered?.filter(p => p.status === 'completed')
    .reduce((s, p) => s + p.amount_paid, 0) ?? 0

  function buildUrl(params: Record<string, string | undefined>) {
    const parts: string[] = []
    if (params.status) parts.push(`status=${params.status}`)
    if (params.period) parts.push(`period=${params.period}`)
    if (params.q) parts.push(`q=${params.q}`)
    return `/admin/vanzari${parts.length ? '?' + parts.join('&') : ''}`
  }

  return (
    <div>
      <AdminPageHeader
        title="Vânzări"
        description={`${filtered?.length ?? 0} tranzacții · Total: ${formatPrice(totalRevenue, 'ron')}`}
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <form>
            <Input
              name="q"
              placeholder="Caută după email..."
              defaultValue={q ?? ''}
              className="pl-9 h-9 text-sm bg-white w-56"
            />
          </form>
        </div>

        <div className="flex gap-1.5">
          {STATUS_FILTERS.map(f => (
            <Link
              key={f.label}
              href={buildUrl({ status: f.value, period })}
              className={cn(
                buttonVariants({ variant: status === f.value ? 'default' : 'outline', size: 'sm' }),
                'h-8 text-xs'
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="flex gap-1.5">
          {[
            { label: '7 zile', value: '7d' },
            { label: '30 zile', value: '30d' },
            { label: 'Luna aceasta', value: 'month' },
          ].map(p => (
            <Link
              key={p.value}
              href={buildUrl({ status, period: p.value })}
              className={cn(
                buttonVariants({ variant: period === p.value ? 'secondary' : 'ghost', size: 'sm' }),
                'h-8 text-xs'
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-zinc-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Curs</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Data</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sumă</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {!filtered?.length && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-zinc-400">
                  Nicio vânzare găsită.
                </td>
              </tr>
            )}
            {filtered?.map(p => {
              const profile = p.profiles as any
              const course = p.courses as any
              return (
                <tr key={p.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-zinc-900">{profile?.full_name || ' - '}</p>
                    <p className="text-xs text-zinc-400">{profile?.email}</p>
                  </td>
                  <td className="px-4 py-3.5 hidden sm:table-cell">
                    <p className="text-sm text-zinc-700">{course?.title_ro || ' - '}</p>
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <p className="text-xs text-zinc-500">
                      {format(new Date(p.purchased_at ?? Date.now()), 'd MMM yyyy, HH:mm', { locale: ro })}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-semibold text-zinc-900">
                      {formatPrice(p.amount_paid, p.currency as 'ron' | 'eur')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Badge
                      variant={p.status === 'completed' ? 'default' : 'secondary'}
                      className="text-[10px]"
                    >
                      {p.status === 'completed' ? 'Confirmat' : p.status}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
