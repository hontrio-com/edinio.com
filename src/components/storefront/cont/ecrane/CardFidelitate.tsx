import { Gift, Sparkles } from "lucide-react";
import type { FidelitateCont } from "@/lib/themarketer/fidelitate";
import { CARD, TITLU } from "../ui/clase";

/**
 * Programul de fidelitate al magazinului (theMarketer), in contul cumparatorului: punctele, nivelul si
 * codurile de reducere primite si nefolosite. Datele vin de pe server (`fidelitateaContului`); cardul
 * lipseste cand omul nu e in program sau theMarketer n-a raspuns la timp.
 *
 * ⚠ Text de vitrina: fara diacritice, ca restul zonei de cont.
 */

function puncte(n: number): string {
  return `${n.toLocaleString("ro-RO")} ${n === 1 ? "punct" : "puncte"}`;
}

function dataScurta(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

function valoareCod(c: { valoare: string; tip: string }): string {
  const v = c.valoare.trim();
  const t = c.tip.toLowerCase();
  if (t.includes("free") || t.includes("shipping")) return "transport gratuit";
  if (t.includes("percent") || t === "1") return v ? `${v}% reducere` : "reducere";
  return v ? `${v} lei reducere` : "reducere";
}

export function CardFidelitate({ f }: { f: FidelitateCont }) {
  return (
    <section className={`${CARD} p-5 sm:p-6`} aria-labelledby="fidelitate-titlu">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--st-muted)]">Programul de fidelitate</p>
          <h2 id="fidelitate-titlu" className="mt-1 text-2xl font-semibold tabular-nums text-[var(--st-text)]" style={TITLU}>
            {puncte(f.puncte)}
          </h2>
          {f.nivel && (
            <p className="mt-0.5 text-sm text-[var(--st-muted)]">
              Nivelul tau: <span className="font-medium text-[var(--st-text)]">{f.nivel}</span>
            </p>
          )}
        </div>
        <Sparkles className="h-6 w-6 shrink-0 text-[var(--st-muted)]" strokeWidth={1.6} aria-hidden="true" />
      </div>

      {(f.panaLaUrmator !== null && f.nivelUrmator) || f.expiraCurand > 0 ? (
        <ul className="mt-4 space-y-1.5 text-sm text-[var(--st-text)]">
          {f.panaLaUrmator !== null && f.nivelUrmator && (
            <li>Mai ai nevoie de {puncte(f.panaLaUrmator)} pana la nivelul {f.nivelUrmator}.</li>
          )}
          {f.expiraCurand > 0 && <li>{puncte(f.expiraCurand)} expira curand. Foloseste-le la urmatoarea comanda.</li>}
        </ul>
      ) : null}

      {f.coduri.length > 0 && (
        <div className="mt-5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--st-text)]">
            <Gift className="h-4 w-4" aria-hidden="true" /> Codurile tale de reducere
          </p>
          <ul className="mt-2 space-y-2">
            {f.coduri.map((c) => (
              <li key={c.cod} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--st-radius-sm)] border border-[var(--st-border)] px-3 py-2">
                <span className="select-all font-mono text-sm font-semibold text-[var(--st-text)]">{c.cod}</span>
                <span className="text-xs text-[var(--st-muted)]">
                  {valoareCod(c)}{dataScurta(c.expira) ? `, valabil pana pe ${dataScurta(c.expira)}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--st-muted)]">Scrii codul la finalizarea comenzii, in campul pentru cupon.</p>
        </div>
      )}
    </section>
  );
}
