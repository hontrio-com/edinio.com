'use client'

import { useState, useEffect, useCallback } from 'react'
import type { UpsellOffer } from '@/lib/upsell'
import { OTOCourseCard } from './oto-course-card'
import { OTOBundleCard } from './oto-bundle-card'
import { Separator } from '@/components/ui/separator'

interface OTOUpsellSectionProps {
  nextCourseOffer: UpsellOffer | null
  bundleOffer: UpsellOffer | null
  currency: 'ron' | 'eur'
  language: 'ro' | 'en'
}

const OTO_TIMER_SECONDS = 15 * 60

export function OTOUpsellSection({
  nextCourseOffer,
  bundleOffer,
  currency,
  language,
}: OTOUpsellSectionProps) {
  const [secondsLeft, setSecondsLeft] = useState(OTO_TIMER_SECONDS)
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    if (secondsLeft <= 0) { setIsExpired(true); return }
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { setIsExpired(true); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const formatTime = useCallback((s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }, [])

  if (!nextCourseOffer && !bundleOffer) return null

  return (
    <div className="space-y-4">
      {/* Timer header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {language === 'ro' ? 'Ofertă specială pentru tine' : 'Special offer for you'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {language === 'ro'
              ? 'Disponibilă doar acum, imediat după cumpărare'
              : 'Available only now, right after purchase'}
          </p>
        </div>
        {!isExpired && (
          <div className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-mono font-semibold text-destructive tabular-nums">
              {formatTime(secondsLeft)}
            </span>
          </div>
        )}
      </div>

      {nextCourseOffer && (
        <OTOCourseCard
          offer={nextCourseOffer}
          currency={currency}
          language={language}
          isExpired={isExpired}
        />
      )}

      {bundleOffer && nextCourseOffer && (
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground shrink-0 font-medium">
            {language === 'ro' ? 'sau mai bine' : 'or even better'}
          </span>
          <Separator className="flex-1" />
        </div>
      )}

      {bundleOffer && (
        <OTOBundleCard
          offer={bundleOffer}
          currency={currency}
          language={language}
          isExpired={isExpired}
        />
      )}
    </div>
  )
}
