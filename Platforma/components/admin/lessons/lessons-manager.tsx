'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LessonDialog } from './lesson-dialog'
import { ConfirmDialog } from '../shared/confirm-dialog'
import { Plus, Pencil, Trash2, Loader2, GripVertical, Clock, Unlock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { formatDuration } from '@/lib/utils'

interface Lesson {
  id: string
  title_ro: string
  title_en: string
  description_ro: string | null
  description_en: string | null
  bunny_video_id: string | null
  duration_seconds: number | null
  sort_order: number
  is_preview: boolean
  language: 'ro' | 'en'
}

interface LessonsManagerProps {
  courseId: string
  lessons: Lesson[]
  language: 'ro' | 'en'
}

export function LessonsManager({ courseId, lessons: initial, language }: LessonsManagerProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [lessons, setLessons] = useState<Lesson[]>(initial)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editLesson, setEditLesson] = useState<Lesson | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const supabase = createClient()

  function openNew() {
    setEditLesson(null)
    setDialogOpen(true)
  }

  function openEdit(lesson: Lesson) {
    setEditLesson(lesson)
    setDialogOpen(true)
  }

  async function handleSave(data: Omit<Lesson, 'id' | 'language'>) {
    if (editLesson) {
      const { error } = await supabase
        .from('lessons')
        .update({ ...data, language })
        .eq('id', editLesson.id)

      if (!error) {
        setLessons(prev => prev.map(l =>
          l.id === editLesson.id ? { ...l, ...data, language } : l
        ))
        toast({ title: 'Lecție actualizată.' })
        router.refresh()
      } else {
        toast({ title: 'Eroare', description: error.message, variant: 'destructive' })
      }
    } else {
      const nextOrder = lessons.length > 0
        ? Math.max(...lessons.map(l => l.sort_order)) + 1
        : 0

      const { data: newLesson, error } = await supabase
        .from('lessons')
        .insert({ ...data, language, course_id: courseId, sort_order: nextOrder })
        .select()
        .single()

      if (!error && newLesson) {
        setLessons(prev => [...prev, newLesson as Lesson])
        toast({ title: 'Lecție adăugată!' })
        router.refresh()
      } else {
        toast({ title: 'Eroare', description: error?.message, variant: 'destructive' })
      }
    }
    setDialogOpen(false)
  }

  async function handleDelete(lessonId: string) {
    setDeletingId(lessonId)
    const { error } = await supabase.from('lessons').delete().eq('id', lessonId)
    if (!error) {
      setLessons(prev => prev.filter(l => l.id !== lessonId))
      toast({ title: 'Lecție ștearsă.' })
      router.refresh()
    } else {
      toast({ title: 'Eroare la ștergere', variant: 'destructive' })
    }
    setDeletingId(null)
  }

  const titleKey = language === 'ro' ? 'title_ro' : 'title_en'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {lessons.length} {lessons.length === 1 ? 'lecție' : 'lecții'}
        </p>
        <Button size="sm" onClick={openNew} className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Lecție nouă
        </Button>
      </div>

      {lessons.length === 0 ? (
        <div className="border-2 border-dashed border-zinc-200 rounded-lg py-12 text-center">
          <p className="text-sm text-zinc-400">Nicio lecție adăugată.</p>
          <button onClick={openNew} className="text-sm text-primary underline underline-offset-2 mt-1">
            Adaugă prima lecție
          </button>
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden divide-y divide-zinc-100">
          {lessons.map((lesson, index) => (
            <div
              key={lesson.id}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50 transition-colors group"
            >
              <GripVertical className="h-4 w-4 text-zinc-300 shrink-0 cursor-grab" />

              <div className="h-6 w-6 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-semibold text-zinc-500">{index + 1}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {lesson[titleKey as keyof Lesson] as string}
                  </p>
                  {lesson.is_preview && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-0.5 border-green-200 text-green-700">
                      <Unlock className="h-2.5 w-2.5" />
                      Gratuit
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {lesson.bunny_video_id && (
                    <span className="text-[11px] text-zinc-400 font-mono truncate max-w-[120px]">
                      {lesson.bunny_video_id.slice(0, 8)}...
                    </span>
                  )}
                  {lesson.duration_seconds && (
                    <span className="flex items-center gap-0.5 text-[11px] text-zinc-400">
                      <Clock className="h-3 w-3" />
                      {formatDuration(lesson.duration_seconds)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => openEdit(lesson)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-zinc-400 hover:text-destructive"
                      disabled={deletingId === lesson.id}
                    >
                      {deletingId === lesson.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />
                      }
                    </Button>
                  }
                  title="Șterge lecția"
                  description={`Ești sigur că vrei să ștergi "${lesson[titleKey as keyof Lesson]}"? Acțiunea este ireversibilă.`}
                  confirmLabel="Șterge"
                  onConfirm={() => handleDelete(lesson.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <LessonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lesson={editLesson}
        language={language}
        onSave={handleSave}
      />
    </div>
  )
}
