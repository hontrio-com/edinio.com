'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Loader2, Save, Wand2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const schema = z.object({
  title_ro: z.string().min(3, 'Minim 3 caractere'),
  title_en: z.string().min(3, 'Min 3 characters'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Doar litere mici, cifre și -'),
  description_ro: z.string().optional(),
  description_en: z.string().optional(),
  price_ron: z.coerce.number().min(1),
  price_eur: z.coerce.number().min(1),
  stripe_price_id_ron: z.string().optional(),
  stripe_price_id_eur: z.string().optional(),
  thumbnail_url: z.string().url('URL invalid').optional().or(z.literal('')),
  promo_video_url: z.string().optional().or(z.literal('')),
  sort_order: z.coerce.number(),
})

type FormData = z.infer<typeof schema>

interface CourseFormProps {
  course?: {
    id: string
    title_ro: string
    title_en: string
    slug: string
    description_ro: string | null
    description_en: string | null
    price_ron: number
    price_eur: number
    stripe_price_id_ron: string | null
    stripe_price_id_eur: string | null
    thumbnail_url: string | null
    promo_video_url: string | null
    sort_order: number | null
  }
}

function FieldSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-zinc-600">{label}</Label>
      {children}
      {hint && <p className="text-xs text-zinc-400">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function CourseForm({ course }: CourseFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: course ? {
      ...course,
      price_ron: course.price_ron / 100,
      price_eur: course.price_eur / 100,
      description_ro: course.description_ro ?? '',
      description_en: course.description_en ?? '',
      stripe_price_id_ron: course.stripe_price_id_ron ?? '',
      stripe_price_id_eur: course.stripe_price_id_eur ?? '',
      thumbnail_url: course.thumbnail_url ?? '',
      promo_video_url: course.promo_video_url ?? '',
      sort_order: course.sort_order ?? 0,
    } : { sort_order: 0, price_ron: 250, price_eur: 50 },
  })

  function generateSlug() {
    const title = watch('title_ro')
    const slug = title
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
    setValue('slug', slug, { shouldDirty: true })
  }

  async function onSubmit(data: FormData) {
    setLoading(true)
    const payload = {
      ...data,
      price_ron: Math.round(data.price_ron * 100),
      price_eur: Math.round(data.price_eur * 100),
      description_ro: data.description_ro || null,
      description_en: data.description_en || null,
      stripe_price_id_ron: data.stripe_price_id_ron || null,
      stripe_price_id_eur: data.stripe_price_id_eur || null,
      thumbnail_url: data.thumbnail_url || null,
      promo_video_url: data.promo_video_url || null,
    }

    if (course?.id) {
      const { error } = await supabase.from('courses').update(payload).eq('id', course.id)
      if (error) {
        toast({ title: 'Eroare', description: error.message, variant: 'destructive' })
      } else {
        toast({ title: 'Curs salvat.' })
        router.refresh()
      }
    } else {
      const { data: newCourse, error } = await supabase
        .from('courses')
        .insert({ ...payload, is_published: false })
        .select('id')
        .single()
      if (error) {
        toast({ title: 'Eroare', description: error.message, variant: 'destructive' })
      } else {
        toast({ title: 'Curs creat!' })
        router.push(`/admin/cursuri/${newCourse.id}`)
      }
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <FieldSection title="Conținut">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Titlu (Română)" error={errors.title_ro?.message}>
            <Input placeholder="Învață să faci video cu AI" className="h-9 text-sm" {...register('title_ro')} />
          </Field>
          <Field label="Title (English)" error={errors.title_en?.message}>
            <Input placeholder="AI Video Creation" className="h-9 text-sm" {...register('title_en')} />
          </Field>
        </div>

        <Field label="Slug URL" error={errors.slug?.message} hint="Folosit în URL: edinio.com/cursuri/[slug]">
          <div className="flex gap-2">
            <Input placeholder="video-ai" className="h-9 text-sm font-mono flex-1" {...register('slug')} />
            <Button type="button" variant="outline" size="sm" onClick={generateSlug} className="h-9 gap-1.5 shrink-0">
              <Wand2 className="h-3.5 w-3.5" />
              Auto
            </Button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Descriere scurtă (RO)">
            <Textarea
              placeholder="Descriere în română..."
              className="resize-none text-sm h-20"
              {...register('description_ro')}
            />
          </Field>
          <Field label="Short description (EN)">
            <Textarea
              placeholder="Description in English..."
              className="resize-none text-sm h-20"
              {...register('description_en')}
            />
          </Field>
        </div>
      </FieldSection>

      <Separator />

      <FieldSection title="Prețuri și Stripe">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Preț RON" error={errors.price_ron?.message}>
            <div className="relative">
              <Input type="number" step="1" placeholder="250" className="h-9 text-sm pr-12" {...register('price_ron')} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400">RON</span>
            </div>
          </Field>
          <Field label="Price EUR" error={errors.price_eur?.message}>
            <div className="relative">
              <Input type="number" step="1" placeholder="50" className="h-9 text-sm pr-12" {...register('price_eur')} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400">EUR</span>
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Stripe Price ID (RON)" hint="Din Stripe Dashboard → Products → Price ID">
            <Input placeholder="price_1..." className="h-9 text-sm font-mono" {...register('stripe_price_id_ron')} />
          </Field>
          <Field label="Stripe Price ID (EUR)" hint="Produsul EUR din Stripe">
            <Input placeholder="price_1..." className="h-9 text-sm font-mono" {...register('stripe_price_id_eur')} />
          </Field>
        </div>
      </FieldSection>

      <Separator />

      <FieldSection title="Media și ordine">
        <Field label="URL Thumbnail" hint="Imagine de copertă a cursului (16:9 recomandat)">
          <Input placeholder="https://..." className="h-9 text-sm" {...register('thumbnail_url')} />
        </Field>
        <Field label="Bunny.net Promo Video ID" hint="ID-ul videoclipului de prezentare din Bunny Stream">
          <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="h-9 text-sm font-mono" {...register('promo_video_url')} />
        </Field>
        <Field label="Ordine sortare" hint="Număr mai mic = apare primul (0, 1, 2...)">
          <Input type="number" placeholder="0" className="h-9 text-sm w-24" {...register('sort_order')} />
        </Field>
      </FieldSection>

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} className="text-zinc-500">
          Anulează
        </Button>
        <Button type="submit" disabled={loading} className="gap-2 min-w-[130px]">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {course ? 'Salvează modificările' : 'Creează cursul'}
        </Button>
      </div>
    </form>
  )
}
