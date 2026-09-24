import type { TonEticheta } from "@/components/ui/eticheta-stare";
import { ORDER_STATUS, type OrderStatus } from "@/lib/orders/status";

/**
 * Starea comenzii, scrisa pentru cumparator, in contul lui.
 *
 * ⚠ La feminin, ca pasii din `cronologie.ts` de pe acelasi ecran („Expediata”,
 * „In pregatire”). Harta din `lib/orders/status.ts` e a panoului si ramane acolo
 * neatinsa; de aici se imprumuta numai TONUL, ca aceeasi stare sa aiba aceeasi
 * culoare in panou si in cont.
 */
const ETICHETE: Record<OrderStatus, string> = {
  pending: "In asteptare",
  confirmed: "Confirmata",
  processing: "In pregatire",
  shipped: "Expediata",
  delivered: "Livrata",
  cancelled: "Anulata",
  refunded: "Rambursata",
};

export function stareaComenzii(status: string): { label: string; ton: TonEticheta } {
  const cheie: OrderStatus = Object.hasOwn(ETICHETE, status) ? (status as OrderStatus) : "pending";
  return { label: ETICHETE[cheie], ton: ORDER_STATUS[cheie].ton };
}
