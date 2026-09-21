"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { getProductsByIds, searchProductsForPicker } from "@/lib/actions/product-picker.actions";
import {
  DESPRE_CATEGORII, descrieRestrangerea, type FelRestrangere, type Restrangere,
} from "@/lib/discounts/restrangere";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PE CE MERGE CODUL                                             (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ ACEEAȘI ALEGERE CA LA OFERTE (`OfferForm`): trei butoane late, apoi lista.
 * Comerciantul a mai văzut ecranul ăsta o dată; al doilea vocabular pentru
 * aceeași întrebare l-ar fi pus să învețe de două ori.
 *
 * ⚠⚠ PRODUSELE SE CAUTĂ, NU SE ÎNCARCĂ TOATE. `OfferForm` primește catalogul
 * întreg ca prop; aici nu, fiindcă pagina de discounturi se deschide de zeci de
 * ori pe zi și un magazin poate avea mii de produse. Se folosesc cele două
 * acțiuni care există deja pentru page-builder.
 */

const FELURI: { v: FelRestrangere; label: string }[] = [
  { v: "tot", label: "Tot magazinul" },
  { v: "produse", label: "Doar anumite produse" },
  { v: "categorii", label: "Doar anumite categorii" },
];

interface Produs { id: string; name: string }

export function AlegePeCeMerge({
  businessId,
  valoare,
  categoriiMagazin,
  onSchimba,
  eroare,
}: {
  businessId: string;
  valoare: Restrangere;
  categoriiMagazin: { id: string; name: string }[];
  onSchimba: (r: Restrangere) => void;
  eroare?: string;
}) {
  const [cautare, setCautare] = useState("");
  const [rezultate, setRezultate] = useState<Produs[]>([]);
  const [cauta, setCauta] = useState(false);
  /* Numele produselor deja alese — ca să nu se arate id-uri pe ecran. */
  const [numeAlese, setNumeAlese] = useState<Record<string, string>>({});

  /*
    ⚠ Numele celor deja alese se aduc O SINGURĂ DATĂ, la deschidere. Cerute la
    fiecare tastare, editarea unui cod cu douăzeci de produse ar fi bătut baza
    la fiecare literă.
  */
  const aduseDeja = useRef(false);
  useEffect(() => {
    if (aduseDeja.current || valoare.produse.length === 0) return;
    aduseDeja.current = true;
    let anulat = false;
    void (async () => {
      try {
        const p = await getProductsByIds(businessId, valoare.produse);
        if (!anulat) setNumeAlese((v) => ({ ...v, ...Object.fromEntries(p.map((x) => [x.id, x.name])) }));
      } catch { /* Numele lipsă nu opresc nimic: se arată id-ul scurtat. */ }
    })();
    return () => { anulat = true; };
  }, [businessId, valoare.produse]);

  /*
   * Căutarea, cu o pauză scurtă ca să nu plece o cerere la fiecare literă.
   *
   * ⚠ Sub două litere NU se goleșc rezultatele dintr-un `setState` pus aici:
   * o scriere de stare chemată direct în efect declanșează un al doilea rând de
   * randări. Lista arătată se DERIVĂ mai jos, din lungimea căutării.
   */
  useEffect(() => {
    const q = cautare.trim();
    if (q.length < 2) return;
    let anulat = false;
    const t = setTimeout(() => {
      /* ⚠ Si semnul de asteptare se aprinde ABIA AICI, nu in corpul efectului:
         o scriere de stare chemata direct acolo porneste un al doilea rand de
         randari. Iese si mai bine pe ecran — nu mai palpaie la fiecare litera. */
      if (!anulat) setCauta(true);
      void (async () => {
        try {
          const p = await searchProductsForPicker(businessId, q);
          if (!anulat) setRezultate(p.map((x) => ({ id: x.id, name: x.name })));
        } catch {
          if (!anulat) setRezultate([]);
        } finally {
          if (!anulat) setCauta(false);
        }
      })();
    }, 250);
    return () => { anulat = true; clearTimeout(t); };
  }, [cautare, businessId]);

  /* ⚠ Derivată, nu ținută în stare — vezi efectul de mai sus. */
  const deAratat = cautare.trim().length >= 2 ? rezultate : [];

  function schimbaFelul(fel: FelRestrangere) {
    /*
      ⚠ LISTELE SE PĂSTREAZĂ când omul schimbă felul și se întoarce. Golite,
      cineva care apasă din greșeală „Tot magazinul” ar fi pierdut cele
      douăzeci de produse alese, fără să i se spună nimic.
    */
    onSchimba({ ...valoare, fel });
  }

  function comutaProdus(p: Produs) {
    const are = valoare.produse.includes(p.id);
    setNumeAlese((v) => ({ ...v, [p.id]: p.name }));
    onSchimba({
      ...valoare,
      produse: are ? valoare.produse.filter((x) => x !== p.id) : [...valoare.produse, p.id],
    });
  }

  function comutaCategorie(nume: string) {
    const are = valoare.categorii.includes(nume);
    onSchimba({
      ...valoare,
      categorii: are ? valoare.categorii.filter((x) => x !== nume) : [...valoare.categorii, nume],
    });
  }

  return (
    <div className={cn("rounded-xl border p-3 space-y-3", eroare ? "border-destructive" : "border-border")}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pe ce merge codul</p>

      <div className="grid grid-cols-3 gap-2">
        {FELURI.map((f) => (
          <button
            key={f.v}
            type="button"
            onClick={() => schimbaFelul(f.v)}
            className={cn(
              "rounded-lg border-2 px-2 py-2 text-xs font-medium transition-all",
              valoare.fel === f.v
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {valoare.fel === "produse" && (
        <div className="space-y-2">
          {valoare.produse.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {valoare.produse.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs text-foreground">
                  {numeAlese[id] ?? `${id.slice(0, 8)}…`}
                  <button
                    type="button"
                    onClick={() => comutaProdus({ id, name: numeAlese[id] ?? "" })}
                    aria-label={`Scoate ${numeAlese[id] ?? "produsul"}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={cautare}
              onChange={(e) => setCautare(e.target.value)}
              placeholder="Caută un produs după nume…"
              className="w-full rounded-lg border border-input bg-transparent py-2 pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {cauta && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>

          {cautare.trim().length >= 2 && !cauta && deAratat.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Niciun produs găsit.</p>
          )}

          {deAratat.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
              {deAratat.map((p) => {
                const ales = valoare.produse.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => comutaProdus(p)}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-muted",
                        ales && "text-primary",
                      )}
                    >
                      <span className="truncate">{p.name}</span>
                      {ales && <span className="ml-2 shrink-0 text-[11px]">ales</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {valoare.fel === "categorii" && (
        categoriiMagazin.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nu ai categorii încă. Fă-ți categorii din Produse ca să poți restrânge codul.</p>
        ) : (
          <div className="space-y-2">
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {categoriiMagazin.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={valoare.categorii.includes(c.name)}
                    onChange={() => comutaCategorie(c.name)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  <span className="truncate text-foreground">{c.name}</span>
                </label>
              ))}
            </div>
            {/*
              ⚠⚠ Amândouă urmările sunt ale felului în care sunt făcute
              categoriile în casă (`products.category` e un NUME), nu ale etapei
              ăsteia — dar comerciantul n-are de unde să știe.
            */}
            <p className="text-[11px] text-muted-foreground">{DESPRE_CATEGORII}</p>
          </div>
        )
      )}

      {eroare
        ? <p className="text-xs text-destructive">{eroare}</p>
        : <p className="text-[11px] text-muted-foreground">{descrieRestrangerea(valoare, null)}</p>}
    </div>
  );
}
