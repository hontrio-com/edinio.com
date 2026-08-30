"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { centrulProblemelorEmag, type CentruProblemeEcran } from "@/lib/actions/emag.actions";

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
  const [seIncarca, incepe] = useTransition();

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

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" /> Ce te ține pe loc
          </h3>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            {total} {total === 1 ? "lucru" : "lucruri"} de reparat, adunate pe feluri.
            Cel mai des e primul.
          </p>
        </div>
        <button
          type="button"
          onClick={incarca}
          disabled={seIncarca}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
        >
          {seIncarca ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reîmprospătează
        </button>
      </div>

      <ul className="mt-4 divide-y divide-border">
        {centru.grupuri.map((g) => (
          <li key={g.cheie} className="py-3">
            <div className="flex flex-wrap items-start gap-2">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                g.sursa === "emag" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  : g.sursa === "edinio" ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              }`}>
                {/* ⚠ Se spune UNDE se repară, nu doar că e stricat. „eMAG a refuzat" și
                    „n-am putut trimite" se repară în locuri complet diferite; fără
                    eticheta asta, omul ar fi căutat în panoul greșit. */}
                {g.sursa === "emag" ? "La eMAG" : g.sursa === "edinio" ? "La tine" : "Legătura"}
              </span>
              <span className="min-w-0 flex-1 text-sm">{g.titlu}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {g.cate}
              </span>
            </div>

            {/* ⚠ Un exemplu ÎNTREG. Gruparea șterge numerele și valorile ca să poată
                aduna; fără exemplu, „lipsește o caracteristică" n-ar fi spus CARE. */}
            {g.exemplu && g.exemplu !== g.titlu && (
              <p className="mt-1 text-xs text-muted-foreground">
                De exemplu: {g.exemplu}
              </p>
            )}

            {g.oferte.length > 0 && (
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                Oferte: {g.oferte.join(", ")}
                {g.cate > g.oferte.length ? ` și încă ${g.cate - g.oferte.length}` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>

      {/*
        ⚠ MARGINEA SE SPUNE, NU SE ASCUNDE.
        „3 grupuri" calculat din primele 1000 de rânduri dintr-un catalog de 40.000
        arată exact ca adevărul întreg, și nu e. O margine tăcută e mai rea decât una
        lată — omul ar fi reparat trei lucruri și ar fi crezut că a terminat.
      */}
      {centru.taiat && (
        <p className="mt-3 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
          Grupele sunt făcute din cele mai recente {centru.citite} de oferte cu probleme.
          Dacă ai mai multe, repară-le pe astea întâi și revino. Lista se recalculează.
        </p>
      )}
    </div>
  );
}
