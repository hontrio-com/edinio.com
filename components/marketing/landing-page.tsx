'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  Star,
  Zap,
  TrendingUp,
  Clock,
  BadgeCheck,
  Users,
  BookOpen,
  Play,
} from 'lucide-react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Footer } from '@/components/layout/footer'

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG = '#05100a'
const BG_ALT = '#0a1a0f'

const glass = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(24px) saturate(160%)',
  WebkitBackdropFilter: 'blur(24px) saturate(160%)',
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
  borderRadius: '1.25rem',
}

const glassGreen = {
  background: 'linear-gradient(135deg, rgba(74,222,128,0.08) 0%, rgba(22,163,74,0.03) 100%)',
  backdropFilter: 'blur(24px) saturate(160%)',
  WebkitBackdropFilter: 'blur(24px) saturate(160%)',
  border: '1px solid rgba(74,222,128,0.2)',
  boxShadow: '0 0 80px rgba(74,222,128,0.06), 0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(74,222,128,0.1)',
  borderRadius: '1.5rem',
}

const greenBtn = {
  background: 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)',
  boxShadow: '0 0 32px rgba(74,222,128,0.3), 0 4px 16px rgba(0,0,0,0.4)',
  color: '#fff',
  border: 'none',
  fontWeight: 600,
}

const ghostBtn = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.13)',
  color: 'rgba(240,250,244,0.8)',
}

const GREEN = '#4ade80'
const TEXT = '#f0faf4'
const TEXT_DIM = 'rgba(240,250,244,0.5)'
const TEXT_MUTED = 'rgba(240,250,244,0.35)'

// ─── Animation variants ───────────────────────────────────────────────────────

const item = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.25, 0.1, 0.25, 1] as const },
  },
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const containerFast = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function AnimatedSection({
  id,
  children,
  className = '',
  bg,
}: {
  id?: string
  children: React.ReactNode
  className?: string
  bg?: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <section id={id} style={{ backgroundColor: bg || BG }}>
      <motion.div
        ref={ref}
        className={`container mx-auto px-4 ${className}`}
        variants={container}
        initial="hidden"
        animate={inView ? 'show' : 'hidden'}
      >
        {children}
      </motion.div>
    </section>
  )
}

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      variants={item}
      className="text-xs font-bold tracking-[0.22em] uppercase mb-5"
      style={{ color: GREEN }}
    >
      {children}
    </motion.p>
  )
}

function Stars({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="size-4 fill-yellow-400 text-yellow-400" />
      ))}
    </div>
  )
}

// ─── Data ────────────────────────────────────────────────────────────────────

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
      'Nu e suficient sa stii despre AI. Ai nevoie de un workflow complet, de la idee la videoclip final, gata de publicat.',
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
  'Acces pe orice dispozitiv',
]

const lessons = [
  {
    n: '01',
    title: 'Introducere',
    dur: '5 min',
    desc: 'Descoperi ce vei crea, ce instrumente vei folosi si ce rezultate poti obtine la finalul cursului.',
  },
  {
    n: '02',
    title: 'Cu ce lucram?',
    dur: '15 min',
    desc: 'Prezentare completa a ecosistemului de unelte AI: ce face fiecare platforma, cum se conecteaza intre ele.',
  },
  {
    n: '03',
    title: 'Platforma KIE.AI',
    dur: '20 min',
    desc: 'Ghid complet KIE.AI: configurezi contul, inveti interfata si faci primele generari de continut AI.',
  },
  {
    n: '04',
    title: 'Creare avatar',
    dur: '25 min',
    desc: 'Creezi primul tau avatar AI personalizat, de la upload-ul imaginii sursa la ajustari fine pentru un rezultat profesional.',
  },
  {
    n: '05',
    title: 'Creare scene cu Nano Banana Pro',
    dur: '30 min',
    desc: 'Inveti sa generezi scene video de calitate cinematografica cu Nano Banana Pro, cu prompturi si setari optime.',
  },
  {
    n: '06',
    title: 'Creare videoclipuri cu Google Veo 3.1',
    dur: '35 min',
    desc: 'Google Veo 3.1 este cel mai avansat model de generare video. Inveti sa il folosesti la potential maxim.',
  },
  {
    n: '07',
    title: 'Final',
    dur: '10 min',
    desc: 'Combini tot ce ai invatat pentru a produce un videoclip complet, de la concept la publicare.',
  },
]

const testimonials = [
  {
    name: 'Andrei M.',
    role: 'Creator de continut',
    rating: 5,
    text: 'Am reusit sa creez primul meu videoclip AI in mai putin de 2 ore. Explicatiile sunt clare, practice si la obiect.',
  },
  {
    name: 'Diana S.',
    role: 'Antreprenoare',
    rating: 5,
    text: 'Nu credeam ca voi reusi fara experienta tehnica, dar cursul mi-a aratat pas cu pas cum sa folosesc instrumentele. Rezultatele sunt spectaculoase!',
  },
  {
    name: 'Mihai T.',
    role: 'Marketing Manager',
    rating: 5,
    text: 'Valoare extraordinara. In alta parte ai plati mult mai mult pentru informatii similare. Recomand cu caldura oricarui om din marketing.',
  },
  {
    name: 'Elena C.',
    role: 'Blogger',
    rating: 5,
    text: 'Cursul mi-a deschis o noua perspectiva. Instrumentele prezentate sunt uimitoare si accesibile oricarui incepator.',
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
    text: 'Am facut cursul impreuna cu fiica mea. Amandoua am reusit sa cream videoclipuri de care suntem mandre. Un curs pentru oricine.',
  },
]

const faqs = [
  {
    q: 'Nu am nicio experienta cu AI. Pot urma cursul?',
    a: 'Da, absolut. Cursul este conceput de la zero pentru incepatori. Nu ai nevoie de cunostinte tehnice sau experienta anterioara cu AI. Daca stii sa folosesti un browser web, esti gata.',
  },
  {
    q: 'Cat timp am acces la curs?',
    a: 'Acces pe viata, inclusiv toate actualizarile viitoare. Platesti o singura data si ai acces oricand, pe orice dispozitiv.',
  },
  {
    q: 'Pot invata in ritmul meu?',
    a: 'Da. Toate lectiile sunt inregistrate video si disponibile 24/7. Poti incepe, pauza si relua oricand. Nu exista termene limita sau sesiuni live obligatorii.',
  },
  {
    q: 'Am nevoie de abonamente la platformele prezentate?',
    a: 'Unele platforme ofera planuri gratuite sau perioade de proba. In curs iti aratam exact ce plan ai nevoie si cum sa minimizezi costurile la inceput.',
  },
  {
    q: 'Exista suport daca am intrebari?',
    a: 'Da. Ai acces la o comunitate privata de cursanti unde poti pune intrebari si primi feedback. Raspundem la toate intrebarile in maxim 24 de ore.',
  },
  {
    q: 'Cat dureaza pana vad primele rezultate?',
    a: 'Dupa prima lectie esti deja functional pe KIE.AI. Dupa intregul curs, in mai putin de 2 ore, poti publica primul tau videoclip generat cu AI.',
  },
]

// ─── Component ───────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: BG, color: TEXT }}>

      {/* ━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        className="relative min-h-[92vh] flex flex-col items-center justify-center pt-28 pb-24 px-4 text-center overflow-hidden"
        style={{
          background: `radial-gradient(ellipse 110% 80% at 50% -15%, rgba(74,222,128,0.14) 0%, ${BG} 60%)`,
        }}
      >
        {/* Ambient blob */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(74,222,128,0.05) 0%, transparent 65%)',
            filter: 'blur(60px)',
          }}
        />
        {/* Grid texture */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(74,222,128,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.03) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage: 'radial-gradient(ellipse 80% 80% at 50% 0%, black 0%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 0%, black 0%, transparent 100%)',
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto w-full">
          {/* Pill badge */}
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
            className="inline-flex items-center gap-2.5 px-5 py-2 mb-10 text-xs font-bold tracking-[0.18em] uppercase"
            style={{ ...glass, color: GREEN, borderRadius: '9999px' }}
          >
            <span className="size-1.5 rounded-full bg-[#4ade80] animate-pulse" />
            Nou · Acces limitat
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.08] tracking-tight mb-7"
          >
            Creaza videoclipuri{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #86efac 0%, #4ade80 45%, #22c55e 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              profesionale
            </span>
            <br />
            cu Inteligenta Artificiala
          </motion.h1>

          {/* Sub */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-xl max-w-2xl mx-auto mb-12 leading-relaxed"
            style={{ color: TEXT_DIM }}
          >
            Transforma orice idee intr-un videoclip de calitate profesionala in cateva minute.
            Fara studio, fara echipa, fara experienta anterioara.
          </motion.p>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex items-center justify-center gap-5 mb-12"
          >
            <div className="flex -space-x-2.5">
              {['AM', 'DS', 'MT', 'EC', 'RI'].map((ini, i) => (
                <div
                  key={i}
                  className="size-10 rounded-full border-[2px] flex items-center justify-center text-[10px] font-bold text-white"
                  style={{
                    backgroundColor: ['#15803d', '#166534', '#14532d', '#16a34a', '#22c55e'][i],
                    borderColor: BG,
                  }}
                >
                  {ini}
                </div>
              ))}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Stars />
                <span className="font-bold text-sm">4.9</span>
              </div>
              <p className="text-xs" style={{ color: TEXT_MUTED }}>
                500+ cursanti multumiti
              </p>
            </div>
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/checkout"
              className="inline-flex items-center gap-2.5 rounded-xl px-9 py-4 text-base transition-all duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
              style={greenBtn}
            >
              Vreau acces acum
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="#curriculum"
              className="inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base transition-all duration-200 hover:brightness-125"
              style={ghostBtn}
            >
              <Play className="size-4" />
              Vezi curriculum
            </Link>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.5 }}
            className="mt-6 text-sm"
            style={{ color: TEXT_MUTED }}
          >
            Acces complet{' '}
            <span style={{ color: TEXT, fontWeight: 700 }}>250 lei</span> · plata unica · acces
            pe viata
          </motion.p>
        </div>
      </section>

      {/* ━━ TRUST BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          backgroundColor: BG_ALT,
        }}
      >
        <div className="container mx-auto px-4 py-10">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-7 text-[11px] font-bold tracking-[0.25em] uppercase"
            style={{ color: TEXT_MUTED }}
          >
            Vei folosi cele mai avansate platforme AI
          </motion.p>
          <div className="flex flex-wrap items-center justify-center gap-12">
            {['KIE.AI', 'Google Veo 3.1', 'Nano Banana Pro'].map((name, i) => (
              <motion.span
                key={name}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className="text-xl font-bold"
                style={{ color: 'rgba(255,255,255,0.38)' }}
              >
                {name}
              </motion.span>
            ))}
          </div>
        </div>
      </div>

      {/* ━━ BENEFITS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <AnimatedSection id="beneficii" className="py-28 max-w-5xl">
        <div className="text-center mb-16">
          <SectionBadge>De ce acum?</SectionBadge>
          <motion.h2
            variants={item}
            className="text-4xl sm:text-5xl font-bold leading-tight"
          >
            Piata s-a schimbat.{' '}
            <span style={{ color: GREEN }}>Tu esti pregatit?</span>
          </motion.h2>
          <motion.p
            variants={item}
            className="mt-5 text-lg max-w-2xl mx-auto"
            style={{ color: TEXT_DIM }}
          >
            AI-ul a revolutionat productia video. Cei care nu se adapteaza acum vor ramane
            in urma.
          </motion.p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {problems.map(({ Icon, title, description }) => (
            <motion.div
              key={title}
              variants={item}
              className="p-7 transition-all duration-300 hover:scale-[1.015] hover:brightness-110"
              style={glass}
            >
              <div
                className="size-12 rounded-xl flex items-center justify-center mb-5"
                style={{
                  background: 'rgba(74,222,128,0.1)',
                  border: '1px solid rgba(74,222,128,0.18)',
                }}
              >
                <Icon className="size-5" style={{ color: GREEN }} />
              </div>
              <h3 className="font-bold text-lg mb-2">{title}</h3>
              <p className="leading-relaxed text-sm" style={{ color: TEXT_DIM }}>
                {description}
              </p>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      {/* ━━ NO EXPERIENCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <AnimatedSection className="py-28 max-w-5xl" bg={BG_ALT}>
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <SectionBadge>Accesibil oricui</SectionBadge>
            <motion.h2
              variants={item}
              className="text-4xl sm:text-5xl font-bold leading-tight mb-6"
            >
              Nu ai nevoie de{' '}
              <span style={{ color: GREEN }}>nicio experienta</span>{' '}
              anterioara
            </motion.h2>
            <motion.p
              variants={item}
              className="text-lg leading-relaxed mb-12"
              style={{ color: TEXT_DIM }}
            >
              Cursul este construit special pentru oameni fara background tehnic. Daca stii sa
              folosesti un smartphone, esti deja pregatit sa incepi.
            </motion.p>

            <motion.div variants={containerFast} className="grid grid-cols-3 gap-6">
              {[
                { value: '500+', label: 'Cursanti' },
                { value: '4.9', label: 'Rating' },
                { value: '7', label: 'Lectii' },
              ].map(({ value, label }) => (
                <motion.div key={label} variants={item}>
                  <p className="text-4xl font-bold" style={{ color: GREEN }}>
                    {value}
                  </p>
                  <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>
                    {label}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <motion.div variants={containerFast} className="space-y-2.5">
            {features.map((f) => (
              <motion.div
                key={f}
                variants={item}
                className="flex items-center gap-3 px-5 py-3.5 transition-all duration-200 hover:brightness-110"
                style={glass}
              >
                <div
                  className="flex-shrink-0 size-6 rounded-full flex items-center justify-center"
                  style={{
                    background: 'rgba(74,222,128,0.12)',
                    border: '1px solid rgba(74,222,128,0.22)',
                  }}
                >
                  <Check className="size-3.5" style={{ color: GREEN }} />
                </div>
                <span className="font-medium text-sm" style={{ color: 'rgba(240,250,244,0.85)' }}>
                  {f}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </AnimatedSection>

      {/* ━━ CURRICULUM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <AnimatedSection id="curriculum" className="py-28 max-w-3xl">
        <div className="text-center mb-14">
          <SectionBadge>Curriculum</SectionBadge>
          <motion.h2 variants={item} className="text-4xl sm:text-5xl font-bold">
            Curriculum <span style={{ color: GREEN }}>complet</span>
          </motion.h2>
          <motion.p variants={item} className="mt-5 text-lg" style={{ color: TEXT_DIM }}>
            7 lectii structurate logic, de la zero la un proiect video real gata de publicat.
          </motion.p>
        </div>

        <motion.div variants={containerFast}>
          <Accordion openMultiple defaultValue={['01']}>
            {lessons.map((l) => (
              <motion.div key={l.n} variants={item} className="mb-3">
                <AccordionItem
                  value={l.n}
                  className="overflow-hidden rounded-xl border-0"
                  style={{ ...glass, borderRadius: '0.875rem' }}
                >
                  <AccordionTrigger
                    className="px-5 py-4 w-full text-left hover:no-underline"
                    style={{ color: TEXT }}
                  >
                    <div className="flex items-center gap-4 flex-1 pr-2">
                      <span
                        className="flex-shrink-0 size-9 rounded-full text-sm font-bold flex items-center justify-center"
                        style={{
                          background: 'rgba(74,222,128,0.12)',
                          border: '1px solid rgba(74,222,128,0.22)',
                          color: GREEN,
                        }}
                      >
                        {l.n}
                      </span>
                      <span className="flex-1 font-semibold text-sm">{l.title}</span>
                      <span className="text-xs mr-1" style={{ color: TEXT_MUTED }}>
                        {l.dur}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-5">
                    <p className="pb-4 pl-[52px] text-sm leading-relaxed" style={{ color: TEXT_DIM }}>
                      {l.desc}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>
        </motion.div>
      </AnimatedSection>

      {/* ━━ TESTIMONIALS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <AnimatedSection id="testimoniale" className="py-28 max-w-5xl" bg={BG_ALT}>
        <div className="text-center mb-16">
          <SectionBadge>Recenzii</SectionBadge>
          <motion.h2 variants={item} className="text-4xl sm:text-5xl font-bold">
            Ce spun <span style={{ color: GREEN }}>studentii nostri</span>
          </motion.h2>
          <motion.div
            variants={item}
            className="flex items-center justify-center gap-3 mt-5"
          >
            <Stars />
            <span className="font-bold text-lg">4.9</span>
            <span className="text-sm" style={{ color: TEXT_MUTED }}>
              din 500+ recenzii
            </span>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              variants={item}
              className="p-6 flex flex-col gap-4"
              style={glass}
            >
              <Stars count={t.rating} />
              <p className="text-sm leading-relaxed flex-1" style={{ color: TEXT_DIM }}>
                &ldquo;{t.text}&rdquo;
              </p>
              <div
                className="flex items-center gap-3 pt-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div
                  className="size-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    background: 'rgba(74,222,128,0.12)',
                    border: '1px solid rgba(74,222,128,0.2)',
                    color: GREEN,
                  }}
                >
                  {t.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div>
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>
                    {t.role}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      {/* ━━ PRICING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <AnimatedSection id="pret" className="py-28 max-w-lg">
        <div className="text-center mb-14">
          <SectionBadge>Pret</SectionBadge>
          <motion.h2 variants={item} className="text-4xl sm:text-5xl font-bold">
            Un singur pret.{' '}
            <span style={{ color: GREEN }}>Acces pe viata.</span>
          </motion.h2>
          <motion.p variants={item} className="mt-4 text-lg" style={{ color: TEXT_DIM }}>
            Platesti o singura data si ai acces la tot continutul pentru totdeauna.
          </motion.p>
        </div>

        <motion.div variants={item} className="overflow-hidden" style={glassGreen}>
          {/* Top accent line */}
          <div
            className="h-px w-full"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(74,222,128,0.7) 50%, transparent 100%)',
            }}
          />

          <div className="p-10">
            <p
              className="text-sm font-bold tracking-widest uppercase text-center mb-8"
              style={{ color: GREEN }}
            >
              Cel mai popular · Acces complet
            </p>

            <div className="flex items-end gap-2 justify-center mb-2">
              <span className="text-7xl font-bold tracking-tight">250</span>
              <span
                className="text-2xl font-semibold mb-3"
                style={{ color: TEXT_DIM }}
              >
                lei
              </span>
            </div>
            <p className="text-center mb-10" style={{ color: TEXT_MUTED }}>
              Plata unica · Fara abonament
            </p>

            <div className="grid grid-cols-2 gap-3 mb-10">
              {[
                '7 lectii video',
                'Platforma KIE.AI',
                'Avatare AI',
                'Workflow complet',
                'Comunitate privata',
                'Actualizari gratuite',
                'Orice dispozitiv',
                'Acces pe viata',
              ].map((it) => (
                <div key={it} className="flex items-center gap-2.5">
                  <div
                    className="size-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'rgba(74,222,128,0.12)',
                      border: '1px solid rgba(74,222,128,0.22)',
                    }}
                  >
                    <Check className="size-3" style={{ color: GREEN }} />
                  </div>
                  <span className="text-sm">{it}</span>
                </div>
              ))}
            </div>

            <Link
              href="/checkout"
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl py-4 text-base transition-all duration-200 hover:scale-[1.01] hover:brightness-110 active:scale-[0.98]"
              style={greenBtn}
            >
              Vreau acces acum
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </motion.div>
      </AnimatedSection>

      {/* ━━ FAQ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <AnimatedSection id="faq" className="py-28 max-w-3xl" bg={BG_ALT}>
        <div className="text-center mb-14">
          <SectionBadge>FAQ</SectionBadge>
          <motion.h2 variants={item} className="text-4xl sm:text-5xl font-bold">
            Intrebari <span style={{ color: GREEN }}>frecvente</span>
          </motion.h2>
        </div>

        <motion.div variants={containerFast} className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div key={i} variants={item}>
              <Accordion>
                <AccordionItem
                  value="open"
                  className="overflow-hidden rounded-xl border-0"
                  style={{ ...glass, borderRadius: '0.875rem' }}
                >
                  <AccordionTrigger
                    className="px-6 py-5 text-left font-semibold text-sm hover:no-underline"
                    style={{ color: TEXT }}
                  >
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    <p className="pb-5 text-sm leading-relaxed" style={{ color: TEXT_DIM }}>
                      {faq.a}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </motion.div>
          ))}
        </motion.div>
      </AnimatedSection>

      {/* ━━ FINAL CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        className="py-28 px-4 text-center relative overflow-hidden"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 50% 110%, rgba(74,222,128,0.13) 0%, ${BG} 55%)`,
        }}
      >
        {/* Grid texture bottom */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(74,222,128,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.025) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage:
              'radial-gradient(ellipse 80% 80% at 50% 100%, black 0%, transparent 100%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 80% 80% at 50% 100%, black 0%, transparent 100%)',
          }}
        />

        <div className="container mx-auto max-w-3xl relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.75, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <p
              className="text-xs font-bold tracking-[0.22em] uppercase mb-7"
              style={{ color: GREEN }}
            >
              Incepe azi
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
              Primul tau proiect AI{' '}
              <span style={{ color: GREEN }}>e mai aproape</span> decat crezi
            </h2>
            <p className="text-xl mb-12" style={{ color: TEXT_DIM }}>
              In mai putin de 2 ore parcurgi tot cursul si publici primul tau videoclip creat cu
              Inteligenta Artificiala.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/checkout"
                className="inline-flex items-center gap-2.5 rounded-xl px-9 py-4 text-base transition-all duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
                style={greenBtn}
              >
                Vreau acces acum · 250 lei
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base transition-all duration-200 hover:brightness-125"
                style={ghostBtn}
              >
                Am deja cont
              </Link>
            </div>

            <div
              className="flex flex-wrap items-center justify-center gap-8 mt-12 text-sm"
              style={{ color: TEXT_MUTED }}
            >
              <span className="flex items-center gap-2">
                <Users className="size-4" style={{ color: GREEN }} />
                500+ cursanti
              </span>
              <span className="flex items-center gap-2">
                <Star className="size-4 fill-yellow-400 text-yellow-400" />
                Rating 4.9
              </span>
              <span className="flex items-center gap-2">
                <BookOpen className="size-4" style={{ color: GREEN }} />
                Acces pe viata
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
