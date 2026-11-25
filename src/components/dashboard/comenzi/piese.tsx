/*
  Piesele mici ale listei de Comenzi: starea fara pastila, sursa comenzii si totalul ei.
  Fara „use client": nimic de aici nu tine stare si nu asculta nimic.
*/

import { cn } from "@/lib/utils/cn";
import { PunctStare } from "@/components/dashboard/atomi-panou";
import { suma } from "@/components/dashboard/liste/piese";
import type { ComandaLista } from "./date";

/** Punct colorat si cuvant: starea se citeste, nu sta intr-o pastila. */
export function StareText({ status, className }: { status: ComandaLista["status"]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-foreground", className)}>
      <PunctStare ton={status.ton} />
      {status.eticheta}
    </span>
  );
}

/**
 * De unde a venit comanda: sigla marketplace-ului sau a canalului de reclama, altfel cuvantul.
 * O comanda a magazinului procesata in easySales o spune alaturi: factura si AWB-ul ei se fac acolo.
 */
export function Sursa({ sursa, cuText = true, className }: { sursa: ComandaLista["sursa"]; cuText?: boolean; className?: string }) {
  const eticheta = sursa.easySales ? `${sursa.eticheta}, procesată în easySales` : sursa.eticheta;
  /* Cu sigla la vedere si fara loc de text, ramane doar ce nu spune sigla: ca e procesata in easySales. */
  const scris = cuText || !sursa.logo ? eticheta : sursa.easySales ? "easySales" : null;
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground", className)} title={eticheta}>
      {sursa.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sursa.logo} alt="" loading="lazy" decoding="async" className="h-3.5 w-auto max-w-[46px] flex-shrink-0 object-contain" />
      )}
      {/* Un nume lung de sursa („blogdeamenajari.test") se taie cu „…", nu iese din celula; intreg sta in indiciul de la maus. */}
      {scris && <span className="truncate">{scris}</span>}
    </span>
  );
}

/** Ce i se spune omului despre o moneda pe care n-am putut-o citi. */
export const MONEDA_NECITITA = "Moneda comenzii nu a putut fi citită. Verific-o înainte de a emite AWB cu ramburs sau factură.";

/**
 * Totalul comenzii, in moneda ei.
 *
 * ⚠ „?" INSEAMNA CA NU STIM IN CE MONEDA E. Marketplace-ul a trimis un cod pe care nu l-am putut
 * citi; rambursul si factura automata refuza deja comanda asta, iar fara semnul de aici
 * comerciantul ar fi cautat degeaba de ce nu merg.
 */
export function Total({ comanda: c, className }: { comanda: ComandaLista; className?: string }) {
  return (
    <span
      className={cn("whitespace-nowrap tabular-nums", c.monedaNecitita ? "text-warning" : "text-foreground", className)}
      title={c.monedaNecitita ? MONEDA_NECITITA : undefined}
    >
      {suma(c.total, c.moneda)}
    </span>
  );
}
