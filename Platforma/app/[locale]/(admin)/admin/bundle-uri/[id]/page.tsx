import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { BundleForm } from '@/components/admin/bundles/bundle-form'
import { PublishToggle } from '@/components/admin/shared/publish-toggle'
import type { Database } from '@/types/database'

type BundleRow = Database['public']['Tables']['bundles']['Row'] & {
  bundle_courses: { course_id: string }[] | null
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditBundlePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: bundleRaw } = await supabase
    .from('bundles')
    .select('*, bundle_courses(course_id)')
    .eq('id', id)
    .single()

  const bundle = bundleRaw as BundleRow | null

  if (!bundle) notFound()

  const { data: courses } = await supabase
    .from('courses')
    .select('id, title_ro')
    .eq('is_published', true)
    .order('sort_order')

  return (
    <div>
      <AdminPageHeader
        title={bundle.title_ro}
        action={
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">{bundle.is_published ? 'Publicat' : 'Draft'}</span>
            <PublishToggle id={bundle.id} table="bundles" isPublished={bundle.is_published} />
          </div>
        }
      />
      <BundleForm
        bundle={bundle}
        selectedCourseIds={bundle.bundle_courses?.map((bc: any) => bc.course_id) ?? []}
        allCourses={courses ?? []}
      />
    </div>
  )
}
