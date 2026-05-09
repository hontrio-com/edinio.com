import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from '@/components/auth/login-form'
import { AuthLayout } from '@/components/auth/auth-layout'

export const metadata: Metadata = { title: 'Autentificare — Edinio' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const { redirectTo, error } = await searchParams

  return (
    <AuthLayout title="Bine ai revenit" subtitle="Intră în contul tău Edinio">
      <LoginForm redirectTo={redirectTo} errorParam={error} />
    </AuthLayout>
  )
}
