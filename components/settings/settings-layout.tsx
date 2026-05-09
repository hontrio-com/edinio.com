'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ProfileSection } from './profile-section'
import { SecuritySection } from './security-section'
import { NotificationsSection } from './notifications-section'
import { SubscriptionSection } from './subscription-section'
import { Separator } from '@/components/ui/separator'

const NAV_ITEMS = [
  { id: 'profil', label: 'Profil' },
  { id: 'securitate', label: 'Securitate' },
  { id: 'notificari', label: 'Notificări' },
  { id: 'abonament', label: 'Abonament' },
]

interface NotifPrefs {
  email_purchase_confirm: boolean
  email_new_lesson: boolean
  email_tips: boolean
  email_promotions: boolean
  email_platform_updates: boolean
}

interface Purchase {
  id: string
  amount_paid: number
  currency: string
  purchased_at: string
  stripe_session_id: string | null
  courses: {
    id: string
    title_ro: string
    slug: string
    thumbnail_url: string | null
  } | null
}

interface SettingsLayoutProps {
  profile: {
    id: string
    full_name: string | null
    email: string | null
    avatar_url: string | null
    preferred_language: string | null
    created_at: string | null
  } | null
  purchases: Purchase[]
  userId: string
  notifPrefs: NotifPrefs
}

export function SettingsLayout({ profile, purchases, userId, notifPrefs }: SettingsLayoutProps) {
  const [activeSection, setActiveSection] = useState('profil')
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    const observers: IntersectionObserver[] = []

    NAV_ITEMS.forEach(({ id }) => {
      const el = sectionRefs.current[id]
      if (!el) return

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id)
        },
        { threshold: 0.3, rootMargin: '-80px 0px -60% 0px' }
      )
      observer.observe(el)
      observers.push(observer)
    })

    return () => observers.forEach((o) => o.disconnect())
  }, [])

  function scrollTo(id: string) {
    const el = sectionRefs.current[id]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveSection(id)
  }

  function setRef(id: string) {
    return (el: HTMLElement | null) => {
      sectionRefs.current[id] = el
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-12">
      {/* Navigare - orizontala pe mobil, verticala pe desktop */}
      <aside className="md:w-[200px] md:shrink-0">
        <nav className="md:sticky md:top-6">
          {/* Mobile: scroll orizontal */}
          <div className="flex md:hidden gap-1 overflow-x-auto pb-1 scrollbar-none">
            {NAV_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap',
                  activeSection === id
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted-foreground hover:text-foreground bg-muted/50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Desktop: vertical */}
          <div className="hidden md:flex flex-col space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 pb-2">
              Navigare
            </p>
            {NAV_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                  activeSection === id
                    ? 'text-foreground font-medium bg-muted/60'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                )}
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0 transition-colors',
                  activeSection === id ? 'bg-foreground' : 'bg-border'
                )} />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </aside>

      {/* Continut sectiuni */}
      <div className="flex-1 min-w-0 space-y-14">
        <section ref={setRef('profil')} id="profil" className="scroll-mt-6">
          <ProfileSection profile={profile} userId={userId} />
        </section>

        <Separator />

        <section ref={setRef('securitate')} id="securitate" className="scroll-mt-6">
          <SecuritySection />
        </section>

        <Separator />

        <section ref={setRef('notificari')} id="notificari" className="scroll-mt-6">
          <NotificationsSection userId={userId} initialPrefs={notifPrefs} />
        </section>

        <Separator />

        <section ref={setRef('abonament')} id="abonament" className="scroll-mt-6">
          <SubscriptionSection purchases={purchases} />
        </section>
      </div>
    </div>
  )
}
