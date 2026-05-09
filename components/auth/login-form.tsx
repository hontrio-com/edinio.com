'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Email invalid'),
  password: z.string().min(6, 'Parola trebuie să aibă minim 6 caractere'),
})

type LoginFormData = z.infer<typeof loginSchema>

interface LoginFormProps {
  redirectTo?: string
  errorParam?: string
}

export function LoginForm({ redirectTo, errorParam }: LoginFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(errorParam ?? null)
  const [isLoading, setIsLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const supabase = createClient()

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginFormData) {
    setIsLoading(true)
    setError(null)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Email sau parolă incorectă.'
          : 'A apărut o eroare. Încearcă din nou.'
      )
      setIsLoading(false)
      return
    }
    router.push(redirectTo ?? '/dashboard')
    router.refresh()
  }

  async function sendMagicLink() {
    const email = getValues('email')
    if (!email) { setError('Introdu emailul mai întâi.'); return }
    setIsLoading(true)
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })
    setMagicLinkSent(true)
    setIsLoading(false)
  }

  if (magicLinkSent) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <p className="text-sm text-zinc-600">
          Link de acces trimis! Verifică inbox-ul (și folderul spam).
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm text-zinc-700">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@exemplu.com"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-sm text-zinc-700">Parolă</Label>
          <Link
            href="/auth/forgot-password"
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            Ai uitat parola?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Intră în cont
      </Button>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <Separator />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-zinc-400">sau</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => sendMagicLink()}
        disabled={isLoading}
      >
        Primește link de acces pe email
      </Button>
    </form>
  )
}
