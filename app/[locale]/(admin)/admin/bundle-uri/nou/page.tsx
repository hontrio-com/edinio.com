import { createClient } from '@/lib/supabase/server'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { BundleForm } from '@/components/admin/bundles/bundle-form'

export const metadata = { title: 'Bundle nou - Admin Edinio' }

export default async function NewBundlePage() {
  const supabase = await createClient()
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title_ro')
    .eq('is_published', true)
    .order('sort_order')

  return (
    <div>
      <AdminPageHeader
        title="Bundle nou"
        description="Combină mai multe cursuri într-un pachet cu preț special."
      />
      <BundleForm allCourses={courses ?? []} />
    </div>
  )
}
