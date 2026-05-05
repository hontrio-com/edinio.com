import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type Course = Database['public']['Tables']['courses']['Row']

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

export default async function CourseLandingPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  const course = data as Course | null

  if (!course) notFound()

  return (
    <main className="container mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold">{course.title_ro}</h1>
      <p className="text-muted-foreground mt-4">{course.description_ro}</p>
    </main>
  )
}
