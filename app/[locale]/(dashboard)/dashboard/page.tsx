import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Sparkles } from 'lucide-react'
import { AnimatedProgressCard } from '@/components/dashboard/animated-progress-card'
import { StatsRow } from '@/components/dashboard/stats-row'
import { DailyTipCard } from '@/components/dashboard/daily-tip-card'
import { RecentActivityCard } from '@/components/dashboard/recent-activity-card'
import { UpsellBanner } from '@/components/dashboard/upsell-banner'
import { LockedCourseCard } from '@/components/dashboard/locked-course-card'
import { BadgesSection } from '@/components/dashboard/badges-section'
import { ReferralSection } from '@/components/dashboard/referral-section'
import { DashboardSkeleton } from '@/components/ui/skeletons'
import { getUpsellOffers } from '@/lib/upsell'
import { parseGeoCookie, GEO_COOKIE } from '@/lib/geo'

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

function calcStreak(progressRows: ProgressData[]): number {
  const completedDates = new Set(
    progressRows.filter((p) => p.completed).map((p) => p.last_watched_at.slice(0, 10))
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const cookieStore = await cookies()
  const geo = parseGeoCookie(cookieStore.get(GEO_COOKIE)?.value) ?? {
    currency: 'ron' as const,
    language: 'ro' as const,
    country: 'RO',
    isRomania: true,
  }

  const [purchasesResult, progressResult, upsellResult, badgesResult, referralResult] = await Promise.all([
    supabase
      .from('purchases')
      .select('id, purchased_at, courses ( id, slug, title_ro, thumbnail_url, lessons ( id, duration_seconds ) )')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('purchased_at', { ascending: false }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed, progress_seconds, last_watched_at, lessons ( title_ro, course_id )')
      .eq('user_id', user.id)
      .order('last_watched_at', { ascending: false }),
    getUpsellOffers(user.id),
    Promise.all([
      supabase.from('badge_definitions').select('*').order('sort_order'),
      supabase.from('user_badges').select('*, badge_definitions(*)').eq('user_id', user.id),
    ]),
    Promise.all([
      supabase.from('referral_balance').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('referral_conversions').select('id, reward_amount, reward_currency, status, created_at').eq('referrer_id', user.id).order('created_at', { ascending: false }),
    ]),
  ])

  const purchases = (purchasesResult.data ?? []) as PurchaseData[]
  const progress = (progressResult.data ?? []) as ProgressData[]
  const progressMap = new Map(progress.map((p) => [p.lesson_id, p]))
  const { nextCourse: nextCourseOffer, unpurchasedCourses } = upsellResult

  const [{ data: allBadgesRaw }, { data: userBadgesRaw }] = badgesResult
  const [{ data: balanceRaw }, { data: conversionsRaw }] = referralResult

  const allBadges = (allBadgesRaw ?? []) as any[]
  const earnedBadges = (userBadgesRaw ?? []).map((ub: any) => ({
    ...ub.badge_definitions,
    earned_at: ub.earned_at,
    seen: ub.seen,
  }))

  const balance = balanceRaw as { total_earned: number; available_balance: number; total_paid_out: number } | null
  const conversions = (conversionsRaw ?? []) as any[]

  const totalCourses = purchases.length
  const completedLessons = progress.filter((p) => p.completed).length
  const streak = calcStreak(progress)
  const hasCourses = totalCourses > 0

  const recentActivity = progress
    .filter((p) => p.completed && p.lessons)
    .slice(0, 5)
    .map((p) => ({
      lessonTitle: p.lessons!.title_ro,
      courseTitle:
        purchases.find((pur) => pur.courses?.id === p.lessons?.course_id)?.courses?.title_ro ?? '',
      completedAt: p.last_watched_at,
    }))

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Bună ziua! 👋</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {hasCourses
            ? 'Continuă de unde ai rămas. Progresul tău este salvat.'
            : 'Bine ai venit pe Edinio. Alege primul tău curs și pornește.'}
        </p>
      </div>

      {/* Stats */}
      {hasCourses && (
        <StatsRow totalCourses={totalCourses} completedLessons={completedLessons} streak={streak} />
      )}

      {/* Badges */}
      {allBadges.length > 0 && (
        <BadgesSection
          earnedBadges={earnedBadges}
          allBadges={allBadges}
          language={geo.language}
          userId={user.id}
        />
      )}

      {/* Daily tip */}
      <DailyTipCard />

      {/* Upsell banner */}
      {nextCourseOffer && (
        <UpsellBanner offer={nextCourseOffer} currency={geo.currency} language={geo.language} />
      )}

      {/* Cursurile mele */}
      {hasCourses && (
        <div className="space-y-6 sm:space-y-8">
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Cursurile mele</h2>
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {purchases.map((purchase, i) => {
                const course = purchase.courses
                if (!course) return null
                const lessons = course.lessons ?? []
                const completedCount = lessons.filter((l) => progressMap.get(l.id)?.completed).length
                const totalDuration = lessons.reduce((acc, l) => acc + (l.duration_seconds ?? 0), 0)
                return (
                  <AnimatedProgressCard
                    key={purchase.id}
                    index={i}
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

          {recentActivity.length > 0 && (
            <>
              <Separator />
              <RecentActivityCard activities={recentActivity} />
            </>
          )}
        </div>
      )}

      {/* Cursuri blocate */}
      {unpurchasedCourses.length > 0 && (
        <>
          {hasCourses && <Separator />}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {hasCourses ? 'Extinde-ți cunoștințele' : 'Cursuri disponibile'}
              </h2>
              <Badge variant="outline" className="text-xs gap-1">
                <Sparkles className="h-3 w-3" />
                -20% reducere exclusivă
              </Badge>
            </div>
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {unpurchasedCourses.map((course) => (
                <LockedCourseCard
                  key={course.id}
                  course={course}
                  currency={geo.currency}
                  language={geo.language}
                  discountPercent={20}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Referral program */}
      <Separator />
      <ReferralSection
        balance={balance}
        conversions={conversions}
        language={geo.language}
      />

      {/* Empty state */}
      {!hasCourses && unpurchasedCourses.length === 0 && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Niciun curs disponibil momentan.
        </div>
      )}
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
