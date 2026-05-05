import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendUpsellEmail } from '@/lib/resend/upsell-emails'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: pending } = await db
    .from('upsell_emails')
    .select(`
      id, user_id, email_step, upsell_course_id, bundle_id, course_id,
      profiles:user_id (email, full_name, preferred_language),
      upsell_course:upsell_course_id (title_ro, title_en, slug, price_ron, price_eur),
      bundle:bundle_id (title_ro, title_en, slug, price_ron, price_eur),
      purchased_course:course_id (title_ro, title_en)
    `)
    .eq('is_sent', false)
    .lte('scheduled_at', now)
    .limit(50)

  if (!pending?.length) {
    return NextResponse.json({ sent: 0 })
  }

  const { data: allCourses } = await db
    .from('courses')
    .select('title_ro, title_en')
    .eq('is_published', true)
    .order('sort_order')

  let sentCount = 0

  for (const item of pending) {
    const profile = item.profiles as any
    const upsellCourse = item.upsell_course as any
    const bundle = item.bundle as any
    const purchasedCourse = item.purchased_course as any

    if (!profile?.email) continue

    const language = (profile.preferred_language as 'ro' | 'en') ?? 'ro'
    const currency = language === 'ro' ? 'ron' : 'eur'

    await sendUpsellEmail({
      step: item.email_step as 1 | 2 | 3,
      to: profile.email,
      customerName: profile.full_name || profile.email.split('@')[0],
      purchasedCourseName: language === 'ro' ? purchasedCourse?.title_ro : (purchasedCourse?.title_en ?? purchasedCourse?.title_ro),
      upsellCourseName: language === 'ro' ? upsellCourse?.title_ro : (upsellCourse?.title_en ?? upsellCourse?.title_ro),
      bundleName: language === 'ro' ? bundle?.title_ro : (bundle?.title_en ?? bundle?.title_ro),
      courseNames: (allCourses ?? []).map((c: any) => language === 'ro' ? c.title_ro : (c.title_en ?? c.title_ro)),
      upsellCourseId: item.upsell_course_id ?? undefined,
      upsellCourseSlug: upsellCourse?.slug,
      bundleId: item.bundle_id ?? undefined,
      bundleSlug: bundle?.slug,
      priceRon: upsellCourse?.price_ron ?? 0,
      priceEur: upsellCourse?.price_eur ?? 0,
      bundlePriceRon: bundle?.price_ron ?? 0,
      bundlePriceEur: bundle?.price_eur ?? 0,
      currency,
      language,
    })

    await db
      .from('upsell_emails')
      .update({ is_sent: true, sent_at: new Date().toISOString() })
      .eq('id', item.id)

    sentCount++
  }

  return NextResponse.json({ sent: sentCount, timestamp: now })
}
