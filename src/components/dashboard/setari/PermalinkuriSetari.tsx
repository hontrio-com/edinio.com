"use client";

import { useMemo, useState } from "react";
import { Info, Link2, RotateCcw } from "lucide-react";
import { Callout } from "@/components/ui/callout";
import { salveazaPermalinkurile } from "@/lib/actions/permalinkuri.actions";
import {
  FELURI_PERMALINK, PERMALINKURI_IMPLICITE, problemaPrefixului,
  type FelPermalink, type Permalinkuri,
} from "@/lib/storefront/permalinkuri";

/**
 * Fila „Permalink-uri" din Setări.
 *
 * ⚠ Sta intr-un fisier al ei, ca `ContClientiSetari`: `SettingsClient.tsx` are
 * peste trei mii de randuri. Textele sunt ale PANOULUI, deci cu diacritice.
 * ⚠ Regulile adevarate sunt pe server (`salveazaPermalinkurile`); aici doar se
 * arata inainte, ca omul sa nu afle abia la salvare.
 */

const RANDURI: Record<FelPermalink, { titlu: string; descriere: string; exemplu: string }> = {
  produs: {
    titlu: "Produse",
    descriere: "Adresa fiecărui produs.",
    exemplu: "nume-produs",
  },
  magazin: {
    titlu: "Catalog și categorii",
    descriere: "Pagina cu toate produsele și paginile categoriilor. Contează doar dacă magazinul are pagină de catalog separată.",
    exemplu: "nume-categorie",
  },
  brand: {
    titlu: "Branduri",
    descriere: "Paginile brandurilor, când magazinul are pagină de catalog separată.",
    exemplu: "nume-brand",
  },
};

export function PermalinkuriSetari({
  businessId, initial, adresaMagazin,
}: {
  businessId: string;
  initial: Permalinkuri;
  /** Ce se vede in fata prefixului: domeniul propriu sau `edinio.com/<slug>`. */
  adresaMagazin: string;
}) {
  const [salvate, setSalvate] = useState<Permalinkuri>(initial);
  const [ciorna, setCiorna] = useState<Permalinkuri>(initial);
  const [asteapta, setAsteapta] = useState(false);
  const [eroare, setEroare] = useState("");
  const [salvat, setSalvat] = useState(false);

  const modificat = FELURI_PERMALINK.some((f) => ciorna[f] !== salvate[f]);

  const probleme = useMemo(() => {
    const p: Partial<Record<FelPermalink, string>> = {};
    for (const f of FELURI_PERMALINK) {
      const m = problemaPrefixului(f, ciorna[f]);
      if (m) p[f] = m;
    }
    for (const f of FELURI_PERMALINK) {
      if (!p[f] && FELURI_PERMALINK.some((g) => g !== f && ciorna[g] === ciorna[f])) {
        p[f] = "Prefixul se repetă. Cele trei prefixe trebuie să fie diferite.";
      }
    }
    return p;
  }, [ciorna]);
  const areProbleme = Object.keys(probleme).length > 0;

  function schimba(fel: FelPermalink, valoare: string) {
    setCiorna((c) => ({ ...c, [fel]: valoare.toLowerCase().replace(/\s+/g, "-") }));
    setEroare("");
    setSalvat(false);
  }

  async function salveaza() {
    if (areProbleme) return;
    setAsteapta(true);
    setEroare("");
    const r = await salveazaPermalinkurile(businessId, ciorna);
    setAsteapta(false);
    if (!r.ok) { setEroare(r.eroare); return; }
    setSalvate(r.valoare);
    setCiorna(r.valoare);
    setSalvat(true);
  }

  return (
    <div className="space-y-5 pb-20">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Permalink-uri</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Alege cuvântul care apare în adresele paginilor magazinului: de exemplu „produs” în loc de „product”. Linkurile
          din magazin, sitemapul, feedurile Google și Facebook și datele pentru motoarele de căutare se schimbă singure.
        </p>
      </div>

      <Callout variant="info" icon={Info} title="Adresele vechi merg în continuare">
        <p>
          Cine intră pe o adresă veche (din Google, dintr-un email sau dintr-un link salvat) este dus automat la cea nouă,
          printr-o redirecționare permanentă. Motoarele de căutare actualizează adresele treptat, în câteva zile sau săptămâni.
        </p>
        <p className="mt-1.5">
          Dacă ai Google Merchant conectat, produsele sunt retrimise cu noile adrese și pot trece din nou prin verificarea Google.
        </p>
      </Callout>

      {FELURI_PERMALINK.map((fel) => {
        const r = RANDURI[fel];
        const problema = probleme[fel];
        const implicit = PERMALINKURI_IMPLICITE[fel];
        return (
          <div key={fel} className="rounded-xl border border-border p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                <Link2 className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground">{r.titlu}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{r.descriere}</p>

                <label className="mt-3 flex items-center overflow-hidden rounded-xl border border-border bg-surface transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="sr-only">Prefixul pentru {r.titlu.toLowerCase()}</span>
                  <span className="hidden max-w-[45%] truncate border-r border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground sm:inline">
                    {adresaMagazin}/
                  </span>
                  <input
                    type="text"
                    value={ciorna[fel]}
                    onChange={(e) => schimba(fel, e.target.value)}
                    maxLength={40}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={!!problema}
                    className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none"
                  />
                  {ciorna[fel] !== implicit && (
                    <button type="button" onClick={() => schimba(fel, implicit)}
                      className="mr-1.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                      <RotateCcw className="h-3 w-3" />
                      Implicit
                    </button>
                  )}
                </label>

                {problema ? (
                  <p role="alert" className="mt-1.5 text-xs text-destructive">{problema}</p>
                ) : (
                  <p className="mt-1.5 break-all text-xs text-muted-foreground">
                    Exemplu: {adresaMagazin}/<span className="font-medium text-foreground">{ciorna[fel]}</span>/{r.exemplu}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Coșul, finalizarea comenzii, contul clientului și paginile de politici își păstrează adresele: sunt legate de plăți
        și nu contează pentru căutări.
      </p>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 backdrop-blur">
        {eroare && <p role="alert" className="mr-auto text-sm text-destructive">{eroare}</p>}
        {!eroare && salvat && !modificat && <p className="mr-auto text-sm text-muted-foreground">Salvat.</p>}
        {!eroare && modificat && <p className="mr-auto text-sm text-muted-foreground">Ai modificări nesalvate.</p>}
        <button type="button" disabled={!modificat || asteapta}
          onClick={() => { setCiorna(salvate); setEroare(""); }}
          className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-foreground disabled:opacity-50">
          Renunță
        </button>
        <button type="button" disabled={!modificat || asteapta || areProbleme} onClick={salveaza}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {asteapta ? "Se salvează..." : "Salvează"}
        </button>
      </div>
    </div>
  );
}
