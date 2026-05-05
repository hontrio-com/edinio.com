import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function checkAndAwardBadges(userId: string): Promise<string[]> {
  const awarded: string[] = []
  const db = getSupabaseAdmin()

  const [
    { data: purchases },
    { data: progress },
    { data: existingBadges },
    { data: allCourses },
    { data: referrals },
  ] = await Promise.all([
    db.from('purchases').select('id, course_id').eq('user_id', userId).eq('status', 'completed'),
    db.from('lesson_progress').select('lesson_id, completed, last_watched_at').eq('user_id', userId),
    db.from('user_badges').select('badge_id').eq('user_id', userId),
    db.from('courses').select('id, lessons(id)').eq('is_published', true),
    db.from('referral_conversions').select('id').eq('referrer_id', userId).eq('status', 'approved'),
  ])

  const ownedBadgeIds = new Set(existingBadges?.map((b) => b.badge_id) ?? [])
  const purchasedCourseIds = new Set(purchases?.map((p) => p.course_id) ?? [])

  async function award(badgeId: string) {
    if (ownedBadgeIds.has(badgeId)) return
    const { error } = await db.from('user_badges').insert({ user_id: userId, badge_id: badgeId, seen: false })
    if (!error) {
      awarded.push(badgeId)
      ownedBadgeIds.add(badgeId)
    }
  }

  // first_purchase
  if ((purchases?.length ?? 0) >= 1) await award('first_purchase')

  // course_complete
  const completedLessonIds = new Set(progress?.filter((p) => p.completed).map((p) => p.lesson_id) ?? [])
  for (const course of allCourses ?? []) {
    if (!purchasedCourseIds.has(course.id)) continue
    const lessons = (course.lessons as any[]) ?? []
    if (lessons.length > 0 && lessons.every((l: any) => completedLessonIds.has(l.id))) {
      await award('course_complete')
      break
    }
  }

  // all_courses_complete
  const publishedIds = allCourses?.map((c) => c.id) ?? []
  if (publishedIds.length > 0 && publishedIds.every((id) => purchasedCourseIds.has(id))) {
    let allDone = true
    for (const course of allCourses ?? []) {
      const lessons = (course.lessons as any[]) ?? []
      if (!lessons.every((l: any) => completedLessonIds.has(l.id))) { allDone = false; break }
    }
    if (allDone) await award('all_courses')
  }

  // streak_7 / streak_30
  const activityDates = [...new Set(
    progress?.filter((p) => p.last_watched_at).map((p) => new Date(p.last_watched_at).toDateString()) ?? []
  )].map((d) => new Date(d)).sort((a, b) => b.getTime() - a.getTime())

  let streak = 0
  if (activityDates.length > 0) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const mostRecent = new Date(activityDates[0]); mostRecent.setHours(0, 0, 0, 0)
    if (mostRecent >= yesterday) {
      streak = 1
      for (let i = 1; i < activityDates.length; i++) {
        const curr = new Date(activityDates[i]); curr.setHours(0, 0, 0, 0)
        const prev = new Date(activityDates[i - 1]); prev.setHours(0, 0, 0, 0)
        if ((prev.getTime() - curr.getTime()) / 86400000 === 1) streak++
        else break
      }
    }
  }
  if (streak >= 7) await award('streak_7')
  if (streak >= 30) await award('streak_30')

  // referral_first
  if ((referrals?.length ?? 0) >= 1) await award('referral_first')

  return awarded
}
