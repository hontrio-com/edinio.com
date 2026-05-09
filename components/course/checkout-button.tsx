'use client'

import { useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { useGeo } from '@/lib/geo-context'
import type { VariantProps } from 'class-variance-authority'

type ButtonVariants = VariantProps<typeof buttonVariants>

interface Props {
  courseId: string
  courseSlug: string
  label?: string
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  className?: string
}

export function CheckoutButton({
  courseId,
  courseSlug: _courseSlug,
  label,
  variant,
  size = 'lg',
  className,
}: Props) {
  const [loading, setLoading] = useState(false)
  const { currency, language } = useGeo()

  const defaultLabel = language === 'ro' ? 'Cumpără acum' : 'Buy now'

  async function handleCheckout() {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, currency }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setLoading(false)
    }
  }

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleCheckout}
      disabled={loading}
      className={className}
    >
      {loading
        ? (language === 'ro' ? 'Se procesează...' : 'Processing...')
        : (label ?? defaultLabel)
      }
    </Button>
  )
}
