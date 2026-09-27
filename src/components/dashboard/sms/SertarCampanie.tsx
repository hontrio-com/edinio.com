"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, Pause, Play, X } from "lucide-react";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { useDialogAccesibil } from "../useDialogAccesibil";
import { detaliiCampanie, type DetaliiCampanie } from "@/lib/actions/sms.actions";
import { formatDateTime } from "@/lib/utils/format";
import type { Campanie } from "../SMSMarketingClient";
import { DESPRE_STARE } from "./stari";

/** Fisa unei campanii: livrari, esecuri, si ce se poate face cu ea. */
export function SertarCampanie({ businessId, campanie, onClose, onReia, onOpreste, onDuplica, lucreaza }: {
  businessId: string;
  campanie: Campanie;
  onClose: () => void;
  onReia: () => void;
  onOpreste: () => void;
  onDuplica: () => void;
  lucreaza: boolean;
}) {
  const cutia = useDialogAccesibil(true, onClose);
  const [detalii, setDetalii] = useState<DetaliiCampanie | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);

  useEffect(() => {
    let anulat = false;
    (async () => {
      try {
        const r = await detaliiCampanie(businessId, campanie.id);
        if (anulat) return;
        if ("error" in r) setEroare(r.error); else setDetalii(r);
      } catch {
        if (!anulat) setEroare("Nu am putut încărca detaliile. Încearcă din nou.");
      }
    })();
    return () => { anulat = true; };
  }, [businessId, campanie.id, campanie.sent_count, campanie.status]);

  const s = DESPRE_STARE[campanie.status] ?? DESPRE_STARE.failed;
  const pePloturi = !!campanie.cheie;
  const st = detalii?.stare;
  const plecate = st ? st.trimis : campanie.sent_count;
  const rataLivrare = st && st.livrate + st.nelivrate > 0 ? Math.round((st.livrate / (st.livrate + st.nelivrate)) * 100) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-stretch sm:justify-end" onClick={onClose}>
      <div ref={cutia} role="dialog" aria-modal="true" aria-label="Detaliile campaniei" tabIndex={-1}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:h-full sm:max-h-none sm:w-[34rem] sm:rounded-none sm:rounded-l-2xl sm:border-y-0 sm:border-r-0"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Campanie</h2>
              <EtichetaStare ton={s.ton} marime="mic">{s.text}</EtichetaStare>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(campanie.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Închide" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/30 p-3 text-sm text-foreground">{campanie.message}</div>

          {campanie.motiv_oprire && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">{campanie.motiv_oprire}</p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Cifra eticheta="Destinatari" valoare={campanie.recipient_count} />
            <Cifra eticheta="Trimise" valoare={plecate} />
            {st && <Cifra eticheta="Rămase" valoare={st.de_trimis + st.in_lucru} />}
            {st && <Cifra eticheta="Livrate" valoare={st.livrate} sub={rataLivrare !== null ? `${rataLivrare}% din raportate` : "raportul vine de la SMSO"} />}
            <Cifra eticheta="Eșuate" valoare={st ? st.esuat + st.necunoscut : campanie.failed_count} />
            {campanie.sariti > 0 && <Cifra eticheta="Dezabonați (săriți)" valoare={campanie.sariti} />}
            {st && st.cost_eurocenti > 0 && <Cifra eticheta="Cost" valoare={`${(st.cost_eurocenti / 100).toFixed(2)} €`} />}
          </div>

          {!pePloturi && (
            <p className="text-xs text-muted-foreground">Campanie trimisă înainte de 27.09.2026: pentru ea avem doar cifrele din listă.</p>
          )}

          {eroare && <p className="text-xs text-destructive">{eroare}</p>}
          {!detalii && !eroare && pePloturi && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Se încarcă…</p>
          )}

          {detalii && detalii.esecuri.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nu au plecat</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {detalii.esecuri.map((e, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                    <span className="font-mono text-foreground">{e.telefon}</span>
                    <span className="text-right text-muted-foreground">{e.eroare ?? "Eroare necunoscută"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button type="button" onClick={onDuplica}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
            <Copy className="h-4 w-4" /> Folosește mesajul din nou
          </button>
          {pePloturi && campanie.status === "in_curs" && (
            <button type="button" onClick={onOpreste} disabled={lucreaza}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              <Pause className="h-4 w-4" /> Oprește
            </button>
          )}
          {pePloturi && (campanie.status === "oprita" || (campanie.status === "in_curs" && !lucreaza)) && (
            <button type="button" onClick={onReia} disabled={lucreaza}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <Play className="h-4 w-4" /> {campanie.status === "oprita" ? "Reia trimiterea" : "Continuă trimiterea"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Cifra({ eticheta, valoare, sub }: { eticheta: string; valoare: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{eticheta}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{typeof valoare === "number" ? valoare.toLocaleString("ro-RO") : valoare}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
