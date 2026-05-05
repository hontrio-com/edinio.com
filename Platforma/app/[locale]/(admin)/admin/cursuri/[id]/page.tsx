import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { PublishToggle } from '@/components/admin/shared/publish-toggle'
import { CourseForm } from '@/components/admin/courses/course-form'
import { LessonsManager } from '@/components/admin/lessons/lessons-manager'
import { formatPrice } from '@/lib/utils'
import type { Database } from '@/types/database'

type LessonRow = Database['public']['Tables']['lessons']['Row']

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditCoursePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('id', id)
    .single()

  if (!course) notFound()

  const { data: lessonsData } = await supabase
    .from('lessons')
    .select('*')
    .eq('course_id', id)
    .order('language')
    .order('sort_order')

  const lessons = (lessonsData ?? []) as LessonRow[]
  const roLessons = lessons.filter(l => l.language === 'ro')
  const enLessons = lessons.filter(l => l.language === 'en')

  return (
    <div className="max-w-3xl">
      <AdminPageHeader
        title={course.title_ro}
        description={`/${course.slug} · ${formatPrice(course.price_ron, 'ron')} · ${formatPrice(course.price_eur, 'eur')}`}
        action={
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">
              {course.is_published ? 'Publicat' : 'Draft'}
            </span>
            <PublishToggle id={course.id} table="courses" isPublished={course.is_published} />
          </div>
        }
      />

      <Tabs defaultValue="detalii" className="space-y-5">
        <TabsList className="bg-zinc-100 h-9">
          <TabsTrigger value="detalii" className="text-xs">Detalii curs</TabsTrigger>
          <TabsTrigger value="lectii-ro" className="text-xs gap-1.5">
            Lecții Română
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{roLessons.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="lectii-en" className="text-xs gap-1.5">
            Lecții English
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{enLessons.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="detalii">
          <div className="bg-white border border-zinc-200 rounded-xl p-6">
            <CourseForm course={course} />
          </div>
        </TabsContent>

        <TabsContent value="lectii-ro">
          <div className="bg-white border border-zinc-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b">
              <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-[10px] font-bold text-blue-700">RO</span>
              </div>
              <p className="text-sm font-medium">Lecții în limba Română</p>
              <p className="text-xs text-zinc-400 ml-auto">Vizibile pentru utilizatori din România</p>
            </div>
            <LessonsManager courseId={id} lessons={roLessons as any} language="ro" />
          </div>
        </TabsContent>

        <TabsContent value="lectii-en">
          <div className="bg-white border border-zinc-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b">
              <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-[10px] font-bold text-orange-700">EN</span>
              </div>
              <p className="text-sm font-medium">Lessons in English</p>
              <p className="text-xs text-zinc-400 ml-auto">Visible for international users</p>
            </div>
            <LessonsManager courseId={id} lessons={enLessons as any} language="en" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
