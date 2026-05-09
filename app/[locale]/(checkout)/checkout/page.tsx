import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/layout/navbar'
import { CheckoutButton } from '@/components/checkout/checkout-button'
import { Check, Infinity, ShieldCheck, Star } from 'lucide-react'

const GREEN = '#16a34a'
const TEXT = '#0a1a0f'
const TEXT_DIM = 'rgba(10,26,15,0.6)'
const TEXT_MUTED = 'rgba(10,26,15,0.38)'

const INCLUDES = [
  '7 lecții video structurate, de la zero',
  'Creare avatare AI personalizate (KIE.AI)',
  'Generare imagini cu Nano Banana Pro',
  'Videoclipuri cu Google Veo 3.1 și Kling 3.0',
  'Actualizări gratuite pe viață',
  'Acces pe orice dispozitiv, oricând',
]

export default async function CheckoutPage() {
  const supabase = await createClient()

  const { data: course } = await supabase
    .from('courses')
    .select('id, title_ro, slug, price_ron, price_eur, stripe_price_id_ron, stripe_price_id_eur')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!course) redirect('/')

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: existing } = await supabase
      .from('purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', course.id)
      .eq('status', 'completed')
      .maybeSingle()
    if (existing) redirect('/dashboard')
  }

  const priceRon = course.price_ron ?? 250

  return (
    <>
      <Navbar />
      <main
        className="min-h-screen py-16 px-4"
        style={{ background: 'linear-gradient(160deg, #edfaf3 0%, #ffffff 40%)' }}
      >
        <div className="container mx-auto max-w-5xl">
          {/* Header */}
          <div className="text-center mb-12">
            <p className="text-xs font-bold tracking-[0.22em] uppercase mb-3" style={{ color: GREEN }}>
              Acces complet · Plată unică
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4" style={{ color: TEXT }}>
              Finalizează comanda
            </h1>
            <p className="text-lg" style={{ color: TEXT_DIM }}>
              Ești la un pas de acces complet la{' '}
              <strong style={{ color: TEXT }}>{course.title_ro}</strong>
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-6 items-start">
            {/* Order Summary */}
            <div
              className="md:col-span-3 rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(0,0,0,0.07)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,1)',
              }}
            >
              {/* Course name */}
              <div className="p-7" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <p className="text-xs font-bold tracking-[0.18em] uppercase mb-2" style={{ color: TEXT_MUTED }}>
                  Comanda ta
                </p>
                <p className="text-xl font-bold mb-2" style={{ color: TEXT }}>{course.title_ro}</p>
                <div className="flex items-center gap-1.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="size-3.5 fill-yellow-400 text-yellow-400" />
                  ))}
                  <span className="text-xs font-semibold ml-1" style={{ color: TEXT_DIM }}>
                    4.9 · 500+ cursanți
                  </span>
                </div>
              </div>

              {/* What's included */}
              <div className="p-7">
                <p className="text-xs font-bold tracking-[0.18em] uppercase mb-5" style={{ color: TEXT_MUTED }}>
                  Ce primești
                </p>
                <ul className="space-y-3">
                  {INCLUDES.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div
                        className="flex-shrink-0 size-5 rounded-full flex items-center justify-center mt-0.5"
                        style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)' }}
                      >
                        <Check className="size-3" style={{ color: GREEN }} />
                      </div>
                      <span className="text-sm leading-snug" style={{ color: TEXT_DIM }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Lifetime badge */}
              <div
                className="mx-7 mb-7 flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.18)' }}
              >
                <Infinity className="size-5 flex-shrink-0" style={{ color: GREEN }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: GREEN }}>Acces pe viață</p>
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>
                    Platești o singură dată, ai acces pentru totdeauna
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Box */}
            <div className="md:col-span-2 space-y-4">
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.9)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(22,163,74,0.2)',
                  boxShadow: '0 0 40px rgba(22,163,74,0.08), 0 4px 24px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,1)',
                }}
              >
                <div
                  className="h-[2px] w-full"
                  style={{ background: 'linear-gradient(90deg, transparent, #22c55e 40%, #16a34a 60%, transparent)' }}
                />

                <div className="p-7">
                  <p className="text-xs font-bold tracking-widest uppercase text-center mb-5" style={{ color: GREEN }}>
                    Total de plată
                  </p>

                  <div className="text-center mb-2">
                    <span className="text-6xl font-bold tracking-tight" style={{ color: TEXT }}>
                      {priceRon}
                    </span>
                    <span className="text-2xl font-semibold ml-1.5" style={{ color: TEXT_DIM }}>lei</span>
                  </div>
                  <p className="text-center text-xs mb-8" style={{ color: TEXT_MUTED }}>
                    TVA inclus · Plată unică · Fără abonament
                  </p>

                  <CheckoutButton courseId={course.id} currency="ron" label="Mergi la plată" />
                </div>
              </div>

              {/* Trust signals */}
              <div
                className="rounded-2xl p-5 space-y-3"
                style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)' }}
              >
                {[
                  { Icon: ShieldCheck, text: 'Plată criptată SSL/TLS — datele cardului nu trec prin serverele noastre' },
                  { Icon: Check, text: 'Procesator: Stripe — certificat PCI-DSS nivel 1' },
                  { Icon: Infinity, text: 'Acces activat automat imediat după confirmare' },
                ].map(({ Icon, text }, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Icon className="size-4 flex-shrink-0 mt-0.5" style={{ color: GREEN }} />
                    <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>{text}</p>
                  </div>
                ))}
              </div>

              {!user && (
                <p className="text-center text-xs" style={{ color: TEXT_MUTED }}>
                  Ai deja cont?{' '}
                  <a href="/auth/login" className="underline underline-offset-2" style={{ color: GREEN }}>
                    Autentifică-te
                  </a>{' '}
                  înainte de plată.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
