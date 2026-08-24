"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { facturileEmag, type FacturiLorEcran } from "@/lib/actions/emag.actions";

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
 */

export function EmagFacturiLor({ businessId }: { businessId: string }) {
  const [deschis, setDeschis] = useState(false);
  const [date, setDate] = useState<FacturiLorEcran | null>(null);
  const [luni, setLuni] = useState("3");
  const [seIncarca, incepe] = useTransition();

  function incarca(peLuni = luni) {
    incepe(async () => {
      const r = await facturileEmag(businessId, Number(peLuni));
      if ("error" in r) {
        toast.error(r.error);
        setDate({ facturi: [], totaluri: [], monede: [] });
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

  return (
    <div className="rounded-xl border border-border bg-card">
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

              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Vezi facturile ({date.facturi.length})
                </summary>
                <ul className="mt-2 divide-y divide-border">
                  {date.facturi.map((f) => (
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
