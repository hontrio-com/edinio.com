"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, PackageCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  hotarasteReturTrendyol, motiveRespingereTrendyol, repuneInStocTrendyol, retururiTrendyol,
  type RandRetur,
} from "@/lib/actions/trendyol-retururi.actions";

/**
 * Retururile Trendyol.
 *
 * ═══ ⚠ DE CE EXISTA ECRANUL ═══
 *
 * Pana azi Edinio stia despre un retur un singur lucru: pachetul are statusul `Returned`. Nu
 * ce articol s-a intors, nu cate bucati, nu de ce, si nu daca cererea asteapta o hotarare.
 * Comerciantul afla din panoul LOR si decidea acolo.
 *
 * ═══ ⚠ DOUA APASARI, NU UNA ═══
 *
 * „Accept returul" inseamna ca banii se intorc. „Am primit marfa si e buna" inseamna ca
 * produsul se pune la loc pe raft. Sunt lucruri diferite, la momente diferite: marfa vine
 * desfacuta, incompleta, ori pur si simplu alta.
 *
 * Un singur buton care le face pe amandoua ar fi umflat stocul cu marfa nevandabila — si
 * exact asta am oprit cu o zi inainte, la trecerea automata pe „returnat".
 */

const STARI: Record<string, string> = {
  Created: "Nouă",
  WaitingInAction: "Așteaptă răspunsul tău",
  InAnalysis: "În analiză la Trendyol",
  Accepted: "Acceptată",
  Rejected: "Respinsă",
  Cancelled: "Anulată",
  Unresolved: "Nerezolvată",
};

export function TrendyolReturns({ businessId }: { businessId: string }) {
  const [retururi, setRetururi] = useState<RandRetur[] | null>(null);
  const [motive, setMotive] = useState<{ id: number; nume: string }[]>([]);
  const [doarDeHotarat, setDoarDeHotarat] = useState(true);
  const [alese, setAlese] = useState<Set<string>>(new Set());
  const [motivAles, setMotivAles] = useState<string>("");
  const [explicatie, setExplicatie] = useState("");
  const [seIncarca, incepe] = useTransition();

  function incarca(doar = doarDeHotarat) {
    incepe(async () => {
      const r = await retururiTrendyol(businessId, doar);
      if ("error" in r) { toast.error(r.error); return; }
      setRetururi(r.retururi);
    });
  }

  /* ⚠ Se incarca la schimbarea magazinului, nu la fiecare randare: `incarca` se recreeaza la
     fiecare trecere, iar pusa in lista de dependinte ar fi cerut retururile la nesfarsit. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { incarca(); }, [businessId]);

  function comuta(id: string) {
    setAlese((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function hotaraste(claimId: string, accepta: boolean) {
    const ids = [...alese];
    if (ids.length === 0) { toast.error("Bifează întâi liniile."); return; }
    incepe(async () => {
      const r = await hotarasteReturTrendyol(businessId, {
        claimId, claimItemIds: ids, accepta,
        motivId: accepta ? undefined : Number(motivAles) || undefined,
        explicatie: accepta ? undefined : explicatie,
      });
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(accepta ? "Returul a fost acceptat." : "Returul a fost respins.");
      setAlese(new Set());
      setExplicatie("");
      incarca();
    });
  }

  function pune(claimItemId: string) {
    incepe(async () => {
      const r = await repuneInStocTrendyol(businessId, claimItemId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(r.pus > 0 ? `${r.pus} buc. au intrat înapoi în stoc.` : "Era deja pusă înapoi.");
      incarca();
    });
  }

  /* ⚠ Motivele se cer ABIA cand omul vrea sa respinga: sunt o cerere catre ei, si n-are rost
     arsa pentru fiecare deschidere a ecranului. */
  function ceruMotivele() {
    if (motive.length > 0) return;
    incepe(async () => {
      const r = await motiveRespingereTrendyol(businessId);
      if ("error" in r) { toast.error(r.error); return; }
      setMotive(r.motive);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
          <RotateCcw className="h-4 w-4" /> Retururi Trendyol
        </h3>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={doarDeHotarat}
            onChange={(e) => { setDoarDeHotarat(e.target.checked); incarca(e.target.checked); }}
          />
          Doar cele care așteaptă
        </label>
      </div>

      {seIncarca && !retururi && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Se încarcă…
        </p>
      )}

      {retururi?.length === 0 && (
        <p className="text-sm text-muted-foreground">Niciun retur {doarDeHotarat ? "de rezolvat" : "înregistrat"}.</p>
      )}

      <div className="space-y-3">
        {(retururi ?? []).map((r) => (
          <div key={r.claimId} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-foreground">
                {r.orderNumber ?? "Comandă necunoscută"}
              </span>
              <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {STARI[r.status ?? ""] ?? r.status ?? "—"}
              </span>
            </div>

            <ul className="space-y-1.5">
              {r.linii.map((l) => (
                <li key={l.claimItemId} className="flex flex-wrap items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={alese.has(l.claimItemId)}
                    onChange={() => comuta(l.claimItemId)}
                    aria-label={`Alege ${l.numeProdus ?? l.barcode ?? "linia"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground">{l.numeProdus ?? l.barcode ?? "Produs"}</span>
                    <span className="text-muted-foreground"> · {l.cantitate} buc.</span>
                    {l.motiv && <span className="text-muted-foreground"> · {l.motiv}</span>}
                    {l.notaClient && (
                      <span className="block text-muted-foreground">„{l.notaClient}”</span>
                    )}
                    {l.decizie && (
                      <span className="block text-[11px] text-muted-foreground">
                        {l.decizie === "accepted" ? "Acceptat de tine" : "Respins de tine"}
                      </span>
                    )}
                  </span>
                  {/*
                    ⚠ A DOUA APASARE, si numai dupa ce omul a vazut marfa. Acceptarea returului
                    inseamna ca banii se intorc, nu ca produsul e bun de pus la loc pe raft.
                  */}
                  {l.repusInStoc ? (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                      <PackageCheck className="h-3 w-3" /> pusă în stoc
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pune(l.claimItemId)}
                      disabled={seIncarca}
                      className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-60"
                    >
                      Am primit marfa și e bună
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => hotaraste(r.claimId, true)}
                disabled={seIncarca}
                className="rounded-lg bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                Acceptă returul
              </button>
              <button
                type="button"
                onClick={() => { ceruMotivele(); }}
                disabled={seIncarca}
                className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-60"
              >
                Respinge…
              </button>
              {motive.length > 0 && (
                <>
                  <select
                    value={motivAles}
                    onChange={(e) => setMotivAles(e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Alege motivul</option>
                    {motive.map((m) => <option key={m.id} value={m.id}>{m.nume}</option>)}
                  </select>
                  <input
                    value={explicatie}
                    onChange={(e) => setExplicatie(e.target.value)}
                    placeholder="Scrie de ce respingi"
                    className="min-w-40 flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => hotaraste(r.claimId, false)}
                    disabled={seIncarca || !motivAles || !explicatie.trim()}
                    className="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    Trimite respingerea
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
