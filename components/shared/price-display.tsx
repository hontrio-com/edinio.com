import { cn, formatPrice } from '@/lib/utils'

interface Props {
  priceRon: number
  originalPriceRon?: number
  priceEur: number
  currency: 'ron' | 'eur'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function PriceDisplay({
  priceRon,
  originalPriceRon,
  priceEur,
  currency,
  size = 'md',
  className,
}: Props) {
  const current = formatPrice(currency === 'ron' ? priceRon : priceEur, currency)
  const original =
    originalPriceRon && originalPriceRon > priceRon
      ? formatPrice(originalPriceRon, 'ron')
      : null

  const priceClass = cn(
    'font-bold',
    size === 'sm' && 'text-xl',
    size === 'md' && 'text-2xl',
    size === 'lg' && 'text-4xl',
    className
  )

  return (
    <div className="flex items-baseline gap-2">
      <span className={priceClass}>{current}</span>
      {original && (
        <span className="text-sm text-muted-foreground line-through">{original}</span>
      )}
    </div>
  )
}
