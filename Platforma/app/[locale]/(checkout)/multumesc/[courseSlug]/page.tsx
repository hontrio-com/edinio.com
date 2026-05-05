import { createClient } from '@/lib/supabase/server'
import { ThankYouHero } from '@/components/checkout/thank-you-hero'
import { UpsellCard } from '@/components/checkout/upsell-card'
import type { Database } from '@/types/database'

type CourseRow = Database['public']['Tables']['courses']['Row']
type BundleRow = Database['public']['Tables']['bundles']['Row']
type BundleCourseRow = Database['public']['Tables']['bundle_courses']['Row']

interface Props {
  params: Promise<{ locale: string; courseSlug: string }>
  searchParams: Promise<{ session_id?: string; currency?: string }>
}

export default async function ThankYouPage({ params, searchParams }: Props) {
  const { courseSlug } = await params
  const { currency = 'ron' } = await searchParams

  const supabase = await createClient()

  const { data: courseData } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', courseSlug)
    .maybeSingle()

  const course = courseData as CourseRow | null

  // Find a published bundle that contains this course for upsell
  let upsellBundle: BundleRow | null = null
  if (course) {
    const { data: bcRaw } = await supabase
      .from('bundle_courses')
      .select('*')
      .eq('course_id', course.id)
      .limit(1)
      .maybeSingle()

    const bcData = bcRaw as BundleCourseRow | null

    if (bcData) {
      const { data: bundleData } = await supabase
        .from('bundles')
        .select('*')
        .eq('id', bcData.bundle_id)
        .eq('is_published', true)
        .maybeSingle()

      upsellBundle = bundleData as BundleRow | null
    }
  }

  return (
    <main className="container max-w-2xl mx-auto px-4 py-12 space-y-12">
      <ThankYouHero
        courseName={course?.title_ro ?? courseSlug}
        courseSlug={courseSlug}
      />

      {upsellBundle && (
        <UpsellCard
          title={`Completează cu: ${upsellBundle.title_ro}`}
          description="Obține acces la toate cursurile din pachet la un preț special."
          features={[
            'Acces la toate cursurile din pachet',
            'Actualizări de conținut incluse',
            'Suport prioritar',
          ]}
          courseId={upsellBundle.id}
          courseSlug={upsellBundle.slug}
          priceRon={upsellBundle.price_ron}
          priceEur={upsellBundle.price_eur}
          currency={currency as 'ron' | 'eur'}
          expiresInSeconds={600}
        />
      )}
    </main>
  )
}
