import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsLayout } from '@/components/settings/settings-layout'

export const metadata = { title: 'Setări - Edinio' }

async function SettingsContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, preferred_language, created_at')
    .eq('id', user.id)
    .single()

  const { data: purchases } = await supabase
    .from('purchases')
    .select(`
      id, amount_paid, currency, purchased_at, stripe_session_id,
      courses (id, title_ro, slug, thumbnail_url)
    `)
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('purchased_at', { ascending: false })

  const notifPrefs = (user.user_metadata?.notification_prefs ?? {
    email_purchase_confirm: true,
    email_new_lesson: true,
    email_tips: true,
    email_promotions: false,
    email_platform_updates: true,
  }) as {
    email_purchase_confirm: boolean
    email_new_lesson: boolean
    email_tips: boolean
    email_promotions: boolean
    email_platform_updates: boolean
  }

  return (
    <SettingsLayout
      profile={profile}
      purchases={(purchases ?? []) as any[]}
      userId={user.id}
      notifPrefs={notifPrefs}
    />
  )
}

function SettingsSkeleton() {
  return (
    <div className="flex gap-8 max-w-4xl">
      <div className="w-[220px] shrink-0 space-y-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
      </div>
      <div className="flex-1 space-y-12">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Setări</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestionează contul și preferințele tale.
        </p>
      </div>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  )
}
