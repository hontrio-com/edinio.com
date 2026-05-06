'use client'

import { Menu, Bell } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { DashboardSidebarMobile } from './sidebar-mobile'
import type { PurchasedCourse } from './sidebar'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface LockedCourse {
  id: string
  slug: string
  title_ro: string
  title_en: string | null
}

interface HeaderProps {
  user: {
    full_name: string | null
    email: string | null
    avatar_url: string | null
  } | null
  purchasedCourses: PurchasedCourse[]
  lockedCourses?: LockedCourse[]
  language?: 'ro' | 'en'
}

export function DashboardHeader({ user, purchasedCourses, lockedCourses, language }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : (user?.email?.[0].toUpperCase() ?? 'E')

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="flex items-center justify-between h-16 px-4 border-b bg-background shrink-0">
      {/* Mobile menu trigger */}
      <Sheet>
        <SheetTrigger
          render={
            <button
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon' }),
                'md:hidden'
              )}
            />
          }
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-60">
          <DashboardSidebarMobile onSignOut={handleSignOut} purchasedCourses={purchasedCourses} lockedCourses={lockedCourses} language={language} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 md:hidden" />

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative')} />
            }
          >
            <Bell className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Notificări</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nicio notificare nouă
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="relative h-9 w-9 rounded-full inline-flex items-center justify-center hover:bg-muted transition-colors" />
            }
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={user?.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user?.full_name ?? 'Utilizator'}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => router.push('/dashboard/setari')}>
                Setări cont
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive"
              >
                Deconectare
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
