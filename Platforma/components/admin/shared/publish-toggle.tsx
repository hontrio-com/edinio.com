'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'

interface PublishToggleProps {
  id: string
  table: 'courses' | 'bundles'
  isPublished: boolean | null
}

export function PublishToggle({ id, table, isPublished: initial }: PublishToggleProps) {
  const [isPublished, setIsPublished] = useState(initial ?? false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  async function toggle() {
    setLoading(true)
    const newVal = !isPublished
    const { error } = await supabase.from(table).update({ is_published: newVal }).eq('id', id)
    if (!error) {
      setIsPublished(newVal)
      toast({ title: newVal ? 'Publicat' : 'Ascuns din platformă' })
      router.refresh()
    } else {
      toast({ title: 'Eroare', variant: 'destructive' })
    }
    setLoading(false)
  }

  return (
    <Switch
      checked={isPublished}
      onCheckedChange={toggle}
      disabled={loading}
      aria-label={isPublished ? 'Unpublish' : 'Publish'}
    />
  )
}
