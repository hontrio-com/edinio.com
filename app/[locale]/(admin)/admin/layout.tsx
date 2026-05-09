import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/layout/admin-sidebar'
import { AdminHeader } from '@/components/admin/layout/admin-header'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirectTo=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email, avatar_url')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      <AdminSidebar />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <AdminHeader admin={profile} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
