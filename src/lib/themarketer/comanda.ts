/*
  ═══════════════════════════════════════════════════════════════════════════════
  COMANDA, IN FORMELE CERUTE DE THEMARKETER. Pur.
  ═══════════════════════════════════════════════════════════════════════════════

  Trei forme, din aceleasi date:
    - `save_order` (API, din coada): developers.themarketer.com/reference/post_api-v1-save-order;
    - feedul de comenzi pentru importul istoric (`orders-feed-for-one-time-import`): „All the attributes
      listed in the sample order feed are required”;
    - evenimentul `__sm__order` din browser are forma lui `save_order`, fara cheile contului.

  ⚠ `save_order` RASPUNDE 422 cand lipseste vreunul dintre: „products, firstname, lastname, number,
  email_address or phone” (specul lor). De aceea o comanda fara email nu pleaca deloc (nu e un contact),
  iar numele de familie lipsa se completeaza cu prenumele: un 422 ar fi pierdut comanda cu totul.

  ⚠ VARIANTA NU E PE LINIA SALVATA. `orders.items` tine numele din catalog cu combinatia „coapta”:
  `Geaca (XXL)` (vezi `variant-guard.ts`: `${produs.name} (${titlu})`). Varianta se regaseste potrivind
  coada numelui cu titlurile combinatiilor de AZI; cand nu se mai potriveste (combinatia redenumita),
  linia pleaca cu SKU-ul produsului. Mai bine o potrivire pe produs decat una pe varianta gresita.
*/

import { liniaAdresei, type AdresaLivrare } from "@/lib/orders/adresa";
import { asteaptaIncasareOnline } from "@/lib/orders/vanzare-confirmata";
import { parseVariants } from "@/lib/storefront/variants";
import { skuLinieTM, idVariantaTM } from "./identitate";
import { dataTM } from "./feed-produse";
import { numeTM, telefonTM } from "./persoana";

export { numeTM, telefonTM };

export type ComandaTM = {
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: unknown;
  items: unknown;
  shipping_cost: number | string | null;
  total: number | string | null;
  discount_code: string | null;
  discount_amount: number | string | null;
  card_discount_amount?: number | string | null;
  offer_discount_amount?: number | string | null;
  cod_discount_amount?: number | string | null;
  cod_fee_amount?: number | string | null;
  vat_amount: number | string | null;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  created_at: string | null;
};

/** Produsul de azi al unei linii, cat ii trebuie formelor. */
export type ProdusLinie = {
  id: string;
  name: string;
  sku: string | null;
  slug: string | null;
  images: unknown;
  category: string | null;
  price: number | string | null;
  compare_at_price: number | string | null;
  page_sections: unknown;
};

export type LinieTM = {
  product_id: string;
  nume: string;
  pret: number;
  cantitate: number;
  titluVarianta: string | null;
  variation_sku: string;
  variation_id: string;
};

function bani(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Suma cu doua zecimale si punct, ca in exemplele lor („153.50”). */
export function suma(v: unknown): string {
  return bani(v).toFixed(2);
}

/**
 * Titlul combinatiei vandute, din coada numelui liniei: `Geaca (XXL)` → `XXL`. Cel mai lung titlu care se
 * potriveste castiga (`S` nu trebuie sa fure `XS`). `null` cand niciunul nu se potriveste.
 */
export function variantaDinNume(numeLinie: string, titluri: readonly string[]): string | null {
  const n = numeLinie.trim();
  let ales: string | null = null;
  for (const t of titluri) {
    const titlu = t.trim();
    if (!titlu) continue;
    if (n.endsWith(` (${titlu})`) && (!ales || titlu.length > ales.length)) ales = titlu;
  }
  return ales;
}

/**
 * Liniile de produs ale comenzii, cu SKU-ul cerut de theMarketer. Extraoptiunile (`extra_…`: ambalaj
 * cadou si altele) nu sunt produse din catalog si nu pleaca: theMarketer le-ar cauta in feed degeaba.
 */
export function liniiTM(items: unknown, produse: ReadonlyMap<string, ProdusLinie>): LinieTM[] {
  const lista = Array.isArray(items) ? items : [];
  const iesire: LinieTM[] = [];
  for (const brut of lista) {
    const i = (brut ?? {}) as { product_id?: unknown; name?: unknown; price?: unknown; quantity?: unknown };
    const productId = typeof i.product_id === "string" ? i.product_id : "";
    if (!productId || productId.startsWith("extra_")) continue;
    const cantitate = Math.max(1, Math.floor(Number(i.quantity) || 1));
    const nume = String(i.name ?? "").trim();
    const produs = produse.get(productId);
    const combinatii = parseVariants(produs?.page_sections)?.combinations ?? [];
    const titlu = combinatii.length ? variantaDinNume(nume, combinatii.map((c) => c.title)) : null;
    const combo = titlu ? combinatii.find((c) => c.title.trim() === titlu) : undefined;
    const sku = skuLinieTM({ productId, skuProdus: produs?.sku, titluVarianta: titlu, skuCombinatie: combo?.sku });
    iesire.push({
      product_id: productId,
      nume,
      pret: bani(i.price),
      cantitate,
      titluVarianta: titlu,
      variation_sku: sku,
      variation_id: titlu ? idVariantaTM(productId, titlu) : productId,
    });
  }
  return iesire;
}

function adresa(c: ComandaTM): { city: string; county: string; address: string; country: string } {
  const a = (c.shipping_address ?? {}) as AdresaLivrare & { city?: string; county?: string; country?: string };
  return {
    city: String(a.city ?? "").trim(),
    county: String(a.county ?? "").trim(),
    address: liniaAdresei(a),
    country: String(a.country ?? "").trim().toUpperCase() || "RO",
  };
}

/** Reducerea totala a comenzii: cupon + oferte + plata cu cardul + ramburs. „Final value of the discount.” */
export function reducereTotala(c: ComandaTM): number {
  return bani(
    bani(c.discount_amount) + bani(c.offer_discount_amount) + bani(c.card_discount_amount) + bani(c.cod_discount_amount),
  );
}

/** Transportul, cu taxa de ramburs: e tot un cost de livrare, iar totalul trebuie sa iasa din parti. */
export function transportTM(c: ComandaTM): number {
  return bani(bani(c.shipping_cost) + bani(c.cod_fee_amount));
}

/**
 * Partea comenzii FARA DATE PERSONALE: numarul, sumele si produsele. O primeste si pagina de multumire, care
 * o completeaza in browser cu datele scrise chiar de om la checkout (`comanda-browser.ts`), ca nimic personal
 * sa nu stea in clar in HTML. `null` = fara produse din catalog.
 */
export function corpComandaFaraPersoana(
  c: Pick<ComandaTM, "order_number" | "discount_code" | "discount_amount" | "card_discount_amount" | "offer_discount_amount"
    | "cod_discount_amount" | "cod_fee_amount" | "shipping_cost" | "vat_amount" | "total">,
  linii: readonly LinieTM[],
): Record<string, unknown> | null {
  if (linii.length === 0) return null;
  return {
    number: c.order_number,
    discount_value: suma(reducereTotala(c as ComandaTM)),
    discount_code: (c.discount_code ?? "").trim(),
    shipping: suma(transportTM(c as ComandaTM)),
    tax: suma(c.vat_amount),
    total_value: suma(c.total),
    products: linii.map((l) => ({
      product_id: l.product_id,
      price: suma(l.pret),
      quantity: l.cantitate,
      variation_sku: l.variation_sku,
    })),
  };
}

/** Forma lui `save_order`: partea fara persoana, plus omul. `null` = nu pleaca (fara email sau fara produse). */
export function corpComanda(c: ComandaTM, linii: readonly LinieTM[]): Record<string, unknown> | null {
  const email = (c.customer_email ?? "").trim();
  const parteaComenzii = corpComandaFaraPersoana(c, linii);
  if (!email || !parteaComenzii) return null;
  const { firstname, lastname } = numeTM(c.customer_name);
  const a = adresa(c);
  return {
    number: c.order_number,
    email_address: email,
    phone: telefonTM(c.customer_phone),
    firstname,
    lastname,
    city: a.city,
    county: a.county,
    address: a.address,
    ...parteaComenzii,
  };
}

/* ═══ STATUSURILE ═══
   „use the specific statuses of the e-commerce platform, mapping will be done by us”: theMarketer cere
   statusurile NOASTRE, iar comerciantul le leaga in contul lui de ale lor. Pleaca in engleza, cu
   majuscula, cum arata exemplele lor („Processing”, „Fulfilled”), ca sa fie usor de recunoscut acolo. */

const STATUSURI: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  returned: "Returned",
};

export function statusTM(status: string | null | undefined, stareaPlatii?: string | null): string {
  if ((stareaPlatii ?? "").toLowerCase() === "refunded" && status !== "cancelled") return "Refunded";
  const s = (status ?? "").toLowerCase().trim();
  if (STATUSURI[s]) return STATUSURI[s];
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Pending";
}

/** Toate statusurile pe care le poate trimite Edinio, pentru lista din panou („leaga-le in theMarketer”). */
export const STATUSURI_TRIMISE = Object.values(STATUSURI);

/* ═══ CE PLEACA DIN COADA, PE FIECARE EVENIMENT ═══ */

export type FelEvenimentTM = "creata" | "platita" | "expediata" | "livrata" | "anulata" | "rambursata";

/** A fost comanda raportata ca vanzare? Ramburs: de la creare. Online: numai daca banii au intrat vreodata. */
export function aFostVanzare(metoda: string | null | undefined, stareaPlatii: string | null | undefined): boolean {
  if (!asteaptaIncasareOnline(metoda)) return true;
  const s = (stareaPlatii ?? "").toLowerCase();
  return s === "paid" || s === "refunded";
}

/**
 * Ce apel pleaca pentru un eveniment al cozii, sau de ce nu pleaca nimic. Pura.
 *
 * ⚠ La plata online comanda exista inainte ca banii sa intre: `save_order` pleaca LA PLATA, nu la creare
 * („for online payment method, the function must be called after the response from the payment processor
 * is received and the answer is positive”). La ramburs pleaca la creare, si numai atunci.
 */
export function apelPentruEveniment(
  fel: FelEvenimentTM,
  metoda: string | null | undefined,
  stareaPlatii: string | null | undefined,
): { apel: "save_order" } | { apel: "status"; status: string } | { sarit: string } {
  const online = asteaptaIncasareOnline(metoda);
  switch (fel) {
    case "creata":
      return online ? { sarit: "plata online inca neincasata: pleaca la plata" } : { apel: "save_order" };
    case "platita":
      return online ? { apel: "save_order" } : { sarit: "ramburs: comanda a plecat la creare" };
    case "expediata":
      return aFostVanzare(metoda, stareaPlatii) ? { apel: "status", status: "Shipped" } : { sarit: "n-a fost raportata ca vanzare" };
    case "livrata":
      return aFostVanzare(metoda, stareaPlatii) ? { apel: "status", status: "Delivered" } : { sarit: "n-a fost raportata ca vanzare" };
    case "anulata":
      return aFostVanzare(metoda, stareaPlatii) ? { apel: "status", status: "Cancelled" } : { sarit: "n-a fost raportata ca vanzare" };
    case "rambursata":
      return aFostVanzare(metoda, stareaPlatii) ? { apel: "status", status: "Refunded" } : { sarit: "n-a fost raportata ca vanzare" };
  }
}

/* ═══ FEEDUL DE COMENZI (IMPORTUL ISTORIC) ═══ */

export type ContextComenziTM = {
  /** Adresa produsului din catalogul de azi. */
  urlProdus: (p: ProdusLinie) => string;
  imagine: (p: ProdusLinie) => string;
  ierarhie: (categorie: string | null) => string | null;
  /** Adresa magazinului, pentru produsele sterse intre timp (campul e obligatoriu). */
  baza: string;
};

/** O comanda in forma feedului de import. `null` = fara email sau fara produse (nu e un contact). */
export function comandaPentruFeed(
  c: ComandaTM,
  linii: readonly LinieTM[],
  produse: ReadonlyMap<string, ProdusLinie>,
  ctx: ContextComenziTM,
): Record<string, unknown> | null {
  const corp = corpComanda(c, linii);
  if (!corp) return null;
  const rambursata = (c.payment_status ?? "").toLowerCase() === "refunded" || (c.status ?? "").toLowerCase() === "refunded";
  return {
    order_no: c.order_number,
    order_status: statusTM(c.status, c.payment_status),
    refund_value: rambursata ? suma(c.total) : "0.00",
    created_at: dataTM(c.created_at) ?? "",
    email_address: corp.email_address,
    phone: corp.phone,
    firstname: corp.firstname,
    lastname: corp.lastname,
    city: corp.city,
    county: corp.county,
    country: adresa(c).country,
    address: corp.address,
    discount_value: corp.discount_value,
    discount_code: corp.discount_code,
    shipping: corp.shipping,
    tax: corp.tax,
    total_value: corp.total_value,
    products: linii.map((l) => {
      const p = produse.get(l.product_id);
      const catalog = p ? bani(p.compare_at_price) > bani(p.price) ? bani(p.compare_at_price) : bani(p.price) : 0;
      return {
        product_id: l.product_id,
        name: p?.name ?? l.nume,
        url: p ? ctx.urlProdus(p) : ctx.baza,
        main_image: p ? ctx.imagine(p) : "",
        category: (p ? ctx.ierarhie(p.category) : null) ?? "N/A",
        brand: marca(p),
        price: suma(Math.max(catalog, l.pret)),
        sale_price: suma(l.pret),
        quantity: l.cantitate,
        variation_id: l.variation_id,
        variation_sku: l.variation_sku,
      };
    }),
  };
}

function marca(p: ProdusLinie | undefined): string {
  const b = (p?.page_sections as { google?: { brand?: unknown } } | null)?.google?.brand;
  return typeof b === "string" && b.trim() ? b.trim() : "N/A";
}
