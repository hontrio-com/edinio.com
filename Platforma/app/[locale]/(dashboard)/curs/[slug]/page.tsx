import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { parseGeoCookie, GEO_COOKIE } from '@/lib/geo'
import { getUpsellOffers } from '@/lib/upsell'
import { CourseCurriculum } from '@/components/dashboard/course-curriculum'
import { CourseHeroPlayer } from '@/components/dashboard/course-hero-player'
import { UpsellBanner } from '@/components/dashboard/upsell-banner'
import { LockedCourseCard } from '@/components/dashboard/locked-course-card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import type { Database } from '@/types/database'

type CourseRow = Database['public']['Tables']['courses']['Row']
type LessonRow = Database['public']['Tables']['lessons']['Row']
type ProgressRow = Database['public']['Tables']['lesson_progress']['Row']

interface Props {
  params: Promise<{ slug: string; locale: string }>
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Determine language: profile preference > geo cookie > default 'ro'
  const cookieStore = await cookies()
  const geo = parseGeoCookie(cookieStore.get(GEO_COOKIE)?.value)

  const { data: profileData } = await supabase
    .from('profiles')
    .select('preferred_language')
    .eq('id', user.id)
    .maybeSingle()

  const language: 'ro' | 'en' =
    ((profileData as any)?.preferred_language as 'ro' | 'en' | null) ??
    geo?.language ??
    'ro'

  // Fetch course
  const { data: courseData } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  const course = courseData as CourseRow | null
  if (!course) notFound()

  // Verify purchase
  const { data: purchaseData } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('course_id', course.id)
    .eq('status', 'completed')
    .maybeSingle()

  if (!purchaseData) redirect(`/cursuri/${slug}`)

  // Fetch lessons filtered by language
  const { data: lessonsData } = await supabase
    .from('lessons')
    .select('*')
    .eq('course_id', course.id)
    .eq('language', language)
    .order('sort_order')

  const lessons = (lessonsData ?? []) as LessonRow[]

  // Fetch progress + upsell offers in parallel
  const [{ data: progressData }, upsellResult] = await Promise.all([
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed, progress_seconds')
      .eq('user_id', user.id)
      .in('lesson_id', lessons.map((l: any) => l.id)),
    getUpsellOffers(user.id),
  ])

  const { nextCourse: nextCourseOffer, unpurchasedCourses } = upsellResult
  const currency = geo?.currency ?? 'ron'

  const progress = (progressData ?? []) as Pick<
    ProgressRow,
    'lesson_id' | 'completed' | 'progress_seconds'
  >[]
  const progressMap = new Map(progress.filter(p => p.lesson_id).map((p) => [p.lesson_id as string, { completed: p.completed ?? false, progress_seconds: p.progress_seconds ?? 0 }]))

  const completedCount = progress.filter((p) => p.completed).length
  const progressPercent =
    lessons.length > 0
      ? Math.round((completedCount / lessons.length) * 100)
      : 0

  const firstIncompleteLessonId =
    lessons.find((l: any) => !progressMap.get(l.id)?.completed)?.id ??
    (lessons[0] as any)?.id

  const courseTitle = language === 'ro' ? course.title_ro : (course.title_en || course.title_ro)

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{courseTitle}</h1>
          <div className="flex items-center gap-2 shrink-0">
            {progressPercent === 100 && (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                {language === 'ro' ? 'Finalizat' : 'Completed'}
              </Badge>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              {completedCount} {language === 'ro' ? 'din' : 'of'} {lessons.length}{' '}
              {language === 'ro' ? 'lecții completate' : 'lessons completed'}
            </span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>

      <Separator />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 order-2 lg:order-1">
          <CourseCurriculum
            courseSlug={slug}
            lessons={lessons as any}
            progressMap={progressMap}
            language={language}
          />
        </div>
        <div className="lg:col-span-2 order-1 lg:order-2">
          <CourseHeroPlayer
            courseSlug={slug}
            firstLessonId={firstIncompleteLessonId}
            progressPercent={progressPercent}
          />
        </div>
      </div>

      {/* Upsell section */}
      {(nextCourseOffer || unpurchasedCourses.length > 0) && (
        <>
          <Separator />
          <div className="space-y-4">
            {nextCourseOffer && (
              <UpsellBanner
                offer={nextCourseOffer}
                currency={currency}
                language={language}
              />
            )}
            {unpurchasedCourses.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  {language === 'ro' ? 'Mai ai de descoperit' : 'More to explore'}
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {unpurchasedCourses.slice(0, 3).map((c) => (
                    <LockedCourseCard
                      key={c.id}
                      course={c}
                      currency={currency}
                      language={language}
                      discountPercent={20}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
