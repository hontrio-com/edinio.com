"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { jurnalCereriEmag, type RandJurnalEcran } from "@/lib/actions/emag.actions";

/**
 * Ce a plecat spre eMAG și ce au răspuns (§65, §66).
 *
 * ═══ ⚠ DE CE EXISTĂ ECRANUL ĂSTA ═══
 *
 * „Prețul ăla chiar a plecat? Când? Și ce-au zis ei?" E singura întrebare care se
 * pune cu adevărat despre o integrare de marketplace, și până acum n-avea niciun
 * răspuns: se vedea doar ce a căzut, iar o cerere care reușește și nu face nimic —
 * chiar tiparul Trendyol, 1051 de produse cu prețurile neschimbate — nu lăsa urmă.
 *
 * ═══ ⚠ STĂ ÎNCHIS, ȘI DINADINS ═══
 *
 * Nu e un ecran de zi cu zi. Se deschide când ceva pare că n-a plecat — și atunci
 * trebuie să fie acolo, complet. Deschis din start, ar fi împins jos lucrurile pe
 * care comerciantul chiar le face în fiecare zi.
 *
 * ⚠ Se încarcă abia la deschidere. Un `useEffect` la montare ar fi cerut baza de date
 * la fiecare intrare pe pagină, pentru un panou pe care nimeni nu-l deschide.
 */

export function EmagJurnal({ businessId }: { businessId: string }) {
  const [deschis, setDeschis] = useState(false);
  const [randuri, setRanduri] = useState<RandJurnalEcran[] | null>(null);
  const [total, setTotal] = useState(0);
  const [doarProbleme, setDoarProbleme] = useState(false);
  const [fir, setFir] = useState<string | null>(null);
  const [seIncarca, incepe] = useTransition();

  function incarca(optiuni: { doarProbleme?: boolean; fir?: string | null } = {}) {
    const probleme = optiuni.doarProbleme ?? doarProbleme;
    const firul = optiuni.fir !== undefined ? optiuni.fir : fir;
    incepe(async () => {
      const r = await jurnalCereriEmag(businessId, {
        doarProbleme: probleme,
        ...(firul ? { fir: firul } : {}),
      });
      if ("error" in r) {
        toast.error(r.error);
        setRanduri([]);
        return;
      }
      setRanduri(r.randuri);
      setTotal(r.total);
    });
  }

  function comutaDeschis() {
    const nou = !deschis;
    setDeschis(nou);
    if (nou && randuri === null) incarca();
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
          <ScrollText className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Ce a plecat spre eMAG</span>
            <span className="block text-xs text-muted-foreground">
              Ultimele 30 de zile. Deschide-l când ceva pare că n-a ajuns.
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
            <button
              type="button"
              onClick={() => { setDoarProbleme(!doarProbleme); incarca({ doarProbleme: !doarProbleme }); }}
              disabled={seIncarca}
              aria-pressed={doarProbleme}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-60 ${
                doarProbleme ? "border-transparent bg-primary text-primary-foreground" : "border-border hover:bg-muted"
              }`}
            >
              Doar ce n-a mers
            </button>

            {/* ⚠ Firul se stinge cu un buton al lui, nu prin reîncărcarea paginii: altfel
                omul rămâne blocat pe o singură lucrare fără să știe de ce lista e scurtă. */}
            {fir && (
              <button
                type="button"
                onClick={() => { setFir(null); incarca({ fir: null }); }}
                disabled={seIncarca}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
              >
                Ieși din lucrarea <span className="font-mono">{fir}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => incarca()}
              disabled={seIncarca}
              className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
            >
              {seIncarca ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Reîmprospătează
            </button>
          </div>

          {randuri === null ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Se citește jurnalul…
            </p>
          ) : randuri.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {doarProbleme
                ? "Nimic n-a dat greș. E vestea bună."
                : "Încă n-a plecat nimic spre eMAG."}
            </p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-border">
                {randuri.map((r) => (
                  <RandJurnal
                    key={r.id}
                    rand={r}
                    laFir={(f) => { setFir(f); incarca({ fir: f }); }}
                  />
                ))}
              </ul>
              {total > randuri.length && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Se arată {randuri.length} din {total}.
                </p>
              )}
            </>
          )}

          {/*
            ⚠ SE SPUNE CE NU E ÎN JURNAL, ȘI DE CE.
            Fără rândurile astea, cine caută o citire reușită și n-o găsește ar crede
            că s-a pierdut ceva — și ar căuta un defect care nu există. La fel cu
            corpul cererii: lipsa lui e o hotărâre, nu o scăpare.
          */}
          <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">Citirile reușite nu se scriu aici.</strong>{" "}
              Sincronizarea citește de la eMAG din minut în minut; păstrate, ar fi zeci de
              mii de rânduri pe zi care nu spun nimic. Se scriu toate scrierile și tot ce
              n-a reușit.
            </p>
            <p className="mt-1.5">
              <strong className="text-foreground">Conținutul cererilor nu se păstrează.</strong>{" "}
              Comenzile și AWB-urile poartă numele, adresa și telefonul cumpărătorului;
              jurnalul n-are voie să fie o a doua copie a datelor clienților tăi.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const CULOARE_VERDICT: Record<string, string> = {
  reusit: "bg-primary/10 text-primary",
  reusit_cu_observatii: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  refuz: "bg-destructive/10 text-destructive",
  trecatoare: "bg-muted text-muted-foreground",
  chei: "bg-destructive/10 text-destructive",
};

function RandJurnal({ rand, laFir }: { rand: RandJurnalEcran; laFir: (fir: string) => void }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${CULOARE_VERDICT[rand.verdict] ?? "bg-muted"}`}>
          {rand.verdictEticheta}
        </span>
        <span className="font-mono text-xs">{rand.metoda} {rand.cale}</span>
        {/* ⚠ `0` înseamnă „n-am ajuns la ei", nu „au răspuns cu zero". Arătat ca un cod
            HTTP obișnuit, ar fi trimis pe cineva să caute ce înseamnă „HTTP 0". */}
        <span className="text-xs text-muted-foreground tabular-nums">
          {rand.status === 0 ? "fără răspuns" : rand.status}
          {rand.durataMs != null ? ` · ${rand.durataMs} ms` : ""}
        </span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {new Date(rand.cand).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "medium" })}
        </span>
      </div>

      {rand.emagIds.length > 0 && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Oferte: <span className="font-mono">{rand.emagIds.slice(0, 6).join(", ")}</span>
          {rand.emagIds.length > 6 ? ` și încă ${rand.emagIds.length - 6}` : ""}
        </p>
      )}

      {rand.eroare && <p className="mt-0.5 text-xs text-destructive">{rand.eroare}</p>}

      {/* ⚠ Mesajele LOR, neatinse. Sunt singurul loc din care afli ce câmp e de reparat;
          un rezumat scris de noi ar fi pierdut exact numele câmpului și valoarea. */}
      {rand.mesaje.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {rand.mesaje.map((m, i) => (
            <li key={i} className="text-xs text-muted-foreground">{m}</li>
          ))}
        </ul>
      )}

      {rand.fir && (
        <button
          type="button"
          onClick={() => laFir(rand.fir!)}
          className="mt-1 font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
          title="Vezi toate cererile acestei lucrări"
        >
          {rand.fir}
        </button>
      )}
    </li>
  );
}
