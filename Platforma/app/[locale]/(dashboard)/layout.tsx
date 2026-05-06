import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { GeoProvider } from '@/lib/geo-context'
import { parseGeoCookie, GEO_COOKIE } from '@/lib/geo'
import { getUpsellOffers } from '@/lib/upsell'
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

  // Geo from cookie
  const cookieStore = await cookies()
  const geoCookie = cookieStore.get(GEO_COOKIE)?.value
  const geo = parseGeoCookie(geoCookie) ?? {
    country: 'RO',
    language: 'ro' as const,
    currency: 'ron' as const,
    isRomania: true,
  }

  // Profile language preference overrides geo
  const userLanguage = (profileData as any)?.preferred_language as 'ro' | 'en' | null
  const effectiveGeo: GeoContext = userLanguage
    ? {
        ...geo,
        language: userLanguage,
        currency: userLanguage === 'ro' ? 'ron' : 'eur',
        isRomania: userLanguage === 'ro',
      }
    : geo

  // All published courses
  const { data: allCoursesRaw } = await supabase
    .from('courses')
    .select('id, slug, title_ro, title_en')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })

  const allCourses = (allCoursesRaw ?? []) as { id: string; slug: string; title_ro: string; title_en: string | null }[]

  // Purchased course IDs
  const { data: purchasesRaw } = await supabase
    .from('purchases')
    .select('course_id')
    .eq('user_id', user.id)
    .eq('status', 'completed')

  const purchasedIds = new Set(
    (purchasesRaw ?? []).map((p) => (p as { course_id: string }).course_id)
  )

  const purchasedCourses = allCourses
    .filter((c) => purchasedIds.has(c.id))
    .map((c) => ({ slug: c.slug, title_ro: c.title_ro, owned: true }))

  const lockedCourses = allCourses
    .filter((c) => !purchasedIds.has(c.id))
    .slice(0, 3)
    .map((c) => ({ id: c.id, slug: c.slug, title_ro: c.title_ro, title_en: c.title_en }))

  return (
    <GeoProvider initialGeo={effectiveGeo}>
      <div className="flex h-screen overflow-hidden bg-background">
        <DashboardSidebar
          purchasedCourses={purchasedCourses}
          lockedCourses={lockedCourses}
          language={effectiveGeo.language}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <DashboardHeader user={profile} purchasedCourses={purchasedCourses} lockedCourses={lockedCourses} language={effectiveGeo.language} />
          <main className="flex-1 overflow-y-auto">
            <div className="container max-w-6xl mx-auto px-4 py-4 sm:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </GeoProvider>
  )
}
