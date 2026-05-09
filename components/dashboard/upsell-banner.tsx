'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { UpsellOffer } from '@/lib/upsell'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, Sparkles, Lock } from 'lucide-react'
import { formatPrice, cn } from '@/lib/utils'

interface UpsellBannerProps {
  offer: UpsellOffer
  currency: 'ron' | 'eur'
  language: 'ro' | 'en'
}

export function UpsellBanner({ offer, currency, language }: UpsellBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const isBundle = offer.type === 'bundle'
  const title = isBundle
    ? (language === 'ro' ? offer.bundle!.title_ro : (offer.bundle!.title_en ?? offer.bundle!.title_ro))
    : (language === 'ro' ? offer.course!.title_ro : (offer.course!.title_en ?? offer.course!.title_ro))

  const price = currency === 'eur' ? offer.discountedPriceEur : offer.discountedPriceRon
  const targetSlug = isBundle ? `/cursuri/bundle` : `/cursuri/${offer.course!.slug}`

  return (
    <div className="relative flex items-center gap-4 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
      <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
        {isBundle
          ? <Sparkles className="h-4 w-4 text-primary" />
          : <Lock className="h-4 w-4 text-primary" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {language === 'ro' ? `Deblochează: ${title}` : `Unlock: ${title}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {language === 'ro'
            ? `Reducere exclusivă -${offer.discountPercent}% · `
            : `Exclusive discount -${offer.discountPercent}% · `}
          <span className="font-semibold text-foreground">{formatPrice(price, currency)}</span>
          {' '}
          <span className="line-through">{formatPrice(offer.originalPriceRon, 'ron')}</span>
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 hidden sm:flex border-destructive/30 text-destructive">
          -{offer.discountPercent}%
        </Badge>
        <Link
          href={targetSlug}
          className={cn(buttonVariants({ size: 'sm' }), 'h-8 text-xs gap-1.5')}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {language === 'ro' ? 'Vezi oferta' : 'See offer'}
        </Link>
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
