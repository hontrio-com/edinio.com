import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAndAwardBadges } from '@/lib/badges'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const { success, reset } = await rateLimit(req, 'badges')
  if (!success) return rateLimitResponse(reset)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const awarded = await checkAndAwardBadges(user.id)
  return NextResponse.json({ awarded })
}
