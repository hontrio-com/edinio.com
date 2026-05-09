'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [showCelebration, setShowCelebration] = useState(false)
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

    if (newCompleted) {
      setShowCelebration(true)
      setTimeout(() => setShowCelebration(false), 1500)
      fetch('/api/badges/check', { method: 'POST' })
    }

    router.refresh()

    if (newCompleted && nextLessonId) {
      setTimeout(() => {
        router.push(`/curs/${courseSlug}/lectia/${nextLessonId}`)
      }, 1000)
    }
  }

  return (
    <div className="relative">
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ scale: 0, opacity: 0, y: 0 }}
            animate={{ scale: 1, opacity: 1, y: -40 }}
            exit={{ opacity: 0, y: -60 }}
            transition={{ duration: 0.4 }}
            className="absolute -top-2 left-1/2 -translate-x-1/2 text-2xl pointer-events-none z-10"
          >
            🎉
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div whileTap={{ scale: 0.95 }}>
        <Button
          variant={isCompleted ? 'secondary' : 'default'}
          size="sm"
          onClick={toggle}
          disabled={isLoading}
          className="shrink-0 gap-2"
        >
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="h-4 w-4 animate-spin" />
              </motion.div>
            ) : isCompleted ? (
              <motion.div
                key="completed"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              >
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </motion.div>
            ) : (
              <motion.div key="incomplete" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Circle className="h-4 w-4" />
              </motion.div>
            )}
          </AnimatePresence>
          {isCompleted ? 'Finalizat' : 'Marchează ca finalizat'}
        </Button>
      </motion.div>
    </div>
  )
}
