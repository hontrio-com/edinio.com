'use client'

import { motion, useInView, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
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
  ShoppingCart,
  Infinity,
} from 'lucide-react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Footer } from '@/components/layout/footer'

// ─── Design tokens (light mode) ──────────────────────────────────────────────

const BG = '#ffffff'
const BG_ALT = '#f4f9f6'

const glass = {
  background: 'rgba(255,255,255,0.8)',
  backdropFilter: 'blur(20px) saturate(160%)',
  WebkitBackdropFilter: 'blur(20px) saturate(160%)',
  border: '1px solid rgba(0,0,0,0.07)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,1)',
  borderRadius: '1.25rem',
}

const glassGreen = {
  background: 'linear-gradient(135deg, rgba(22,163,74,0.06) 0%, rgba(34,197,94,0.03) 100%)',
  backdropFilter: 'blur(20px) saturate(160%)',
  WebkitBackdropFilter: 'blur(20px) saturate(160%)',
  border: '1px solid rgba(22,163,74,0.2)',
  boxShadow: '0 0 60px rgba(22,163,74,0.06), 0 24px 48px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
  borderRadius: '1.5rem',
}

const greenBtn = {
  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  boxShadow: '0 0 24px rgba(34,197,94,0.3), 0 4px 16px rgba(0,0,0,0.12)',
  color: '#fff',
  border: 'none',
  fontWeight: 600,
}

const ghostBtn = {
  background: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.1)',
  color: 'rgba(10,26,15,0.7)',
}

const GREEN = '#16a34a'
const TEXT = '#0a1a0f'
const TEXT_DIM = 'rgba(10,26,15,0.55)'
const TEXT_MUTED = 'rgba(10,26,15,0.38)'

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

// ─── Sticky buy button ────────────────────────────────────────────────────────

function StickyBuyButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 500)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="fixed bottom-0 left-0 right-0 z-50 md:bottom-6 md:left-auto md:right-6 md:w-auto"
        >
          {/* Mobile: full-width bar */}
          <div
            className="md:hidden px-4 py-3"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderTop: '1px solid rgba(0,0,0,0.08)',
            }}
          >
            <Link
              href="/checkout"
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl text-base font-bold tracking-wide transition-all duration-200 active:scale-[0.98]"
              style={greenBtn}
            >
              <ShoppingCart className="size-5" />
              CUMPARA ACUM · 250 LEI
            </Link>
          </div>

          {/* Desktop: floating pill */}
          <Link
            href="/checkout"
            className="hidden md:inline-flex items-center gap-2.5 px-7 py-4 rounded-full text-sm font-bold tracking-wide transition-all duration-200 hover:scale-[1.03] hover:brightness-110 active:scale-[0.97]"
            style={{
              ...greenBtn,
              boxShadow: '0 0 32px rgba(34,197,94,0.4), 0 8px 24px rgba(0,0,0,0.18)',
              borderRadius: '9999px',
            }}
          >
            <ShoppingCart className="size-4" />
            CUMPARA ACUM
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
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
  { n: '01', title: 'Introducere', dur: '5 min', desc: 'Descoperi ce vei crea, ce instrumente vei folosi si ce rezultate poti obtine la finalul cursului.' },
  { n: '02', title: 'Cu ce lucram?', dur: '15 min', desc: 'Prezentare completa a ecosistemului de unelte AI: ce face fiecare platforma, cum se conecteaza intre ele.' },
  { n: '03', title: 'Platforma KIE.AI', dur: '20 min', desc: 'Ghid complet KIE.AI: configurezi contul, inveti interfata si faci primele generari de continut AI.' },
  { n: '04', title: 'Creare avatar', dur: '25 min', desc: 'Creezi primul tau avatar AI personalizat, de la upload-ul imaginii sursa la ajustari fine pentru un rezultat profesional.' },
  { n: '05', title: 'Creare scene cu Nano Banana Pro', dur: '30 min', desc: 'Inveti sa generezi scene video de calitate cinematografica cu Nano Banana Pro, cu prompturi si setari optime.' },
  { n: '06', title: 'Creare videoclipuri cu Google Veo 3.1', dur: '35 min', desc: 'Google Veo 3.1 este cel mai avansat model de generare video. Inveti sa il folosesti la potential maxim.' },
  { n: '07', title: 'Final', dur: '10 min', desc: 'Combini tot ce ai invatat pentru a produce un videoclip complet, de la concept la publicare.' },
]

const testimonials = [
  { name: 'Andrei M.', role: 'Creator de continut', rating: 5, text: 'Am reusit sa creez primul meu videoclip AI in mai putin de 2 ore. Explicatiile sunt clare, practice si la obiect.' },
  { name: 'Diana S.', role: 'Antreprenoare', rating: 5, text: 'Nu credeam ca voi reusi fara experienta tehnica, dar cursul mi-a aratat pas cu pas cum sa folosesc instrumentele. Rezultatele sunt spectaculoase!' },
  { name: 'Mihai T.', role: 'Marketing Manager', rating: 5, text: 'Valoare extraordinara. In alta parte ai plati mult mai mult pentru informatii similare. Recomand cu caldura oricarui om din marketing.' },
  { name: 'Elena C.', role: 'Blogger', rating: 5, text: 'Cursul mi-a deschis o noua perspectiva. Instrumentele prezentate sunt uimitoare si accesibile oricarui incepator.' },
  { name: 'Razvan I.', role: 'Freelancer', rating: 5, text: 'Foarte bine structurat, de la zero la rezultate vizibile. Platforma KIE.AI este extraordinara, nu stiam de ea pana la acest curs.' },
  { name: 'Laura P.', role: 'Profesor', rating: 5, text: 'Am facut cursul impreuna cu fiica mea. Amandoua am reusit sa cream videoclipuri de care suntem mandre. Un curs pentru oricine.' },
]

const faqs = [
  { q: 'Nu am nicio experienta cu AI. Pot urma cursul?', a: 'Da, absolut. Cursul este conceput de la zero pentru incepatori. Nu ai nevoie de cunostinte tehnice sau experienta anterioara cu AI. Daca stii sa folosesti un browser web, esti gata.' },
  { q: 'Cat timp am acces la curs?', a: 'Acces pe viata, inclusiv toate actualizarile viitoare. Platesti o singura data si ai acces oricand, pe orice dispozitiv.' },
  { q: 'Pot invata in ritmul meu?', a: 'Da. Toate lectiile sunt inregistrate video si disponibile 24/7. Poti incepe, pauza si relua oricand. Nu exista termene limita sau sesiuni live obligatorii.' },
  { q: 'Am nevoie de abonamente la platformele prezentate?', a: 'Unele platforme ofera planuri gratuite sau perioade de proba. In curs iti aratam exact ce plan ai nevoie si cum sa minimizezi costurile la inceput.' },
  { q: 'Exista suport daca am intrebari?', a: 'Da. Ai acces la o comunitate privata de cursanti unde poti pune intrebari si primi feedback. Raspundem la toate intrebarile in maxim 24 de ore.' },
  { q: 'Cat dureaza pana vad primele rezultate?', a: 'Dupa prima lectie esti deja functional pe KIE.AI. Dupa intregul curs, in mai putin de 2 ore, poti publica primul tau videoclip generat cu AI.' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: BG, color: TEXT }}>
      <StickyBuyButton />

      {/* ━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        className="relative min-h-[90vh] flex flex-col items-center justify-center pt-28 pb-24 px-4 text-center overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #edfaf3 0%, #ffffff 50%)',
        }}
      >
        {/* Ambient soft circle */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 65%)',
            filter: 'blur(50px)',
          }}
        />
        {/* Subtle grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(22,163,74,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(22,163,74,0.04) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, black 0%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, black 0%, transparent 100%)',
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto w-full">
          {/* Pill badge */}
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
            className="inline-flex items-center gap-2.5 px-5 py-2 mb-10 text-xs font-bold tracking-[0.18em] uppercase"
            style={{
              ...glass,
              borderRadius: '9999px',
              color: GREEN,
              background: 'rgba(255,255,255,0.9)',
            }}
          >
            <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
            Nou · Acces limitat
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.08] tracking-tight mb-7"
            style={{ color: TEXT }}
          >
            Invata sa faci videoclipuri cu{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 60%, #15803d 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Inteligenta Artificiala
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-xl max-w-2xl mx-auto mb-12 leading-relaxed"
            style={{ color: TEXT_DIM }}
          >
            Transforma o idee in videoclip profesional in mai putin de 2 ore. Fara camera, fara actor, fara studio. Doar AI si pasii pe care ti-i arat eu — pas cu pas, de la zero.
          </motion.p>

          {/* Social proof avatars */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex items-center justify-center gap-5 mb-12"
          >
            <div className="flex -space-x-2.5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <img
                  key={n}
                  src={`/testimoniale/r${n}.jpg`}
                  alt={`Student ${n}`}
                  className="size-10 rounded-full object-cover border-[2.5px] border-white"
                  style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
                />
              ))}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Stars />
                <span className="font-bold text-sm" style={{ color: TEXT }}>4.9</span>
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
              className="inline-flex items-center gap-2.5 rounded-xl px-9 py-4 text-base transition-all duration-200 hover:scale-[1.02] hover:brightness-105 active:scale-[0.98]"
              style={greenBtn}
            >
              Vreau acces acum
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="#curriculum"
              className="inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base transition-all duration-200 hover:bg-black/[0.06]"
              style={ghostBtn}
            >
              <Play className="size-4" />
              Vezi curriculum
            </Link>
          </motion.div>

          {/* Lifetime access highlight */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.5 }}
            className="mt-8 inline-flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <div
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full"
              style={{
                background: 'linear-gradient(135deg, rgba(22,163,74,0.08) 0%, rgba(34,197,94,0.05) 100%)',
                border: '1px solid rgba(22,163,74,0.2)',
              }}
            >
              <Infinity className="size-4 shrink-0" style={{ color: GREEN }} />
              <span className="text-sm font-semibold" style={{ color: GREEN }}>
                Platesti o singura data
              </span>
              <span className="w-px h-3.5 bg-green-300" />
              <span className="text-sm font-semibold" style={{ color: GREEN }}>
                Acces pe viata
              </span>
            </div>
            <span className="text-sm font-bold" style={{ color: TEXT }}>250 lei</span>
          </motion.div>
        </div>
      </section>

      {/* ━━ TRUST BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        style={{
          borderTop: '1px solid rgba(0,0,0,0.06)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
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
                style={{ color: 'rgba(10,26,15,0.25)' }}
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
          <motion.h2 variants={item} className="text-4xl sm:text-5xl font-bold leading-tight" style={{ color: TEXT }}>
            Piata s-a schimbat.{' '}
            <span style={{ color: GREEN }}>Tu esti pregatit?</span>
          </motion.h2>
          <motion.p variants={item} className="mt-5 text-lg max-w-2xl mx-auto" style={{ color: TEXT_DIM }}>
            AI-ul a revolutionat productia video. Cei care nu se adapteaza acum vor ramane in urma.
          </motion.p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {problems.map(({ Icon, title, description }) => (
            <motion.div
              key={title}
              variants={item}
              className="p-7 transition-all duration-300 hover:scale-[1.015] hover:shadow-lg"
              style={glass}
            >
              <div
                className="size-12 rounded-xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.15)' }}
              >
                <Icon className="size-5" style={{ color: GREEN }} />
              </div>
              <h3 className="font-bold text-lg mb-2" style={{ color: TEXT }}>{title}</h3>
              <p className="leading-relaxed text-sm" style={{ color: TEXT_DIM }}>{description}</p>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      {/* ━━ NO EXPERIENCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <AnimatedSection className="py-28 max-w-5xl" bg={BG_ALT}>
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <SectionBadge>Accesibil oricui</SectionBadge>
            <motion.h2 variants={item} className="text-4xl sm:text-5xl font-bold leading-tight mb-6" style={{ color: TEXT }}>
              Nu ai nevoie de{' '}
              <span style={{ color: GREEN }}>nicio experienta</span>{' '}
              anterioara
            </motion.h2>
            <motion.p variants={item} className="text-lg leading-relaxed mb-12" style={{ color: TEXT_DIM }}>
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
                  <p className="text-4xl font-bold" style={{ color: GREEN }}>{value}</p>
                  <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>{label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <motion.div variants={containerFast} className="space-y-2.5">
            {features.map((f) => (
              <motion.div
                key={f}
                variants={item}
                className="flex items-center gap-3 px-5 py-3.5 transition-all duration-200 hover:shadow-md"
                style={glass}
              >
                <div
                  className="flex-shrink-0 size-6 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)' }}
                >
                  <Check className="size-3.5" style={{ color: GREEN }} />
                </div>
                <span className="font-medium text-sm" style={{ color: TEXT }}>{f}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </AnimatedSection>

      {/* ━━ CURRICULUM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <AnimatedSection id="curriculum" className="py-28 max-w-3xl">
        <div className="text-center mb-14">
          <SectionBadge>Curriculum</SectionBadge>
          <motion.h2 variants={item} className="text-4xl sm:text-5xl font-bold" style={{ color: TEXT }}>
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
                        style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)', color: GREEN }}
                      >
                        {l.n}
                      </span>
                      <span className="flex-1 font-semibold text-sm">{l.title}</span>
                      <span className="text-xs mr-1" style={{ color: TEXT_MUTED }}>{l.dur}</span>
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
          <motion.h2 variants={item} className="text-4xl sm:text-5xl font-bold" style={{ color: TEXT }}>
            Ce spun <span style={{ color: GREEN }}>studentii nostri</span>
          </motion.h2>
          <motion.div variants={item} className="flex items-center justify-center gap-3 mt-5">
            <Stars />
            <span className="font-bold text-lg" style={{ color: TEXT }}>4.9</span>
            <span className="text-sm" style={{ color: TEXT_MUTED }}>din 500+ recenzii</span>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {testimonials.map((t) => (
            <motion.div
              key={t.name}
              variants={item}
              className="p-6 flex flex-col gap-4 transition-all duration-300 hover:shadow-md"
              style={glass}
            >
              <Stars count={t.rating} />
              <p className="text-sm leading-relaxed flex-1" style={{ color: TEXT_DIM }}>
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="flex items-center gap-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div
                  className="size-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.18)', color: GREEN }}
                >
                  {t.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: TEXT }}>{t.name}</p>
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>{t.role}</p>
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
          <motion.h2 variants={item} className="text-4xl sm:text-5xl font-bold" style={{ color: TEXT }}>
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
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(22,163,74,0.6) 50%, transparent 100%)' }}
          />

          <div className="p-10">
            <p className="text-sm font-bold tracking-widest uppercase text-center mb-8" style={{ color: GREEN }}>
              Cel mai popular · Acces complet
            </p>

            <div className="flex items-end gap-2 justify-center mb-2">
              <span className="text-7xl font-bold tracking-tight" style={{ color: TEXT }}>250</span>
              <span className="text-2xl font-semibold mb-3" style={{ color: TEXT_DIM }}>lei</span>
            </div>
            <p className="text-center mb-10" style={{ color: TEXT_MUTED }}>
              Plata unica · Fara abonament
            </p>

            <div className="grid grid-cols-2 gap-3 mb-10">
              {[
                '7 lectii video', 'Platforma KIE.AI',
                'Avatare AI', 'Workflow complet',
                'Comunitate privata', 'Actualizari gratuite',
                'Orice dispozitiv', 'Acces pe viata',
              ].map((it) => (
                <div key={it} className="flex items-center gap-2.5">
                  <div
                    className="size-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)' }}
                  >
                    <Check className="size-3" style={{ color: GREEN }} />
                  </div>
                  <span className="text-sm" style={{ color: TEXT }}>{it}</span>
                </div>
              ))}
            </div>

            <Link
              href="/checkout"
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl py-4 text-base transition-all duration-200 hover:scale-[1.01] hover:brightness-105 active:scale-[0.98]"
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
          <motion.h2 variants={item} className="text-4xl sm:text-5xl font-bold" style={{ color: TEXT }}>
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
                    <p className="pb-5 text-sm leading-relaxed" style={{ color: TEXT_DIM }}>{faq.a}</p>
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
        style={{ background: 'linear-gradient(180deg, #ffffff 0%, #edfaf3 100%)' }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(22,163,74,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(22,163,74,0.04) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage: 'radial-gradient(ellipse 70% 70% at 50% 100%, black 0%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 100%, black 0%, transparent 100%)',
          }}
        />

        <div className="container mx-auto max-w-3xl relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.75, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <p className="text-xs font-bold tracking-[0.22em] uppercase mb-7" style={{ color: GREEN }}>
              Incepe azi
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold leading-tight mb-6" style={{ color: TEXT }}>
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
                className="inline-flex items-center gap-2.5 rounded-xl px-9 py-4 text-base transition-all duration-200 hover:scale-[1.02] hover:brightness-105 active:scale-[0.98]"
                style={greenBtn}
              >
                Vreau acces acum · 250 lei
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base transition-all duration-200 hover:bg-black/[0.06]"
                style={ghostBtn}
              >
                Am deja cont
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 mt-12 text-sm" style={{ color: TEXT_MUTED }}>
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

      {/* Extra bottom padding on mobile for sticky button */}
      <div className="h-[88px] md:h-0" />

      <Footer />
    </div>
  )
}
