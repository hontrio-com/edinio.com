import { NextRequest, NextResponse } from 'next/server'
import { sendPurchaseConfirmationEmail } from '@/lib/resend/emails'

// TEMPORARY - delete after testing
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { to } = await req.json()
  if (!to) return NextResponse.json({ error: 'Missing to' }, { status: 400 })

  try {
    await sendPurchaseConfirmationEmail({
      to,
      customerName: 'Robert Test',
      courseName: 'AI Video Creator',
      courseSlug: 'ai-video-creator',
      isNewUser: true,
      temporaryPassword: 'TestParola123!',
      loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/auth/login`,
      dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    })
    return NextResponse.json({ ok: true, message: `Email trimis la ${to}` })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
