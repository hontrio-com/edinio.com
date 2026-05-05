import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, CheckCircle2, Flame } from 'lucide-react'

interface StatsRowProps {
  totalCourses: number
  completedLessons: number
  streak: number
}

export function StatsRow({ totalCourses, completedLessons, streak }: StatsRowProps) {
  const stats = [
    {
      label: 'Cursuri active',
      value: totalCourses,
      icon: BookOpen,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Lecții finalizate',
      value: completedLessons,
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-100 dark:bg-green-950',
    },
    {
      label: 'Zile la rând',
      value: streak,
      icon: Flame,
      color: 'text-orange-500',
      bg: 'bg-orange-100 dark:bg-orange-950',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg} shrink-0`}>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-semibold leading-none">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
