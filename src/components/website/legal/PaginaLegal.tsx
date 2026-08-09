import { ArrowUp } from "lucide-react";
import { BlocuriLegal } from "./BlocuriLegal";
import { CuprinsLegal } from "./CuprinsLegal";
import type { DocumentLegal } from "@/lib/website/legal";

/**
 * Desenul comun al celor trei documente juridice: Termeni, Confidențialitate,
 * Cookies.
 *
 * ⚠ NICIUN TEXT DE CONȚINUT NU E AICI. Tot ce se vede vine din fișierele de
 * conținut; singurele cuvinte proprii sunt „Ultima actualizare" și „Înapoi sus"
 * (plus „Cuprins", în componenta lui).
 *
 * ═══ DE CE NU `PageShell` ═══
 *
 * `PageShell` vine cu „Începe gratuit" și „Vezi prețurile" sub titlu. Pe pagina
 * pe care omul o deschide ca să afle ce semnează sau ce se face cu datele lui,
 * două butoane de vânzare la început e exact tonul greșit. Capul de pagină de
 * mai jos păstrează aceeași scară tipografică, fără îndemnuri.
 *
 * ═══ ANCORE ═══
 *
 * Fiecare articol are `id` din fișierul de conținut și `scroll-mt-[88px]`, cât
 * bara lipicioasă (`h-18` = 72px) plus aer. Fără el, un link către `#clauza` ar
 * așeza titlul FIX SUB bară și ai crede că ai nimerit greșit.
 */
export function PaginaLegal({ doc }: { doc: DocumentLegal }) {
  const intrari = doc.sectiuni.map(({ id, nr, titlu }) => ({ id, nr, titlu }));

  return (
    <>
      <section className="border-b border-hairline bg-white">
        <div className="mx-auto max-w-[1200px] px-5 pt-14 pb-12 sm:px-6 lg:px-8 lg:pt-20 lg:pb-16">
          <div className="max-w-[760px]">
            <span className="inline-flex items-center rounded-full border border-hairline bg-tint px-3 py-1.5 text-[12px] font-medium text-ink-2">
              Ultima actualizare: {doc.actualizare}
            </span>

            <h1 className="mt-5 text-[32px] font-bold leading-[1.08] tracking-[-0.025em] text-ink sm:text-[44px]">
              {doc.titlu}
            </h1>

            <div className="mt-7">
              <BlocuriLegal blocuri={doc.preambul} />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-[1200px] px-5 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14">
            <CuprinsLegal intrari={intrari} />

            <div className="max-w-[760px]">
              {doc.sectiuni.map((sectiune) => (
                <section
                  key={sectiune.id}
                  id={sectiune.id}
                  className="scroll-mt-[88px] border-t border-hairline pt-8 first:border-t-0 first:pt-0 [&+section]:mt-10"
                >
                  <h2 className="text-[19px] font-semibold leading-[1.3] tracking-[-0.01em] text-ink sm:text-[21px]">
                    {/* Numărul e o adresă, nu parte din titlu: stins, ca la
                        paragrafele numerotate din interiorul articolelor. */}
                    <span className="mr-2 tabular-nums text-ink-3">{sectiune.nr}.</span>
                    {sectiune.titlu}
                  </h2>

                  <div className="mt-4">
                    <BlocuriLegal blocuri={sectiune.blocuri} />
                  </div>
                </section>
              ))}

              <p className="mt-12 border-t border-hairline pt-8 print:hidden">
                <a
                  href="#"
                  className="group inline-flex items-center gap-1.5 text-[14px] text-ink-2 transition-colors hover:text-ink"
                >
                  <ArrowUp className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5" />
                  Înapoi sus
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
