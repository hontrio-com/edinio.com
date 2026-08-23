import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CATEGORII_AJUTOR, numaraGhiduri } from "@/lib/website/ajutor";
import { adresaCategorie } from "@/lib/website/ajutor-cautare";

/**
 * Grila de categorii din pagina de start a centrului de ajutor.
 *
 * Trei pe rând, ca în schița clientului. Șase categorii, deci două rânduri de
 * trei — vezi în `lib/website/ajutor.ts` de ce șase și nu trei.
 *
 * ⚠ CARDUL SPUNE CÂTE GHIDURI ARE. Fără numărul ăsta, șase carduri identice sunt
 * șase pariuri: nu știi dacă în spate e o listă serioasă sau un singur rând, așa
 * că le deschizi pe rând. Numărul e și o plasă pentru noi — o categorie rămasă cu
 * un singur ghid se vede din pagină, nu doar din fișierul de date.
 *
 * Componentă de server: sunt legături și text.
 */
export function CarduriCategorii() {
  return (
    <ul role="list" className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {CATEGORII_AJUTOR.map((c) => {
        const Icoana = c.icon;
        const cate = numaraGhiduri(c);
        return (
          <li key={c.slug}>
            <Link
              href={adresaCategorie(c.slug)}
              /*
                `h-full` pe amândouă nivelurile, ca într-un rând cardurile să iasă
                de aceeași înălțime chiar dacă descrierile au un rând diferență.
                Fără el, unul mai scurt lasă un gol sub el și rândul pare rupt.
              */
              className="feature-card-shadow group flex h-full flex-col rounded-[16px] border border-hairline bg-white p-6 transition-colors duration-200 hover:bg-tint"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-tint-2 text-ink transition-colors duration-200 group-hover:bg-white">
                <Icoana className="h-5 w-5" aria-hidden="true" />
              </span>

              <span className="mt-5 block text-[18px] font-bold tracking-[-0.02em] text-ink">
                {c.titlu}
              </span>
              <span className="mt-2 block text-[15px] leading-[1.55] text-ink-2">
                {c.descriere}
              </span>

              {/* `mt-auto` împinge rândul de jos la baza cardului, oricât de
                  lungă e descrierea. */}
              <span className="mt-auto flex items-center gap-1.5 pt-6 text-[14px] font-medium text-ink-2">
                {cate} {cate === 1 ? "ghid" : "ghiduri"}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
