// Shared (non-"use server") bundle logic: types, pricing and availability.
// A bundle is a product (is_bundle=true) whose components live in
// page_sections.bundle. Used by the dashboard builder, storefront and orders.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type BundlePricingMode = "fixed" | "discount_percent" | "discount_amount";

export interface BundleItem {
  product_id: string;
  quantity: number;
}

export interface BundleConfig {
  items: BundleItem[];
  pricing_mode: BundlePricingMode;
  discount_percent?: number;
  discount_amount?: number;
}

// A bundle item paired with the real product data (resolved from the DB).
export interface BundleComponent {
  product_id: string;
  quantity: number;
  name: string;
  price: number;
  image_url: string | null;
  track_inventory: boolean;
  stock_quantity: number | null;
  /**
   * Randul EXISTA in catalog si e activ. `false` inseamna sters sau dezactivat.
   *
   * Obligatoriu, nu optional ca vechiul `missing?`: taman optionalitatea aia a
   * facut ca doar unul din patru apelanti sa-l trimita, iar celelalte trei sa
   * arate disponibil un pachet pe care nicio comanda nu-l poate trece.
   */
  vandabila: boolean;
  /**
   * Randul mai exista in `products`. Deosebeste „sters" de „doar dezactivat":
   * primul nu se mai poate nici pretui, al doilea doar nu se poate vinde.
   */
  existaInCatalog: boolean;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function bundleComponentsSum(components: { price: number; quantity: number }[]): number {
  return round2(components.reduce((s, c) => s + (Number(c.price) || 0) * (Number(c.quantity) || 0), 0));
}

// Effective bundle price + the "compare at" (sum of components) + the saving.
export function computeBundlePricing(
  components: { price: number; quantity: number }[],
  mode: BundlePricingMode,
  opts: { fixedPrice?: number; discountPercent?: number; discountAmount?: number },
): { price: number; compareAt: number; savings: number } {
  const compareAt = bundleComponentsSum(components);
  let price: number;
  if (mode === "fixed") {
    price = round2(Math.max(0, Number(opts.fixedPrice) || 0));
  } else if (mode === "discount_percent") {
    const pct = Math.min(100, Math.max(0, Number(opts.discountPercent) || 0));
    price = round2(compareAt * (1 - pct / 100));
  } else {
    const amt = Math.max(0, Number(opts.discountAmount) || 0);
    price = round2(Math.max(0, compareAt - amt));
  }
  const savings = round2(Math.max(0, compareAt - price));
  return { price, compareAt, savings };
}

export interface StareComponenta {
  quantity: number;
  vandabila: boolean;
  track_inventory: boolean;
  stock_quantity: number | null;
}

export type MotivIndisponibil = "fara_componente" | "componenta_lipsa" | "stoc_insuficient";

export type DisponibilitatePachet =
  | { inStock: true; max: number }
  | { inStock: false; max: 0; motiv: MotivIndisponibil; indice: number };

/**
 * Pachetul asta se poate cumpara, si daca nu, DIN CAUZA CUI.
 *
 * Intrebarea avea patru raspunsuri diferite: cardul din catalog stia de pachete,
 * cele doua pagini de produs nu (calculau `isOutOfStock` din campuri pe care un
 * pachet nu le are niciodata — el se scrie cu `track_inventory: false`), filtrul
 * de vizibilitate din paginile proprii sarea peste pachete, iar panoul avea a
 * patra formulare. Rezultatul, viu in productie: „Pachet Femei" (suplio,
 * publicat, 358,40 lei) are toate cele trei componente sterse de o saptamana, se
 * afiseaza disponibil si nicio comanda nu poate trece; „Kit Incarcare Rapida
 * USB" are cardul „Stoc epuizat" si butonul Comanda deschis in acelasi timp.
 *
 * `indice` spune care componenta a picat: fara el nu se poate scrie nici un
 * mesaj adevarat, nici un jurnal in care sa se poata uita cineva.
 */
export function disponibilitatePachet(componente: StareComponenta[]): DisponibilitatePachet {
  // Zero componente inseamna si „pachet gol", si „configul a fost sters de
  // formularul obisnuit de produs" — in amandoua cazurile nevandabil.
  if (componente.length === 0) return { inStock: false, max: 0, motiv: "fara_componente", indice: -1 };

  let max = Infinity;
  let indiceLimita = -1;
  for (let i = 0; i < componente.length; i++) {
    const c = componente[i];
    if (!c.vandabila) return { inStock: false, max: 0, motiv: "componenta_lipsa", indice: i };
    if (!c.track_inventory) continue; // stoc nelimitat
    const per = Math.max(1, Number(c.quantity) || 1);
    const disponibile = Math.floor((Number(c.stock_quantity) || 0) / per);
    if (disponibile < max) { max = disponibile; indiceLimita = i; }
  }
  if (max === Infinity) return { inStock: true, max: Infinity };
  return max > 0 ? { inStock: true, max } : { inStock: false, max: 0, motiv: "stoc_insuficient", indice: indiceLimita };
}

// Order-time: turn ordered items into the actual stock decrements, expanding any
// bundle into its components, and validating component stock. Returns an error
// string if a component is missing or out of stock (prevents overselling).
export async function expandBundleStock(
  admin: SupabaseClient<Database>,
  businessId: string,
  orderedItems: { product_id: string; quantity: number }[],
): Promise<
  | { decrements: { product_id: string; quantity: number }[] }
  | { error: string; componenta: string; motiv: MotivIndisponibil }
> {
  const ids = [...new Set(orderedItems.map((i) => i.product_id))];
  if (ids.length === 0) return { decrements: [] };

  const { data: ordered } = await admin
    .from("products")
    .select("id, is_bundle, page_sections")
    .eq("business_id", businessId)
    .in("id", ids);
  const orderedMap = new Map((ordered ?? []).map((p) => [p.id, p]));

  // Expand bundles into component requirements; non-bundles map to themselves.
  const need = new Map<string, number>();
  for (const item of orderedItems) {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const p = orderedMap.get(item.product_id);
    const cfg = p?.is_bundle ? readBundleConfig(p.page_sections) : null;
    if (cfg) {
      for (const comp of cfg.items) {
        need.set(comp.product_id, (need.get(comp.product_id) ?? 0) + comp.quantity * qty);
      }
    } else {
      need.set(item.product_id, (need.get(item.product_id) ?? 0) + qty);
    }
  }

  const compIds = [...need.keys()];
  if (compIds.length === 0) return { decrements: [] };
  // `is_active`: o componenta dezactivata se vindea pana acum normal prin pachet,
  // fiindca verificarea se uita doar la stoc.
  const { data: comps } = await admin
    .from("products")
    .select("id, name, is_active, track_inventory, stock_quantity")
    .eq("business_id", businessId)
    .in("id", compIds);
  const compMap = new Map((comps ?? []).map((c) => [c.id, c]));

  for (const [pid, required] of need) {
    const c = compMap.get(pid);
    // Mesajele spuneau „Reincarca pagina" — instructiune FALSA cand componenta e
    // stearsa: reincarcarea redeseneaza acelasi pachet, la nesfarsit. Se spune ce
    // se poate face, si se intoarce si id-ul, ca apelantul sa poata jurnaliza.
    if (!c || !c.is_active) {
      return {
        error: "Un produs din pachet nu mai este disponibil. Scoate pachetul din cos si incearca din nou.",
        componenta: pid,
        motiv: "componenta_lipsa" as const,
      };
    }
    if (c.track_inventory && (Number(c.stock_quantity) || 0) < required) {
      return {
        error: `Din „${String(c.name ?? "").slice(0, 60)}" nu mai sunt destule bucati pentru pachet. Scade cantitatea sau scoate pachetul din cos.`,
        componenta: pid,
        motiv: "stoc_insuficient" as const,
      };
    }
  }

  return { decrements: [...need.entries()].map(([product_id, quantity]) => ({ product_id, quantity })) };
}

/**
 * Aceeasi desfacere in componente, dar pentru DAREA INAPOI a stocului.
 *
 * ═══ DE CE NU SE REFOLOSESTE `expandBundleStock` ═══
 *
 * Aceea are un al doilea rol: da verdictul de disponibilitate si formuleaza
 * mesajele omenesti („scoate pachetul din cos"). Pentru o eliberare, verdictul n-are
 * ce inseamna — bucatile se intorc pe raft, iar o componenta dezactivata sau
 * stearsa intre timp n-are cum sa opreasca scoaterea unei linii din comanda. Cu
 * `expandBundleStock`, editarea ar fi picat cu „un produs din pachet nu mai este
 * disponibil" exact pe comanda pe care comerciantul incearca sa o repare.
 *
 * Ce nu se mai gaseste in catalog se SARE, si atat: componenta stearsa n-are unde
 * primi bucatile inapoi. Restul se cleameaza oricum in baza, la ce s-a rezervat
 * chiar pe comanda aia (`scade_din_rezervat`), deci compozitia schimbata intre
 * vanzare si editare nu poate umfla stocul.
 */
export async function expandBundleRelease(
  admin: SupabaseClient<Database>,
  businessId: string,
  items: { product_id: string; quantity: number }[],
): Promise<{ product_id: string; quantity: number }[]> {
  const ids = [...new Set(items.map((i) => i.product_id))];
  if (ids.length === 0) return [];

  const { data: randuri } = await admin
    .from("products")
    .select("id, is_bundle, page_sections")
    .eq("business_id", businessId)
    .in("id", ids);
  const dupaId = new Map((randuri ?? []).map((p) => [p.id, p]));

  const need = new Map<string, number>();
  for (const item of items) {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const p = dupaId.get(item.product_id);
    const cfg = p?.is_bundle ? readBundleConfig(p.page_sections) : null;
    if (cfg) {
      for (const comp of cfg.items) {
        need.set(comp.product_id, (need.get(comp.product_id) ?? 0) + comp.quantity * qty);
      }
    } else {
      // Si produsul care nu mai e in catalog trece pe aici: eliberarea lui e
      // clemata la zero in baza, deci nu strica nimic, iar un pachet devenit
      // produs simplu isi da inapoi propriul rand.
      need.set(item.product_id, (need.get(item.product_id) ?? 0) + qty);
    }
  }
  return [...need.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
}

// Safely read a bundle config off a product's page_sections JSON.
export function readBundleConfig(pageSections: unknown): BundleConfig | null {
  const ps = (pageSections ?? {}) as { bundle?: BundleConfig };
  const b = ps.bundle;
  if (!b || !Array.isArray(b.items) || b.items.length === 0) return null;
  return {
    items: b.items
      .filter((i) => i && typeof i.product_id === "string")
      .map((i) => ({ product_id: i.product_id, quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)) })),
    pricing_mode: b.pricing_mode ?? "fixed",
    discount_percent: b.discount_percent,
    discount_amount: b.discount_amount,
  };
}
