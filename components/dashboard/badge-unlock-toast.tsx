'use client'

import { useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

interface BadgeUnlockToastProps {
  newBadgeIds: string[]
  allBadges: { id: string; name_ro: string; icon: string }[]
  language: 'ro' | 'en'
}

export function BadgeUnlockToast({ newBadgeIds, allBadges, language }: BadgeUnlockToastProps) {
  const { toast } = useToast()

  useEffect(() => {
    newBadgeIds.forEach((badgeId, i) => {
      const badge = allBadges.find((b) => b.id === badgeId)
      if (!badge) return
      setTimeout(() => {
        toast({
          title: language === 'ro'
            ? `🏆 Badge deblocat: ${badge.name_ro}`
            : `🏆 Badge unlocked: ${badge.name_ro}`,
          description: language === 'ro'
            ? 'Verifică profilul tău pentru a vedea toate badge-urile.'
            : 'Check your profile to see all badges.',
        })
      }, i * 800)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newBadgeIds.join(',')])

  return null
}
