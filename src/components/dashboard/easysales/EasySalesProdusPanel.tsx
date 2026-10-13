"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { stareaEasySalesAProdusului } from "@/lib/actions/easysales.actions";
import type { StareProdusEasySales } from "@/lib/easysales/catalog-actiuni";

/**
 * easySales pe pagina produsului (planul, §7.3): pleaca produsul in catalog, si daca nu, de ce.
 *
 * ⚠ Aceeasi hotarare ca raportul de pregatire si lucratorul (`eligibilitate.ts`), citita pe server.
 * Inainte de pornirea catalogului spune „ar pleca"; dupa, arata si starea fiecarui articol la ei.
 */

const NUME_STARE: Record<string, string> = {
  nou: "nesincronizat", de_trimis: "de trimis", trimis: "trimis, se verifică", confirmat: "în easySales",
  blocat: "blocat", respins: "refuzat de easySales", disparut: "dispărut din easySales", exclus: "exclus", arhivat: "arhivat",
};

export function EasySalesProdusPanel({ businessId, productId }: { businessId: string; productId: string }) {
  const [s, setS] = useState<StareProdusEasySales | null | undefined>(undefined);

  useEffect(() => {
    let viu = true;
    stareaEasySalesAProdusului(businessId, productId).then((r) => {
      if (viu) setS(r && !("error" in r) ? r : null);
    }).catch(() => { if (viu) setS(null); });
    return () => { viu = false; };
  }, [businessId, productId]);

  if (!s) return null;
  const blocajeProdus = s.motiveProdus.filter((m) => m.nivel === "blocheaza");
  const pleaca = s.articole.filter((a) => a.eligibil).length;
  const verb = s.catalogPornit && s.catalogActiv ? "pleacă" : "ar pleca";

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold text-foreground">easySales</p>
      </div>
      <div className="px-5 py-4 space-y-3 text-sm">
        {blocajeProdus.length > 0 ? (
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 font-medium text-foreground"><AlertTriangle className="size-4 text-amber-500" /> Nu {verb} în easySales</p>
            {blocajeProdus.map((m) => <p key={m.mesaj} className="text-muted-foreground">{m.mesaj}</p>)}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            {pleaca > 0 ? <CheckCircle className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-amber-500" />}
            {pleaca === s.articole.length ? `Produsul ${verb} în easySales` : `${pleaca} din ${s.articole.length} variante ${verb} în easySales`}
          </p>
        )}
        {s.articole.length > 0 && blocajeProdus.length === 0 && (
          <ul className="space-y-2">
            {s.articole.map((a) => (
              <li key={a.titlu || "simplu"} className="space-y-0.5">
                {a.titlu && <p className="font-medium text-foreground">{a.titlu}</p>}
                {a.skuTrimis && <p className="text-muted-foreground">SKU în easySales: {a.skuTrimis}</p>}
                {a.stare && a.stare !== "nou" && <p className="text-muted-foreground">Stare: {NUME_STARE[a.stare] ?? a.stare}{a.motivRand ? `. ${a.motivRand}` : ""}</p>}
                {a.motive.map((m) => (
                  <p key={m.mesaj} className={m.nivel === "blocheaza" ? "text-destructive" : "text-muted-foreground"}>{m.mesaj}</p>
                ))}
              </li>
            ))}
          </ul>
        )}
        {s.motiveProdus.filter((m) => m.nivel === "avertisment").map((m) => (
          <p key={m.mesaj} className="text-muted-foreground">{m.mesaj}</p>
        ))}
        {s.duplicateNeverificate && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" /> SKU-urile folosite de mai multe produse se verifică în raportul de pregătire.</p>
        )}
        <Link href="/dashboard/features/easysales" className="text-xs font-medium underline-offset-2 hover:underline">Catalogul easySales</Link>
      </div>
    </div>
  );
}
