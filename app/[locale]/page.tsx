import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Check,
  Star,
  Zap,
  TrendingUp,
  Clock,
  ShieldCheck,
  Users,
  BookOpen,
  ArrowRight,
  BadgeCheck,
} from 'lucide-react'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { CurriculumSection } from '@/components/marketing/curriculum-section'
import { FaqSection } from '@/components/marketing/faq-section'

export const metadata = {
  title: 'Invata sa faci videoclipuri cu Inteligenta Artificiala | Edinio',
  description:
    'Cursul complet pentru a crea videoclipuri profesionale cu AI. Platforma KIE.AI, avatare AI, Google Veo 3.1. 199 lei, acces pe viata.',
}

const problems = [
  {
    Icon: TrendingUp,
    title: 'Costurile s-au prabusit',
    description:
      'Productia video traditionala costa mii de euro. Cu AI obtii rezultate profesionale fara echipa, fara studio, fara experienta tehnica.',
  },
  {
    Icon: Clock,
    title: 'Viteza decide castigatorii',
    description:
      'Companiile care adopta AI acum au un avantaj imens. Fiecare zi in care astepti e o zi in care concurenta o ia inainte.',
  },
  {
    Icon: Zap,
    title: 'Cererea de continut explodeaza',
    description:
      'TikTok, YouTube, Instagram cer continut constant. AI este singura modalitate scalabila de a tine pasul fara sa iti epuizezi bugetul.',
  },
  {
    Icon: BadgeCheck,
    title: 'Fara un sistem, pierzi',
    description:
      'Nu e suficient sa stii despre AI. Ai nevoie de un workflow complet, de la idee la videoclip final gata de publicat.',
  },
]

const features = [
  'Ghid pas cu pas, de la zero',
  'Platforma KIE.AI explicata complet',
  'Creare de avatare AI personalizate',
  'Scene video cu Nano Banana Pro',
  'Videoclipuri cu Google Veo 3.1',
  'Comunitate privata de suport',
  'Actualizari gratuite pe viata',
  'Garantie 14 zile bani inapoi',
]

const testimonials = [
  {
    name: 'Andrei M.',
    role: 'Creator de continut',
    rating: 5,
    text: 'Am reusit sa creez primul meu videoclip AI in mai putin de 2 ore dupa ce am urmat cursul. Explicatiile sunt clare, practice si la obiect.',
  },
  {
    name: 'Diana S.',
    role: 'Antreprenoare',
    rating: 5,
    text: 'Nu credeam ca voi reusi fara experienta tehnica, dar cursul mi-a aratat pas cu pas cum sa folosesc instrumentele AI. Rezultatele sunt spectaculoase!',
  },
  {
    name: 'Mihai T.',
    role: 'Marketing Manager',
    rating: 5,
    text: 'Valoare extraordinara pentru 199 lei. In alta parte ai plati mult mai mult pentru informatii similare. Recomand cu caldura oricarui om din marketing.',
  },
  {
    name: 'Elena C.',
    role: 'Blogger',
    rating: 5,
    text: 'Cursul mi-a deschis o noua perspectiva despre cum se poate crea continut video. Instrumentele prezentate sunt uimitoare si accesibile oricui.',
  },
  {
    name: 'Razvan I.',
    role: 'Freelancer',
    rating: 5,
    text: 'Foarte bine structurat, de la zero la rezultate vizibile. Platforma KIE.AI este extraordinara, nu stiam de ea pana la acest curs.',
  },
  {
    name: 'Laura P.',
    role: 'Profesor',
    rating: 5,
    text: 'Am facut cursul impreuna cu fiica mea. Amandoua am reusit sa cream videoclipuri de care suntem mandre. Un curs pentru oricine, indiferent de varsta.',
  },
]

const includedItems = [
  '7 lectii video pas cu pas',
  'Acces la platforma KIE.AI',
  'Ghid de creare avatare AI',
  'Workflow complet de productie video',
  'Comunitate privata de cursanti',
  'Actualizari gratuite incluse',
  'Acces pe orice dispozitiv',
  'Garantie 14 zile bani inapoi',
]

function StarRating({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="size-4 fill-yellow-400 text-yellow-400" />
      ))}
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white pt-20 pb-24">
        {/* subtle radial glow */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 70% 50% at 50% -10%, oklch(0.52 0.17 145 / 0.08) 0%, transparent 70%)',
          }}
        />

        <div className="container mx-auto px-4 text-center max-w-4xl">
          {/* badge */}
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary uppercase tracking-widest mb-8">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            Nou · Acces limitat
          </span>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
            Creaza videoclipuri{' '}
            <span className="text-primary">profesionale</span>
            <br />
            cu Inteligenta Artificiala
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Transforma orice idee intr-un videoclip de calitate profesionala in cateva minute.
            Fara studio, fara echipa, fara experienta anterioara.
          </p>

          {/* social proof avatars */}
          <div className="flex items-center justify-center gap-4 mb-10">
            <div className="flex -space-x-2.5">
              {['AM', 'DS', 'MT', 'EC', 'RI'].map((initials, i) => (
                <div
                  key={i}
                  className="size-9 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white"
                  style={{
                    backgroundColor: [
                      '#16a34a',
                      '#15803d',
                      '#166534',
                      '#14532d',
                      '#052e16',
                    ][i],
                  }}
                >
                  {initials}
                </div>
              ))}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <StarRating />
                <span className="font-bold text-sm">4.9</span>
              </div>
              <p className="text-xs text-muted-foreground">500+ cursanti multumiti</p>
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/checkout"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-13 px-8 text-base font-semibold gap-2'
              )}
            >
              Vreau acces acum
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="#curriculum"
              className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'h-13 px-8 text-base')}
            >
              Vezi curriculum
            </Link>
          </div>

          <p className="mt-5 text-sm text-muted-foreground">
            Acces complet <span className="font-bold text-foreground">199 lei</span> · plata unica ·
            acces pe viata
          </p>
        </div>
      </section>

      {/* ─── TRUST BAR ────────────────────────────────────────────── */}
      <section className="border-y border-border bg-muted/50 py-6">
        <div className="container mx-auto px-4">
          <p className="text-center text-sm text-muted-foreground mb-4 font-medium uppercase tracking-widest text-xs">
            Vei folosi cele mai avansate platforme AI
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {['KIE.AI', 'Google Veo 3.1', 'Nano Banana Pro'].map((name) => (
              <span key={name} className="font-bold text-lg text-foreground/60">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PROBLEMS ─────────────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold tracking-widest text-primary uppercase mb-4">
              De ce acum?
            </span>
            <h2 className="text-4xl font-bold">
              Piata s-a schimbat.{' '}
              <span className="text-primary">Tu esti pregatit?</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
              AI-ul a revolutionat productia video. Cei care nu se adapteaza acum vor ramane
              in urma. Cele care o fac vor cuceri piata.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {problems.map(({ Icon, title, description }) => (
              <div
                key={title}
                className="rounded-2xl border border-border bg-white p-7 hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <div className="size-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <Icon className="size-5 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2">{title}</h3>
                <p className="text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── NO EXPERIENCE NEEDED ─────────────────────────────────── */}
      <section
        className="py-24 text-white"
        style={{ backgroundColor: '#0a1f12' }}
      >
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-block text-xs font-semibold tracking-widest text-primary uppercase mb-4">
                Accesibil oricui
              </span>
              <h2 className="text-4xl font-bold leading-tight mb-6">
                Nu ai nevoie de{' '}
                <span className="text-primary">nicio experienta</span>{' '}
                anterioara
              </h2>
              <p className="text-white/70 text-lg leading-relaxed mb-10">
                Cursul este construit special pentru oameni fara background tehnic. Daca stii sa
                folosesti un smartphone, esti deja pregatit sa incepi.
              </p>

              {/* stats */}
              <div className="grid grid-cols-3 gap-6">
                {[
                  { value: '500+', label: 'Cursanti' },
                  { value: '4.9', label: 'Rating mediu' },
                  { value: '7', label: 'Lectii video' },
                ].map(({ value, label }) => (
                  <div key={label}>
                    <p className="text-3xl font-bold text-primary">{value}</p>
                    <p className="text-sm text-white/60 mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-4"
                >
                  <div className="flex-shrink-0 size-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="size-3.5 text-primary" />
                  </div>
                  <span className="text-white/90 font-medium">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CURRICULUM ───────────────────────────────────────────── */}
      <CurriculumSection />

      {/* ─── TESTIMONIALS ─────────────────────────────────────────── */}
      <section className="py-24 bg-muted/40">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold tracking-widest text-primary uppercase mb-4">
              Recenzii
            </span>
            <h2 className="text-4xl font-bold">
              Ce spun <span className="text-primary">studentii nostri</span>
            </h2>
            <div className="flex items-center justify-center gap-3 mt-5">
              <span className="text-sm font-medium text-muted-foreground">Google Reviews</span>
              <StarRating />
              <span className="font-bold">4.9</span>
              <span className="text-sm text-muted-foreground">(500+ recenzii)</span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl bg-white border border-border p-6 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <StarRating count={t.rating} />
                  <span className="text-xs text-muted-foreground">Verificat</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/80 flex-1">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {t.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ──────────────────────────────────────────────── */}
      <section className="py-24 bg-white" id="pret">
        <div className="container mx-auto px-4 max-w-lg">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-semibold tracking-widest text-primary uppercase mb-4">
              Pret
            </span>
            <h2 className="text-4xl font-bold">
              Un singur pret.{' '}
              <span className="text-primary">Acces pe viata.</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Platesti o singura data si ai acces la tot continutul pentru totdeauna.
            </p>
          </div>

          <div className="relative rounded-3xl border-2 border-primary shadow-xl shadow-primary/10 overflow-hidden">
            {/* top banner */}
            <div className="bg-primary py-2.5 text-center">
              <span className="text-primary-foreground text-sm font-semibold">
                Cel mai popular · Acces complet
              </span>
            </div>

            <div className="p-8 bg-white">
              <div className="flex items-end gap-2 mb-1">
                <span className="text-6xl font-bold">199</span>
                <span className="text-2xl font-semibold mb-3">lei</span>
              </div>
              <p className="text-muted-foreground mb-8">Plata unica · Fara abonament</p>

              <div className="grid grid-cols-2 gap-3 mb-8">
                {includedItems.map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <Check className="size-4 text-primary flex-shrink-0" />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/checkout"
                className={cn(buttonVariants({ size: 'lg' }), 'w-full h-13 text-base font-semibold')}
              >
                Vreau acces acum
              </Link>

              <div className="flex items-center justify-center gap-6 mt-6 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-primary" />
                  Plata securizata Stripe
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-primary" />
                  Garantie 14 zile
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────── */}
      <FaqSection />

      {/* ─── FINAL CTA ────────────────────────────────────────────── */}
      <section
        className="py-24 text-white text-center"
        style={{ backgroundColor: '#0a1f12' }}
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <span className="inline-block text-xs font-semibold tracking-widest text-primary uppercase mb-6">
            Incepe azi
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
            Primul tau proiect AI{' '}
            <span className="text-primary">e mai aproape</span>
            {' '}decat crezi
          </h2>
          <p className="text-white/70 text-xl mb-10 max-w-2xl mx-auto">
            In mai putin de 2 ore parcurgi tot cursul si poti publica primul tau videoclip creat cu
            Inteligenta Artificiala.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/checkout"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-13 px-8 text-base font-semibold gap-2'
              )}
            >
              Vreau acces acum · 199 lei
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/auth/login"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'h-13 px-8 text-base border-white/20 text-white hover:bg-white/10'
              )}
            >
              Am deja cont
            </Link>
          </div>

          <div className="flex items-center justify-center gap-8 mt-10 text-white/50 text-sm">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" />
              Plata securizata
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-4 text-primary" />
              500+ cursanti
            </span>
            <span className="flex items-center gap-1.5">
              <BookOpen className="size-4 text-primary" />
              Acces pe viata
            </span>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
