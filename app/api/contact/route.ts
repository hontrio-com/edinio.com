import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, subject, message } = body ?? {}

  if (!name || !email || !subject || !message) {
    return NextResponse.json({ error: 'Câmpuri obligatorii lipsă.' }, { status: 400 })
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: 'Mesajul este prea lung.' }, { status: 400 })
  }

  // Get current user (optional - contact works without auth too)
  let userId: string | null = null
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch {}

  const db = getAdmin()
  const { error } = await db.from('contact_messages').insert({
    name: String(name).slice(0, 100),
    email: String(email).slice(0, 200),
    subject: String(subject).slice(0, 200),
    message: String(message).slice(0, 2000),
    user_id: userId,
  })

  if (error) {
    console.error('[CONTACT]', error)
    return NextResponse.json({ error: 'Eroare la trimitere. Încearcă din nou.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
