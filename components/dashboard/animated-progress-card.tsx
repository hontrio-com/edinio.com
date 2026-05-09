'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { hoverLift } from '@/lib/animations'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { PlayCircle, Clock, BookOpen } from 'lucide-react'
import { formatDuration, cn } from '@/lib/utils'

interface AnimatedProgressCardProps {
  courseSlug: string
  title: string
  thumbnailUrl: string | null
  completedLessons: number
  totalLessons: number
  totalDurationSeconds: number
  index?: number
}

export function AnimatedProgressCard({
  courseSlug,
  title,
  thumbnailUrl,
  completedLessons,
  totalLessons,
  totalDurationSeconds,
  index = 0,
}: AnimatedProgressCardProps) {
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  const isCompleted = progressPercent === 100
  const hasStarted = completedLessons > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: 'easeOut' }}
      {...hoverLift}
    >
      <Card className="overflow-hidden flex flex-col border hover:shadow-md transition-shadow h-full">
        <div className="relative aspect-video bg-muted overflow-hidden">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
              <BookOpen className="h-12 w-12 text-primary/30" />
            </div>
          )}
          {isCompleted && (
            <div className="absolute top-2 right-2">
              <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                Finalizat
              </Badge>
            </div>
          )}
        </div>

        <CardContent className="flex-1 p-4 space-y-3">
          <h3 className="font-medium text-sm leading-snug line-clamp-2">{title}</h3>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{completedLessons}/{totalLessons} lecții</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.8, delay: index * 0.08 + 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(totalDurationSeconds)}
            </span>
          </div>
        </CardContent>

        <CardFooter className="p-4 pt-0">
          <Link href={`/curs/${courseSlug}`} className={cn(buttonVariants({ size: 'sm' }), 'w-full gap-2')}>
            <PlayCircle className="h-4 w-4" />
            {isCompleted ? 'Revizuiește' : hasStarted ? 'Continuă' : 'Începe cursul'}
          </Link>
        </CardFooter>
      </Card>
    </motion.div>
  )
}
