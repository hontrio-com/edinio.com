'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SectionHeader } from './section-header'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Loader2, Save } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface NotifPrefs {
  email_purchase_confirm: boolean
  email_new_lesson: boolean
  email_tips: boolean
  email_promotions: boolean
  email_platform_updates: boolean
}

const ITEMS: { key: keyof NotifPrefs; label: string; description: string; locked: boolean }[] = [
  {
    key: 'email_purchase_confirm',
    label: 'Confirmări plată',
    description: 'Email imediat după fiecare achiziție reușită, cu datele de acces.',
    locked: true,
  },
  {
    key: 'email_new_lesson',
    label: 'Lecții noi',
    description: 'Notificare când adăugăm conținut nou la cursurile tale.',
    locked: false,
  },
  {
    key: 'email_tips',
    label: 'Sfaturi și tips AI',
    description: 'Newsletter săptămânal cu cele mai utile unelte și tehnici AI.',
    locked: false,
  },
  {
    key: 'email_promotions',
    label: 'Oferte și promoții',
    description: 'Reduceri exclusive și oferte speciale la cursuri noi.',
    locked: false,
  },
  {
    key: 'email_platform_updates',
    label: 'Actualizări platformă',
    description: 'Funcții noi și schimbări importante pe Edinio.',
    locked: false,
  },
]

interface NotificationsSectionProps {
  userId: string
  initialPrefs: NotifPrefs
}

export function NotificationsSection({ userId: _userId, initialPrefs }: NotificationsSectionProps) {
  const { toast } = useToast()
  const [prefs, setPrefs] = useState<NotifPrefs>(initialPrefs)
  const [isDirty, setIsDirty] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  function toggle(key: keyof NotifPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
    setIsDirty(true)
  }

  async function handleSave() {
    setIsLoading(true)
    const { error } = await supabase.auth.updateUser({
      data: { notification_prefs: prefs },
    })
    if (error) {
      toast({ title: 'Eroare la salvare', variant: 'destructive' })
    } else {
      toast({ title: 'Preferințe salvate.' })
      setIsDirty(false)
    }
    setIsLoading(false)
  }

  return (
    <div>
      <SectionHeader
        label="Notificări"
        title="Emailuri și comunicări"
        description="Alege ce emailuri vrei să primești de la Edinio."
        action={
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isLoading || !isDirty}
            className="h-8 px-4 text-xs gap-1.5"
          >
            {isLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Save className="h-3.5 w-3.5" />
            }
            Salvează
          </Button>
        }
      />

      <div className="divide-y divide-border/60">
        {ITEMS.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-6 py-4">
            <div className="space-y-0.5 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{item.label}</p>
                {item.locked && (
                  <span className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-full">
                    Obligatoriu
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
            <Switch
              checked={prefs[item.key]}
              onCheckedChange={() => { if (!item.locked) toggle(item.key) }}
              disabled={item.locked}
              aria-label={item.label}
              className="shrink-0"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
