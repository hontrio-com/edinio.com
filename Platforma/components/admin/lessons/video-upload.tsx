'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Upload, CheckCircle2, Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface VideoUploadProps {
  lessonId: string
  courseSlug: string
  lessonOrder: number
  currentStoragePath?: string | null
  onSuccess: (storagePath: string) => void
}

const BUCKET = 'course-videos'
const MAX_SIZE_MB = 500

export function VideoUpload({
  lessonId,
  courseSlug,
  lessonOrder,
  currentStoragePath,
  onSuccess,
}: VideoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const supabase = createClient()

  async function handleFile(file: File) {
    if (!file.type.startsWith('video/')) {
      toast({ title: 'Doar fișiere video acceptate', variant: 'destructive' })
      return
    }
    const sizeMB = file.size / 1024 / 1024
    if (sizeMB > MAX_SIZE_MB) {
      toast({
        title: `Fișierul e prea mare (${sizeMB.toFixed(0)} MB)`,
        description: `Maxim ${MAX_SIZE_MB} MB per fișier`,
        variant: 'destructive',
      })
      return
    }

    setUploading(true)
    setProgress(0)

    const storagePath = `${courseSlug}/lectia-${lessonOrder}-${lessonId.slice(0, 8)}.mp4`

    try {
      const progressInterval = setInterval(() => {
        setProgress(p => Math.min(p + Math.random() * 15, 85))
      }, 800)

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: 'video/mp4', upsert: true, cacheControl: '3600' })

      clearInterval(progressInterval)

      if (error) {
        toast({ title: 'Eroare la upload', description: error.message, variant: 'destructive' })
        setUploading(false)
        return
      }

      setProgress(95)

      const { error: dbError } = await supabase
        .from('lessons')
        .update({ storage_path: storagePath })
        .eq('id', lessonId)

      if (dbError) {
        toast({
          title: 'Upload reușit dar DB nu s-a actualizat',
          description: `storage_path manual: ${storagePath}`,
          variant: 'destructive',
        })
      } else {
        setProgress(100)
        toast({ title: 'Video uploadat cu succes!' })
        onSuccess(storagePath)
      }
    } catch {
      toast({ title: 'Eroare neașteptată', variant: 'destructive' })
    } finally {
      setUploading(false)
      setTimeout(() => setProgress(0), 2000)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="space-y-3">
      {currentStoragePath && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-xs text-green-800 font-mono truncate flex-1">{currentStoragePath}</span>
          <Badge variant="secondary" className="text-[10px] shrink-0">Uploadat</Badge>
        </div>
      )}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
          isDragOver ? 'border-primary bg-primary/5' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50',
          uploading && 'pointer-events-none opacity-70'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/ogg"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {uploading ? (
          <div className="space-y-3">
            <Film className="h-8 w-8 text-primary mx-auto animate-pulse" />
            <p className="text-sm font-medium">Se uploadează...</p>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-8 w-8 text-zinc-400 mx-auto" />
            <p className="text-sm font-medium text-zinc-700">
              {currentStoragePath ? 'Înlocuiește video-ul' : 'Upload video lecție'}
            </p>
            <p className="text-xs text-zinc-400">Drag & drop sau click · MP4, WebM · Max 500 MB</p>
          </div>
        )}
      </div>
    </div>
  )
}
