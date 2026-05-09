import Link from 'next/link'
import Image from 'next/image'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { PlayCircle, Clock, BookOpen } from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CourseProgressCardProps {
  courseSlug: string
  title: string
  thumbnailUrl: string | null
  completedLessons: number
  totalLessons: number
  totalDurationSeconds: number
}

export function CourseProgressCard({
  courseSlug,
  title,
  thumbnailUrl,
  completedLessons,
  totalLessons,
  totalDurationSeconds,
}: CourseProgressCardProps) {
  const progressPercent =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  const isCompleted = progressPercent === 100
  const hasStarted = completedLessons > 0

  return (
    <Card className="overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
            <BookOpen className="h-12 w-12 text-primary/30" />
          </div>
        )}
        {isCompleted && (
          <div className="absolute top-2 right-2">
            <Badge
              variant="secondary"
              className="bg-green-100 text-green-700 border-green-200"
            >
              Finalizat
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="flex-1 p-4 space-y-3">
        <h3 className="font-medium text-sm leading-snug line-clamp-2">{title}</h3>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {completedLessons}/{totalLessons} lecții
            </span>
            <span>{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(totalDurationSeconds)}
          </span>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Link
          href={`/curs/${courseSlug}`}
          className={cn(buttonVariants({ size: 'sm' }), 'w-full gap-2')}
        >
          <PlayCircle className="h-4 w-4" />
          {isCompleted ? 'Revizuiește' : hasStarted ? 'Continuă' : 'Începe cursul'}
        </Link>
      </CardFooter>
    </Card>
  )
}
