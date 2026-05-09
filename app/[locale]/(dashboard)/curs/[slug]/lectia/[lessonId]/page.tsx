import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { VideoPlayer } from '@/components/dashboard/video-player'
import { LessonNavigation } from '@/components/dashboard/lesson-navigation'
import { MarkCompleteButton } from '@/components/dashboard/mark-complete-button'
import { LessonExtraContent } from '@/components/dashboard/lesson-extra-content'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft } from 'lucide-react'
import type { Database } from '@/types/database'

type LessonRow = Database['public']['Tables']['lessons']['Row']
type CourseRow = Database['public']['Tables']['courses']['Row']
type ProgressRow = Database['public']['Tables']['lesson_progress']['Row']

interface NavLesson {
  id: string
  title_ro: string
  title_en: string
  sort_order: number
}

interface Props {
  params: Promise<{ slug: string; lessonId: string; locale: string }>
}

export default async function LessonPage({ params }: Props) {
  const { slug, lessonId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: lessonData } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .maybeSingle()

  const lesson = lessonData as (LessonRow & { language: 'ro' | 'en' }) | null
  if (!lesson) notFound()

  const { data: courseData } = await supabase
    .from('courses')
    .select('*')
    .eq('id', lesson.course_id!)
    .maybeSingle()

  const course = courseData as CourseRow | null
  if (!course) notFound()

  if (!lesson.is_preview) {
    const { data: purchaseData } = await supabase
      .from('purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', course.id)
      .eq('status', 'completed')
      .maybeSingle()

    if (!purchaseData) redirect(`/cursuri/${slug}`)
  }

  const { data: allLessonsData } = await supabase
    .from('lessons')
    .select('id, title_ro, title_en, sort_order')
    .eq('course_id', course.id)
    .eq('language', lesson.language ?? 'ro')
    .order('sort_order')

  const allLessons = (allLessonsData ?? []) as NavLesson[]
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId)
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null

  const { data: progressData } = await supabase
    .from('lesson_progress')
    .select('completed, progress_seconds')
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)
    .maybeSingle()

  const progress = progressData as Pick<ProgressRow, 'completed' | 'progress_seconds'> | null

  const lang = lesson.language ?? 'ro'
  const lessonTitle = lang === 'ro' ? lesson.title_ro : (lesson.title_en || lesson.title_ro)
  const lessonDesc = lang === 'ro'
    ? lesson.description_ro
    : ((lesson as any).description_en ?? lesson.description_ro)
  const courseTitle = course.title_ro

  return (
    <div className="max-w-3xl mx-auto space-y-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <Link
          href={`/curs/${slug}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="truncate max-w-[200px] sm:max-w-none">{courseTitle}</span>
        </Link>
        <span className="text-muted-foreground/40 text-sm hidden sm:block">/</span>
        <span className="text-sm text-muted-foreground truncate max-w-[150px] hidden sm:block">
          {lessonTitle}
        </span>
      </div>

      {/* Video */}
      <div className="rounded-xl overflow-hidden shadow-lg">
        <VideoPlayer
          lessonId={lesson.id}
          userId={user.id}
          initialProgress={progress?.progress_seconds ?? 0}
        />
      </div>

      {/* Lesson header */}
      <div className="pt-4 pb-2 flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">
              Lecția {lesson.sort_order}
            </span>
            {lesson.is_preview && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                Preview gratuit
              </Badge>
            )}
          </div>
          <h1 className="text-lg sm:text-xl font-semibold leading-snug">{lessonTitle}</h1>
        </div>
        <div className="shrink-0">
          <MarkCompleteButton
            lessonId={lesson.id}
            userId={user.id}
            isCompleted={progress?.completed ?? false}
            nextLessonId={nextLesson?.id}
            courseSlug={slug}
          />
        </div>
      </div>

      {/* Description */}
      {lessonDesc && (
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed pb-2">
          {lessonDesc}
        </p>
      )}

      {/* Per-lesson extra content */}
      <LessonExtraContent sortOrder={lesson.sort_order} courseSlug={slug} />

      {/* Navigation */}
      <div className="pt-4 border-t mt-6">
        <LessonNavigation
          courseSlug={slug}
          prevLesson={prevLesson}
          nextLesson={nextLesson}
        />
      </div>
    </div>
  )
}
