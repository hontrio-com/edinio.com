"use client";

/**
 * Maparea automată a categoriilor: propune, nu decide.
 *
 * Motorul de potrivire (lib/trendyol/category-match.ts) marchează fiecare sugestie
 * cu o încredere. Doar cele „sigure" vin bifate; restul se văd, dar bifarea rămâne
 * o alegere conștientă. O categorie mapată greșit nu dă eroare — produsele se
 * listează în raftul altcuiva, iar comerciantul află din reclamații. De aceea
 * nimic nu se salvează fără apăsarea butonului final.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import {
  applyTrendyolCategoryMap, suggestTrendyolCategoryMap,
  type TrendyolMapSuggestion,
} from "@/lib/actions/trendyol.actions";
import type { Incredere } from "@/lib/trendyol/category-match";

const INCREDERE: Record<Incredere, { text: string; cls: string }> = {
  sigura: { text: "Sigură", cls: "bg-green-100 text-green-700" },
  probabila: { text: "Probabilă", cls: "bg-amber-100 text-amber-700" },
  slaba: { text: "Nesigură", cls: "bg-red-100 text-red-700" },
};

interface Alegere {
  /** Indexul opțiunii alese din `optiuni`. */
  optiune: number;
  bifat: boolean;
}

export function TrendyolAutoMap({
  businessId, categories, nemapate,
}: {
  businessId: string; categories: string[]; nemapate: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [faza, setFaza] = useState<"inchis" | "rezultate">("inchis");
  const [sugestii, setSugestii] = useState<TrendyolMapSuggestion[]>([]);
  const [alegeri, setAlegeri] = useState<Record<string, Alegere>>({});
  const [doarNemapate, setDoarNemapate] = useState(true);

  const analizeaza = () => {
    startTransition(async () => {
      const res = await suggestTrendyolCategoryMap(businessId, categories);
      if ("error" in res) { toast.error(res.error); return; }
      const initiale: Record<string, Alegere> = {};
      for (const s of res.sugestii) {
        const prima = s.optiuni[0];
        initiale[s.edinioCategory] = {
          optiune: 0,
          // Doar potrivirile sigure vin bifate, si doar pentru categoriile
          // nemapate: una deja mapata manual nu se suprascrie din reflex.
          bifat: !!prima && prima.incredere === "sigura" && !s.existent,
        };
      }
      setSugestii(res.sugestii);
      setAlegeri(initiale);
      setFaza("rezultate");
    });
  };

  const aplica = () => {
    const intrari = sugestii
      .filter((s) => alegeri[s.edinioCategory]?.bifat)
      .map((s) => {
        const o = s.optiuni[alegeri[s.edinioCategory].optiune];
        return o ? { edinioCategory: s.edinioCategory, category_id: o.categoryId, label: o.label } : null;
      })
      .filter((x): x is { edinioCategory: string; category_id: number; label: string } => x !== null);

    if (intrari.length === 0) { toast.error("Bifează cel puțin o mapare."); return; }
    startTransition(async () => {
      const res = await applyTrendyolCategoryMap(businessId, intrari);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(`${res.aplicate} ${res.aplicate === 1 ? "categorie mapată" : "categorii mapate"}.`);
      setFaza("inchis"); setSugestii([]); setAlegeri({});
      router.refresh();
    });
  };

  const vizibile = sugestii.filter((s) => (doarNemapate ? !s.existent : true));
  const bifate = sugestii.filter((s) => alegeri[s.edinioCategory]?.bifat).length;
  const fara = sugestii.filter((s) => s.optiuni.length === 0).length;

  if (faza === "inchis") {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Mapare automată
            </h2>
            <p className="text-sm text-muted-foreground">
              Caută pentru fiecare categorie din magazin categoria Trendyol potrivită și îți arată rezultatele
              înainte de a salva ceva. Tu confirmi ce se aplică.
            </p>
            {nemapate > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {nemapate} {nemapate === 1 ? "categorie nemapată" : "categorii nemapate"}.
              </p>
            )}
          </div>
          <button onClick={analizeaza} disabled={pending || categories.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 flex-shrink-0">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {pending ? "Se analizează..." : "Analizează categoriile"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-surface p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Potriviri găsite
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bifate automat sunt doar potrivirile sigure. Verifică-le și pe celelalte înainte să aplici.
          </p>
        </div>
        <button onClick={() => { setFaza("inchis"); setSugestii([]); }} className="text-muted-foreground hover:text-foreground flex-shrink-0" aria-label="Închide">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-3 text-xs">
        <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={doarNemapate} onChange={(e) => setDoarNemapate(e.target.checked)} className="rounded" />
          Arată doar categoriile nemapate
        </label>
        {fara > 0 && (
          <span className="text-muted-foreground">
            {fara} {fara === 1 ? "categorie fără potrivire" : "categorii fără potrivire"} — mapează-le manual mai jos.
          </span>
        )}
      </div>

      <div className="divide-y divide-border max-h-[28rem] overflow-y-auto">
        {vizibile.map((s) => {
          const alegere = alegeri[s.edinioCategory] ?? { optiune: 0, bifat: false };
          const optiune = s.optiuni[alegere.optiune];
          const badge = optiune ? INCREDERE[optiune.incredere] : null;
          return (
            <div key={s.edinioCategory} className="py-3 flex items-start gap-3">
              <input type="checkbox" checked={alegere.bifat} disabled={!optiune}
                onChange={(e) => setAlegeri((p) => ({ ...p, [s.edinioCategory]: { ...alegere, bifat: e.target.checked } }))}
                className="mt-1 rounded flex-shrink-0 disabled:opacity-40" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground truncate">{s.edinioCategory}</p>
                  {badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>}
                  {s.existent && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Deja mapată</span>
                  )}
                </div>

                {s.existent && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Acum: {s.existent.label}
                  </p>
                )}

                {optiune ? (
                  s.optiuni.length > 1 ? (
                    <select value={alegere.optiune}
                      onChange={(e) => setAlegeri((p) => ({ ...p, [s.edinioCategory]: { ...alegere, optiune: Number(e.target.value) } }))}
                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
                      {s.optiuni.map((o, i) => (
                        <option key={o.categoryId} value={i}>
                          {o.label} — {Math.round(o.scor * 100)}%
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-foreground mt-1.5">{optiune.label} <span className="text-muted-foreground">— {Math.round(optiune.scor * 100)}%</span></p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Nicio potrivire găsită. Caut-o manual mai jos.</p>
                )}
              </div>
            </div>
          );
        })}
        {vizibile.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {doarNemapate ? "Toate categoriile sunt deja mapate." : "Nicio categorie de afișat."}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 pt-4 mt-2 border-t border-border">
        <button onClick={aplica} disabled={pending || bifate === 0}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
          {pending ? "Se aplică..." : `Aplică ${bifate} ${bifate === 1 ? "mapare" : "mapări"}`}
        </button>
        <button onClick={() => { setFaza("inchis"); setSugestii([]); }} disabled={pending}
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">
          Renunță
        </button>
      </div>
    </div>
  );
}
