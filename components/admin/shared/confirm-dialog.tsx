'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface ConfirmDialogProps {
  trigger: React.ReactNode
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'default'
  onConfirm: () => Promise<void>
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirmă',
  cancelLabel = 'Anulează',
  variant = 'destructive',
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
    setOpen(false)
  }

  return (
    <>
      <span onClick={() => setOpen(true)} style={{ display: 'contents' }}>
        {trigger}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{description}</p>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={loading}
              className="gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
