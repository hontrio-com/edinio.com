import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Plus, Search, Pencil, Eye } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { PublishToggle } from '@/components/admin/shared/publish-toggle'
import { EmptyState } from '@/components/admin/shared/empty-state'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Cursuri — Admin Edinio' }

interface Props {
  searchParams: Promise<{ q?: string; status?: string }>
}

export default async function AdminCoursesPage({ searchParams }: Props) {
  const { q, status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('courses')
    .select(`id, slug, title_ro, title_en, price_ron, price_eur, is_published, sort_order, created_at, lessons(id, language)`)
    .order('sort_order', { ascending: true })

  if (q) query = (query as any).ilike('title_ro', `%${q}%`)
  if (status === 'published') query = (query as any).eq('is_published', true)
  if (status === 'draft') query = (query as any).eq('is_published', false)

  const { data: courses } = await query

  return (
    <div>
      <AdminPageHeader
        title="Cursuri"
        description={`${courses?.length ?? 0} cursuri în total`}
        action={
          <Link href="/admin/cursuri/nou" className={cn(buttonVariants({ size: 'sm' }), 'gap-2')}>
            <Plus className="h-4 w-4" />
            Curs nou
          </Link>
        }
      />

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <form>
            <Input
              name="q"
              placeholder="Caută cursuri..."
              defaultValue={q ?? ''}
              className="pl-9 h-9 text-sm bg-white"
            />
          </form>
        </div>
        <div className="flex gap-1.5">
          {[
            { label: 'Toate', value: undefined },
            { label: 'Publicate', value: 'published' },
            { label: 'Draft', value: 'draft' },
          ].map(f => (
            <Link
              key={f.label}
              href={f.value ? `/admin/cursuri?status=${f.value}` : '/admin/cursuri'}
              className={cn(
                buttonVariants({ variant: status === f.value ? 'default' : 'outline', size: 'sm' }),
                'h-8 text-xs'
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {courses?.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Niciun curs"
          description="Creează primul curs pe platformă."
          actionLabel="Creează curs"
          actionHref="/admin/cursuri/nou"
        />
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-zinc-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Curs</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Lecții</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Preț</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {courses?.map((course: any) => {
                const lessons = course.lessons ?? []
                const roLessons = lessons.filter((l: any) => l.language === 'ro').length
                const enLessons = lessons.filter((l: any) => l.language === 'en').length

                return (
                  <tr key={course.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-sm text-zinc-900">{course.title_ro}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{course.title_en}</p>
                      <p className="text-xs text-zinc-400 font-mono">/{course.slug}</p>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">RO {roLessons}</Badge>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">EN {enLessons}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-sm font-medium text-zinc-900">{formatPrice(course.price_ron, 'ron')}</p>
                      <p className="text-xs text-zinc-400">{formatPrice(course.price_eur, 'eur')}</p>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <PublishToggle id={course.id} table="courses" isPublished={course.is_published} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/cursuri/${course.slug}`}
                          target="_blank"
                          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8 w-8 p-0')}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                          href={`/admin/cursuri/${course.id}`}
                          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 px-3 text-xs gap-1.5')}
                        >
                          <Pencil className="h-3 w-3" />
                          Editează
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
