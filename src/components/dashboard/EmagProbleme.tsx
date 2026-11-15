"use client";

import { useEffect, useState } from "react";
import { useLucru } from "@/components/dashboard/useLucru";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { centrulProblemelorEmag, type CentruProblemeEcran } from "@/lib/actions/emag.actions";
import type { SursaProblemei } from "@/lib/emag/probleme";
import { cn } from "@/lib/utils/cn";

/**
 * Ce e stricat, adunat pe feluri (§64).
 *
 * ═══ ⚠ DE CE EXISTĂ ═══
 *
 * Panoul știa deja să spună „38 de oferte au probleme". Cu 38 de rânduri de citit unul
 * câte unul, comerciantul nu afla ce e de FĂCUT — deși de cele mai multe ori e un
 * singur lucru: o caracteristică lipsă dintr-o categorie, o marcă nerecunoscută.
 *
 * Aici răspunsul devine „38 de oferte așteaptă aceeași caracteristică", care se
 * repară o dată.
 *
 * ═══ ⚠ SE ASCUNDE SINGUR CÂND NU E NIMIC ═══
 *
 * O carte care scrie „Nicio problemă" în fiecare zi îl învață pe om să nu se mai uite
 * la ea — și atunci n-o vede nici în ziua în care are ce spune.
 */

export function EmagProbleme({ businessId }: { businessId: string }) {
  const [centru, setCentru] = useState<CentruProblemeEcran | null>(null);
  const [seIncarca, incepe] = useLucru();

  function incarca() {
    incepe(async () => {
      const r = await centrulProblemelorEmag(businessId);
      if ("error" in r) {
        toast.error(r.error);
        setCentru({ grupuri: [], taiat: false, citite: 0 });
        return;
      }
      setCentru(r);
    });
  }

  useEffect(() => {
    incarca();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  /* Încă se citește, sau chiar nu e nimic. În ambele cazuri nu se arată nimic: un
     schelet pentru o carte care de obicei lipsește ar fi clipit degeaba pe ecran. */
  if (centru === null || centru.grupuri.length === 0) return null;

  const total = centru.grupuri.reduce((s, g) => s + g.cate, 0);
  /* ⚠ Bara se masoara fata de grupul CEL MAI DES, nu fata de total: „Cel mai des e primul” trebuie
     sa se vada dintr-o privire, iar fata de total, la 14 lucruri, toate barele ar fi fost firave. */
  const maxim = Math.max(1, ...centru.grupuri.map((g) => g.cate));

  /*
   * ═══ FORMA ALEASA DE PROPRIETAR (15.11.2026, „C la ce te tine pe loc”) ═══
   *
   * Dupa lista de erori din Sentry: o linie colorata pe marginea fiecarui rand spune UNDE se repara
   * (la tine, la eMAG, legatura), iar bara din dreapta spune cat de des apare. Inainte, eticheta mica
   * „La tine” / „La eMAG” statea in fata textului si toate randurile aratau la fel de importante.
   */
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Ce te ține pe loc</h3>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
            {total} {total === 1 ? "lucru" : "lucruri"} de reparat, adunate pe feluri.
            Cel mai des e primul.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={incarca} disabled={seIncarca}>
          {seIncarca ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Reîmprospătează
        </Button>
      </header>

      <div className="hidden grid-cols-[minmax(0,1fr)_9rem] gap-6 border-y border-border bg-muted px-5 py-2 text-xs font-medium text-muted-foreground sm:grid">
        <span>Problema</span>
        <span>Cât de des</span>
      </div>

      <ul className="divide-y divide-border max-sm:border-t max-sm:border-border">
        {centru.grupuri.map((g) => {
          /* ⚠ Se spune UNDE se repară, nu doar că e stricat. „eMAG a refuzat" și „n-am putut
             trimite" se repară în locuri complet diferite; fără asta, omul ar fi căutat în
             panoul greșit. Acum o spun și culoarea liniei, și primul cuvânt de sub titlu. */
          const sursa = SURSA[g.sursa];
          return (
            <li key={g.cheie} className="relative grid gap-x-6 gap-y-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
              <span aria-hidden="true" className={cn("absolute inset-y-2.5 left-0 w-[3px] rounded-r", sursa.linie)} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{g.titlu}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {sursa.unde}
                  {/* ⚠ Un exemplu ÎNTREG. Gruparea șterge numerele și valorile ca să poată
                      aduna; fără exemplu, „lipsește o caracteristică" n-ar fi spus CARE. */}
                  {g.exemplu && g.exemplu !== g.titlu && <> · de exemplu {g.exemplu}</>}
                </p>
                {g.oferte.length > 0 && (
                  <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    Oferte {g.oferte.join(", ")}
                    {g.cate > g.oferte.length ? ` și încă ${g.cate - g.oferte.length}` : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2.5" title={`${g.cate} din ${total}`}>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(g.cate / maxim) * 100}%` }} />
                </div>
                <span className="w-7 text-right text-sm font-semibold tabular-nums text-foreground">{g.cate}</span>
              </div>
            </li>
          );
        })}
      </ul>

      {/*
        ⚠ MARGINEA SE SPUNE, NU SE ASCUNDE.
        „3 grupuri" calculat din primele 1000 de rânduri dintr-un catalog de 40.000
        arată exact ca adevărul întreg, și nu e. O margine tăcută e mai rea decât una
        lată — omul ar fi reparat trei lucruri și ar fi crezut că a terminat.
      */}
      {centru.taiat && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Grupele sunt făcute din cele mai recente {centru.citite} de oferte cu probleme.
          Dacă ai mai multe, repară-le pe astea întâi și revino. Lista se recalculează.
        </p>
      )}
    </section>
  );
}

/**
 * Unde se repara fiecare fel de problema (vezi `SursaProblemei`): culoarea liniei din stanga randului
 * si primul cuvant de sub titlu.
 */
const SURSA: Record<SursaProblemei, { linie: string; unde: string }> = {
  edinio: { linie: "bg-destructive", unde: "La tine: lipsește ceva în Edinio" },
  emag: { linie: "bg-warning", unde: "La eMAG: se repară în fișa produsului" },
  legatura: { linie: "bg-muted-foreground/40", unde: "Legătura: se reia singur" },
};
