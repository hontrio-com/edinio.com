import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export default async function CheckoutPage() {
  const supabase = await createClient()

  const { data: course } = await supabase
    .from('courses')
    .select('id, title_ro, slug, price_ron, stripe_price_id_ron')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!course?.stripe_price_id_ron) redirect('/')

  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: existing } = await supabase
      .from('purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', course.id)
      .eq('status', 'completed')
      .maybeSingle()
    if (existing) redirect('/dashboard')
  }

  const cookieStore = await cookies()
  const referralCode = cookieStore.get('edinio_ref')?.value ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: course.stripe_price_id_ron, quantity: 1 }],
    success_url: `${appUrl}/multumesc/${course.slug}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/`,
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
      referralCode,
    },
    custom_text: {
      submit: { message: 'Vei primi acces imediat după plată.' },
    },
  })

  redirect(session.url!)
}
