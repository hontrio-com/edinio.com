import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', req.url))
  }

  const { data: purchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('stripe_session_id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!purchase) {
    return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['invoice'],
    })

    const invoice = session.invoice as { hosted_invoice_url?: string; invoice_pdf?: string } | null
    const invoiceUrl = invoice?.hosted_invoice_url ?? invoice?.invoice_pdf ?? null

    if (invoiceUrl) {
      return NextResponse.redirect(invoiceUrl)
    }

    // Fallback: Stripe receipt from payment intent
    if (typeof session.payment_intent === 'string') {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
        expand: ['latest_charge'],
      })
      const charge = pi.latest_charge as { receipt_url?: string | null } | null
      if (charge?.receipt_url) {
        return NextResponse.redirect(charge.receipt_url)
      }
    }

    return NextResponse.json(
      { error: 'Invoice not available for this purchase' },
      { status: 404 }
    )
  } catch (err) {
    console.error('[INVOICE]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
