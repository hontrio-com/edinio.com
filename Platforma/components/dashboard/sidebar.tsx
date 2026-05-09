'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Play,
  Sparkles,
  Settings,
  HelpCircle,
  LogOut,
  GraduationCap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export interface PurchasedCourse {
  slug: string
  title_ro: string
  owned: boolean
}

interface DashboardSidebarProps {
  purchasedCourses: PurchasedCourse[]
}

export function DashboardSidebar({ purchasedCourses }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const courseSlug = purchasedCourses[0]?.slug ?? 'videoclipuri-cu-ai'

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: `/curs/${courseSlug}`, label: 'Acces Curs', icon: Play },
    { href: '/dashboard/avatare', label: 'Avatar AI', icon: Sparkles },
    { href: '/dashboard/setari', label: 'Setări cont', icon: Settings },
  ]

  return (
    <aside className="hidden md:flex flex-col w-60 border-r bg-background shrink-0">
      <div className="flex items-center h-16 px-6 border-b shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold tracking-tight">edinio</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
                'w-full justify-start gap-3 h-9',
                isActive ? 'font-medium' : 'font-normal'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t space-y-0.5">
        <Link
          href="/dashboard/ajutor"
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
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Deconectare
        </Button>
      </div>
    </aside>
  )
}
