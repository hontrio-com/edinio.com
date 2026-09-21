import { FileUp } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils/format";
import { ButonImport } from "./ButonImport";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILA „IMPORTURI”                                              (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ PANA AZI IMPORTUL NU LASA NICIO URMA. Se termina cu un mesaj pe ecran, iar
 * peste o saptamana nimeni nu mai stia cand s-a facut, din ce fisier si cati au
 * intrat. Cand cineva intreba „de unde e clientul asta?”, nu era nimic de citit.
 *
 * ⚠⚠ FILA ASTA N-A VAZUT TRAFIC ADEVARAT. Masurat pe productie pe 21.09.2026:
 * ZERO contacte importate, in toate cele 21 de magazine. Deci drumul se
 * construieste cu grija, dar nu se poate dovedi pe date adevarate — se dovedeste
 * pe demo. Expunerea zero nu e o scuza, e un motiv sa ridici pragul de atentie.
 *
 * ⚠ SI DE-AIA ISTORICUL INCEPE DE AZI, nu de la primul import facut vreodata.
 * Importurile de dinainte n-au lasat nimic in urma si nu se pot naste acum din
 * nimic. Golul se spune pe fata, nu se umple cu ghicituri.
 */

/** Cate importuri se arata. Mai vechi de atat nu mai intreaba nimeni. */
const CATE = 50;

export async function FilaImporturi({ businessId }: { businessId: string }) {
  const supabase = await createClient();

  const { data: randuri } = await supabase
    .from("customer_imports")
    .select("id, fisier, adaugati, completati, sarite, creat_la")
    .eq("business_id", businessId)
    .order("creat_la", { ascending: false })
    .limit(CATE);

  const importuri = randuri ?? [];

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Importuri de clienți</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ce fișier s-a încărcat, când, și câți clienți au intrat din el.
          </p>
        </div>
        <ButonImport />
      </div>

      {importuri.length === 0 ? (
        <div className="rounded-xl bg-card p-6 text-center ring-1 ring-foreground/10">
          <FileUp className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-sm text-foreground">Niciun import înregistrat.</p>
          {/*
            ⚠ Se spune de CAND se ține minte. Altfel un comerciant care chiar a
            importat clienți acum o lună ar crede că importul lui s-a pierdut.
          */}
          <p className="mt-1 text-xs text-muted-foreground">
            Importurile se țin minte începând cu 21 septembrie 2026. Cele de dinainte
            n-au lăsat urmă.
          </p>
        </div>
      ) : (
        <>
          {/*
            ⚠ CARDURI PE TELEFON, TABEL PE DESKTOP — acelasi tipar ca lista de
            clienti. Masurat: tabelul celor cinci coloane cere 600px, iar cutia
            lui taia (`overflow-hidden`), deci pe un telefon de 390px ultimele
            doua coloane — „Completati" si „Sariti" — erau pur si simplu de
            neajuns. Nu se vedeau si nu se putea derula pana la ele.
          */}
          <ul className="space-y-2 sm:hidden">
            {importuri.map((r) => (
              <li key={r.id} className="rounded-xl bg-card p-3.5 ring-1 ring-foreground/10">
                <p className="truncate text-sm font-semibold text-foreground">
                  {r.fisier ?? <span className="font-normal text-muted-foreground/60">fără nume</span>}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(r.creat_la)}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="text-foreground">
                    <span className="font-semibold tabular-nums">{r.adaugati}</span> adăugați
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold tabular-nums">{r.completati}</span> completați
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold tabular-nums">{r.sarite}</span> săriți
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Fișier</th>
                  <th className="px-4 py-2.5 font-medium">Când</th>
                  <th className="px-4 py-2.5 text-right font-medium">Adăugați</th>
                  <th className="px-4 py-2.5 text-right font-medium">Completați</th>
                  <th className="px-4 py-2.5 text-right font-medium">Săriți</th>
                </tr>
              </thead>
              <tbody>
                {importuri.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="max-w-[16rem] truncate px-4 py-3 text-foreground">
                      {r.fisier ?? <span className="text-muted-foreground/60">fără nume</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.creat_la)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{r.adaugati}</td>
                    {/*
                      ⚠ „Completați" nu sunt clienți noi: existau deja, iar fișierul
                      le-a adus câmpuri care lipseau. Puse la un loc cu cei adăugați,
                      cifra ar fi spus că magazinul a crescut mai mult decât a crescut.
                    */}
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.completati}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.sarite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/*
        ⚠ Legenda apare DOAR când există tabelul pe care îl explică. Sub un gol,
        explica trei coloane pe care nimeni nu le vedea — adică punea întrebări
        în loc să răspundă la vreuna.
      */}
      {importuri.length > 0 && (
      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Adăugați</span> = rânduri noi ·{" "}
        <span className="font-medium text-foreground">Completați</span> = clienți care existau
        deja și au primit câmpuri lipsă ·{" "}
        <span className="font-medium text-foreground">Săriți</span> = rânduri fără telefon și
        fără email, care n-au cum să fie legate de cineva.
      </p>
      )}
    </div>
  );
}
