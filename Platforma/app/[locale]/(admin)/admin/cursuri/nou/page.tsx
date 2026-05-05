import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { CourseForm } from '@/components/admin/courses/course-form'

export const metadata = { title: 'Curs nou — Admin Edinio' }

export default function NewCoursePage() {
  return (
    <div className="max-w-2xl">
      <AdminPageHeader
        title="Curs nou"
        description="Completează detaliile pentru a crea un curs nou."
      />
      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <CourseForm />
      </div>
    </div>
  )
}
