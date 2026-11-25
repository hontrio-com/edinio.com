// Un singur loc pentru cum se numeste si cum arata fiecare stare de comanda.
// Inainte, aceeasi harta de sapte stari statea copiata in dashboard/page.tsx,
// OrdersClient.tsx si OrderDetailClient.tsx.
//
// ⚠ AICI NU MAI STAU CLASE, CI TONURI. Fiecare stare spune ce FEL de stare e
// („se asteapta", „s-a terminat bine"), iar cum arata hotaraste `EtichetaStare`.
// Cu clasele scrise aici, fiecare ecran si le mai potrivea putin, si aceeasi
// stare ajunsese sa arate altfel de la o pagina la alta.

import type { TonEticheta } from "@/components/ui/eticheta-stare";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

/*
 * ⚠ DOUA FORME ALE ACELUIASI NUME, tinute tot aici ca sa nu se desparta:
 *
 *   `label`  forma veche, fara diacritice si la masculin („Confirmat"). O citesc lista de
 *            comenzi de azi, exporturile si cautarile: schimbata, le-ar schimba pe toate deodata.
 *   `nume`   forma cu diacritice, acordata cu „comanda" („Confirmată"). O folosesc paginile
 *            refacute in 11.2026, unde starea se citeste ca punct si cuvant, nu ca pastila.
 */
export const ORDER_STATUS: Record<OrderStatus, { label: string; nume: string; ton: TonEticheta }> = {
  pending:    { label: "In asteptare", nume: "În așteptare", ton: "asteptare" },
  confirmed:  { label: "Confirmat",    nume: "Confirmată",   ton: "info" },
  processing: { label: "In procesare", nume: "În procesare", ton: "lucru" },
  shipped:    { label: "Expediat",     nume: "Expediată",    ton: "drum" },
  delivered:  { label: "Livrat",       nume: "Livrată",      ton: "bun" },
  cancelled:  { label: "Anulat",       nume: "Anulată",      ton: "rau" },
  refunded:   { label: "Rambursat",    nume: "Rambursată",   ton: "neutru" },
};

export function orderStatus(status: string): { label: string; nume: string; ton: TonEticheta } {
  return ORDER_STATUS[status as OrderStatus] ?? ORDER_STATUS.pending;
}
