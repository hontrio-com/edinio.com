'use client'

import { useState, useEffect } from 'react'

interface Props {
  targetDate: Date
}

export function CountdownTimer({ targetDate }: Props) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft())

  function getTimeLeft() {
    const diff = Math.max(0, targetDate.getTime() - Date.now())
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return { hours, minutes, seconds }
  }

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeLeft()), 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="flex items-center gap-2 text-2xl font-mono font-bold tabular-nums">
      <span>{pad(timeLeft.hours)}</span>
      <span className="text-muted-foreground">:</span>
      <span>{pad(timeLeft.minutes)}</span>
      <span className="text-muted-foreground">:</span>
      <span>{pad(timeLeft.seconds)}</span>
    </div>
  )
}
