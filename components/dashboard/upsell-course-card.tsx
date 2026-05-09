import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface UpsellCourseCardProps {
  slug: string
  title: string
  thumbnailUrl: string | null
  priceRon: number
}

export function UpsellCourseCard({ slug, title, thumbnailUrl, priceRon }: UpsellCourseCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="aspect-video bg-muted relative">
        {thumbnailUrl ? (
          <Image src={thumbnailUrl} alt={title} fill className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-secondary">
            <span className="text-muted-foreground text-xs">Fără imagine</span>
          </div>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-medium text-sm leading-snug mb-3 line-clamp-2">{title}</h3>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">{priceRon} RON</span>
          <Link
            href={`/cursuri/${slug}`}
            className={cn(buttonVariants({ size: 'sm' }))}
          >
            Cumpără
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
