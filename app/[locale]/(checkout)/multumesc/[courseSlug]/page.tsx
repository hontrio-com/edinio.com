import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { ThankYouHero } from '@/components/checkout/thank-you-hero'
import { OTOUpsellSection } from '@/components/checkout/oto-upsell-section'
import { getUpsellOffers } from '@/lib/upsell'
import { parseGeoCookie, GEO_COOKIE } from '@/lib/geo'

interface Props {
  params: Promise<{ locale: string; courseSlug: string }>
  searchParams: Promise<{ session_id?: string }>
}

export default async function ThankYouPage({ params }: Props) {
  const { courseSlug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Geo for currency/language
  const cookieStore = await cookies()
  const geo = parseGeoCookie(cookieStore.get(GEO_COOKIE)?.value) ?? {
    currency: 'ron' as const,
    language: 'ro' as const,
    country: 'RO',
    isRomania: true,
  }

  const { data: courseData } = await supabase
    .from('courses')
    .select('title_ro')
    .eq('slug', courseSlug)
    .maybeSingle()

  // OTO offers — only if logged in
  const { nextCourse, bundle } = user
    ? await getUpsellOffers(user.id)
    : { nextCourse: null, bundle: null }

  const hasOffers = !!nextCourse || !!bundle

  return (
    <main className="container max-w-2xl mx-auto px-4 py-12 space-y-10">
      <ThankYouHero
        courseName={courseData?.title_ro ?? courseSlug}
        courseSlug={courseSlug}
      />

      {hasOffers && (
        <OTOUpsellSection
          nextCourseOffer={nextCourse}
          bundleOffer={bundle}
          currency={geo.currency}
          language={geo.language}
        />
      )}
    </main>
  )
}
