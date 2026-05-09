'use client'

import { useState } from 'react'
import { ArrowRight, Lock, Loader2 } from 'lucide-react'

interface CheckoutButtonProps {
  courseId: string
  currency: 'ron' | 'eur'
  label?: string
}

export function CheckoutButton({ courseId, currency, label = 'Mergi la plată' }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCheckout = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, currency }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setError('Ai deja acces la acest curs. Mergi la dashboard.')
        } else {
          setError(data.error ?? 'A apărut o eroare. Încearcă din nou.')
        }
        return
      }
      window.location.href = data.url
    } catch {
      setError('Conexiune eșuată. Verifică internetul și încearcă din nou.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2.5 rounded-xl py-4 text-base font-bold tracking-wide transition-all duration-200 hover:brightness-105 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed disabled:scale-100"
        style={{
          background: loading
            ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
            : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          boxShadow: '0 0 32px rgba(34,197,94,0.35), 0 4px 16px rgba(0,0,0,0.12)',
          color: '#fff',
        }}
      >
        {loading ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            Se pregătește plata...
          </>
        ) : (
          <>
            {label}
            <ArrowRight className="size-5" />
          </>
        )}
      </button>

      {error && (
        <p className="text-center text-sm font-medium" style={{ color: '#dc2626' }}>
          {error}
        </p>
      )}

      <div className="flex items-center justify-center gap-1.5 text-xs" style={{ color: 'rgba(10,26,15,0.4)' }}>
        <Lock className="size-3" />
        Plată securizată prin Stripe · Datele tale sunt protejate
      </div>
    </div>
  )
}
