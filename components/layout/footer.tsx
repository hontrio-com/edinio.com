'use client'

import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

const columns = [
  {
    title: 'Curs',
    links: [
      { label: 'Curriculum', href: '#curriculum' },
      { label: 'Beneficii', href: '#beneficii' },
      { label: 'Testimoniale', href: '#testimoniale' },
      { label: 'Pret', href: '#pret' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    title: 'Cont',
    links: [
      { label: 'Intra in cont', href: '/auth/login' },
      { label: 'Creeaza cont', href: '/auth/register' },
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  {
    title: 'Companie',
    links: [
      { label: 'Despre noi', href: '/despre' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Termeni si conditii', href: '/termeni' },
      { label: 'Politica de confidentialitate', href: '/confidentialitate' },
      { label: 'Politica cookies', href: '/cookies' },
    ],
  },
]

export function Footer() {
  return (
    <footer
      style={{
        backgroundColor: '#f4f9f6',
        borderTop: '1px solid rgba(0,0,0,0.07)',
        color: '#0a1a0f',
      }}
    >
      <div className="container mx-auto px-4 pt-16 pb-10">
        {/* Top row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 mb-14">
          {/* Brand */}
          <div className="col-span-2">
            <div className="mb-4">
              <Logo size="md" />
            </div>
            <p
              className="text-sm leading-relaxed mb-6"
              style={{ color: 'rgba(10,26,15,0.55)' }}
            >
              Invata sa creezi videoclipuri profesionale cu Inteligenta Artificiala. De la zero,
              in mai putin de 2 ore.
            </p>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-green-500" />
              <span className="text-xs font-medium" style={{ color: 'rgba(10,26,15,0.45)' }}>
                500+ cursanti activi
              </span>
            </div>
          </div>

          {/* Columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <p
                className="text-xs font-bold tracking-[0.15em] uppercase mb-5"
                style={{ color: 'rgba(10,26,15,0.3)' }}
              >
                {col.title}
              </p>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm transition-colors duration-150 hover:opacity-80"
                      style={{ color: 'rgba(10,26,15,0.55)' }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px w-full mb-8" style={{ background: 'rgba(0,0,0,0.07)' }} />

        {/* Bottom row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs" style={{ color: 'rgba(10,26,15,0.35)' }}>
            &copy; {new Date().getFullYear()} Edinio. Toate drepturile rezervate.
          </p>
          <div className="flex items-center gap-6">
            {[
              { label: 'Termeni', href: '/termeni' },
              { label: 'Confidentialitate', href: '/confidentialitate' },
              { label: 'Cookies', href: '/cookies' },
            ].map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs transition-colors hover:opacity-70"
                style={{ color: 'rgba(10,26,15,0.35)' }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
