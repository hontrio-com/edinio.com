'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'

const schema = z.object({ email: z.string().email('Email invalid') })
type FormData = z.infer<typeof schema>

export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setSent(true)
    setIsLoading(false)
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <p className="text-sm text-zinc-600">
          Link de resetare trimis! Verifică inbox-ul (și folderul spam).
        </p>
        <Link
          href="/auth/login"
          className="mt-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Înapoi la login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Trimite link de resetare
      </Button>

      <div className="text-center">
        <Link
          href="/auth/login"
          className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors flex items-center justify-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Înapoi la login
        </Link>
      </div>
    </form>
  )
}
