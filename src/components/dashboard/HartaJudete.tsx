"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/format";
import { COUNTY_CODE_MAP, RomaniaMap } from "@/components/dashboard/RomaniaMap";
import { MASURI_HARTA, type MasuraHarta, type RandJudet } from "@/lib/statistici";

/*
  ═══════════════════════════════════════════════════════════════════════════
  HARTA PE JUDETE
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ ACUM ASCULTA DE PERIOADA. Pana azi folosea o functie care intorcea TOT
  istoricul: schimbai „7 zile" pe „90 de zile" si harta ramanea identica, deci
  parea ca raspunde la filtru fara sa raspunda.

  ⚠ SI SE POATE CITI FARA MAUS. Desenul raspunde la trecerea cu mausul, ceea ce
  pe telefon nu inseamna nimic si la tastatura nici atat. De aceea sub harta sta
  aceeasi informatie ca lista: tabelul nu e un adaos, e calea de acces pentru
  cine nu poate folosi harta.
*/

export function HartaJudete({
  judete, svgContent, primaryColor, perioadaScrisa,
}: {
  judete: RandJudet[];
  svgContent: string;
  primaryColor: string;
  perioadaScrisa: string;
}) {
  const [masura, setMasura] = useState<MasuraHarta>("comenzi");
  const info = MASURI_HARTA.find((m) => m.masura === masura) ?? MASURI_HARTA[0];

  /* Harta stie sa coloreze dupa un singur numar; ii dam masura aleasa. */
  const pentruHarta = judete
    .map((j) => ({
      county: j.judet,
      code: COUNTY_CODE_MAP[j.judet] ?? "",
      orders: Math.round(masura === "comenzi" ? j.comenzi : masura === "vanzari" ? j.vanzari : j.medie),
    }))
    .filter((j) => j.code);

  const scrie = (j: RandJudet) =>
    info.bani
      ? formatPrice(masura === "vanzari" ? j.vanzari : j.medie)
      : new Intl.NumberFormat("ro-RO").format(j.comenzi);

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold text-foreground">Comenzi pe judet</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{perioadaScrisa}</p>
        </div>
        <div className="flex gap-0.5 rounded-lg bg-muted p-1">
          {MASURI_HARTA.map((m) => (
            <button
              key={m.masura}
              type="button"
              onClick={() => setMasura(m.masura)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                masura === m.masura ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.eticheta}
            </button>
          ))}
        </div>
      </div>

      {judete.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">
          Nu ai primit comenzi in perioada asta, deci harta n-are ce colora.
        </p>
      ) : (
        <>
          <div className="p-4">
            <div className="mx-auto max-w-2xl">
              <RomaniaMap svgContent={svgContent} countyData={pentruHarta} primaryColor={primaryColor} />
            </div>
          </div>

          <div className="border-t border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Aceleasi cifre ca pe harta, in tabel, pentru cine nu poate folosi desenul.
              </caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Judet</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Comenzi</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Vanzari</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Valoare medie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {judete.slice(0, 10).map((j) => (
                  <tr key={j.judet}>
                    <th scope="row" className="px-5 py-2 text-left font-medium text-foreground">{j.judet}</th>
                    <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{j.comenzi}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{formatPrice(j.vanzari)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{formatPrice(j.medie)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {judete.length > 10 && (
              <p className="px-5 py-2 text-xs text-muted-foreground">
                Primele 10 judete din {judete.length}, dupa {info.eticheta.toLowerCase()}: {scrie(judete[0])} in {judete[0].judet}.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
