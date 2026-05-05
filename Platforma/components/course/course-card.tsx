import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Course } from '@/types/course'

interface Props {
  course: Course
  locale: string
}

export function CourseCard({ course, locale }: Props) {
  const title = locale === 'ro' ? course.title_ro : course.title_en
  const price = locale === 'ro'
    ? `${course.price_ron / 100} RON`
    : `${course.price_eur / 100} EUR`

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardHeader className="p-0">
        {course.thumbnail_url ? (
          <div className="relative aspect-video">
            <Image
              src={course.thumbnail_url}
              alt={title}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="aspect-video bg-muted flex items-center justify-center">
            <span className="text-muted-foreground text-sm">Edinio</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-4">
        <h3 className="font-semibold text-lg leading-tight">{title}</h3>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex items-center justify-between">
        <Badge variant="secondary" className="text-sm font-semibold">
          {price}
        </Badge>
        <Link href={`/cursuri/${course.slug}`} className={cn(buttonVariants({ size: 'sm' }))}>
          Vezi cursul
        </Link>
      </CardFooter>
    </Card>
  )
}
