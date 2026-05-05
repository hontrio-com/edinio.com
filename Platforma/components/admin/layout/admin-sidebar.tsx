'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, BookOpen, Package,
  ShoppingBag, Users, GraduationCap,
  ExternalLink, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/cursuri', label: 'Cursuri', icon: BookOpen, exact: false },
  { href: '/admin/bundle-uri', label: 'Bundle-uri', icon: Package, exact: false },
  { href: '/admin/vanzari', label: 'Vânzări', icon: ShoppingBag, exact: false },
  { href: '/admin/utilizatori', label: 'Utilizatori', icon: Users, exact: false },
]

export function AdminSidebar() {
  const pathname = usePathname()

  function isActive(href: string, exact: boolean) {
    const stripped = pathname.replace(/^\/(ro|en)/, '')
    if (exact) return stripped === href
    return stripped.startsWith(href) && href !== '/admin'
      ? true
      : exact && stripped === href
  }

  return (
    <aside className="hidden md:flex flex-col w-56 border-r bg-white shrink-0">
      <div className="flex items-center gap-2 h-14 px-5 border-b shrink-0">
        <GraduationCap className="h-5 w-5 text-zinc-900" />
        <span className="font-semibold text-sm tracking-tight">edinio</span>
        <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5 font-medium">
          admin
        </Badge>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest px-2 pb-2 pt-1">
          Platformă
        </p>
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link key={href} href={href}>
              <div className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors cursor-pointer',
                active
                  ? 'bg-zinc-900 text-white font-medium'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              )}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="h-3 w-3 opacity-60" />}
              </div>
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t">
        <Separator className="mb-2" />
        <Link href="/dashboard" target="_blank">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span>Vezi ca utilizator</span>
          </div>
        </Link>
      </div>
    </aside>
  )
}
