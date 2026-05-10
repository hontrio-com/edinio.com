import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowRight, Check, Clock, Infinity } from 'lucide-react'
import type { Database } from '@/types/database'

type Course = Database['public']['Tables']['courses']['Row']

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('courses').select('title_ro, description_ro').eq('slug', slug).maybeSingle()
  if (!data) return {}
  return { title: data.title_ro, description: data.description_ro }
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
    <main className="min-h-screen" style={{ backgroundColor: '#f4f9f6' }}>
      {/* Hero cu thumbnail */}
      <section className="container mx-auto px-4 pt-16 pb-12 max-w-5xl">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <div className="space-y-6">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase"
              style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}
            >
              <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
              Acces disponibil
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold leading-tight" style={{ color: '#0a1a0f' }}>
              {course.title_ro}
            </h1>

            {course.description_ro && (
              <p className="text-base leading-relaxed" style={{ color: 'rgba(10,26,15,0.6)' }}>
                {course.description_ro}
              </p>
            )}

            <ul className="space-y-2.5">
              {['7 lecții video', 'Avatare AI personalizate', 'Acces pe viață', 'Actualizări gratuite'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm font-medium" style={{ color: '#0a1a0f' }}>
                  <span className="flex-shrink-0 size-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(22,163,74,0.15)' }}>
                    <Check className="size-3" style={{ color: '#16a34a' }} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-4 pt-2">
              <Link
                href="/checkout"
                className="inline-flex items-center gap-2.5 rounded-xl px-8 py-4 text-base font-bold text-white transition-all duration-200 hover:scale-[1.02] hover:brightness-105 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', boxShadow: '0 0 24px rgba(34,197,94,0.3)' }}
              >
                Vreau acces acum
                <ArrowRight className="size-4" />
              </Link>
            </div>

            <div className="flex items-center gap-4 text-xs" style={{ color: 'rgba(10,26,15,0.45)' }}>
              <span className="flex items-center gap-1.5">
                <Infinity className="size-3.5" />
                Plată unică · Acces pe viață
              </span>
              <span className="font-bold text-sm" style={{ color: '#0a1a0f' }}>250 lei</span>
            </div>
          </div>

          {/* Thumbnail */}
          {course.thumbnail_url && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                boxShadow: '0 24px 60px rgba(22,163,74,0.15), 0 8px 24px rgba(0,0,0,0.1)',
                border: '1px solid rgba(22,163,74,0.15)',
              }}
            >
              <img
                src={course.thumbnail_url}
                alt={course.title_ro}
                className="w-full h-auto block"
              />
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
