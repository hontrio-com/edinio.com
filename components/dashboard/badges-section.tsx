'use client'

import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

interface Badge {
  id: string
  name_ro: string
  name_en: string
  description_ro: string
  description_en: string
  icon: string
  color: string
  earned_at?: string
  seen?: boolean
}

interface BadgesSectionProps {
  earnedBadges: Badge[]
  allBadges: Badge[]
  language: 'ro' | 'en'
  userId: string
}

const COLOR_MAP: Record<string, { bg: string; border: string; glow: string }> = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   glow: 'shadow-blue-200' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  glow: 'shadow-green-200' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  glow: 'shadow-amber-200' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', glow: 'shadow-purple-200' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    glow: 'shadow-red-200' },
  zinc:   { bg: 'bg-zinc-50',   border: 'border-zinc-200',   glow: 'shadow-zinc-200' },
}

export function BadgesSection({ earnedBadges, allBadges, language, userId }: BadgesSectionProps) {
  const earnedIds = new Set(earnedBadges.map((b) => b.id))
  const unseenBadges = earnedBadges.filter((b) => !b.seen)
  const supabase = createClient()

  async function markAllSeen() {
    if (unseenBadges.length === 0) return
    await supabase.from('user_badges').update({ seen: true }).eq('user_id', userId).eq('seen', false)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-medium">
            {language === 'ro' ? 'Badge-uri' : 'Badges'}
          </h2>
          {unseenBadges.length > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-primary text-primary-foreground rounded-full"
            >
              {unseenBadges.length}
            </motion.span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {earnedBadges.length}/{allBadges.length} {language === 'ro' ? 'obținute' : 'earned'}
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3" onMouseEnter={markAllSeen}>
        {allBadges.map((badge) => {
          const isEarned = earnedIds.has(badge.id)
          const isNew = unseenBadges.some((b) => b.id === badge.id)
          const colors = COLOR_MAP[badge.color] ?? COLOR_MAP.zinc

          return (
            <motion.div
              key={badge.id}
              initial={isNew ? { scale: 0.8, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={isEarned ? { scale: 1.05, y: -2 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="relative group"
            >
              <div className={[
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all',
                isEarned
                  ? `${colors.bg} ${colors.border} shadow-sm${isNew ? ` shadow-md ${colors.glow}` : ''}`
                  : 'bg-zinc-50 border-zinc-100 opacity-40 grayscale',
              ].join(' ')}>
                {isNew && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full border-2 border-background"
                  />
                )}
                <span className="text-2xl leading-none">{badge.icon}</span>
                <span className="text-[10px] font-medium text-center leading-tight text-foreground/80">
                  {language === 'ro' ? badge.name_ro : badge.name_en}
                </span>
              </div>

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-foreground text-background text-[11px] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center shadow-lg">
                <p className="font-medium mb-0.5">
                  {language === 'ro' ? badge.name_ro : badge.name_en}
                </p>
                <p className="opacity-75">
                  {language === 'ro' ? badge.description_ro : badge.description_en}
                </p>
                {isEarned && badge.earned_at && (
                  <p className="opacity-50 mt-1">
                    {new Date(badge.earned_at).toLocaleDateString('ro-RO', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                )}
                {!isEarned && (
                  <p className="opacity-50 mt-1">
                    {language === 'ro' ? 'Neobținut' : 'Not earned yet'}
                  </p>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
