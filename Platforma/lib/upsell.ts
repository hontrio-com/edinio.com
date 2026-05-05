import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const UPSELL_DISCOUNT_INDIVIDUAL = 0.20
export const UPSELL_DISCOUNT_BUNDLE = 0.30

export interface UpsellCourseData {
  id: string
  slug: string
  title_ro: string
  title_en: string | null
  price_ron: number
  price_eur: number
  thumbnail_url: string | null
  description_ro: string | null
  sort_order: number | null
}

export interface UpsellOffer {
  type: 'course' | 'bundle'
  course?: UpsellCourseData
  bundle?: {
    id: string
    slug: string
    title_ro: string
    title_en: string | null
    price_ron: number
    price_eur: number
  }
  discountPercent: number
  discountedPriceRon: number
  discountedPriceEur: number
  originalPriceRon: number
  savingsRon: number
}

export async function getUpsellOffers(userId: string): Promise<{
  nextCourse: UpsellOffer | null
  bundle: UpsellOffer | null
  unpurchasedCourses: UpsellCourseData[]
}> {
  const db = getSupabaseAdmin()

  const [
    { data: allCourses },
    { data: purchases },
    { data: bundle },
    { data: bundlePurchase },
  ] = await Promise.all([
    db.from('courses')
      .select('id, slug, title_ro, title_en, price_ron, price_eur, thumbnail_url, description_ro, sort_order')
      .eq('is_published', true)
      .order('sort_order'),
    db.from('purchases')
      .select('course_id')
      .eq('user_id', userId)
      .eq('status', 'completed'),
    db.from('bundles')
      .select('id, slug, title_ro, title_en, price_ron, price_eur')
      .eq('is_published', true)
      .maybeSingle(),
    db.from('bundle_purchases')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .maybeSingle(),
  ])

  const purchasedIds = new Set(purchases?.map((p) => p.course_id) ?? [])
  const hasBundleAlready = !!bundlePurchase
  const unpurchasedCourses = ((allCourses ?? []) as UpsellCourseData[]).filter(
    (c) => !purchasedIds.has(c.id)
  )

  const nextCourse = unpurchasedCourses[0] ?? null

  const nextCourseOffer: UpsellOffer | null = nextCourse
    ? {
        type: 'course',
        course: nextCourse,
        discountPercent: Math.round(UPSELL_DISCOUNT_INDIVIDUAL * 100),
        discountedPriceRon: Math.round(nextCourse.price_ron * (1 - UPSELL_DISCOUNT_INDIVIDUAL)),
        discountedPriceEur: Math.round(nextCourse.price_eur * (1 - UPSELL_DISCOUNT_INDIVIDUAL)),
        originalPriceRon: nextCourse.price_ron,
        savingsRon: Math.round(nextCourse.price_ron * UPSELL_DISCOUNT_INDIVIDUAL),
      }
    : null

  const bundleOffer: UpsellOffer | null =
    !hasBundleAlready && bundle
      ? {
          type: 'bundle',
          bundle: bundle as UpsellOffer['bundle'],
          discountPercent: Math.round(UPSELL_DISCOUNT_BUNDLE * 100),
          discountedPriceRon: Math.round(bundle.price_ron * (1 - UPSELL_DISCOUNT_BUNDLE)),
          discountedPriceEur: Math.round(bundle.price_eur * (1 - UPSELL_DISCOUNT_BUNDLE)),
          originalPriceRon: bundle.price_ron,
          savingsRon: Math.round(bundle.price_ron * UPSELL_DISCOUNT_BUNDLE),
        }
      : null

  return { nextCourse: nextCourseOffer, bundle: bundleOffer, unpurchasedCourses }
}

export async function scheduleUpsellEmails(
  userId: string,
  purchaseId: string,
  purchasedCourseId: string
) {
  const db = getSupabaseAdmin()
  const { nextCourse, bundle } = await getUpsellOffers(userId)
  if (!nextCourse && !bundle) return

  const upsellCourseId = nextCourse?.course?.id ?? null
  const bundleId = bundle?.bundle?.id ?? null
  const now = new Date()

  for (const { step, delayHours } of [
    { step: 1, delayHours: 1 },
    { step: 2, delayHours: 24 },
    { step: 3, delayHours: 72 },
  ]) {
    const scheduledAt = new Date(now.getTime() + delayHours * 60 * 60 * 1000)
    await db.from('upsell_emails').upsert(
      {
        user_id: userId,
        trigger_purchase_id: purchaseId,
        course_id: purchasedCourseId,
        upsell_course_id: upsellCourseId,
        bundle_id: bundleId,
        email_step: step,
        scheduled_at: scheduledAt.toISOString(),
        is_sent: false,
      },
      { onConflict: 'user_id,trigger_purchase_id,email_step' }
    )
  }
}
