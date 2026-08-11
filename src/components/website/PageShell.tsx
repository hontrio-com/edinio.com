import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Capul de pagină comun al site-ului de prezentare.
 *
 * Fiecare pagină nouă din mega menu pornește de aici: supratitlu, titlu, o frază
 * care spune despre ce e vorba, două acțiuni și rândul de garanții. Nu scrie
 * nicăieri ca e in lucru: e o pagină adevărată, doar scurtă, pe care o
 * îmbogățim secțiune cu secțiune.
 */

const TRUST = "15 zile gratuit, fără card de credit. Anulezi oricând.";

export function PageShell({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <section className="bg-white">
        <div className="mx-auto max-w-[1200px] px-5 pt-16 pb-20 sm:px-6 lg:px-8 lg:pt-24 lg:pb-28">
          <div className="max-w-[760px]">
            {/* Fara punct verde in fata, ca in panourile din bara: era ornament. */}
            {eyebrow ? (
              <span className="inline-flex items-center rounded-full border border-hairline bg-tint px-3 py-1.5 text-[12px] font-medium text-ink-2">
                {eyebrow}
              </span>
            ) : null}

            <h1 className="mt-5 text-[38px] font-bold leading-[1.06] tracking-[-0.025em] text-ink sm:text-[52px]">
              {title}
            </h1>

            <p className="mt-5 max-w-[640px] text-[17px] leading-[1.6] text-ink-2 sm:text-[19px]">
              {lead}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center rounded-[8px] bg-primary px-6 text-[15px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02] active:scale-100"
              >
                Începe gratuit
              </Link>
              <Link
                /* Pagina, nu ancora: de pe o pagina interioara, `/#preturi` te
                   ducea pe pagina de START si te derula acolo — un ocol, acum ca
                   `/preturi` exista si are mai mult decat sectiunea. Butonul din
                   hero-ul paginii de start ramane pe ancora: acolo sectiunea e
                   chiar mai jos, iar o navigare ar fi mai mult decat trebuie. */
                href="/preturi"
                className="group inline-flex h-12 items-center justify-center gap-1.5 rounded-[8px] border border-hairline px-6 text-[15px] font-medium text-ink transition-colors duration-200 hover:bg-tint-2"
              >
                Vezi prețurile
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* O propozitie, nu trei bife. Vezi nota din `sections/Hero.tsx`. */}
            <p className="mt-7 text-[14px] text-ink-3">{TRUST}</p>
          </div>
        </div>
      </section>

      {children}
    </>
  );
}

/** Grilă de legături, folosită de paginile-index (industrii, comparații). */
export function LinkGrid({
  heading,
  links,
}: {
  heading: string;
  links: { label: string; href: string; description?: string }[];
}) {
  return (
    <section className="border-t border-hairline bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
        <h2 className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[32px]">
          {heading}
        </h2>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-2xl border border-hairline bg-white p-5 transition-colors duration-200 hover:border-ink-3/40"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-ink">{link.label}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
              {link.description ? (
                <span className="mt-1.5 block text-[13px] leading-[1.55] text-ink-2">
                  {link.description}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
