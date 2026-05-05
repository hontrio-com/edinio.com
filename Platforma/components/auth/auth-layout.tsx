'use client'

import { AuroraBackground } from '@/components/ui/aurora-background'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: React.ReactNode
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <AuroraBackground showRadialGradient animationSpeed={15}>
      <div className="relative z-10 w-full max-w-sm px-4 flex flex-col items-center gap-8">

        {/* Card */}
        <div className="w-full rounded-2xl border border-zinc-200 bg-white/80 backdrop-blur-xl p-8 shadow-xl">
          <div className="mb-7 space-y-1.5 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {title}
            </h1>
            <p className="text-sm text-zinc-500">{subtitle}</p>
          </div>
          {children}
        </div>

        {/* Quote */}
        <blockquote className="text-center px-4 space-y-1.5 pb-4">
          <p className="text-[13px] text-zinc-500 leading-relaxed italic">
            &ldquo;AI nu va înlocui oamenii. Oamenii care știu să folosească AI
            îi vor înlocui pe cei care nu știu.&rdquo;
          </p>
          <footer className="text-[11px] text-zinc-400 font-medium tracking-wide uppercase">
            Principiul Edinio
          </footer>
        </blockquote>

      </div>
    </AuroraBackground>
  )
}
