import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getUpsellOffers } from '@/lib/upsell'
import { parseGeoCookie, GEO_COOKIE } from '@/lib/geo'
import { VideoPlayer } from '@/components/dashboard/video-player'
import { LessonNavigation } from '@/components/dashboard/lesson-navigation'
import { MarkCompleteButton } from '@/components/dashboard/mark-complete-button'
import { UpsellBanner } from '@/components/dashboard/upsell-banner'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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

  const cookieStore = await cookies()
  const geo = parseGeoCookie(cookieStore.get(GEO_COOKIE)?.value)

  // Fetch lesson
  const { data: lessonData } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .maybeSingle()

  const lesson = lessonData as (LessonRow & { language: 'ro' | 'en' }) | null
  if (!lesson) notFound()

  // Fetch course
  const { data: courseData } = await supabase
    .from('courses')
    .select('*')
    .eq('id', lesson.course_id!)
    .maybeSingle()

  const course = courseData as CourseRow | null
  if (!course) notFound()

  // Verify purchase (unless preview)
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

  // Navigation lessons — same language as current lesson
  const { data: allLessonsData } = await supabase
    .from('lessons')
    .select('id, title_ro, title_en, sort_order')
    .eq('course_id', course.id)
    .eq('language', lesson.language ?? 'ro')
    .order('sort_order')

  const allLessons = (allLessonsData ?? []) as NavLesson[]
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId)
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null
  const nextLesson =
    currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null

  // Get progress + upsell in parallel
  const [{ data: progressData }, { nextCourse: nextCourseOffer }] = await Promise.all([
    supabase
      .from('lesson_progress')
      .select('completed, progress_seconds')
      .eq('user_id', user.id)
      .eq('lesson_id', lessonId)
      .maybeSingle(),
    getUpsellOffers(user.id),
  ])

  const progress = progressData as Pick<
    ProgressRow,
    'completed' | 'progress_seconds'
  > | null

  const currency = geo?.currency ?? 'ron'

  const lang = lesson.language ?? 'ro'
  const lessonTitle = lang === 'ro' ? lesson.title_ro : (lesson.title_en || lesson.title_ro)
  const lessonDesc =
    lang === 'ro'
      ? lesson.description_ro
      : ((lesson as any).description_en ?? lesson.description_ro)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-4">
        <VideoPlayer
          bunnyVideoId={lesson.bunny_video_id}
          lessonId={lesson.id}
          userId={user.id}
          initialProgress={progress?.progress_seconds ?? 0}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            {lesson.is_preview && (
              <Badge variant="outline" className="text-xs">
                {lang === 'ro' ? 'Previzualizare gratuită' : 'Free preview'}
              </Badge>
            )}
            <h1 className="text-xl font-semibold">{lessonTitle}</h1>
            {lessonDesc && (
              <p className="text-sm text-muted-foreground">{lessonDesc}</p>
            )}
          </div>
          <MarkCompleteButton
            lessonId={lesson.id}
            userId={user.id}
            isCompleted={progress?.completed ?? false}
            nextLessonId={nextLesson?.id}
            courseSlug={slug}
          />
        </div>
      </div>

      <Separator />

      <LessonNavigation
        courseSlug={slug}
        prevLesson={prevLesson}
        nextLesson={nextLesson}
      />

      {nextCourseOffer && (
        <UpsellBanner
          offer={nextCourseOffer}
          currency={currency}
          language={lang}
        />
      )}
    </div>
  )
}
