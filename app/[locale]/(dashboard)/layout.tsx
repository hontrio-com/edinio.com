import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { GeoProvider } from '@/lib/geo-context'
import { parseGeoCookie, GEO_COOKIE } from '@/lib/geo'
import type { GeoContext } from '@/lib/geo'
import type { Database } from '@/types/database'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name, email, avatar_url, preferred_language')
    .eq('id', user.id)
    .maybeSingle()

  const profile = profileData as Pick<
    ProfileRow,
    'full_name' | 'email' | 'avatar_url'
  > | null

  const cookieStore = await cookies()
  const geoCookie = cookieStore.get(GEO_COOKIE)?.value
  const geo = parseGeoCookie(geoCookie) ?? {
    country: 'RO',
    language: 'ro' as const,
    currency: 'ron' as const,
    isRomania: true,
  }

  const userLanguage = (profileData as any)?.preferred_language as 'ro' | 'en' | null
  const effectiveGeo: GeoContext = userLanguage
    ? {
        ...geo,
        language: userLanguage,
        currency: userLanguage === 'ro' ? 'ron' : 'eur',
        isRomania: userLanguage === 'ro',
      }
    : geo

  const { data: purchasesRaw } = await supabase
    .from('purchases')
    .select('course_id, courses(slug, title_ro)')
    .eq('user_id', user.id)
    .eq('status', 'completed')

  const purchasedCourses = (purchasesRaw ?? [])
    .map((p: any) => ({
      slug: p.courses?.slug ?? '',
      title_ro: p.courses?.title_ro ?? '',
      owned: true,
    }))
    .filter((c) => c.slug)

  return (
    <GeoProvider initialGeo={effectiveGeo}>
      <div className="flex h-screen overflow-hidden bg-background">
        <DashboardSidebar purchasedCourses={purchasedCourses} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <DashboardHeader user={profile} purchasedCourses={purchasedCourses} />
          <main className="flex-1 overflow-y-auto">
            <div className="container max-w-5xl mx-auto px-4 py-4 sm:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </GeoProvider>
  )
}
