import Link from 'next/link'
import { Play, CheckCircle2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CourseHeroPlayerProps {
  courseSlug: string
  firstLessonId: string | undefined
  progressPercent: number
}

export function CourseHeroPlayer({
  courseSlug,
  firstLessonId,
  progressPercent,
}: CourseHeroPlayerProps) {
  const isCompleted = progressPercent === 100

  return (
    <div className="rounded-xl border bg-muted/30 overflow-hidden">
      {/* Placeholder for video preview */}
      <div className="aspect-video flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 gap-4">
        {isCompleted ? (
          <>
            <CheckCircle2 className="h-16 w-16 text-green-600" />
            <p className="text-sm font-medium text-muted-foreground">
              Curs finalizat!
            </p>
          </>
        ) : (
          <>
            <div className="p-4 rounded-full bg-primary/10">
              <Play className="h-10 w-10 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              {progressPercent > 0 ? 'Continuă lecția' : 'Începe cursul'}
            </p>
          </>
        )}
      </div>

      {firstLessonId && (
        <div className="p-4">
          <Link
            href={`/curs/${courseSlug}/lectia/${firstLessonId}`}
            className={cn(buttonVariants(), 'w-full gap-2')}
          >
            <Play className="h-4 w-4" />
            {isCompleted
              ? 'Revizuiește cursul'
              : progressPercent > 0
                ? 'Continuă de unde ai rămas'
                : 'Începe prima lecție'}
          </Link>
        </div>
      )}
    </div>
  )
}
