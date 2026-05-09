import { createClient } from '@supabase/supabase-js'
import { customAlphabet } from 'nanoid'
export { REFERRAL_REWARD_RON, REFERRAL_REWARD_EUR, MIN_PAYOUT_RON } from './referral-constants'
import { REFERRAL_REWARD_RON, REFERRAL_REWARD_EUR } from './referral-constants'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const db = getSupabaseAdmin()

  const { data: existing } = await db
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return existing.code

  let code = ''
  let attempts = 0
  do {
    code = `EDN-${nanoid()}`
    const { data } = await db.from('referral_codes').select('id').eq('code', code).maybeSingle()
    if (!data) break
    attempts++
  } while (attempts < 10)

  await db.from('referral_codes').insert({ user_id: userId, code })
  return code
}

export async function processReferral(
  referredUserId: string,
  purchaseId: string,
  currency: 'ron' | 'eur',
  code: string
): Promise<void> {
  if (!code) return
  const db = getSupabaseAdmin()

  const { data: referralCode } = await db
    .from('referral_codes')
    .select('user_id')
    .eq('code', code)
    .maybeSingle()

  if (!referralCode || referralCode.user_id === referredUserId) return

  const { data: existing } = await db
    .from('referral_conversions')
    .select('id')
    .eq('referred_id', referredUserId)
    .maybeSingle()

  if (existing) return

  const rewardAmount = currency === 'eur' ? REFERRAL_REWARD_EUR : REFERRAL_REWARD_RON

  await db.from('referral_conversions').insert({
    referrer_id: referralCode.user_id,
    referred_id: referredUserId,
    purchase_id: purchaseId,
    code,
    reward_amount: rewardAmount,
    reward_currency: currency,
    status: 'approved',
  })

  await db.rpc('increment_referral_balance', {
    p_user_id: referralCode.user_id,
    p_amount: rewardAmount,
  })

  const { checkAndAwardBadges } = await import('./badges')
  await checkAndAwardBadges(referralCode.user_id)
}
