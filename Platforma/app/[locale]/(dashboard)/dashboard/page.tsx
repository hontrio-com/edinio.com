import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { CourseProgressCard } from '@/components/dashboard/course-progress-card'
import { EmptyCoursesState } from '@/components/dashboard/empty-courses-state'
import { StatsRow } from '@/components/dashboard/stats-row'
import { DailyTipCard } from '@/components/dashboard/daily-tip-card'
import { UpsellCourseCard } from '@/components/dashboard/upsell-course-card'
import { RecentActivityCard } from '@/components/dashboard/recent-activity-card'
import { Separator } from '@/components/ui/separator'

export const metadata = { title: 'Dashboard — Edinio' }

interface LessonData {
  id: string
  duration_seconds: number | null
}

interface CourseData {
  id: string
  slug: string
  title_ro: string
  thumbnail_url: string | null
  lessons: LessonData[]
}

interface PurchaseData {
  id: string
  purchased_at: string
  courses: CourseData | null
}

interface ProgressData {
  lesson_id: string
  completed: boolean
  progress_seconds: number
  last_watched_at: string
  lessons: { title_ro: string; course_id: string } | null
}

interface UpsellCourse {
  id: string
  slug: string
  title_ro: string
  thumbnail_url: string | null
  price_ron: number
}

function calcStreak(progressRows: ProgressData[]): number {
  const completedDates = new Set(
    progressRows
      .filter((p) => p.completed)
      .map((p) => p.last_watched_at.slice(0, 10))
  )
  if (completedDates.size === 0) return 0
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    if (completedDates.has(d.toISOString().slice(0, 10))) streak++
    else if (i > 0) break
  }
  return streak
}

async function DashboardContent() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: purchasesRaw } = await supabase
    .from('purchases')
    .select(`
      id, purchased_at,
      courses ( id, slug, title_ro, thumbnail_url, lessons ( id, duration_seconds ) )
    `)
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('purchased_at', { ascending: false })

  const purchases = (purchasesRaw ?? []) as PurchaseData[]
  const purchasedCourseIds = purchases.map((p) => p.courses?.id).filter(Boolean) as string[]

  const { data: progressRaw } = await supabase
    .from('lesson_progress')
    .select('lesson_id, completed, progress_seconds, last_watched_at, lessons ( title_ro, course_id )')
    .eq('user_id', user.id)
    .order('last_watched_at', { ascending: false })

  const progress = (progressRaw ?? []) as ProgressData[]
  const progressMap = new Map(progress.map((p) => [p.lesson_id, p]))

  const totalCourses = purchases.length
  const completedLessons = progress.filter((p) => p.completed).length
  const streak = calcStreak(progress)

  const recentActivity = progress
    .filter((p) => p.completed && p.lessons)
    .slice(0, 5)
    .map((p) => ({
      lessonTitle: p.lessons!.title_ro,
      courseTitle:
        purchases.find((pur) => pur.courses?.id === p.lessons?.course_id)?.courses?.title_ro ?? '',
      completedAt: p.last_watched_at,
    }))

  const { data: allCoursesRaw } = await supabase
    .from('courses')
    .select('id, slug, title_ro, thumbnail_url, price_ron')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })

  const upsellCourses = ((allCoursesRaw ?? []) as UpsellCourse[])
    .filter((c) => !purchasedCourseIds.includes(c.id))
    .slice(0, 3)

  const hasCourses = totalCourses > 0

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bună ziua! 👋</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {hasCourses
            ? 'Continuă de unde ai rămas. Progresul tău este salvat.'
            : 'Bine ai venit pe Edinio. Alege primul tău curs și pornește.'}
        </p>
      </div>

      {/* Stats */}
      {hasCourses && (
        <StatsRow
          totalCourses={totalCourses}
          completedLessons={completedLessons}
          streak={streak}
        />
      )}

      {/* Daily tip banner — full width */}
      <DailyTipCard />

      {/* Main content */}
      {!hasCourses ? (
        <EmptyCoursesState />
      ) : (
        <div className="space-y-8">
          {/* Cursurile mele */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Cursurile mele</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {purchases.map((purchase) => {
                const course = purchase.courses
                if (!course) return null
                const lessons = course.lessons ?? []
                const completedCount = lessons.filter((l) => progressMap.get(l.id)?.completed).length
                const totalDuration = lessons.reduce((acc, l) => acc + (l.duration_seconds ?? 0), 0)
                return (
                  <CourseProgressCard
                    key={purchase.id}
                    courseSlug={course.slug}
                    title={course.title_ro}
                    thumbnailUrl={course.thumbnail_url}
                    completedLessons={completedCount}
                    totalLessons={lessons.length}
                    totalDurationSeconds={totalDuration}
                  />
                )
              })}
            </div>
          </div>

          {/* Recent activity */}
          {recentActivity.length > 0 && (
            <>
              <Separator />
              <RecentActivityCard activities={recentActivity} />
            </>
          )}

          {/* Descoperă mai mult — upsell grid */}
          {upsellCourses.length > 0 && (
            <>
              <Separator />
              <div className="space-y-4">
                <h2 className="text-base font-semibold">Descoperă mai mult</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {upsellCourses.map((course) => (
                    <UpsellCourseCard
                      key={course.id}
                      slug={course.slug}
                      title={course.title_ro}
                      thumbnailUrl={course.thumbnail_url}
                      priceRon={course.price_ron}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}
