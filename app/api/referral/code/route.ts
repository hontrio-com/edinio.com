import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateReferralCode } from '@/lib/referral'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = await getOrCreateReferralCode(user.id)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  return NextResponse.json({ code, url: `${appUrl}?ref=${code}` })
}
