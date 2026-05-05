import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildStatsData, parseDateRange } from '@/lib/admin-stats'

export async function GET(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const period = searchParams.get('period') ?? '90d'
  const fromParam = searchParams.get('from') ?? undefined
  const toParam = searchParams.get('to') ?? undefined

  const data = await buildStatsData(supabase, period, fromParam, toParam)
  return NextResponse.json(data)
}
