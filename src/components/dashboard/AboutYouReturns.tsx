"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, PackageCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  repuneInStocAboutYou, retururiAboutYou, type RandReturAboutYou,
} from "@/lib/actions/aboutyou-retururi.actions";

/**
 * Retururile About You.
 *
 * ═══ ⚠ DE CE EXISTA ECRANUL ═══
 *
 * Pana azi statusul „returned" de la ei punea AUTOMAT toata comanda inapoi pe raft. Marfa
 * intoarsa vine insa desfacuta, zgariata, incompleta, sau pur si simplu alta — iar stocul
 * umflat se vinde, si se vinde ce nu exista.
 *
 * ⚠ ORDINEA A CONTAT: repunerea automata s-a oprit ODATA cu ecranul asta, nu inaintea lui.
 * Taiata fara el, marfa intoarsa n-ar mai fi ajuns niciodata inapoi in stoc — o paguba mai
 * mare decat cea reparata.
 *
 * ⚠ SI E O SINGURA APASARE, nu doua ca la Trendyol. Acolo comerciantul mai si HOTARASTE daca
 * accepta returul; aici About You a hotarat deja, iar singura intrebare ramasa e daca marfa
 * primita e buna de pus la loc.
 */
export function AboutYouReturns({ businessId }: { businessId: string }) {
  const [retururi, setRetururi] = useState<RandReturAboutYou[] | null>(null);
  const [doarNerezolvate, setDoarNerezolvate] = useState(true);
  const [seIncarca, incepe] = useTransition();

  function incarca(doar = doarNerezolvate) {
    incepe(async () => {
      const r = await retururiAboutYou(businessId, doar);
      if ("error" in r) { toast.error(r.error); return; }
      setRetururi(r.retururi);
    });
  }

  /* ⚠ Se incarca la schimbarea magazinului, nu la fiecare randare: `incarca` se recreeaza la
     fiecare trecere, iar pusa in lista de dependinte ar fi cerut retururile la nesfarsit. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { incarca(); }, [businessId]);

  function pune(id: string) {
    incepe(async () => {
      const r = await repuneInStocAboutYou(businessId, id);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(r.pus > 0 ? `${r.pus} buc. au intrat înapoi în stoc.` : "Era deja pusă înapoi.");
      incarca();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
          <RotateCcw className="h-4 w-4" /> Retururi About You
        </h3>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={doarNerezolvate}
            onChange={(e) => { setDoarNerezolvate(e.target.checked); incarca(e.target.checked); }}
          />
          Doar cele nepuse înapoi
        </label>
      </div>

      <p className="mb-3 text-[11px] text-muted-foreground leading-relaxed">
        Marfa întoarsă nu intră singură în stoc: vine și desfăcută, incompletă sau alta decât
        cea trimisă. Uită-te la ce ai primit, apoi pune înapoi doar ce se mai poate vinde.
      </p>

      {seIncarca && !retururi && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Se încarcă…
        </p>
      )}

      {retururi?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Niciun retur {doarNerezolvate ? "de pus înapoi" : "înregistrat"}.
        </p>
      )}

      <ul className="space-y-2">
        {(retururi ?? []).map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-2.5 text-xs">
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{r.numeProdus ?? `SKU ${r.sku}`}</span>
              {r.variantTitle && <span className="text-muted-foreground"> · {r.variantTitle}</span>}
              <span className="text-muted-foreground"> · {r.cantitate} buc.</span>
              <span className="block text-[11px] text-muted-foreground">Comanda {r.comanda}</span>
            </span>
            {r.repusInStoc ? (
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                <PackageCheck className="h-3 w-3" /> pusă în stoc
              </span>
            ) : (
              <button
                type="button"
                onClick={() => pune(r.id)}
                disabled={seIncarca}
                className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-60"
              >
                Am primit marfa și e bună
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
