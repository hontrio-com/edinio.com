'use client'

import { useState, useEffect } from 'react'
import { CheckoutButton } from '@/components/course/checkout-button'
import { PriceDisplay } from '@/components/shared/price-display'

interface UpsellCardProps {
  title: string
  description: string
  features: string[]
  courseId: string
  courseSlug: string
  priceRon: number
  originalPriceRon?: number
  priceEur: number
  currency: 'ron' | 'eur'
  expiresInSeconds?: number
}

function useCountdown(seconds: number) {
  const [timeLeft, setTimeLeft] = useState(seconds)

  useEffect(() => {
    if (timeLeft <= 0) return
    const id = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [timeLeft])

  const m = Math.floor(timeLeft / 60)
    .toString()
    .padStart(2, '0')
  const s = (timeLeft % 60).toString().padStart(2, '0')
  return { display: `${m}:${s}`, expired: timeLeft === 0 }
}

export function UpsellCard({
  title,
  description,
  features,
  courseId,
  courseSlug,
  priceRon,
  originalPriceRon,
  priceEur,
  currency,
  expiresInSeconds = 600,
}: UpsellCardProps) {
  const { display, expired } = useCountdown(expiresInSeconds)

  if (expired) return null

  return (
    <section className="border rounded-xl overflow-hidden bg-card shadow-sm">
      {/* Urgency banner */}
      <div className="bg-amber-500 text-white text-center text-sm font-semibold py-2 px-4">
        Ofertă specială — expiră în{' '}
        <span className="font-mono font-bold">{display}</span>
      </div>

      <div className="p-6 sm:p-8">
        <h2 className="text-xl font-bold mb-2">{title}</h2>
        <p className="text-muted-foreground text-sm mb-6">{description}</p>

        <ul className="space-y-2 mb-6">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="text-green-500 mt-0.5 shrink-0">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <PriceDisplay
            priceRon={priceRon}
            originalPriceRon={originalPriceRon}
            priceEur={priceEur}
            currency={currency}
            size="lg"
          />
          <CheckoutButton
            courseId={courseId}
            courseSlug={courseSlug}
            label="Adaugă la comandă"
            size="lg"
            className="w-full sm:w-auto"
          />
        </div>
      </div>
    </section>
  )
}
