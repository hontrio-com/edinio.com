"use client";

import { formatPrice } from "@/lib/utils/format";
import type { Prag } from "@/lib/storefront/quantity-tiers";

/*
  ═══════════════════════════════════════════════════════════════════════════
  REDUCERI DE CANTITATE, PE PAGINA PRODUSULUI
  ═══════════════════════════════════════════════════════════════════════════

  Tabelul cerut de proprietar pe 20.09.2026, dupa modelul pe care l-a aratat:
  „De la / Discount / Pret pe bucata / Economisesti", cu un buton care sare
  direct la cantitatea aceea.

  ⚠ CIFRELE NU SE SOCOTESC AICI. Pretul pe bucata si economia ies din chiar
  functia care incaseaza (`pretPeTrepte`), chemata de parinte. O inmultire
  scrisa in tabel ar fi fost a doua socoteala, iar tabelul ar fi putut arata
  „169,74 lei/buc" langa un cos care cere altceva. Aceeasi lectie ca la
  `cart/pret-linie.ts`.

  ⚠ „ECONOMISESTI" E PE CANTITATEA PRAGULUI, nu pe bucata: cine se uita la
  randul „50 buc" vrea sa stie cat pune deoparte daca ia 50, nu cat castiga pe
  una. Asa e si in modelul aratat (50 buc, -9,23%, 863,00 lei).
*/

export interface RandPrag {
  prag: Prag;
  /** Pretul unei bucati la cantitatea pragului, din motorul de preturi. */
  pretBucata: number;
  /** Cat pune deoparte cumparand exact cantitatea pragului. */
  economie: number;
}

export function TabelPraguri({ randuri, laAlegere, culoare }: {
  randuri: RandPrag[];
  /** Deschide comanda direct la cantitatea pragului. */
  laAlegere?: (cantitate: number) => void;
  culoare?: string;
}) {
  if (randuri.length === 0) return null;

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-border">
      <p className="border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground">
        Reduceri de cantitate
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Reduceri dupa cantitatea cumparata: de la cate bucati incepe fiecare,
            cat la suta scade pretul, cat costa o bucata si cat economisesti.
          </caption>
          <thead>
            <tr className="text-left text-[11px] text-muted-foreground sm:text-xs">
              <th scope="col" className="px-3 py-2 font-medium sm:px-4">De la</th>
              <th scope="col" className="px-2 py-2 text-right font-medium sm:px-4">Reducere</th>
              <th scope="col" className="px-2 py-2 text-right font-medium sm:px-4">Pret / buc</th>
              <th scope="col" className="px-2 py-2 text-right font-medium sm:px-4">Economisesti</th>
              {laAlegere && <th scope="col" className="w-10 px-2 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {randuri.map((r) => (
              <tr key={r.prag.minQty}>
                <th scope="row" className="px-3 py-2.5 text-left font-medium whitespace-nowrap text-foreground sm:px-4">
                  {r.prag.minQty} buc
                  {r.prag.badge && (
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{r.prag.badge}</span>
                  )}
                </th>
                <td className="px-2 py-2.5 text-right text-xs tabular-nums font-medium sm:px-4 sm:text-sm" style={{ color: culoare }}>
                  -{r.prag.percent.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%
                </td>
                <td className="px-2 py-2.5 text-right text-xs tabular-nums font-semibold text-foreground sm:px-4 sm:text-sm whitespace-nowrap">
                  {formatPrice(r.pretBucata)}
                </td>
                <td className="px-2 py-2.5 text-right text-xs tabular-nums text-muted-foreground sm:px-4 sm:text-sm whitespace-nowrap">
                  {formatPrice(r.economie)}
                </td>
                {laAlegere && (
                  <td className="px-2 py-2.5 text-right sm:px-4">
                    <button
                      type="button"
                      onClick={() => laAlegere(r.prag.minQty)}
                      aria-label={`Comanda ${r.prag.minQty} bucati`}
                      className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      +
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
