import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LessonNavigationProps {
  courseSlug: string
  prevLesson: { id: string; title_ro: string } | null
  nextLesson: { id: string; title_ro: string } | null
}

export function LessonNavigation({
  courseSlug,
  prevLesson,
  nextLesson,
}: LessonNavigationProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      {prevLesson ? (
        <Link
          href={`/curs/${courseSlug}/lectia/${prevLesson.id}`}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'gap-2 max-w-[45%]'
          )}
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm">{prevLesson.title_ro}</span>
        </Link>
      ) : (
        <div />
      )}

      {nextLesson ? (
        <Link
          href={`/curs/${courseSlug}/lectia/${nextLesson.id}`}
          className={cn(buttonVariants(), 'gap-2 max-w-[45%] ml-auto')}
        >
          <span className="truncate text-sm">{nextLesson.title_ro}</span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Link>
      ) : (
        <div />
      )}
    </div>
  )
}
