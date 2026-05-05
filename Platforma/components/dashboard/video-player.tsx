'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface VideoPlayerProps {
  bunnyVideoId: string | null
  lessonId: string
  userId: string
  initialProgress?: number
}

export function VideoPlayer({
  bunnyVideoId,
  lessonId,
  userId,
  initialProgress = 0,
}: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  const saveProgress = useCallback(
    async (seconds: number) => {
      await supabase.from('lesson_progress').upsert(
        {
          user_id: userId,
          lesson_id: lessonId,
          progress_seconds: Math.floor(seconds),
          last_watched_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,lesson_id' }
      )
    },
    [lessonId, userId, supabase]
  )

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return
      const { event: playerEvent, seconds } = event.data as {
        event?: string
        seconds?: number
      }

      if (playerEvent === 'timeupdate' && seconds) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(() => saveProgress(seconds), 5000)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [saveProgress])

  if (!bunnyVideoId) {
    return (
      <div className="aspect-video bg-muted rounded-xl flex items-center justify-center">
        <p className="text-muted-foreground text-sm">
          Video indisponibil momentan
        </p>
      </div>
    )
  }

  const startTime = initialProgress > 10 ? `&t=${initialProgress}` : ''
  const src = `https://iframe.mediadelivery.net/embed/${process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID}/${bunnyVideoId}?autoplay=false&loop=false&muted=false&preload=true${startTime}`

  return (
    <div className="aspect-video rounded-xl overflow-hidden bg-black">
      <iframe
        ref={iframeRef}
        src={src}
        className="w-full h-full"
        allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
        allowFullScreen
        title="Video lecție"
      />
    </div>
  )
}
