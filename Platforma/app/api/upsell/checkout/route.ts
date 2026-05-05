import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function ensureCoupon(couponId: string, discountPercent: number) {
  try {
    await stripe.coupons.retrieve(couponId)
  } catch {
    await stripe.coupons.create({
      id: couponId,
      percent_off: discountPercent,
      duration: 'once',
      name: `Upsell Email -${discountPercent}%`,
    })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const courseId = searchParams.get('courseId')
  const bundleId = searchParams.get('bundleId')
  const currency = (searchParams.get('currency') ?? 'ron') as 'ron' | 'eur'
  const discount = parseInt(searchParams.get('discount') ?? '20')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const db = getSupabaseAdmin()
  let priceId: string | null = null
  let successUrl: string
  let cancelUrl: string

  if (courseId) {
    const { data: course } = await db
      .from('courses')
      .select('stripe_price_id_ron, stripe_price_id_eur, slug')
      .eq('id', courseId)
      .single()

    priceId = currency === 'eur' ? course?.stripe_price_id_eur : course?.stripe_price_id_ron
    successUrl = `${appUrl}/multumesc/${course?.slug}?session_id={CHECKOUT_SESSION_ID}`
    cancelUrl = `${appUrl}/cursuri/${course?.slug}`
  } else if (bundleId) {
    const { data: bundle } = await db
      .from('bundles')
      .select('stripe_price_id_ron, stripe_price_id_eur, slug')
      .eq('id', bundleId)
      .single()

    priceId = currency === 'eur' ? bundle?.stripe_price_id_eur : bundle?.stripe_price_id_ron
    successUrl = `${appUrl}/multumesc/bundle-${bundle?.slug}?session_id={CHECKOUT_SESSION_ID}`
    cancelUrl = `${appUrl}/dashboard`
  } else {
    return NextResponse.redirect(`${appUrl}/dashboard`)
  }

  if (!priceId) return NextResponse.redirect(`${appUrl}/dashboard`)

  const couponId = `upsell_${discount}pct`
  await ensureCoupon(couponId, discount)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    discounts: [{ coupon: couponId }],
    success_url: successUrl!,
    cancel_url: cancelUrl!,
    customer_creation: 'always',
    billing_address_collection: 'required',
    locale: 'ro',
    metadata: {
      courseId: courseId ?? '',
      bundleId: bundleId ?? '',
      currency,
      isUpsellEmail: 'true',
    },
  })

  return NextResponse.redirect(session.url!)
}
