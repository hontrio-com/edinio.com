'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  function switchLocale(next: string) {
    const segments = pathname.split('/')
    if (segments[1] === 'ro' || segments[1] === 'en') {
      segments[1] = next
    } else {
      segments.splice(1, 0, next)
    }
    router.push(segments.join('/'))
  }

  return (
    <div className="flex gap-1">
      <Button
        variant={locale === 'ro' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => switchLocale('ro')}
        className="h-7 px-2 text-xs"
      >
        RO
      </Button>
      <Button
        variant={locale === 'en' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => switchLocale('en')}
        className="h-7 px-2 text-xs"
      >
        EN
      </Button>
    </div>
  )
}
