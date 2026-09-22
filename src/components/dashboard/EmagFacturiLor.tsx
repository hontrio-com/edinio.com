"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { facturileEmag, type FacturiLorEcran } from "@/lib/actions/emag.actions";
import { Paginatie } from "./Paginatie";

/**
 * Ce ți-a facturat eMAG (§89).
 *
 * ═══ ⚠ FAPTE, NU ESTIMĂRI ═══
 *
 * Nu există nicio rută care să spună cât e comisionul pe o categorie — căutat în tot
 * OpenAPI-ul lor. Un tabel de procente ținut de noi ar îmbătrâni tăcut și ar arăta
 * sume care nu se potrivesc cu extrasul de cont: cel mai prost fel de a greși cu bani.
 *
 * Aici sunt facturile lor, așa cum ni le dau ei.
 *
 * ═══ ⚠ ȘI SE SPUNE CE NU E AICI ═══
 *
 * Nu e marja. Marja cere prețul de achiziție, iar catalogul n-are unde să-l țină.
 * „Încasări minus comision" arătat drept marjă l-ar fi pus pe comerciant să hotărască
 * prețuri pe un număr care nu înseamnă ce scrie pe el.
 *
 * ═══ ⚠ LISTA SE RĂSFOIEȘTE, TOTALURILE NU (22.09.2026) ═══
 *
 * Se aduc toate facturile perioadei, până la zece mii: altfel totalul ar fi fost fals,
 * iar asta e chiar greșeala reparată pe 24.08. Dar desenate toate deodată, „Ultimul an"
 * al unui magazin cu multe comisioane punea mii de rânduri în pagină la o singură
 * apăsare. Deci numai lista de dedesubt are pagini; sumele de deasupra rămân socotite
 * din TOT ce s-a adus.
 */

/** Câte facturi se desenează pe o pagină. Socoteala de deasupra le folosește pe toate. */
const FACTURI_PE_PAGINA = 50;

export function EmagFacturiLor({ businessId }: { businessId: string }) {
  const [deschis, setDeschis] = useState(false);
  const [date, setDate] = useState<FacturiLorEcran | null>(null);
  const [luni, setLuni] = useState("3");
  const [pagina, setPagina] = useState(1);
  const [seIncarca, incepe] = useTransition();

  function incarca(peLuni = luni) {
    /* ⚠ Se începe de la prima pagină: altă perioadă înseamnă altă listă, de obicei mai
       scurtă. Rămasă pe pagina 7, lista ar fi ieșit goală pe o perioadă cu 40 de
       facturi, iar omul ar fi crezut că eMAG nu i-a facturat nimic. */
    setPagina(1);
    incepe(async () => {
      const r = await facturileEmag(businessId, Number(peLuni));
      if ("error" in r) {
        toast.error(r.error);
        setDate({ facturi: [], totaluri: [], monede: [], partial: false, dinCate: 0 });
        return;
      }
      setDate(r);
    });
  }

  function comutaDeschis() {
    const nou = !deschis;
    setDeschis(nou);
    if (nou && date === null) incarca();
  }

  const toateFacturile = date?.facturi ?? [];
  const paginiFacturi = Math.max(1, Math.ceil(toateFacturile.length / FACTURI_PE_PAGINA));
  /* ⚠ Se strânge la câte pagini există. Fără strângere, o listă care s-a scurtat între
     timp ar fi lăsat ecranul pe o pagină goală, fără drum înapoi. */
  const paginaAcum = Math.min(Math.max(1, pagina), paginiFacturi);
  const deLa = (paginaAcum - 1) * FACTURI_PE_PAGINA;
  const facturiDeAratat = toateFacturile.slice(deLa, deLa + FACTURI_PE_PAGINA);

  return (
    <div className="rounded-xl ring-1 ring-foreground/10 bg-card">
      <button
        type="button"
        onClick={comutaDeschis}
        aria-expanded={deschis}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Receipt className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Cât te costă eMAG</span>
            <span className="block text-xs text-muted-foreground">
              Facturile pe care ți le-au emis ei. Nu estimări.
            </span>
          </span>
        </span>
        {deschis
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {deschis && (
        <div className="border-t border-border p-5 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
              value={luni}
              onChange={(e) => { setLuni(e.target.value); incarca(e.target.value); }}
              disabled={seIncarca}
            >
              <option value="1">Ultima lună</option>
              <option value="3">Ultimele 3 luni</option>
              <option value="6">Ultimele 6 luni</option>
              <option value="12">Ultimul an</option>
            </select>
            {seIncarca && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {date === null ? (
            <p className="mt-4 text-sm text-muted-foreground">Se citesc facturile…</p>
          ) : date.facturi.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              eMAG nu ți-a emis nicio factură în perioada asta.
            </p>
          ) : (
            <>
              {/* ⚠ Totalurile sunt FĂRĂ TVA: TVA-ul se deduce, deci nu e un cost.
                  Adunat, cifra ar fi arătat cu o cincime mai mare decât realitatea. */}
              <ul className="mt-4 divide-y divide-border">
                {date.totaluri.map((t) => (
                  <li key={t.categorie} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="text-sm">{t.eticheta}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {t.total.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {date.monede.length === 1 ? ` ${date.monede[0]}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Sume fără TVA. Stornările sunt scăzute.
                {/* ⚠ Monedele nu se adună între ele. Un magazin cu conturi în două
                    monede ar fi văzut o sumă fără niciun înțeles. */}
                {date.monede.length > 1 && (
                  <> <strong className="text-foreground">Atenție:</strong> sunt facturi în
                  mai multe monede ({date.monede.join(", ")}), iar sumele de mai sus le
                  adună la un loc. Uită-te pe facturi una câte una.</>
                )}
              </p>

              {/*
                ═══ ⚠ UN TOTAL INCOMPLET NU ARE VOIE SA ARATE CA UNUL COMPLET ═══

                Pana pe 24.08.2026 se cerea o SINGURA pagina de 100 de facturi, fara
                `currentPage` si fara sa se uite la `total_results`. Pe „Ultimul an",
                tot ce trecea de a 100-a factura nu se aduna — iar cifra arata la fel de
                credibila. Pe ecranul asta comerciantul isi socoteste preturile: un cost
                subestimat le impinge in jos, si nimic nu i-ar fi spus de ce.

                Acum se merge pana la capat. Cand tot nu se poate — plafonul de pagini,
                sau o pagina care n-a venit — se SPUNE.
              */}
              {date.partial && (
                <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Sumele de mai sus sunt socotite din {date.facturi.length} facturi, din{" "}
                    {date.dinCate} câte are perioada. Restul nu s-au putut aduce acum, deci
                    costul adevărat e mai mare. Încearcă din nou, sau alege o perioadă mai
                    scurtă.
                  </span>
                </p>
              )}

              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Vezi facturile ({date.facturi.length})
                </summary>
                <ul className="mt-2 divide-y divide-border">
                  {facturiDeAratat.map((f) => (
                    <li key={`${f.numar}-${f.data}`} className="py-2">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-xs">{f.numar}</span>
                        <span className="text-xs text-muted-foreground">{f.data}</span>
                        <span className="text-xs">{f.categorieEticheta}</span>
                        {/* ⚠ Stornarea se VEDE, nu doar se scade în total: altfel un
                            rând cu sumă pozitivă care de fapt anulează alta ar fi arătat
                            ca o cheltuială în plus. */}
                        {f.storno && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">stornare</span>
                        )}
                        <span className="ml-auto text-xs font-medium tabular-nums">
                          {(f.storno ? -f.faraTva : f.faraTva).toLocaleString("ro-RO", {
                            minimumFractionDigits: 2, maximumFractionDigits: 2,
                          })} {f.moneda}
                        </span>
                      </div>
                      {f.linii.length > 0 && (
                        <ul className="mt-0.5 space-y-0.5">
                          {f.linii.map((l, i) => (
                            <li key={i} className="text-xs text-muted-foreground">
                              {l.nume}
                              {l.cantitate ? ` × ${l.cantitate}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>

                {/* ⚠ Numai lista se răsfoiește. Totalurile de mai sus rămân socotite din
                    toate facturile perioadei: socotite pe pagină, costul ar fi scăzut la
                    fiecare apăsare de „înainte". */}
                <Paginatie
                  pagina={paginaAcum}
                  pagini={paginiFacturi}
                  laSchimbare={(p) => setPagina(p)}
                  seIncarca={seIncarca}
                  rezumat={`${deLa + 1}–${Math.min(deLa + FACTURI_PE_PAGINA, toateFacturile.length)} din ${toateFacturile.length}`}
                />
              </details>
            </>
          )}

          {/*
            ⚠ SE SPUNE CE NU E AICI. Fără rândurile astea, cineva ar scădea comisionul
            din încasări și ar numi rezultatul „marjă" — un număr care nu înseamnă ce
            scrie pe el, folosit apoi ca să se hotărască prețuri.
          */}
          <p className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Nu e marjă.</strong> Marja cere prețul la
            care ai cumpărat marfa, iar catalogul nu-l ține nicăieri. Ce vezi aici e ce
            ți-a facturat eMAG, nici mai mult, nici mai puțin.
          </p>
        </div>
      )}
    </div>
  );
}
