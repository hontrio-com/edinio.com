'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface VideoPlayerProps {
  lessonId: string
  userId: string
  initialProgress?: number
  onComplete?: () => void
}

const SAVE_INTERVAL_SECONDS = 10
const URL_REFRESH_BEFORE_EXPIRY = 300

export function VideoPlayer({
  lessonId,
  userId,
  initialProgress = 0,
  onComplete,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastSavedTime = useRef<number>(0)
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  const fetchSignedUrl = useCallback(async () => {
    try {
      const res = await fetch(`/api/video/signed-url?lessonId=${lessonId}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Nu s-a putut încărca video-ul')
        setLoading(false)
        return null
      }
      const data = await res.json()
      setSignedUrl(data.url)
      setLoading(false)
      setError(null)

      const refreshIn = (data.expiresIn - URL_REFRESH_BEFORE_EXPIRY) * 1000
      if (refreshIn > 0) {
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = setTimeout(() => fetchSignedUrl(), refreshIn)
      }
      return data.url
    } catch {
      setError('Eroare de conexiune. Încearcă din nou.')
      setLoading(false)
      return null
    }
  }, [lessonId])

  useEffect(() => {
    fetchSignedUrl()
    return () => { if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current) }
  }, [fetchSignedUrl])

  // Restaurează progresul după ce video-ul e gata
  useEffect(() => {
    if (!signedUrl || !videoRef.current) return
    const video = videoRef.current
    function handleCanPlay() {
      if (initialProgress > 10 && video.duration) {
        video.currentTime = Math.min(initialProgress, video.duration - 2)
      }
    }
    video.addEventListener('canplay', handleCanPlay, { once: true })
    return () => video.removeEventListener('canplay', handleCanPlay)
  }, [signedUrl, initialProgress])

  const saveProgress = useCallback(async (currentTime: number, completed = false) => {
    if (Math.abs(currentTime - lastSavedTime.current) < 5) return
    lastSavedTime.current = currentTime
    await supabase.from('lesson_progress').upsert({
      user_id: userId,
      lesson_id: lessonId,
      progress_seconds: Math.floor(currentTime),
      completed,
      last_watched_at: new Date().toISOString(),
    }, { onConflict: 'user_id,lesson_id' })
  }, [lessonId, userId, supabase])

  useEffect(() => {
    if (!signedUrl || !videoRef.current) return
    const video = videoRef.current

    const handleTimeUpdate = () => {
      if (Math.floor(video.currentTime) % SAVE_INTERVAL_SECONDS === 0 && video.currentTime > 0) {
        saveProgress(video.currentTime)
      }
    }
    const handleEnded = async () => {
      await saveProgress(video.duration, true)
      onComplete?.()
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('ended', handleEnded)
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('ended', handleEnded)
    }
  }, [signedUrl, saveProgress, onComplete])

  if (loading) {
    return (
      <div className="aspect-video bg-zinc-950 rounded-xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-zinc-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Se încarcă video-ul...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="aspect-video bg-zinc-950 rounded-xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-zinc-400 text-sm">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setLoading(true); setError(null); fetchSignedUrl() }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Încearcă din nou
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="aspect-video bg-zinc-950 rounded-xl overflow-hidden relative">
      <video
        ref={videoRef}
        src={signedUrl ?? undefined}
        className="w-full h-full"
        controls
        controlsList="nodownload noremoteplayback"
        playsInline
        onContextMenu={(e) => e.preventDefault()}
        preload="metadata"
      />
      <div className="absolute inset-0 pointer-events-none" style={{ userSelect: 'none' }} />
    </div>
  )
}
