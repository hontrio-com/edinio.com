'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface MarkCompleteButtonProps {
  lessonId: string
  userId: string
  isCompleted: boolean
  nextLessonId?: string | null
  courseSlug: string
}

export function MarkCompleteButton({
  lessonId,
  userId,
  isCompleted: initialCompleted,
  nextLessonId,
  courseSlug,
}: MarkCompleteButtonProps) {
  const router = useRouter()
  const [isCompleted, setIsCompleted] = useState(initialCompleted)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  async function toggle() {
    setIsLoading(true)
    const newCompleted = !isCompleted

    await supabase.from('lesson_progress').upsert(
      {
        user_id: userId,
        lesson_id: lessonId,
        completed: newCompleted,
        last_watched_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lesson_id' }
    )

    setIsCompleted(newCompleted)
    setIsLoading(false)
    router.refresh()

    // Auto-navigate to next lesson after marking complete
    if (newCompleted && nextLessonId) {
      setTimeout(() => {
        router.push(`/curs/${courseSlug}/lectia/${nextLessonId}`)
      }, 800)
    }
  }

  return (
    <Button
      variant={isCompleted ? 'secondary' : 'default'}
      size="sm"
      onClick={toggle}
      disabled={isLoading}
      className="shrink-0 gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isCompleted ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <Circle className="h-4 w-4" />
      )}
      {isCompleted ? 'Finalizat' : 'Marchează ca finalizat'}
    </Button>
  )
}
