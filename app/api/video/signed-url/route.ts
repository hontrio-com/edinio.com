import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const SIGNED_URL_EXPIRY = 60 * 60 * 2 // 2 ore
const BUCKET = 'course-videos'

export async function GET(req: NextRequest) {
  const { success, reset } = await rateLimit(req, 'video-url')
  if (!success) return rateLimitResponse(reset)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })

  const lessonId = req.nextUrl.searchParams.get('lessonId')
  if (!lessonId) return NextResponse.json({ error: 'lessonId lipsă' }, { status: 400 })

  const db = getSupabaseAdmin()

  const { data: lesson } = await db
    .from('lessons')
    .select('id, storage_path, course_id, is_preview')
    .eq('id', lessonId)
    .single()

  if (!lesson) return NextResponse.json({ error: 'Lecție negăsită' }, { status: 404 })
  if (!lesson.storage_path) return NextResponse.json({ error: 'Video indisponibil momentan' }, { status: 404 })

  // Verifică purchase dacă nu e preview
  if (!lesson.is_preview) {
    const { data: purchase } = await db
      .from('purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', lesson.course_id)
      .eq('status', 'completed')
      .maybeSingle()

    if (!purchase) {
      // Verifică bundle
      const { data: bundlePurchase } = await db
        .from('bundle_purchases')
        .select('id, bundle_courses!inner(course_id)')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .eq('bundle_courses.course_id', lesson.course_id)
        .maybeSingle()

      if (!bundlePurchase) {
        return NextResponse.json({ error: 'Acces interzis - cumpără cursul pentru acces' }, { status: 403 })
      }
    }
  }

  const { data: signedData, error: signedError } = await db.storage
    .from(BUCKET)
    .createSignedUrl(lesson.storage_path, SIGNED_URL_EXPIRY)

  if (signedError || !signedData?.signedUrl) {
    console.error('[SIGNED URL ERROR]', signedError)
    return NextResponse.json({ error: 'Nu s-a putut genera URL-ul' }, { status: 500 })
  }

  return NextResponse.json({
    url: signedData.signedUrl,
    expiresIn: SIGNED_URL_EXPIRY,
    path: lesson.storage_path,
  })
}
