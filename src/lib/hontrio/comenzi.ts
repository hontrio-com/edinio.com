import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { offerIdVarianta } from "@/lib/google-merchant/id-oferta";
import { titluDinNumeleLiniei } from "@/lib/facebook/pixel-continut";
import { findCombo, parseVariants } from "@/lib/storefront/variants";
import type { Paginare } from "./api";

/**
 * `GET /api/hontrio/v1/comenzi`: comenzile, cu banii, starea si sursa lor. FARA DATE PERSONALE.
 *
 * ═══ ⚠ CE NU PLEACA NICIODATA DE AICI ═══
 *
 * Numele, telefonul, emailul si adresa cumparatorului, firma de facturare, notele, IP-ul si agentul
 * browserului, cookie-urile de masurare (`ga_client_id`, `fbp`, `fbc`, `ttp`). Hontrio n-are nevoie de
 * niciunul ca sa socoteasca ce a adus o reclama, iar fiecare camp in plus l-ar fi facut destinatar de
 * date personale ale cumparatorilor Edinio, cu tot ce cere GDPR pentru asta.
 *
 * ⚠ LISTA E ALBA, ca la `buildOrderSource`: o cheie noua aparuta maine in `order_source` NU pleaca
 * singura. Se adauga aici, cu gandul la ce e.
 *
 * Tara de livrare pleaca, singura din adresa: e nevoie de ea pentru campaniile pe mai multe tari, si
 * nu identifica pe nimeni.
 */

type Db = SupabaseClient<Database>;

/*
 * Din `order_source`, numai atribuirea. `gclid` e legatura cu clicul din Google Ads: fara el, o
 * comanda platita la livrare n-ar putea fi intoarsa la Google ca vanzare confirmata.
 */
const CHEI_SURSA = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "gclid", "referrer", "landing", "captured_at",
  "consimtamant_marketing", "consimtamant_analiza",
] as const;

export const COLOANE_COMANDA =
  "id, order_number, created_at, updated_at, status, payment_status, payment_method, items, subtotal, shipping_cost, discount_amount, offer_discount_amount, card_discount_amount, cod_discount_amount, cod_fee_amount, vat_amount, total, discount_code, order_source, tara:shipping_address->>country";

export interface RandComanda {
  id: string;
  order_number: string;
  created_at: string;
  updated_at: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  items: unknown;
  subtotal: number | null;
  shipping_cost: number | null;
  discount_amount: number | null;
  offer_discount_amount: number | null;
  card_discount_amount: number | null;
  cod_discount_amount: number | null;
  cod_fee_amount: number | null;
  vat_amount: number | null;
  total: number | null;
  discount_code: string | null;
  order_source: unknown;
  tara: string | null;
}

export interface LinieHontrio {
  /** `null` la extraoptiuni (ambalaj cadou si altele) si la liniile de marketplace nelegate de catalog. */
  produs_id: string | null;
  /**
   * Oferta din Merchant Center, cand se stie SIGUR care e. `null` cand produsul are variante, dar
   * combinatia vanduta nu se mai gaseste (stinsa sau redenumita de la comanda), ori produsul a fost
   * sters: atunci vanzarea se poate lega doar de produs (`produs_id`, care e `itemGroupId`).
   */
  oferta_id: string | null;
  nume: string;
  varianta: string | null;
  cantitate: number;
  /** Pretul unei bucati, asa cum a fost incasat. */
  pret: number;
  extra: boolean;
}

export interface ComandaHontrio {
  id: string;
  numar: string;
  creata_la: string;
  actualizata_la: string;
  /** pending | confirmed | processing | shipped | delivered | cancelled | refunded */
  stare: string;
  /** unpaid | paid | refunded */
  stare_plata: string;
  metoda_plata: string | null;
  /** `magazin` pentru vitrina, altfel marketplace-ul prin care a venit (`emag`, `pepita`, ...). */
  canal: string;
  moneda: string;
  subtotal: number;
  transport: number;
  reducere_cupon: number;
  reducere_oferte: number;
  reducere_card: number;
  reducere_ramburs: number;
  taxa_ramburs: number;
  tva: number;
  /** Ce plateste cumparatorul. E si valoarea conversiei de cumparare trimise din vitrina la Google Ads. */
  total: number;
  cod_reducere: string | null;
  tara: string;
  sursa: Record<string, string | boolean>;
  linii: LinieHontrio[];
}

function bani(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function sir(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Oferta si varianta unei linii.
 *
 * ⚠ ACEEASI REZOLVARE CA PE PAGINA DE CONFIRMARE (remarketingul dinamic Google Ads) si ca in pixelul
 * Meta: `variant_title` cand linia il are (comenzile de marketplace), altfel titlul din coada numelui
 * („GEACA (XXL)"). Comenzile din vitrina nu tin varianta altundeva: numele e singura ei urma. Deci
 * Hontrio leaga vanzarea de exact oferta pe care a primit-o si Google la cumparare.
 *
 * @param variante `page_sections->variants` al produsului; `undefined` cand produsul nu mai exista.
 */
function ofertaLiniei(
  produsId: string, nume: string, variantTitle: string | null, variante: unknown,
): { oferta: string | null; varianta: string | null } {
  if (variante === undefined) return { oferta: null, varianta: variantTitle };
  const ps = { variants: variante };
  const v = parseVariants(ps);
  if (!v) return { oferta: produsId, varianta: null };
  const titlu = variantTitle ?? titluDinNumeleLiniei(nume, ps);
  const combo = titlu ? findCombo(v, titlu) : null;
  return combo ? { oferta: offerIdVarianta(produsId, combo), varianta: combo.title } : { oferta: null, varianta: titlu };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function liniileBrute(items: unknown): Record<string, unknown>[] {
  return Array.isArray(items) ? items.filter((l): l is Record<string, unknown> => !!l && typeof l === "object") : [];
}

/**
 * Pura: o comanda scrisa pentru Hontrio.
 *
 * @param variantePeProdus `page_sections->variants` al fiecarui produs din comenzi, citit de apelant.
 *                         Un produs lipsa din harta e un produs sters.
 */
export function comandaPentruHontrio(
  r: RandComanda, variantePeProdus: ReadonlyMap<string, unknown>, monedaMagazin: string,
): ComandaHontrio {
  const src = (r.order_source && typeof r.order_source === "object" ? r.order_source : {}) as Record<string, unknown>;
  const sursa: Record<string, string | boolean> = {};
  for (const k of CHEI_SURSA) {
    const v = sir(src[k]);
    if (v) sursa[k] = v.slice(0, 500);
  }
  if (src.direct === true) sursa.direct = true;
  const marketplace = sir(src.marketplace);
  if (marketplace) sursa.marketplace = marketplace;

  const linii: LinieHontrio[] = liniileBrute(r.items).map((l) => {
    const idBrut = sir(l.product_id);
    const nume = String(l.name ?? "");
    const extra = !!idBrut && idBrut.startsWith("extra_");
    const produsId = idBrut && UUID.test(idBrut) ? idBrut.toLowerCase() : null;
    const { oferta, varianta } = produsId
      ? ofertaLiniei(produsId, nume, sir(l.variant_title), variantePeProdus.has(produsId) ? variantePeProdus.get(produsId) ?? null : undefined)
      : { oferta: null, varianta: sir(l.variant_title) };
    return {
      produs_id: produsId,
      oferta_id: oferta,
      nume,
      varianta,
      cantitate: Math.max(0, Number(l.quantity) || 0),
      pret: bani(l.price),
      extra,
    };
  });

  return {
    id: r.id,
    numar: r.order_number,
    creata_la: r.created_at,
    actualizata_la: r.updated_at,
    stare: r.status,
    stare_plata: r.payment_status,
    metoda_plata: sir(r.payment_method),
    canal: marketplace ?? "magazin",
    /* ⚠ Comenzile de marketplace pot fi in alta moneda (Pepita, in forinti): ingestul o scrie in sursa. */
    moneda: sir(src.currency)?.toUpperCase() ?? monedaMagazin,
    subtotal: bani(r.subtotal),
    transport: bani(r.shipping_cost),
    reducere_cupon: bani(r.discount_amount),
    reducere_oferte: bani(r.offer_discount_amount),
    reducere_card: bani(r.card_discount_amount),
    reducere_ramburs: bani(r.cod_discount_amount),
    taxa_ramburs: bani(r.cod_fee_amount),
    tva: bani(r.vat_amount),
    total: bani(r.total),
    cod_reducere: sir(r.discount_code),
    /* Pe comenzile interne `country` nici nu se scrie in adresa: lipsa inseamna Romania. */
    tara: sir(r.tara)?.toUpperCase() ?? "RO",
    sursa,
    linii,
  };
}

/** O pagina de comenzi, in ordinea `id`-ului. Vezi `citestePaginarea` pentru de ce asa. */
export async function paginaComenzi(
  admin: Db, businessId: string, p: Paginare,
): Promise<{ comenzi: ComandaHontrio[]; urmatorul: string | null }> {
  let q = admin.from("orders").select(COLOANE_COMANDA).eq("business_id", businessId);
  if (p.actualizateDupa) q = q.gte("updated_at", p.actualizateDupa);
  if (p.dupa) q = q.gt("id", p.dupa);
  const [{ data, error }, { data: setari, error: eSet }] = await Promise.all([
    q.order("id", { ascending: true }).limit(p.limita),
    admin.from("store_settings").select("currency").eq("business_id", businessId).maybeSingle(),
  ]);
  if (error) throw error;
  if (eSet) throw eSet;
  const randuri = (data ?? []) as unknown as RandComanda[];
  const moneda = sir((setari as { currency?: unknown } | null)?.currency)?.toUpperCase() ?? "RON";

  /*
   * Variantele produselor din pagina, O singura citire, si numai `page_sections->variants`: restul
   * sectiunilor (descrieri, galerii) pot avea sute de kilobytes pe produs si n-au ce cauta aici.
   */
  const iduri = [...new Set(randuri.flatMap((r) => liniileBrute(r.items)
    .map((l) => sir(l.product_id))
    .filter((x): x is string => !!x && UUID.test(x))
    .map((x) => x.toLowerCase())))];
  const variante = new Map<string, unknown>();
  if (iduri.length) {
    const { data: produse, error: eProd } = await admin
      .from("products").select("id, variante:page_sections->variants")
      .eq("business_id", businessId).in("id", iduri);
    if (eProd) throw eProd;
    for (const pr of (produse ?? []) as unknown as { id: string; variante: unknown }[]) variante.set(pr.id, pr.variante ?? null);
  }

  const comenzi = randuri.map((r) => comandaPentruHontrio(r, variante, moneda));
  return { comenzi, urmatorul: randuri.length === p.limita ? randuri[randuri.length - 1].id : null };
}
