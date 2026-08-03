import { normalizeazaCantitate } from "@/lib/orders/quantity";

/**
 * Ce stie cotatia despre cosul care se livreaza.
 *
 * Greutatea ajunge la API-ul curierului, deci de ea atarna pretul pe care il
 * plateste comerciantul. Se calculeaza DIN BAZA, niciodata din ce declara
 * browserul: pretul cotat pleaca semnat, iar o greutate de la client ar fi
 * insemnat ca cine cere o cotatie pentru un kilogram comanda apoi cincisprezece
 * la acelasi pret.
 *
 * Sta in modul pur ca sa poata fi verificata: `getShippingOptions` e „use server"
 * si testele nu-l pot incarca.
 */

export interface LinieCotata {
  productId: string;
  quantity: number;
}

/** Doar campurile de care depinde transportul, asa cum vin din `products`. */
export interface ProdusCotat {
  id: string;
  shipping_class?: string | null;
  category?: string | null;
  weight_grams?: number | null;
}

export interface ContextCos {
  /** Greutatea totala, in kilograme. Zero cand niciun produs n-are greutate. */
  weightKg: number;
  /** Cate bucati se livreaza, cu tot cu liniile care nu s-au regasit in catalog. */
  quantity: number;
  classIds: string[];
  categories: string[];
  productIds: string[];
}

export function contextulCosului(linii: LinieCotata[] | undefined, produse: ProdusCotat[]): ContextCos {
  const byId = new Map(produse.map((p) => [p.id, p]));
  const classIds = new Set<string>();
  const categories = new Set<string>();
  let grame = 0;
  let quantity = 0;

  for (const linie of linii ?? []) {
    // Clemeaza, ca in browser. La COMANDA regula e mai aspra — ce trece de plafon
    // se refuza (`cantitateCeruta`) — deci un cos cu 5000 de bucati nu ajunge
    // niciodata sa fie si livrat; aici doar nu are voie sa produca o greutate
    // absurda sau negativa.
    const qty = normalizeazaCantitate(linie.quantity);
    quantity += qty;
    const p = byId.get(linie.productId);
    // Un produs care nu s-a regasit (sters, al altui magazin) NU se sare la
    // numaratoare: bucatile lui tot pleaca in colet. Doar greutatea lui lipseste,
    // si atunci lipseste sincer — nu se inventeaza una.
    if (!p) continue;
    if (p.shipping_class) classIds.add(p.shipping_class);
    if (p.category) categories.add(p.category);
    grame += Math.max(0, Number(p.weight_grams) || 0) * qty;
  }

  return {
    // Trei zecimale: gramul e cea mai mica unitate pe care o tine catalogul, iar
    // curierii primesc kilograme.
    weightKg: Math.round(grame) / 1000,
    quantity,
    classIds: [...classIds],
    categories: [...categories],
    productIds: [...new Set((linii ?? []).map((l) => l.productId))],
  };
}
