import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { indemnDeAratat } from "@/lib/blog/indemn";

/**
 * Îndemnul din interiorul articolului.
 *
 * ⚠ NU ÎNLOCUIEȘTE BANDA DE FINAL A SITE-ULUI, stă înaintea ei și spune altceva.
 * Banda e invitația generală a Edinio; asta e pasul următor potrivit CU TEXTUL
 * de deasupra. Un articol despre curierat trimite altundeva decât unul despre
 * facturare, și tocmai asta îl face de urmat.
 *
 * ⚠ NU SE DESENEAZĂ NIMIC CÂND ARTICOLUL N-ARE ÎNDEMN. `indemnDeAratat` întoarce
 * `null` și pentru unul „propriu" scris pe jumătate: un buton fără adresă e mai
 * rău decât lipsa lui, fiindcă omul apasă și crede că site-ul e stricat.
 */
export function IndemnArticol({ cta }: { cta: unknown }) {
  const i = indemnDeAratat(cta);
  if (!i) return null;

  return (
    <aside className="mt-14 rounded-2xl border border-primary/20 bg-primary/[0.04] p-6">
      <p className="text-[17px] font-semibold leading-[1.35] text-ink">{i.titlu}</p>
      {i.text && <p className="mt-2 text-[14.5px] leading-[1.6] text-ink-2">{i.text}</p>}
      <Link
        href={i.adresa}
        className="group mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[14.5px] font-semibold text-white transition-colors hover:bg-primary/90"
      >
        {i.eticheta}
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </aside>
  );
}
