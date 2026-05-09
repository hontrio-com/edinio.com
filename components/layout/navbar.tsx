'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'

const NAV_LINKS = [
  { label: 'Curriculum', href: '#curriculum' },
  { label: 'Beneficii', href: '#beneficii' },
  { label: 'Testimoniale', href: '#testimoniale' },
  { label: 'Pret', href: '#pret' },
  { label: 'FAQ', href: '#faq' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const navbarStyle = scrolled
    ? {
        background: 'rgba(5,16,10,0.8)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }
    : {
        background: 'rgba(5,16,10,0.4)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }

  return (
    <header
      className="sticky top-0 z-50 transition-all duration-300"
      style={navbarStyle}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link
          href="/"
          className="font-bold text-xl tracking-tight shrink-0"
          style={{
            background: 'linear-gradient(135deg, #86efac 0%, #4ade80 50%, #22c55e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Edinio
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-150"
              style={{ color: 'rgba(240,250,244,0.6)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'rgba(240,250,244,0.95)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(240,250,244,0.6)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* CTA buttons desktop */}
        <div className="hidden md:flex items-center gap-2.5 shrink-0">
          <Link
            href="/auth/login"
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(240,250,244,0.75)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
              e.currentTarget.style.color = 'rgba(240,250,244,0.95)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.color = 'rgba(240,250,244,0.75)'
            }}
          >
            Intra in cont
          </Link>
          <Link
            href="/checkout"
            className="px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200 hover:scale-[1.03] hover:brightness-110 active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)',
              boxShadow: '0 0 20px rgba(74,222,128,0.25), 0 2px 8px rgba(0,0,0,0.3)',
              color: '#fff',
            }}
          >
            Vreau acces
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg"
          style={{ color: 'rgba(240,250,244,0.7)', background: 'rgba(255,255,255,0.05)' }}
          onClick={() => setOpen((v) => !v)}
          aria-label="Meniu"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="md:hidden px-4 pb-5 pt-2"
            style={{
              background: 'rgba(5,16,10,0.97)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <nav className="flex flex-col gap-1 mb-4">
              {NAV_LINKS.map(({ label, href }) => (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="px-4 py-3 text-sm font-medium rounded-xl"
                  style={{ color: 'rgba(240,250,244,0.7)' }}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="flex flex-col gap-2">
              <Link
                href="/auth/login"
                onClick={() => setOpen(false)}
                className="w-full text-center py-3 text-sm font-medium rounded-xl"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(240,250,244,0.75)',
                }}
              >
                Intra in cont
              </Link>
              <Link
                href="/checkout"
                onClick={() => setOpen(false)}
                className="w-full text-center py-3 text-sm font-semibold rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)',
                  color: '#fff',
                }}
              >
                Vreau acces
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
