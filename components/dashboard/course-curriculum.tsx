import Link from 'next/link'
import { CheckCircle2, Circle, PlayCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface CurriculumLesson {
  id: string
  title_ro: string
  title_en?: string
  sort_order: number
  duration_seconds: number | null
  is_preview: boolean
}

interface CurriculumProps {
  courseSlug: string
  lessons: CurriculumLesson[]
  progressMap: Map<string, { completed: boolean; progress_seconds: number }>
  language?: 'ro' | 'en'
}

export function CourseCurriculum({
  courseSlug,
  lessons,
  progressMap,
  language = 'ro',
}: CurriculumProps) {
  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <h3 className="text-sm font-medium">
          Curriculum ({lessons.length} lecții)
        </h3>
      </div>
      <ScrollArea className="max-h-[600px]">
        <div className="divide-y">
          {lessons.map((lesson, index) => {
            const progress = progressMap.get(lesson.id)
            const isCompleted = progress?.completed ?? false
            const hasProgress = (progress?.progress_seconds ?? 0) > 0

            return (
              <Link
                key={lesson.id}
                href={`/curs/${courseSlug}/lectia/${lesson.id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
              >
                <div className="shrink-0 mt-0.5">
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : hasProgress ? (
                    <PlayCircle className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'truncate',
                      isCompleted &&
                        'text-muted-foreground line-through decoration-1'
                    )}
                  >
                    {index + 1}.{' '}
                    {language === 'en' && lesson.title_en
                      ? lesson.title_en
                      : lesson.title_ro}
                  </p>
                  {lesson.duration_seconds ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDuration(lesson.duration_seconds)}
                    </p>
                  ) : null}
                </div>
                {lesson.is_preview && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    Gratuit
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
