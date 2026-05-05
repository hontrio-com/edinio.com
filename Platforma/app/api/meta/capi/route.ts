import { NextRequest, NextResponse } from 'next/server'
import { sendCAPIEvent } from '@/lib/meta/capi'
import { z } from 'zod'

const capiSchema = z.object({
  eventName: z.enum(['Purchase', 'InitiateCheckout', 'ViewContent', 'AddToCart']),
  userData: z.object({
    email: z.string().email().optional(),
    fbp: z.string().optional(),
    fbc: z.string().optional(),
  }),
  customData: z
    .object({
      value: z.number().optional(),
      currency: z.string().optional(),
      contentIds: z.array(z.string()).optional(),
      contentName: z.string().optional(),
    })
    .optional(),
  eventSourceUrl: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = capiSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? undefined
  const ua = req.headers.get('user-agent') ?? undefined

  await sendCAPIEvent({
    ...parsed.data,
    eventTime: Math.floor(Date.now() / 1000),
    userData: {
      ...parsed.data.userData,
      clientIpAddress: ip,
      clientUserAgent: ua,
    },
  })

  return NextResponse.json({ sent: true })
}
