"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { formatDateTime } from "@/lib/utils/format";

/**
 * Operatiile externe atarnate, peste toate magazinele.
 *
 * Pagina asta ar trebui sa fie GOALA aproape mereu. Cand nu e, fiecare rand
 * inseamna ca un AWB platit sau un document fiscal s-ar putea sa existe la furnizor
 * fara ca Edinio sa stie — si ca butonul care l-ar reface e blocat pana cand se
 * uita cineva in contul furnizorului.
 */

interface Operatie {
  id: string;
  business_id: string | null;
  order_id: string | null;
  order_number: string | null;
  fel: string;
  furnizor: string;
  stare: string;
  cheie: string;
  referinta_externa: string | null;
  incercari: number;
  ultima_eroare: string | null;
  creat_la: string;
  actualizat_la: string;
}

const STARI: Record<string, { eticheta: string; cls: string }> = {
  in_curs: { eticheta: "a plecat si nu s-a mai auzit nimic", cls: "bg-amber-50 border-amber-200 text-amber-800" },
  necunoscut: { eticheta: "raspunsul nu a ajuns", cls: "bg-red-50 border-red-200 text-red-800" },
  reusit: { eticheta: "gata", cls: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  esuat: { eticheta: "refuzata de furnizor", cls: "bg-slate-50 border-slate-200 text-slate-700" },
  anulat: { eticheta: "anulata", cls: "bg-slate-50 border-slate-200 text-slate-700" },
};

export function AdminOperatiiClient() {
  const [operatii, setOperatii] = useState<Operatie[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [toate, setToate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const limit = 50;

  /*
   * Reincarcarea manuala trece printr-un contor, nu printr-un `useCallback` chemat
   * din efect: asa nu mai exista niciun `setState` SINCRON in corpul efectului
   * (`react-hooks/set-state-in-effect`), fiindca toate scrierile de stare se
   * intampla abia dupa `await`.
   */
  const [reincarcari, setReincarcari] = useState(0);
  const [deschis, setDeschis] = useState<string | null>(null);
  const [motive, setMotive] = useState<Record<string, string>>({});
  const [inLucru, setInLucru] = useState<string | null>(null);

  async function deblocheaza(id: string) {
    setInLucru(id);
    try {
      const res = await fetch("/api/admin/operatii", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, motiv: motive[id] ?? "" }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Nu am putut debloca operatia"); return; }
      setDeschis(null);
      setMotive((v) => { const n = { ...v }; delete n[id]; return n; });
      setLoading(true);
      setReincarcari((n) => n + 1);
    } finally {
      setInLucru(null);
    }
  }

  useEffect(() => {
    let activ = true;
    void (async () => {
      try {
        const p = new URLSearchParams({ page: String(page), ...(toate ? { toate: "1" } : {}) });
        const res = await fetch(`/api/admin/operatii?${p}`);
        const j = await res.json();
        if (!activ) return;
        if (!res.ok) throw new Error(j.error ?? "Eroare la incarcare");
        setOperatii(j.operatii ?? []);
        setTotal(j.total ?? 0);
        setError("");
      } catch (e) {
        if (activ) setError(e instanceof Error ? e.message : "Eroare la incarcare");
      } finally {
        if (activ) setLoading(false);
      }
    })();
    return () => { activ = false; };
  }, [page, toate, reincarcari]);

  const pagini = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Operatii externe</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {toate
              ? "Tot istoricul operatiilor catre furnizori."
              : "Doar cele care blocheaza. In mod normal, lista e goala."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setToate((v) => !v); setPage(1); }}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            {toate ? "Doar cele blocante" : "Arata tot istoricul"}
          </button>
          <button
            type="button"
            onClick={() => { setLoading(true); setReincarcari((n) => n + 1); }}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reincarca
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Se incarca…
        </div>
      ) : operatii.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          {toate ? "Nicio operatie inregistrata." : "Nicio operatie blocata. Asa trebuie sa arate."}
        </div>
      ) : (
        <>
          {!toate ? (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Fiecare rand inseamna ca operatia s-ar putea sa fi REUSIT la furnizor.
                Nu se reia automat — deblocarea o face comerciantul din pagina comenzii,
                dupa ce verifica in contul furnizorului.
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Cand</th>
                  <th className="px-3 py-2 font-medium">Operatie</th>
                  <th className="px-3 py-2 font-medium">Comanda</th>
                  <th className="px-3 py-2 font-medium">Stare</th>
                  <th className="px-3 py-2 font-medium">Referinta</th>
                  <th className="px-3 py-2 font-medium">Motiv</th>
                </tr>
              </thead>
              <tbody>
                {operatii.map((o) => {
                  const s = STARI[o.stare] ?? { eticheta: o.stare, cls: "bg-slate-50 border-slate-200 text-slate-700" };
                  return (
                    <tr key={o.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {formatDateTime(o.creat_la)}
                        {o.incercari > 1 ? <span className="ml-1">· {o.incercari} incercari</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-foreground">{o.fel}</span>
                        <span className="text-muted-foreground"> / {o.furnizor}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                        {o.order_number ?? <span className="text-muted-foreground">platforma</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${s.cls}`}>
                          {s.eticheta}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{o.referinta_externa ?? "—"}</td>
                      <td className="max-w-md break-words px-3 py-2 text-xs text-muted-foreground">
                        {o.ultima_eroare ?? "—"}
                        {/*
                          ⚠ Deblocarea traieste AICI, nu doar in panoul comerciantului.
                          Acela filtreaza pe `order_id`, deci nu poate ajunge niciodata
                          la operatiile fara comanda — facturarea de platforma si
                          ridicarile de la curier. Fara butonul asta, un singur timeout
                          acolo bloca cheia definitiv.
                        */}
                        {o.stare === "in_curs" || o.stare === "necunoscut" ? (
                          deschis === o.id ? (
                            <div className="mt-2 space-y-2">
                              <input
                                value={motive[o.id] ?? ""}
                                onChange={(e) => setMotive((v) => ({ ...v, [o.id]: e.target.value }))}
                                placeholder={`Ce ai verificat in contul ${o.furnizor}?`}
                                className="w-full max-w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                              />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void deblocheaza(o.id)}
                                  disabled={inLucru === o.id}
                                  className="rounded-md bg-foreground px-2 py-1 text-[11px] text-background disabled:opacity-50"
                                >
                                  {inLucru === o.id ? "Se deblocheaza…" : "Confirma"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeschis(null)}
                                  disabled={inLucru === o.id}
                                  className="rounded-md border border-border px-2 py-1 text-[11px]"
                                >
                                  Renunta
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeschis(o.id)}
                              className="mt-2 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
                            >
                              Am verificat, deblocheaza
                            </button>
                          )
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagini > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{total} in total</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Inapoi
                </button>
                <span className="px-2 py-1.5 text-muted-foreground">{page} / {pagini}</span>
                <button
                  type="button"
                  disabled={page >= pagini}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  Inainte <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
