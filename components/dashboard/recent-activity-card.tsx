import { CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ro } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ActivityItem {
  lessonTitle: string
  courseTitle: string
  completedAt: string
}

interface RecentActivityCardProps {
  activities: ActivityItem[]
}

export function RecentActivityCard({ activities }: RecentActivityCardProps) {
  if (activities.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Activitate recentă
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.lessonTitle}</p>
              <p className="text-xs text-muted-foreground">
                {item.courseTitle} ·{' '}
                {formatDistanceToNow(new Date(item.completedAt), {
                  addSuffix: true,
                  locale: ro,
                })}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
