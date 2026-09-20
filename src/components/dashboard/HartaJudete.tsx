"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/format";
import { Bani } from "@/components/dashboard/Bani";
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
  judete, svgContent, primaryColor, perioadaScrisa, sfatGol,
}: {
  judete: RandJudet[];
  svgContent: string;
  primaryColor: string;
  perioadaScrisa: string;
  sfatGol: string;
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
        <div className="px-5 py-12 text-center">
          <p className="text-sm text-foreground">
            Nu ai primit comenzi in perioada asta, deci harta n-are ce colora.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{sfatGol}</p>
        </div>
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
                <tr className="text-left text-[10px] text-muted-foreground sm:text-xs">
                  <th scope="col" className="px-3 py-2 font-medium sm:px-5">Judet</th>
                  <th scope="col" className="px-1.5 py-2 text-right font-medium sm:px-5">Comenzi</th>
                  <th scope="col" className="px-1.5 py-2 text-right font-medium sm:px-5">Vanzari</th>
                  <th scope="col" className="px-1.5 py-2 text-right font-medium sm:px-5">Valoare medie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {judete.slice(0, 10).map((j) => (
                  <tr key={j.judet}>
                    <th scope="row" className="max-w-[7rem] truncate px-3 py-2 text-left font-medium text-foreground sm:max-w-none sm:px-5">{j.judet}</th>
                    <td className="px-1.5 py-2 text-right text-xs tabular-nums text-muted-foreground sm:px-5 sm:text-sm">{j.comenzi}</td>
                    <td className="px-1.5 py-2 text-right text-xs tabular-nums text-muted-foreground sm:px-5 sm:text-sm"><Bani valoare={j.vanzari} /></td>
                    <td className="px-1.5 py-2 text-right text-xs tabular-nums text-muted-foreground sm:px-5 sm:text-sm"><Bani valoare={j.medie} /></td>
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
