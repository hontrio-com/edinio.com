import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@supabase/supabase-js'
import { sendCAPIEvent } from '@/lib/meta/capi'
import { sendPurchaseConfirmationEmail } from '@/lib/resend/emails'
import { scheduleUpsellEmails } from '@/lib/upsell'
import { checkAndAwardBadges } from '@/lib/badges'
import { processReferral } from '@/lib/referral'
import type Stripe from 'stripe'

// Lazy admin client - avoids build failure with placeholder env vars
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)]
  }
  return password
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { courseId, courseSlug, courseTitleRo, userId, bundleId, referralCode } =
      session.metadata ?? {}

    const db = getSupabaseAdmin()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    const customerEmail = session.customer_details?.email ?? ''
    const customerName = session.customer_details?.name ?? ''

    // Idempotency - skip if session already processed
    const { data: existingPurchase } = await db
      .from('purchases')
      .select('id')
      .eq('stripe_session_id', session.id)
      .maybeSingle()

    if (existingPurchase) {
      return NextResponse.json({ received: true })
    }

    // Resolve or create user
    let resolvedUserId = userId || null
    let isNewUser = false
    let temporaryPassword: string | undefined

    if (!resolvedUserId && customerEmail) {
      // Check if user exists by email
      const { data: existingUserData } = await db.auth.admin.getUserByEmail(customerEmail)
      const existingUser = existingUserData?.user ?? null

      if (existingUser?.id) {
        resolvedUserId = existingUser.id
      } else {
        // Create new account
        temporaryPassword = generatePassword()
        const { data: newUser, error: createError } =
          await db.auth.admin.createUser({
            email: customerEmail,
            password: temporaryPassword,
            email_confirm: true,
            user_metadata: { full_name: customerName },
          })

        if (!createError && newUser.user) {
          resolvedUserId = newUser.user.id
          isNewUser = true
        }
      }
    }

    if (!resolvedUserId) {
      console.error('Webhook: could not resolve user for session', session.id)
      return NextResponse.json({ received: true })
    }

    // Bundle purchase
    if (bundleId) {
      const { data: bundleCourses } = await db
        .from('bundle_courses')
        .select('course_id')
        .eq('bundle_id', bundleId)

      await db.from('bundle_purchases').insert({
        user_id: resolvedUserId,
        bundle_id: bundleId,
        stripe_session_id: session.id,
        amount_paid: session.amount_total ?? 0,
        currency: session.currency ?? 'ron',
        status: 'completed',
      })

      if (bundleCourses?.length) {
        await db.from('purchases').insert(
          bundleCourses.map((bc) => ({
            user_id: resolvedUserId,
            course_id: bc.course_id,
            stripe_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent as string | null,
            amount_paid: 0,
            currency: session.currency ?? 'ron',
            status: 'completed',
          }))
        )
      }
    } else if (courseId) {
      const { data: newPurchase } = await db.from('purchases').insert({
        user_id: resolvedUserId,
        course_id: courseId,
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string | null,
        amount_paid: session.amount_total ?? 0,
        currency: session.currency ?? 'ron',
        status: 'completed',
        referral_code: referralCode || null,
      }).select('id').single()

      // Programează emailuri de upsell + badges + referral
      if (newPurchase?.id) {
        scheduleUpsellEmails(resolvedUserId, newPurchase.id, courseId).catch(console.error)
        if (referralCode) {
          processReferral(resolvedUserId, newPurchase.id, (session.currency ?? 'ron') as 'ron' | 'eur', referralCode).catch(console.error)
        }
      }
      checkAndAwardBadges(resolvedUserId).catch(console.error)
    }

    // Fire Meta CAPI + send email in parallel
    await Promise.all([
      sendCAPIEvent({
        eventName: 'Purchase',
        eventTime: Math.floor(Date.now() / 1000),
        userData: { email: customerEmail },
        customData: {
          value: (session.amount_total ?? 0) / 100,
          currency: (session.currency ?? 'ron').toUpperCase(),
          contentIds: courseId ? [courseId] : bundleId ? [bundleId] : [],
          contentName: courseSlug ?? bundleId ?? '',
        },
      }),
      customerEmail
        ? sendPurchaseConfirmationEmail({
            to: customerEmail,
            customerName: customerName || customerEmail,
            courseName: courseTitleRo ?? courseSlug ?? 'cursul',
            courseSlug: courseSlug ?? '',
            isNewUser,
            temporaryPassword,
            loginUrl: `${appUrl}/auth/login`,
            dashboardUrl: `${appUrl}/dashboard`,
          })
        : Promise.resolve(),
    ])
  }

  return NextResponse.json({ received: true })
}
