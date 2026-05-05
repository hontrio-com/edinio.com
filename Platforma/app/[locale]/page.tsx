import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default function HomePage() {
  const t = useTranslations('home')
  const tNav = useTranslations('nav')

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <h1 className="text-5xl font-bold tracking-tight mb-2">
        {t('hero_title')}
      </h1>
      <p className="text-4xl font-bold text-primary mb-6">
        {t('hero_subtitle')}
      </p>
      <p className="text-muted-foreground text-lg max-w-xl mb-8">
        {t('hero_description')}
      </p>
      <div className="flex gap-4">
        <Link href="/cursuri" className={cn(buttonVariants({ size: 'lg' }))}>
          {t('cta_primary')}
        </Link>
        <Link href="/auth/register" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
          {tNav('signup')}
        </Link>
      </div>
    </main>
  )
}
