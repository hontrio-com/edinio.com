'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  Wrench,
  FileText,
  Settings,
  HelpCircle,
  LogOut,
  GraduationCap,
  ChevronDown,
  Lock,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createClient } from '@/lib/supabase/client'

export interface PurchasedCourse {
  slug: string
  title_ro: string
  owned: boolean
}

interface LockedCourse {
  id: string
  slug: string
  title_ro: string
  title_en: string | null
}

interface DashboardSidebarProps {
  purchasedCourses: PurchasedCourse[]
  lockedCourses?: LockedCourse[]
  language?: 'ro' | 'en'
}

export function DashboardSidebar({ purchasedCourses, lockedCourses, language = 'ro' }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  // Doar cursurile cumpărate în secțiunea principală
  const ownedCourses = purchasedCourses.filter((c) => c.owned)

  const [openCourses, setOpenCourses] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const c of ownedCourses) {
      if (pathname.includes(`/curs/${c.slug}`)) initial.add(c.slug)
    }
    return initial
  })

  function toggleCourse(slug: string) {
    setOpenCourses((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-background shrink-0">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold tracking-tight">edinio</span>
        </Link>
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="px-3 space-y-0.5">
          {/* Dashboard */}
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: pathname === '/dashboard' ? 'secondary' : 'ghost' }),
              'w-full justify-start gap-3 h-9',
              pathname === '/dashboard' ? 'font-medium' : 'font-normal'
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Acasă
          </Link>

          {/* Cursuri cumpărate */}
          {ownedCourses.length > 0 && (
            <div className="pt-3">
              <p className="px-3 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Cursuri
              </p>
              <div className="space-y-0.5">
                {ownedCourses.map((course) => {
                  const courseBase = `/curs/${course.slug}`
                  const isActive = pathname.includes(courseBase)
                  const isOpen = openCourses.has(course.slug) || isActive

                  return (
                    <div key={course.slug}>
                      <button
                        onClick={() => toggleCourse(course.slug)}
                        className={cn(
                          buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
                          'w-full justify-start gap-3 h-9',
                          isActive ? 'font-medium' : 'font-normal'
                        )}
                      >
                        <BookOpen className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate text-left text-sm">{course.title_ro}</span>
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-muted-foreground',
                            isOpen && 'rotate-180'
                          )}
                        />
                      </button>

                      {isOpen && (
                        <div className="ml-7 mt-0.5 space-y-0.5">
                          {[
                            { href: courseBase, label: 'Curs', icon: BookOpen },
                            { href: `${courseBase}/unelte`, label: 'Unelte', icon: Wrench },
                            { href: `${courseBase}/resurse`, label: 'Resurse', icon: FileText },
                          ].map((sub) => {
                            const SubIcon = sub.icon
                            const isSubActive =
                              pathname === sub.href ||
                              (sub.href !== courseBase && pathname.startsWith(sub.href))
                            return (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                className={cn(
                                  buttonVariants({ variant: isSubActive ? 'secondary' : 'ghost', size: 'sm' }),
                                  'w-full justify-start gap-2 h-8 text-xs',
                                  isSubActive ? 'font-medium' : 'font-normal'
                                )}
                              >
                                <SubIcon className="h-3.5 w-3.5 shrink-0" />
                                {sub.label}
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Cursuri blocate — Deblochează */}
          {lockedCourses && lockedCourses.length > 0 && (
            <div className="pt-3">
              <p className="px-3 pb-1.5 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                {language === 'ro' ? 'Deblochează' : 'Unlock'}
              </p>
              <div className="space-y-0.5">
                {lockedCourses.map((course) => (
                  <Link
                    key={course.slug}
                    href={`/cursuri/${course.slug}`}
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'w-full justify-start gap-3 h-9 font-normal text-muted-foreground/60 hover:text-muted-foreground'
                    )}
                  >
                    <Lock className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    <span className="flex-1 text-left truncate text-[13px]">
                      {language === 'ro' ? course.title_ro : (course.title_en ?? course.title_ro)}
                    </span>
                    <Sparkles className="h-3 w-3 text-primary/60 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Setări */}
          <div className="pt-3">
            <Link
              href="/dashboard/setari"
              className={cn(
                buttonVariants({ variant: pathname.startsWith('/dashboard/setari') ? 'secondary' : 'ghost' }),
                'w-full justify-start gap-3 h-9',
                pathname.startsWith('/dashboard/setari') ? 'font-medium' : 'font-normal'
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              Setări cont
            </Link>
          </div>
        </nav>
      </ScrollArea>

      <div className="p-3 border-t space-y-0.5">
        <Link
          href="/contact"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full justify-start gap-3 h-9 font-normal')}
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          Ajutor
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-9 font-normal text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Deconectare
        </Button>
      </div>
    </aside>
  )
}
