'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Lock, Sparkles, Loader2 } from 'lucide-react'
import { formatPrice } from '@/lib/utils'

interface LockedCourseCardProps {
  course: {
    id: string
    slug: string
    title_ro: string
    title_en: string | null
    thumbnail_url: string | null
    description_ro: string | null
    price_ron: number
    price_eur: number
  }
  currency: 'ron' | 'eur'
  language: 'ro' | 'en'
  discountPercent?: number
}

export function LockedCourseCard({ course, currency, language, discountPercent = 20 }: LockedCourseCardProps) {
  const [isLoading, setIsLoading] = useState(false)

  const originalPrice = currency === 'eur' ? course.price_eur : course.price_ron
  const discountedPrice = Math.round(originalPrice * (1 - discountPercent / 100))
  const savingsSmallestUnit = originalPrice - discountedPrice
  const title = language === 'ro' ? course.title_ro : (course.title_en ?? course.title_ro)

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
          discountPercent,
        }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      setIsLoading(false)
    }
  }

  return (
    <Card className="overflow-hidden flex flex-col group relative border hover:border-primary/30 hover:shadow-md transition-all duration-200">
      <div className="relative aspect-video bg-muted overflow-hidden">
        {course.thumbnail_url ? (
          <Image
            src={course.thumbnail_url}
            alt={title}
            fill
            className="object-cover filter blur-[3px] brightness-50 scale-105 transition-transform group-hover:scale-110"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/50" />
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="p-3 rounded-full bg-background/90 backdrop-blur-sm shadow-lg">
            <Lock className="h-6 w-6 text-foreground" />
          </div>
          <Badge className="bg-primary text-primary-foreground text-xs font-semibold shadow-sm gap-1">
            <Sparkles className="h-3 w-3" />
            -{discountPercent}% ofertă specială
          </Badge>
        </div>
      </div>

      <CardContent className="flex-1 p-4 space-y-2">
        <h3 className="font-medium text-sm leading-snug">{title}</h3>
        {course.description_ro && (
          <p className="text-xs text-muted-foreground line-clamp-2">{course.description_ro}</p>
        )}

        <div className="flex items-baseline gap-2 pt-1">
          <span className="text-base font-bold text-foreground">
            {formatPrice(discountedPrice, currency)}
          </span>
          <span className="text-xs text-muted-foreground line-through">
            {formatPrice(originalPrice, currency)}
          </span>
          <span className="text-xs text-green-600 font-medium ml-auto">
            -{Math.round(savingsSmallestUnit / 100)} RON
          </span>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button className="w-full gap-2" size="sm" onClick={handleCheckout} disabled={isLoading}>
          {isLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Lock className="h-3.5 w-3.5" />
          }
          {language === 'ro' ? 'Deblochează cursul' : 'Unlock course'}
        </Button>
      </CardFooter>
    </Card>
  )
}
