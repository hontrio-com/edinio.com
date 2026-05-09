'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  duration?: number
  className?: string
  prefix?: string
  suffix?: string
}

export function AnimatedCounter({
  value,
  duration = 1.5,
  className,
  prefix = '',
  suffix = '',
}: AnimatedCounterProps) {
  const [displayed, setDisplayed] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })

  useEffect(() => {
    if (!isInView) return
    const startTime = performance.now()

    function update(currentTime: number) {
      const elapsed = (currentTime - startTime) / 1000
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(value * eased))
      if (progress < 1) requestAnimationFrame(update)
    }

    requestAnimationFrame(update)
  }, [isInView, value, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}{displayed.toLocaleString('ro-RO')}{suffix}
    </span>
  )
}
