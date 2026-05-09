import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { PublishToggle } from '@/components/admin/shared/publish-toggle'
import { EmptyState } from '@/components/admin/shared/empty-state'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type BundleRow = Database['public']['Tables']['bundles']['Row']

export const metadata = { title: 'Bundle-uri — Admin Edinio' }

export default async function AdminBundlesPage() {
  const supabase = await createClient()
  const { data: bundlesRaw } = await supabase
    .from('bundles')
    .select('*, bundle_courses(course_id, courses(title_ro))')
  const bundles = (bundlesRaw ?? []) as (BundleRow & { bundle_courses: any[] })[]

  return (
    <div className="max-w-4xl">
      <AdminPageHeader
        title="Bundle-uri"
        description={`${bundles?.length ?? 0} bundle-uri configurate`}
        action={
          <Link href="/admin/bundle-uri/nou" className={cn(buttonVariants({ size: 'sm' }), 'gap-2')}>
            <Plus className="h-4 w-4" />
            Bundle nou
          </Link>
        }
      />

      {!bundles.length ? (
        <EmptyState
          icon={Plus}
          title="Niciun bundle"
          description="Creează un bundle care să combine mai multe cursuri."
          actionLabel="Creează bundle"
          actionHref="/admin/bundle-uri/nou"
        />
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100">
          {bundles.map((bundle) => {
            const courses = bundle.bundle_courses?.map((bc: any) => bc.courses?.title_ro).filter(Boolean) ?? []
            return (
              <div key={bundle.id} className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-zinc-900">{bundle.title_ro}</p>
                    <Badge
                      variant={bundle.is_published ? 'default' : 'secondary'}
                      className="text-[10px] h-4 px-1.5"
                    >
                      {bundle.is_published ? 'Publicat' : 'Draft'}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {formatPrice(bundle.price_ron, 'ron')} · {formatPrice(bundle.price_eur, 'eur')}
                  </p>
                  {courses.length > 0 && (
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Include: {courses.join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <PublishToggle id={bundle.id} table="bundles" isPublished={bundle.is_published} />
                  <Link
                    href={`/admin/bundle-uri/${bundle.id}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 px-3 text-xs gap-1.5')}
                  >
                    <Pencil className="h-3 w-3" />
                    Editează
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
