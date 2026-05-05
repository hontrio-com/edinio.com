import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { Search, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Utilizatori — Admin Edinio' }

interface Props {
  searchParams: Promise<{ q?: string }>
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const { q } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('profiles')
    .select('id, email, full_name, role, preferred_language, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (q) {
    query = (query as any).or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
  }

  const { data: profiles } = await query

  return (
    <div>
      <AdminPageHeader
        title="Utilizatori"
        description={`${profiles?.length ?? 0} conturi înregistrate`}
      />

      <div className="relative mb-5 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <form>
          <Input
            name="q"
            placeholder="Caută după email sau nume..."
            defaultValue={q ?? ''}
            className="pl-9 h-9 text-sm bg-white"
          />
        </form>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-zinc-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Utilizator</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Rol</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Limbă</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden lg:table-cell">Înregistrat</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Detalii</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {!profiles?.length && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-zinc-400">
                  Niciun utilizator găsit.
                </td>
              </tr>
            )}
            {profiles?.map(p => (
              <tr key={p.id} className="hover:bg-zinc-50 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-zinc-900">{p.full_name || '—'}</p>
                  <p className="text-xs text-zinc-400">{p.email}</p>
                </td>
                <td className="px-4 py-3.5 hidden sm:table-cell">
                  <Badge variant={p.role === 'admin' ? 'default' : 'outline'} className="text-[10px]">
                    {p.role}
                  </Badge>
                </td>
                <td className="px-4 py-3.5 hidden md:table-cell">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {(p as any).preferred_language ?? 'ro'}
                  </Badge>
                </td>
                <td className="px-4 py-3.5 hidden lg:table-cell">
                  <p className="text-xs text-zinc-500">
                    {format(new Date(p.created_at!), 'd MMM yyyy', { locale: ro })}
                  </p>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    href={`/admin/utilizatori/${p.id}`}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-7 w-7 p-0')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
