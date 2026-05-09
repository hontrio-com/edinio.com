'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('edinio_cookie_consent')
      if (!saved) setVisible(true)
    } catch {
      // localStorage not available
    }
  }, [])

  const accept = (all: boolean) => {
    const consent = {
      necessary: true,
      preferences: all,
      analytics: all,
      marketing: all,
      timestamp: new Date().toISOString(),
    }
    try {
      localStorage.setItem('edinio_cookie_consent', JSON.stringify(consent))
    } catch {}
    const maxAge = 365 * 24 * 60 * 60
    document.cookie = `edinio_cookie_consent=${all ? 'all' : 'necessary'}; max-age=${maxAge}; path=/; SameSite=Lax`
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] px-4 py-4 sm:py-5"
      style={{
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.07)',
      }}
    >
      <div className="container mx-auto max-w-5xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Icon + Text */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className="flex-shrink-0 mt-0.5 size-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold mb-0.5" style={{ color: '#0a1a0f' }}>
              Respectăm confidențialitatea ta
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(10,26,15,0.55)' }}>
              Folosim cookie-uri pentru funcționarea platformei și, cu acordul tău, pentru analiză și marketing.{' '}
              <Link
                href="/cookies"
                className="underline underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: '#16a34a' }}
              >
                Politica cookies
              </Link>
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2.5 flex-shrink-0 self-stretch sm:self-auto">
          <button
            onClick={() => accept(false)}
            className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-semibold rounded-lg transition-all duration-200 hover:bg-black/[0.07] active:scale-[0.97]"
            style={{
              background: 'rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.1)',
              color: 'rgba(10,26,15,0.65)',
            }}
          >
            Doar necesarele
          </button>
          <button
            onClick={() => accept(true)}
            className="flex-1 sm:flex-none px-5 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 hover:brightness-105 active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              boxShadow: '0 0 16px rgba(34,197,94,0.25), 0 2px 8px rgba(0,0,0,0.1)',
              color: '#fff',
            }}
          >
            Acceptă tot
          </button>
        </div>
      </div>
    </div>
  )
}
