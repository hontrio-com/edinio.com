'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Loader2 } from 'lucide-react'
import { VideoUpload } from './video-upload'

const schema = z.object({
  title_ro: z.string().min(2, 'Minim 2 caractere'),
  title_en: z.string().min(2, 'Min 2 characters'),
  description_ro: z.string().optional(),
  description_en: z.string().optional(),
  bunny_video_id: z.string().optional(),
  duration_seconds: z.coerce.number().min(0).optional(),
  sort_order: z.coerce.number().min(0),
  is_preview: z.boolean(),
})

type FormData = z.infer<typeof schema>

interface LessonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lesson: {
    id?: string
    title_ro: string
    title_en: string
    description_ro: string | null
    description_en: string | null
    bunny_video_id: string | null
    storage_path?: string | null
    duration_seconds: number | null
    sort_order: number
    is_preview: boolean
  } | null
  courseSlug?: string
  language: 'ro' | 'en'
  onSave: (data: any) => Promise<void>
}

export function LessonDialog({ open, onOpenChange, lesson, courseSlug, onSave }: LessonDialogProps) {
  const [loading, setLoading] = useState(false)
  const [currentStoragePath, setCurrentStoragePath] = useState<string | null>(null)
  const isEdit = !!lesson

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title_ro: '', title_en: '', description_ro: '', description_en: '',
      bunny_video_id: '', duration_seconds: 0, sort_order: 0, is_preview: false,
    },
  })

  useEffect(() => {
    if (lesson) {
      reset({
        title_ro: lesson.title_ro,
        title_en: lesson.title_en,
        description_ro: lesson.description_ro ?? '',
        description_en: lesson.description_en ?? '',
        bunny_video_id: lesson.bunny_video_id ?? '',
        duration_seconds: lesson.duration_seconds ?? 0,
        sort_order: lesson.sort_order,
        is_preview: lesson.is_preview,
      })
      setCurrentStoragePath(lesson.storage_path ?? null)
    } else {
      reset({
        title_ro: '', title_en: '', description_ro: '', description_en: '',
        bunny_video_id: '', duration_seconds: 0, sort_order: 0, is_preview: false,
      })
    }
  }, [lesson, open, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    await onSave({
      ...data,
      description_ro: data.description_ro || null,
      description_en: data.description_en || null,
      bunny_video_id: data.bunny_video_id || null,
      duration_seconds: data.duration_seconds || null,
    })
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editează lecția' : 'Lecție nouă'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Titlu Română</Label>
              <Input placeholder="Introducere" className="h-9 text-sm" {...register('title_ro')} />
              {errors.title_ro && <p className="text-xs text-destructive">{errors.title_ro.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Title English</Label>
              <Input placeholder="Introduction" className="h-9 text-sm" {...register('title_en')} />
              {errors.title_en && <p className="text-xs text-destructive">{errors.title_en.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Descriere (RO)</Label>
              <Textarea placeholder="Opțional..." className="text-sm h-16 resize-none" {...register('description_ro')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Description (EN)</Label>
              <Textarea placeholder="Optional..." className="text-sm h-16 resize-none" {...register('description_en')} />
            </div>
          </div>

          <Separator />

          {isEdit && lesson?.id && courseSlug && (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Video lecție</Label>
              <VideoUpload
                lessonId={lesson.id}
                courseSlug={courseSlug}
                lessonOrder={watch('sort_order') ?? 0}
                currentStoragePath={currentStoragePath}
                onSuccess={(path) => setCurrentStoragePath(path)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Durată (secunde)</Label>
              <Input type="number" placeholder="600" className="h-9 text-sm" {...register('duration_seconds')} />
              <p className="text-xs text-zinc-400">ex: 600 = 10 min</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Ordine sortare</Label>
              <Input type="number" placeholder="0" className="h-9 text-sm" {...register('sort_order')} />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium">Previzualizare gratuită</p>
              <p className="text-xs text-zinc-400">Lecția e vizibilă fără achiziție</p>
            </div>
            <Switch
              checked={watch('is_preview')}
              onCheckedChange={v => setValue('is_preview', v)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-sm">
            Anulează
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={loading} className="gap-2 min-w-[110px]">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Salvează' : 'Adaugă lecția'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
