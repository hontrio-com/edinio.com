"use client";

import { NOTA_COMANDA_IN_FEREASTRA } from "@/lib/editor-magazin/pagini";
import { ETICHETA_TIP_COMANDA, type TipComanda } from "@/lib/storefront/design/tip-comanda";
import { TrimitereSetare } from "./navigare";

/**
 * Tipul de checkout pe pagina „Finalizarea comenzii” (etapa 15): se VEDE aici, in arbore si in panoul sectiunii, dar
 * se alege intr-un singur loc, Setări > Comanda (raspunsul lui). Trimiterea deschide setarea pe loc, in fila ei.
 */
export function CasetaTipComanda({ tip }: { tip: TipComanda }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 space-y-1">
      <p className="text-[11px] text-muted-foreground">Tipul de checkout</p>
      <p className="text-sm font-medium text-foreground">{ETICHETA_TIP_COMANDA[tip]}</p>
      {tip === "fereastra" && <p className="text-xs text-muted-foreground leading-relaxed">{NOTA_COMANDA_IN_FEREASTRA}</p>}
      <p className="pt-0.5 text-xs">
        <TrimitereSetare setare="formular">Schimbă tipul în Setări</TrimitereSetare>
      </p>
    </div>
  );
}
