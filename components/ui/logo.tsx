import { GraduationCap } from 'lucide-react'
import Link from 'next/link'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  href?: string
}

const sizes = {
  sm: { box: 30, icon: 16, radius: 8,  text: '16px', gap: '8px' },
  md: { box: 38, icon: 20, radius: 10, text: '20px', gap: '10px' },
  lg: { box: 52, icon: 28, radius: 14, text: '28px', gap: '14px' },
}

export function Logo({ size = 'md', href = '/' }: LogoProps) {
  const s = sizes[size]

  const content = (
    <span className="inline-flex items-center" style={{ gap: s.gap }}>
      {/* Icon box */}
      <span
        style={{
          width: s.box,
          height: s.box,
          borderRadius: s.radius,
          background: 'linear-gradient(145deg, #4ade80 0%, #16a34a 55%, #15803d 100%)',
          boxShadow: '0 2px 10px rgba(22,163,74,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <GraduationCap size={s.icon} color="white" strokeWidth={2.2} />
      </span>

      {/* Text */}
      <span
        style={{
          fontSize: s.text,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: '#0a1a0f',
          lineHeight: 1,
        }}
      >
        Edinio
      </span>
    </span>
  )

  return (
    <Link href={href} className="inline-flex items-center hover:opacity-90 transition-opacity">
      {content}
    </Link>
  )
}
