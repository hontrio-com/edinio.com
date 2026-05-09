import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'

const GREEN = '#16a34a'
const TEXT = '#0a1a0f'
const TEXT_BODY = 'rgba(10,26,15,0.68)'

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string
  lastUpdated: string
  children: React.ReactNode
}) {
  return (
    <>
      <Navbar />
      <main style={{ backgroundColor: '#f4f9f6', minHeight: '100vh', paddingBottom: '5rem' }}>
        <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="container mx-auto px-4 py-14 max-w-4xl">
            <p className="text-[11px] font-bold tracking-[0.22em] uppercase mb-3" style={{ color: GREEN }}>
              SC VOID SFT GAMES SRL
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3" style={{ color: TEXT }}>
              {title}
            </h1>
            <p className="text-sm" style={{ color: 'rgba(10,26,15,0.4)' }}>
              Ultima actualizare: {lastUpdated}
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 max-w-4xl">
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
          >
            <div className="p-8 sm:p-12 space-y-12" style={{ color: TEXT_BODY }}>
              {children}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

export function LSection({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-start gap-3 mb-5">
        <span
          className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold"
          style={{ background: 'rgba(22,163,74,0.1)', color: GREEN, border: '1px solid rgba(22,163,74,0.22)' }}
        >
          {num}
        </span>
        <h2 className="text-xl font-bold leading-tight pt-0.5" style={{ color: TEXT }}>
          {title}
        </h2>
      </div>
      <div className="ml-11 space-y-4 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  )
}

export function LSubSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold mb-2" style={{ color: TEXT }}>
        {id} {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

export function LList({ items }: { items: (string | React.ReactNode)[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="flex-shrink-0 mt-[7px] size-1.5 rounded-full" style={{ backgroundColor: GREEN }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function LTable({ heads, rows }: { heads: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl my-4" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
      <table className="w-full text-xs min-w-[480px]">
        <thead>
          <tr style={{ backgroundColor: 'rgba(22,163,74,0.06)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            {heads.map((h) => (
              <th key={h} className="text-left px-4 py-3 font-bold" style={{ color: TEXT }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3" style={{ color: 'rgba(10,26,15,0.65)', verticalAlign: 'top' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LCompanyBox() {
  return (
    <div
      className="p-5 rounded-xl"
      style={{ background: 'rgba(22,163,74,0.04)', border: '1px solid rgba(22,163,74,0.15)' }}
    >
      <p className="font-bold text-sm mb-3" style={{ color: TEXT }}>SC VOID SFT GAMES SRL</p>
      <div className="grid sm:grid-cols-2 gap-1.5 text-xs" style={{ color: 'rgba(10,26,15,0.65)' }}>
        <p>Sediu: Mătăsari, Str. Progresului, Nr. 2, Bl. A29, Sc. 2, Et. 2, Ap. 10, jud. Gorj</p>
        <p>CUI: 43474393 &nbsp;|&nbsp; Nr. înmatriculare: J18/1054/2020</p>
        <p>Telefon: <a href="tel:0750456096" className="underline">0750 456 096</a></p>
        <p>Email: <a href="mailto:iroby027@gmail.com" className="underline">iroby027@gmail.com</a></p>
      </div>
    </div>
  )
}
