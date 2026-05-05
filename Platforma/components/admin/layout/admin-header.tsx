'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminHeaderProps {
  admin: { full_name: string | null; email: string | null; avatar_url: string | null } | null
}

export function AdminHeader({ admin }: AdminHeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const initials = admin?.full_name
    ?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    ?? 'A'

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b bg-white shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-400 hidden sm:block">{admin?.email}</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'rounded-full')} />
          }>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-zinc-900 text-white">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <p className="text-sm font-medium">{admin?.full_name}</p>
                <p className="text-xs text-muted-foreground">{admin?.email}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/dashboard/setari')} className="gap-2">
              <Settings className="h-4 w-4" />
              Setări cont
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} variant="destructive" className="gap-2">
              <LogOut className="h-4 w-4" />
              Deconectare
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
