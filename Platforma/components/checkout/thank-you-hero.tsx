import { CheckCircle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface ThankYouHeroProps {
  courseName: string
  courseSlug: string
}

export function ThankYouHero({ courseName, courseSlug }: ThankYouHeroProps) {
  return (
    <section className="flex flex-col items-center text-center py-16 px-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-6">
        <CheckCircle className="h-9 w-9 text-green-600" />
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
        Plata a fost confirmată!
      </h1>

      <p className="text-muted-foreground text-lg max-w-md mb-2">
        Mulțumim pentru achiziție.
      </p>

      <p className="text-muted-foreground max-w-md mb-8">
        Ai acum acces complet la{' '}
        <span className="font-semibold text-foreground">{courseName}</span>.
        Verifică-ți emailul pentru confirmare.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href={`/curs/${courseSlug}`}
          className={cn(buttonVariants({ size: 'lg' }))}
        >
          Începe cursul
        </Link>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
        >
          Dashboard
        </Link>
      </div>
    </section>
  )
}
