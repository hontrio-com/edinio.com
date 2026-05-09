'use client'

import Link from 'next/link'

const BG = '#05100a'
const TEXT_DIM = 'rgba(240,250,244,0.4)'
const TEXT_MUTED = 'rgba(240,250,244,0.22)'
const GREEN = '#4ade80'

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
        backgroundColor: BG,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        color: 'rgba(240,250,244,0.85)',
      }}
    >
      <div className="container mx-auto px-4 pt-16 pb-10">
        {/* Top row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 mb-14">
          {/* Brand */}
          <div className="col-span-2">
            <Link
              href="/"
              className="font-bold text-2xl tracking-tight block mb-4"
              style={{
                background: 'linear-gradient(135deg, #86efac 0%, #4ade80 50%, #22c55e 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Edinio
            </Link>
            <p className="text-sm leading-relaxed mb-6" style={{ color: TEXT_DIM }}>
              Invata sa creezi videoclipuri profesionale cu Inteligenta Artificiala. De la zero,
              in mai putin de 2 ore.
            </p>
            <div className="flex items-center gap-2">
              <div
                className="size-2 rounded-full"
                style={{ backgroundColor: GREEN }}
              />
              <span className="text-xs font-medium" style={{ color: TEXT_DIM }}>
                500+ cursanti activi
              </span>
            </div>
          </div>

          {/* Nav columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <p
                className="text-xs font-bold tracking-[0.15em] uppercase mb-5"
                style={{ color: TEXT_MUTED }}
              >
                {col.title}
              </p>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm transition-all duration-150 hover:opacity-80"
                      style={{ color: TEXT_DIM }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'rgba(240,250,244,0.8)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = TEXT_DIM
                      }}
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
        <div
          className="h-px w-full mb-8"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        />

        {/* Bottom row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            &copy; {new Date().getFullYear()} Edinio. Toate drepturile rezervate.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/termeni"
              className="text-xs transition-colors hover:opacity-70"
              style={{ color: TEXT_MUTED }}
            >
              Termeni
            </Link>
            <Link
              href="/confidentialitate"
              className="text-xs transition-colors hover:opacity-70"
              style={{ color: TEXT_MUTED }}
            >
              Confidentialitate
            </Link>
            <Link
              href="/cookies"
              className="text-xs transition-colors hover:opacity-70"
              style={{ color: TEXT_MUTED }}
            >
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
