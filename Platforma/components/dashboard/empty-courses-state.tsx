import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function EmptyCoursesState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      <div className="p-4 rounded-full bg-muted">
        <BookOpen className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="font-medium text-lg">Nu ai niciun curs încă</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Explorează cursurile noastre de AI și începe să înveți astăzi.
        </p>
      </div>
      <Link href="/cursuri" className={cn(buttonVariants())}>
        Explorează cursurile
      </Link>
    </div>
  )
}
