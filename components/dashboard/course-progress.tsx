import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

interface Props {
  completedLessons: number
  totalLessons: number
}

export function CourseProgress({ completedLessons, totalLessons }: Props) {
  const percentage = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {completedLessons}/{totalLessons} lecții
        </span>
        {percentage === 100 ? (
          <Badge variant="default">Finalizat</Badge>
        ) : (
          <span className="font-medium">{percentage}%</span>
        )}
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  )
}
