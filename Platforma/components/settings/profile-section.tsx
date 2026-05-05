'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { SectionHeader } from './section-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Save } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { cn } from '@/lib/utils'

const schema = z.object({
  full_name: z.string().min(2, 'Minim 2 caractere').max(60),
  preferred_language: z.enum(['ro', 'en']),
})

type FormData = z.infer<typeof schema>

interface ProfileSectionProps {
  profile: {
    id: string
    full_name: string | null
    email: string | null
    avatar_url: string | null
    preferred_language: string | null
    created_at: string | null
  } | null
  userId: string
}

export function ProfileSection({ profile, userId }: ProfileSectionProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  const initials =
    profile?.full_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) ??
    profile?.email?.[0].toUpperCase() ??
    'U'

  const { register, handleSubmit, setValue, watch, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      preferred_language: (profile?.preferred_language as 'ro' | 'en') ?? 'ro',
    },
  })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: data.full_name, preferred_language: data.preferred_language })
      .eq('id', userId)

    if (error) {
      toast({ title: 'Eroare la salvare', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Profil actualizat.' })
      router.refresh()
    }
    setIsLoading(false)
  }

  return (
    <div>
      <SectionHeader
        label="Profil"
        title="Informații personale"
        description="Numele și preferințele afișate în platformă."
        action={
          <Button
            size="sm"
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading || !isDirty}
            className="h-8 px-4 text-xs gap-1.5"
          >
            {isLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Save className="h-3.5 w-3.5" />
            }
            Salvează
          </Button>
        }
      />

      {/* Avatar row */}
      <div className="flex items-center gap-4 mb-8 pb-6 border-b">
        <div className={cn(
          'h-12 w-12 rounded-full flex items-center justify-center shrink-0',
          'bg-foreground text-background text-sm font-semibold'
        )}>
          {initials}
        </div>
        <div>
          <p className="text-sm font-medium">{profile?.full_name || 'Fără nume'}</p>
          <p className="text-xs text-muted-foreground">{profile?.email}</p>
          {profile?.created_at && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Membru din {format(new Date(profile.created_at), 'd MMMM yyyy', { locale: ro })}
            </p>
          )}
        </div>
      </div>

      {/* Form fields */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nume complet</Label>
            <Input
              placeholder="Ion Popescu"
              className="h-9 text-sm"
              {...register('full_name')}
            />
            {errors.full_name && (
              <p className="text-xs text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Limbă preferată</Label>
            <Select
              value={watch('preferred_language')}
              onValueChange={(val) => setValue('preferred_language', val as 'ro' | 'en', { shouldDirty: true })}
            >
              <SelectTrigger className="h-9 text-sm w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ro">Română</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Adresă email</Label>
          <div className="relative">
            <Input
              value={profile?.email ?? ''}
              disabled
              className="h-9 text-sm bg-muted/40 text-muted-foreground pr-24"
            />
            <Badge
              variant="outline"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] h-5 px-1.5 border-green-200 text-green-700 bg-green-50"
            >
              Verificat
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Emailul nu poate fi modificat. Contactează suportul dacă ai nevoie.
          </p>
        </div>
      </form>
    </div>
  )
}
