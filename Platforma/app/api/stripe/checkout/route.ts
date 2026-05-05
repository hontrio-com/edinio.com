import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { Database } from '@/types/database'

type CourseRow = Database['public']['Tables']['courses']['Row']
type PurchaseRow = Database['public']['Tables']['purchases']['Row']

const checkoutSchema = z.object({
  courseId: z.string().uuid(),
  currency: z.enum(['ron', 'eur']).default('ron'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = checkoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { courseId, currency } = parsed.data
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: courseData } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .maybeSingle()

    const course = courseData as CourseRow | null
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Duplicate purchase check for logged-in users
    if (user) {
      const { data: existingData } = await supabase
        .from('purchases')
        .select('id')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .eq('status', 'completed')
        .maybeSingle()

      const existing = existingData as Pick<PurchaseRow, 'id'> | null
      if (existing) {
        return NextResponse.json({ error: 'Already purchased' }, { status: 409 })
      }
    }

    const priceId =
      currency === 'eur' ? course.stripe_price_id_eur : course.stripe_price_id_ron

    if (!priceId) {
      return NextResponse.json({ error: 'Price not configured' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/multumesc/${course.slug}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/cursuri/${course.slug}`,
      customer_email: user?.email,
      customer_creation: 'always',
      billing_address_collection: 'required',
      locale: 'ro',
      allow_promotion_codes: true,
      metadata: {
        courseId: course.id,
        courseSlug: course.slug,
        courseTitleRo: course.title_ro,
        userId: user?.id ?? '',
      },
      custom_text: {
        submit: {
          message: 'Vei primi acces imediat după plată.',
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
