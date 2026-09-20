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

export const ORDER_STATUS: Record<OrderStatus, { label: string; ton: TonEticheta }> = {
  pending:    { label: "In asteptare", ton: "asteptare" },
  confirmed:  { label: "Confirmat",    ton: "info" },
  processing: { label: "In procesare", ton: "lucru" },
  shipped:    { label: "Expediat",     ton: "drum" },
  delivered:  { label: "Livrat",       ton: "bun" },
  cancelled:  { label: "Anulat",       ton: "rau" },
  refunded:   { label: "Rambursat",    ton: "neutru" },
};

export function orderStatus(status: string): { label: string; ton: TonEticheta } {
  return ORDER_STATUS[status as OrderStatus] ?? ORDER_STATUS.pending;
}
