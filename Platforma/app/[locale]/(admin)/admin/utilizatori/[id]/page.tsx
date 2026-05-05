import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import Link from 'next/link'
import { ArrowLeft, BookOpen, ShoppingBag } from 'lucide-react'

interface Props {
  params: Promise<{ id: string }>
}

export default async function UserDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (!profile) notFound()

  const { data: purchases } = await supabase
    .from('purchases')
    .select('id, amount_paid, currency, purchased_at, status, courses(title_ro, slug)')
    .eq('user_id', id)
    .order('purchased_at', { ascending: false })

  const { data: progress } = await supabase
    .from('lesson_progress')
    .select('id, completed')
    .eq('user_id', id)

  const totalRevenue = purchases
    ?.filter(p => p.status === 'completed')
    .reduce((s, p) => s + p.amount_paid, 0) ?? 0

  const completedLessons = progress?.filter(p => p.completed).length ?? 0

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/utilizatori"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8 w-8 p-0')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <AdminPageHeader
          title={profile.full_name || profile.email || 'Utilizator'}
          description={profile.email ?? ''}
        />
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3 mb-4">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Profil</p>
        <div className="grid grid-cols-2 gap-y-3 text-sm">
          {[
            {
              label: 'Rol',
              value: (
                <Badge variant={profile.role === 'admin' ? 'default' : 'outline'} className="text-[10px]">
                  {profile.role}
                </Badge>
              )
            },
            {
              label: 'Limbă',
              value: (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {(profile as any).preferred_language ?? 'ro'}
                </Badge>
              )
            },
            {
              label: 'Înregistrat',
              value: format(new Date(profile.created_at!), 'd MMMM yyyy', { locale: ro })
            },
            { label: 'Lecții finalizate', value: completedLessons },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
              <p className="font-medium text-zinc-900">{value}</p>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <ShoppingBag className="h-4 w-4 text-zinc-400" />
            <span className="text-zinc-600">{purchases?.length ?? 0} achiziții</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-zinc-400" />
            <span className="font-semibold text-zinc-900">{formatPrice(totalRevenue, 'ron')}</span>
            <span className="text-zinc-400">total plătit</span>
          </div>
        </div>
      </div>

      {purchases && purchases.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-zinc-50">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Achiziții</p>
          </div>
          <div className="divide-y divide-zinc-100">
            {purchases.map(p => {
              const course = p.courses as any
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                    <BookOpen className="h-3.5 w-3.5 text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">
                      {course?.title_ro ?? '—'}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {format(new Date(p.purchased_at), 'd MMM yyyy', { locale: ro })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold">
                      {formatPrice(p.amount_paid, p.currency as 'ron' | 'eur')}
                    </span>
                    <Badge
                      variant={p.status === 'completed' ? 'default' : 'secondary'}
                      className="text-[10px]"
                    >
                      {p.status === 'completed' ? 'OK' : p.status}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
