'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { UpsellOffer } from '@/lib/upsell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, BookOpen, ArrowRight } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface OTOCourseCardProps {
  offer: UpsellOffer
  currency: 'ron' | 'eur'
  language: 'ro' | 'en'
  isExpired: boolean
}

export function OTOCourseCard({ offer, currency, language, isExpired }: OTOCourseCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const course = offer.course!

  const price = currency === 'eur' ? offer.discountedPriceEur : offer.discountedPriceRon
  const originalPrice = currency === 'eur' ? course.price_eur : course.price_ron

  async function handleCheckout() {
    setIsLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course.id,
          courseSlug: course.slug,
          currency,
          isUpsell: true,
          discountPercent: offer.discountPercent,
        }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      setIsLoading(false)
    }
  }

  if (isDismissed) return null

  return (
    <div className={cn(
      'relative border-2 rounded-2xl overflow-hidden transition-all',
      isExpired
        ? 'border-border opacity-60'
        : 'border-primary/30 shadow-lg shadow-primary/5'
    )}>
      {!isExpired && (
        <div className="absolute top-3 left-3 z-10">
          <Badge className="gap-1 bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1">
            <Sparkles className="h-3 w-3" />
            -{offer.discountPercent}% · Ofertă unică
          </Badge>
        </div>
      )}

      <div className="flex gap-4 p-5">
        <div className="relative h-24 w-36 rounded-xl overflow-hidden bg-muted shrink-0">
          {course.thumbnail_url ? (
            <Image src={course.thumbnail_url} alt={course.title_ro} fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
              <BookOpen className="h-8 w-8 text-primary/30" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 pt-1">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {language === 'ro' ? 'Cursul următor recomandat' : 'Next recommended course'}
          </p>
          <h3 className="font-semibold text-base leading-snug mb-2">
            {language === 'ro' ? course.title_ro : (course.title_en ?? course.title_ro)}
          </h3>
          {course.description_ro && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {course.description_ro}
            </p>
          )}

          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl font-bold text-foreground">
              {formatPrice(price, currency)}
            </span>
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(originalPrice, currency)}
            </span>
            <span className="text-xs font-medium text-green-600">
              -{formatPrice(currency === 'ron' ? offer.savingsRon : Math.round(offer.savingsRon / 497), currency)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleCheckout}
              disabled={isLoading || isExpired}
              size="sm"
              className="gap-2"
            >
              {isLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ArrowRight className="h-3.5 w-3.5" />
              }
              {isExpired
                ? (language === 'ro' ? 'Ofertă expirată' : 'Offer expired')
                : (language === 'ro' ? 'Da, vreau acest curs!' : 'Yes, I want this course!')
              }
            </Button>
            <button
              onClick={() => setIsDismissed(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              {language === 'ro' ? 'Nu, mulțumesc' : 'No, thanks'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
