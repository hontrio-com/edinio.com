'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Navbar() {
  const t = useTranslations('nav')

  return (
    <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-primary">
          Edinio
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/cursuri" className="text-muted-foreground hover:text-foreground transition-colors">
            {t('courses')}
          </Link>
          <Link href="/despre" className="text-muted-foreground hover:text-foreground transition-colors">
            {t('about')}
          </Link>
          <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">
            {t('contact')}
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            {t('login')}
          </Link>
          <Link href="/auth/signup" className={cn(buttonVariants({ size: 'sm' }))}>
            {t('signup')}
          </Link>
        </div>
      </div>
    </header>
  )
}
