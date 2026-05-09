'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

export function PayoutActionsClient({ request }: { request: any }) {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  if (request.status !== 'pending') return null

  async function updateStatus(status: 'paid' | 'rejected') {
    setLoading(status)
    const { error } = await supabase
      .from('payout_requests')
      .update({ status, processed_at: new Date().toISOString() })
      .eq('id', request.id)

    if (!error) {
      if (status === 'paid') {
        await supabase.rpc('mark_payout_complete', {
          p_user_id: request.user_id,
          p_amount: request.amount,
        })
      } else {
        await supabase.rpc('increment_referral_balance', {
          p_user_id: request.user_id,
          p_amount: request.amount,
        })
      }
      toast({ title: status === 'paid' ? 'Marcat ca plătit' : 'Cerere respinsă' })
      router.refresh()
    }
    setLoading(null)
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        size="sm"
        className="h-7 px-2.5 text-xs gap-1 bg-green-700 hover:bg-green-800 text-white"
        onClick={() => updateStatus('paid')}
        disabled={!!loading}
      >
        {loading === 'paid' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Plătit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2.5 text-xs gap-1 text-destructive hover:text-destructive"
        onClick={() => updateStatus('rejected')}
        disabled={!!loading}
      >
        {loading === 'rejected' ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        Respinge
      </Button>
    </div>
  )
}
