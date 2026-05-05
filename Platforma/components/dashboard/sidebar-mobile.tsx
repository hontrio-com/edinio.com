'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { PurchasedCourse } from './sidebar'

interface SidebarMobileProps {
  onSignOut: () => void
  purchasedCourses: PurchasedCourse[]
}

export function DashboardSidebarMobile({
  onSignOut,
  purchasedCourses,
}: SidebarMobileProps) {
  const pathname = usePathname()

  const [openCourses, setOpenCourses] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const c of purchasedCourses) {
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center h-16 px-6 border-b shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold tracking-tight">edinio</span>
        </Link>
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="px-3 space-y-0.5">
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({
                variant: pathname === '/dashboard' ? 'secondary' : 'ghost',
              }),
              'w-full justify-start gap-3 h-9',
              pathname === '/dashboard' ? 'font-medium' : 'font-normal'
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Acasă
          </Link>

          {purchasedCourses.length > 0 && (
            <div className="pt-3">
              <p className="px-3 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Cursuri
              </p>
              <div className="space-y-0.5">
                {purchasedCourses.map((course) => {
                  const courseBase = `/curs/${course.slug}`
                  const isActive = pathname.includes(courseBase)
                  const isOpen = openCourses.has(course.slug) || isActive

                  if (!course.owned) {
                    return (
                      <Link
                        key={course.slug}
                        href={`/cursuri/${course.slug}`}
                        className={cn(
                          buttonVariants({ variant: 'ghost' }),
                          'w-full justify-start gap-3 h-9 font-normal opacity-60'
                        )}
                      >
                        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-left text-sm">
                          {course.title_ro}
                        </span>
                      </Link>
                    )
                  }

                  return (
                    <div key={course.slug}>
                      <button
                        onClick={() => toggleCourse(course.slug)}
                        className={cn(
                          buttonVariants({
                            variant: isActive ? 'secondary' : 'ghost',
                          }),
                          'w-full justify-start gap-3 h-9',
                          isActive ? 'font-medium' : 'font-normal'
                        )}
                      >
                        <BookOpen className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate text-left text-sm">
                          {course.title_ro}
                        </span>
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
                                  buttonVariants({
                                    variant: isSubActive ? 'secondary' : 'ghost',
                                    size: 'sm',
                                  }),
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

          <div className="pt-3">
            <Link
              href="/dashboard/setari"
              className={cn(
                buttonVariants({
                  variant: pathname.startsWith('/dashboard/setari') ? 'secondary' : 'ghost',
                }),
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
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'w-full justify-start gap-3 h-9 font-normal'
          )}
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          Ajutor
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-9 font-normal text-muted-foreground hover:text-destructive"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Deconectare
        </Button>
      </div>
    </div>
  )
}
