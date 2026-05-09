'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { SectionHeader } from './section-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const schema = z.object({
  currentPassword: z.string().min(1, 'Introdu parola curentă'),
  newPassword: z.string()
    .min(8, 'Minim 8 caractere')
    .regex(/[A-Z]/, 'Literă mare')
    .regex(/[0-9]/, 'Cifră'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Parolele nu coincid',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

function StrengthBar({ password }: { password: string }) {
  if (!password) return null

  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length

  const label = ['', 'Slabă', 'Acceptabilă', 'Bună', 'Puternică'][score]
  const colors = ['', 'bg-red-400', 'bg-amber-400', 'bg-yellow-400', 'bg-green-500']

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-0.5 flex-1 rounded-full transition-all duration-300',
              i < score ? colors[score] : 'bg-border'
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2.5 flex-wrap">
          {[
            { label: '8+ caractere', ok: password.length >= 8 },
            { label: 'Literă mare', ok: /[A-Z]/.test(password) },
            { label: 'Cifră', ok: /[0-9]/.test(password) },
            { label: 'Special', ok: /[^A-Za-z0-9]/.test(password) },
          ].map((c) => (
            <span
              key={c.label}
              className={cn(
                'flex items-center gap-1 text-[11px] transition-colors',
                c.ok ? 'text-green-600' : 'text-muted-foreground/50'
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              {c.label}
            </span>
          ))}
        </div>
        {score > 0 && (
          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        )}
      </div>
    </div>
  )
}

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id?: string
}

function PasswordInput({ id, ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        className="h-9 text-sm pr-9"
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((p) => !p)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

export function SecuritySection() {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const supabase = createClient()

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const newPassword = watch('newPassword') ?? ''

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setIsLoading(false); return }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: data.currentPassword,
    })

    if (signInError) {
      toast({ title: 'Parola curentă e incorectă.', variant: 'destructive' })
      setIsLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: data.newPassword })
    if (error) {
      toast({ title: 'Eroare', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Parolă schimbată cu succes.' })
      reset()
    }
    setIsLoading(false)
  }

  async function sendMagicLink() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return
    await supabase.auth.signInWithOtp({
      email: user.email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })
    setMagicSent(true)
  }

  return (
    <div>
      <SectionHeader
        label="Securitate"
        title="Schimbă parola"
        description="Folosește o parolă unică, puternică pentru contul tău."
        action={
          <Button
            size="sm"
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading}
            className="h-8 px-4 text-xs gap-1.5"
          >
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvează
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Parola curentă</Label>
          <PasswordInput
            id="currentPassword"
            autoComplete="current-password"
            {...register('currentPassword')}
          />
          {errors.currentPassword && (
            <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Parolă nouă</Label>
            <PasswordInput
              id="newPassword"
              autoComplete="new-password"
              {...register('newPassword')}
            />
            <StrengthBar password={newPassword} />
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Confirmă parola</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
        </div>
      </form>

      <div className="mt-8 pt-6 border-t flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Cont creat prin link magic?</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Trimite-ți un email de resetare parolă dacă nu ai una setată.
          </p>
        </div>
        {magicSent ? (
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Email trimis
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={sendMagicLink}
            className="h-8 text-xs shrink-0"
          >
            Trimite link
          </Button>
        )}
      </div>
    </div>
  )
}
