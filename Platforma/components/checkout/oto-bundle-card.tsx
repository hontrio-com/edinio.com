'use client'

import { useState } from 'react'
import type { UpsellOffer } from '@/lib/upsell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Package, CheckCircle2, Crown } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface OTOBundleCardProps {
  offer: UpsellOffer
  currency: 'ron' | 'eur'
  language: 'ro' | 'en'
  isExpired: boolean
}

export function OTOBundleCard({ offer, currency, language, isExpired }: OTOBundleCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const bundle = offer.bundle!

  const price = currency === 'eur' ? offer.discountedPriceEur : offer.discountedPriceRon
  const originalPrice = currency === 'eur' ? bundle.price_eur : bundle.price_ron

  const BUNDLE_INCLUDES =
    language === 'ro'
      ? ['Videoclipuri cu AI', 'Automatizări cu AI', 'Website-uri cu AI', 'Acces lifetime + update-uri']
      : ['AI Video Creation', 'AI Automation', 'AI Websites', 'Lifetime access + updates']

  async function handleCheckout() {
    setIsLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundleId: bundle.id,
          bundleSlug: bundle.slug,
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
        : 'border-amber-300 bg-amber-50/30'
    )}>
      {!isExpired && (
        <div className="absolute top-3 right-3">
          <Badge className="gap-1 bg-amber-500 text-white text-xs font-semibold px-2.5 py-1">
            <Crown className="h-3 w-3" />
            Best Value
          </Badge>
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-xl bg-amber-100 shrink-0">
            <Package className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-amber-700 mb-0.5">
              {language === 'ro'
                ? `Economisești ${offer.discountPercent}% · Toate cursurile incluse`
                : `Save ${offer.discountPercent}% · All courses included`}
            </p>
            <h3 className="font-semibold text-base">
              {language === 'ro' ? bundle.title_ro : (bundle.title_en ?? bundle.title_ro)}
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {BUNDLE_INCLUDES.map((item) => (
            <div key={item} className="flex items-center gap-1.5 text-xs text-foreground/80">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              {item}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{formatPrice(price, currency)}</span>
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(originalPrice, currency)}
            </span>
            <span className="text-xs font-semibold text-green-600">
              -{formatPrice(offer.savingsRon, 'ron')} economii
            </span>
          </div>
          <Button
            onClick={handleCheckout}
            disabled={isLoading || isExpired}
            className="gap-2 bg-amber-500 hover:bg-amber-600 text-white border-0"
            size="sm"
          >
            {isLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Crown className="h-3.5 w-3.5" />
            }
            {isExpired
              ? (language === 'ro' ? 'Expirat' : 'Expired')
              : (language === 'ro' ? 'Vreau bundle-ul!' : 'Get the bundle!')
            }
          </Button>
        </div>

        {!isExpired && (
          <button
            onClick={() => setIsDismissed(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 mt-2 block"
          >
            {language === 'ro' ? "Nu, rămân cu un singur curs" : "No, I'll keep just one course"}
          </button>
        )}
      </div>
    </div>
  )
}
