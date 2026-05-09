import { Flame } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface StreakCardProps {
  streak: number
}

export function StreakCard({ streak }: StreakCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-950 shrink-0">
          <Flame className="h-6 w-6 text-orange-500" />
        </div>
        <div>
          <p className="text-2xl font-bold">{streak}</p>
          <p className="text-sm text-muted-foreground">
            {streak === 1 ? 'zi consecutivă' : 'zile consecutive'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
