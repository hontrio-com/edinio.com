import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MIN_PAYOUT_RON } from '@/lib/referral'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { z } from 'zod'

const schema = z.object({
  amount: z.number().min(MIN_PAYOUT_RON),
  method: z.enum(['bank', 'paypal']),
  iban: z.string().optional(),
  paypal_email: z.string().email().optional(),
})

export async function POST(req: NextRequest) {
  const { success, reset } = await rateLimit(req, 'payout')
  if (!success) return rateLimitResponse(reset)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { amount, method, iban, paypal_email } = parsed.data

  const { data: balance } = await supabase
    .from('referral_balance')
    .select('available_balance')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!balance || (balance.available_balance ?? 0) < amount) {
    return NextResponse.json({ error: 'Balanță insuficientă' }, { status: 400 })
  }

  const { error } = await supabase.from('payout_requests').insert({
    user_id: user.id,
    amount,
    iban: method === 'bank' ? iban : null,
    paypal_email: method === 'paypal' ? paypal_email : null,
    status: 'pending',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.rpc('reserve_payout_balance', { p_user_id: user.id, p_amount: amount })

  return NextResponse.json({ success: true })
}
