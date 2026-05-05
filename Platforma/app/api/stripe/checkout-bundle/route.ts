import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { Database } from '@/types/database'

type BundleRow = Database['public']['Tables']['bundles']['Row']

const schema = z.object({
  bundleId: z.string().uuid(),
  currency: z.enum(['ron', 'eur']).default('ron'),
  isUpsell: z.boolean().optional(),
  discountPercent: z.number().min(1).max(99).optional(),
})

async function ensureCoupon(discountPercent: number) {
  const couponId = `upsell_${discountPercent}pct`
  try {
    await stripe.coupons.retrieve(couponId)
  } catch {
    await stripe.coupons.create({
      id: couponId,
      percent_off: discountPercent,
      duration: 'once',
      name: `Upsell -${discountPercent}%`,
    })
  }
  return couponId
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { bundleId, currency, isUpsell, discountPercent } = parsed.data
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: bundleData } = await supabase
      .from('bundles')
      .select('*')
      .eq('id', bundleId)
      .maybeSingle()

    const bundle = bundleData as BundleRow | null
    if (!bundle) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
    }

    const priceId =
      currency === 'eur' ? bundle.stripe_price_id_eur : bundle.stripe_price_id_ron

    if (!priceId) {
      return NextResponse.json({ error: 'Price not configured' }, { status: 400 })
    }

    let discounts: { coupon: string }[] = []
    if (isUpsell && discountPercent && discountPercent > 0) {
      const couponId = await ensureCoupon(discountPercent)
      discounts = [{ coupon: couponId }]
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/multumesc/bundle-${bundle.slug}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/bundle/${bundle.slug}`,
      customer_email: user?.email,
      customer_creation: 'always',
      billing_address_collection: 'required',
      locale: 'ro',
      ...(discounts.length > 0
        ? { discounts }
        : { allow_promotion_codes: true }
      ),
      metadata: {
        bundleId: bundle.id,
        bundleSlug: bundle.slug,
        bundleTitleRo: bundle.title_ro,
        userId: user?.id ?? '',
      },
      custom_text: {
        submit: { message: 'Vei primi acces imediat la toate cursurile din pachet.' },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe bundle checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
