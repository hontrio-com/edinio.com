'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Copy, Check, Users, Wallet, ArrowDownToLine, Loader2, Gift } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { formatPrice } from '@/lib/utils'
import { MIN_PAYOUT_RON, REFERRAL_REWARD_RON } from '@/lib/referral-constants'

interface Conversion {
  id: string
  reward_amount: number
  reward_currency: string
  status: string
  created_at: string
}

interface ReferralSectionProps {
  balance: { total_earned: number; available_balance: number; total_paid_out: number } | null
  conversions: Conversion[]
  language: 'ro' | 'en'
}

export function ReferralSection({ balance, conversions, language }: ReferralSectionProps) {
  const { toast } = useToast()
  const [referralUrl, setReferralUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutMethod, setPayoutMethod] = useState<'bank' | 'paypal'>('bank')
  const [iban, setIban] = useState('')
  const [paypalEmail, setPaypalEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingCode, setLoadingCode] = useState(true)

  useEffect(() => {
    fetch('/api/referral/code')
      .then((r) => r.json())
      .then((data) => { setReferralUrl(data.url ?? ''); setLoadingCode(false) })
      .catch(() => setLoadingCode(false))
  }, [])

  async function copyCode() {
    if (!referralUrl) return
    await navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: language === 'ro' ? 'Link copiat!' : 'Link copied!' })
  }

  async function requestPayout() {
    if (!payoutAmount) return
    const amount = Math.round(parseFloat(payoutAmount) * 100)
    if (amount < MIN_PAYOUT_RON) {
      toast({
        title: language === 'ro'
          ? `Minimul pentru retragere este ${MIN_PAYOUT_RON / 100} RON`
          : `Minimum payout is ${MIN_PAYOUT_RON / 100} RON`,
        variant: 'destructive',
      })
      return
    }
    setIsLoading(true)
    const res = await fetch('/api/referral/payout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        method: payoutMethod,
        iban: payoutMethod === 'bank' ? iban : undefined,
        paypal_email: payoutMethod === 'paypal' ? paypalEmail : undefined,
      }),
    })
    if (res.ok) {
      toast({
        title: language === 'ro' ? 'Cerere de retragere trimisă!' : 'Payout request submitted!',
        description: language === 'ro'
          ? 'Vei fi contactat în 1-3 zile lucrătoare.'
          : 'You will be contacted within 1-3 business days.',
      })
      setPayoutOpen(false)
    } else {
      const data = await res.json()
      toast({ title: data.error ?? 'Eroare', variant: 'destructive' })
    }
    setIsLoading(false)
  }

  const availableForPayout = balance?.available_balance ?? 0
  const canRequestPayout = availableForPayout >= MIN_PAYOUT_RON

  const stats = [
    {
      label: language === 'ro' ? 'Total câștigat' : 'Total earned',
      value: formatPrice(balance?.total_earned ?? 0, 'ron'),
      icon: Gift,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: language === 'ro' ? 'Disponibil' : 'Available',
      value: formatPrice(availableForPayout, 'ron'),
      icon: Wallet,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: language === 'ro' ? 'Prieteni aduși' : 'Friends referred',
      value: String(conversions.length),
      icon: Users,
      color: 'text-purple-600 bg-purple-50',
    },
  ]

  return (
    <section className="space-y-4">
      <h2 className="text-base font-medium">
        {language === 'ro' ? 'Program de referral' : 'Referral program'}
      </h2>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <motion.div
              key={stat.label}
              whileHover={{ y: -1 }}
              className="flex items-center gap-3 p-3 bg-background border border-border/60 rounded-xl"
            >
              <div className={`p-2 rounded-lg ${stat.color} shrink-0`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-base font-semibold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </motion.div>
          )
        })}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            {language === 'ro' ? 'Linkul tău de referral' : 'Your referral link'}
          </Label>
          <span className="text-xs text-muted-foreground">
            +{formatPrice(REFERRAL_REWARD_RON, 'ron')} {language === 'ro' ? 'per prieten' : 'per friend'}
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            value={loadingCode ? '...' : referralUrl}
            readOnly
            className="text-sm font-mono bg-muted/40 text-muted-foreground h-9"
          />
          <Button
            size="sm"
            variant={copied ? 'secondary' : 'default'}
            className="h-9 gap-2 shrink-0"
            onClick={copyCode}
            disabled={loadingCode}
          >
            {copied
              ? <><Check className="h-3.5 w-3.5" /> Copiat</>
              : <><Copy className="h-3.5 w-3.5" /> Copiază</>
            }
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {language === 'ro'
            ? `Când un prieten cumpără primul curs folosind linkul tău, primești automat ${formatPrice(REFERRAL_REWARD_RON, 'ron')} în cont.`
            : `When a friend buys their first course using your link, you automatically receive ${formatPrice(REFERRAL_REWARD_RON, 'ron')} in your account.`
          }
        </p>
      </div>

      {availableForPayout > 0 && (
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
          <div>
            <p className="text-sm font-medium text-green-800">
              {language === 'ro'
                ? `${formatPrice(availableForPayout, 'ron')} disponibili pentru retragere`
                : `${formatPrice(availableForPayout, 'ron')} available for payout`
              }
            </p>
            {!canRequestPayout && (
              <p className="text-xs text-green-600 mt-0.5">
                {language === 'ro'
                  ? `Minim ${formatPrice(MIN_PAYOUT_RON, 'ron')} pentru retragere`
                  : `Minimum ${formatPrice(MIN_PAYOUT_RON, 'ron')} for payout`
                }
              </p>
            )}
          </div>
          <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
            <DialogTrigger render={
              <button
                disabled={!canRequestPayout}
                className="inline-flex items-center gap-2 text-xs font-medium px-3 h-8 rounded-md bg-green-700 hover:bg-green-800 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            }>
              <ArrowDownToLine className="h-3.5 w-3.5" />
              {language === 'ro' ? 'Retrage' : 'Withdraw'}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {language === 'ro' ? 'Cerere de retragere' : 'Payout request'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="p-3 bg-muted rounded-lg text-sm">
                  {language === 'ro'
                    ? `Disponibil: ${formatPrice(availableForPayout, 'ron')}`
                    : `Available: ${formatPrice(availableForPayout, 'ron')}`
                  }
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{language === 'ro' ? 'Sumă (RON)' : 'Amount (RON)'}</Label>
                  <Input
                    type="number"
                    placeholder={`Min. ${MIN_PAYOUT_RON / 100} RON`}
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    max={availableForPayout / 100}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{language === 'ro' ? 'Metodă de plată' : 'Payment method'}</Label>
                  <Select value={payoutMethod} onValueChange={(v: 'bank' | 'paypal' | null) => { if (v) setPayoutMethod(v) }}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Transfer bancar (IBAN)</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {payoutMethod === 'bank' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">IBAN</Label>
                    <Input
                      placeholder="RO49 AAAA 1B31 0075 9384 0000"
                      value={iban}
                      onChange={(e) => setIban(e.target.value)}
                      className="h-9 text-sm font-mono"
                    />
                  </div>
                )}
                {payoutMethod === 'paypal' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email PayPal</Label>
                    <Input
                      type="email"
                      placeholder="tu@exemplu.com"
                      value={paypalEmail}
                      onChange={(e) => setPaypalEmail(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {language === 'ro'
                    ? 'Plata se procesează manual în 1-3 zile lucrătoare.'
                    : 'Payment is processed manually within 1-3 business days.'
                  }
                </p>
                <Button onClick={requestPayout} disabled={isLoading || !payoutAmount} className="w-full gap-2">
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {language === 'ro' ? 'Trimite cererea' : 'Submit request'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {conversions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {language === 'ro' ? 'Istoric' : 'History'}
          </p>
          <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/40">
            {conversions.slice(0, 5).map((conv) => (
              <div key={conv.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-muted-foreground">
                    {new Date(conv.created_at).toLocaleDateString('ro-RO', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    +{formatPrice(conv.reward_amount, conv.reward_currency as 'ron' | 'eur')}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {conv.status === 'approved'
                      ? (language === 'ro' ? 'Aprobat' : 'Approved')
                      : conv.status
                    }
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
