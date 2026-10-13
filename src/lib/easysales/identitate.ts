import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import { esteIdExtra } from "@/lib/orders/extras";
import { parseVariants, type VariantCombo } from "@/lib/storefront/variants";
import { identitateCombinatie } from "@/lib/storefront/variante-identitate";
import type { ArticolLinie } from "./mapare-comanda";

/**
 * Identitatea fiecarui articol Edinio la easySales (`easysales_produse`), si a fiecarei linii de
 * comanda (planul, §5.1.3 si §5.4.2).
 *
 * ═══ UN RAND PE UNITATE VANDUTA ═══
 *
 * Cheia e `(business_id, product_uuid, identitate)`, cu `identitate`:
 *
 *   ''                  produsul simplu (si pachetul, si linia pe care n-o putem lega mai bine);
 *   '#parinte'          parintele variantelor (numai catalogul il foloseste, din E3);
 *   identitatea combinatiei, adica `uid`-ul ei sau amprenta titlului (`identitateCombinatie`).
 *
 * `id`-ul randului vine din `easysales_id_seq` si e `product_website_id`. Comanda si catalogul
 * folosesc ACELASI rand: o linie trimisa azi si produsul trimis maine sunt acelasi articol la ei.
 *
 * ═══ ⚠ SKU-UL SE INGHEATA LA PRIMA TRIMITERE ═══
 *
 * La un SKU schimbat, easySales creeaza un produs nou (ghid, M-PROD-1). Deci `sku_trimis` se scrie
 * o singura data si nu urmeaza produsul. Fara SKU propriu (sau cu SKU-ul parintelui pe o
 * combinatie, sau cu unul deja luat de alt articol), se genereaza `EDN-` + 10 caractere base32 din
 * `sha256(product_uuid|identitate)`: determinist, deci acelasi la orice reincercare.
 *
 * ═══ ⚠ VARIANTA UNEI LINII SE REFACE DIN `stoc_rezervat`, NU DIN NUME ═══
 *
 * Liniile din vitrina au numai `{product_id, name, price, quantity}`. `stoc_rezervat.variante` e
 * sursa sigura (scrisa la plasare, cu titlul exact). Sufixul „(titlu)" din nume e doar rezerva:
 * numele produsului poate contine el insusi paranteze. O potrivire nesigura lasa linia NELEGATA:
 * pleaca pe identitatea produsului, cu nota in observatii, nu pe o varianta ghicita.
 */

export const IDENTITATE_SIMPLU = "";
export const IDENTITATE_PARINTE = "#parinte";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** SKU-ul generat, stabil: `EDN-` + primele 10 caractere base32 din `sha256(uuid|identitate)`. */
export function skuGenerat(productUuid: string, identitate: string): string {
  const octeti = createHash("sha256").update(`${productUuid}|${identitate}`, "utf8").digest();
  let biti = 0;
  let valoare = 0;
  let out = "";
  for (const o of octeti) {
    valoare = (valoare << 8) | o;
    biti += 8;
    while (biti >= 5 && out.length < 10) {
      out += BASE32[(valoare >>> (biti - 5)) & 31];
      biti -= 5;
    }
    if (out.length >= 10) break;
    valoare &= (1 << biti) - 1;
  }
  return `EDN-${out}`;
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ce trebuie stiut despre un produs ca sa i se afle articolul. */
export interface ProdusPentruIdentitate {
  id: string;
  name: string;
  sku: string | null;
  page_sections: unknown;
}

export const COLOANE_PRODUS_IDENTITATE = "id, name, sku, page_sections";

/** Articolul cerut pentru o linie, inainte de alocare. */
export interface CheieArticol {
  product_uuid: string;
  identitate: string;
  /** Produsul exista acum (altfel `product_id` ramane NULL, piatra de mormant). */
  produsExista: boolean;
  /** SKU-ul propriu, daca se poate folosi; `null` = se genereaza. */
  skuDorit: string | null;
  nelegata: boolean;
}

export function cheiaArticolului(c: Pick<CheieArticol, "product_uuid" | "identitate">): string {
  return `${c.product_uuid}|${c.identitate}`;
}

function skuCurat(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

interface LinieComanda {
  product_id?: unknown;
  name?: unknown;
  quantity?: unknown;
}

interface VariantaRezervata {
  product_id?: unknown;
  variant_title?: unknown;
  quantity?: unknown;
}

/** Titlurile din `stoc_rezervat.variante`, cate unul pe linie, consumate pe masura ce se leaga. */
function rezervate(stoc: unknown): VariantaRezervata[] {
  const v = (stoc as { variante?: unknown } | null)?.variante;
  return Array.isArray(v) ? (v as VariantaRezervata[]).filter((x) => typeof x?.variant_title === "string" && x.variant_title !== "") : [];
}

function cantitateaRezervarii(q: unknown): number {
  return Math.max(1, Math.floor(Number(q) || 1));
}

/**
 * Titlul variantei unei linii: intai din rezervare, apoi din sufixul numelui, altfel `null`.
 * Rezervarea folosita se SCOATE din bazin, ca doua linii ale aceluiasi produs sa nu ia acelasi titlu.
 */
function titlulVariantei(
  l: LinieComanda, combinatii: VariantCombo[], bazin: VariantaRezervata[],
): string | null {
  const id = String(l.product_id);
  const nume = typeof l.name === "string" ? l.name : "";
  const candidati = bazin.filter((r) => String(r.product_id) === id);
  if (candidati.length > 0) {
    /* Mai multe linii ale aceluiasi produs: castiga titlul care se vede in nume, apoi cantitatea. */
    const dupaNume = candidati.filter((r) => nume.endsWith(` (${r.variant_title as string})`));
    const pool = dupaNume.length ? dupaNume : candidati;
    const exact = pool.find((r) => cantitateaRezervarii(r.quantity) === cantitateaRezervarii(l.quantity)) ?? (pool.length === 1 ? pool[0] : null);
    if (exact) {
      bazin.splice(bazin.indexOf(exact), 1);
      return exact.variant_title as string;
    }
  }
  /* Rezerva: sufixul „ (titlu)". Numai o potrivire UNICA; doua inseamna „nu stiu". */
  const potrivite = [...new Set(combinatii.map((c) => c.title))].filter((t) => t && nume.endsWith(` (${t})`));
  return potrivite.length === 1 ? potrivite[0] : null;
}

/**
 * Cheia articolului fiecarei linii, pe ACELASI indice ca `items`; `null` pe extraoptiuni si pe
 * liniile fara un `product_id` care sa fie uuid. Pura.
 */
export function cheileLiniilor(
  items: unknown, stocRezervat: unknown, produse: ReadonlyMap<string, ProdusPentruIdentitate>,
): (CheieArticol | null)[] {
  const linii = (Array.isArray(items) ? items : []) as LinieComanda[];
  const bazin = rezervate(stocRezervat);
  return linii.map((l) => {
    if (esteIdExtra(l.product_id)) return null;
    const uuid = typeof l.product_id === "string" ? l.product_id.trim() : "";
    if (!RE_UUID.test(uuid)) return null;

    const p = produse.get(uuid);
    if (!p) {
      /* Produs sters: piatra de mormant, pe identitatea produsului. */
      return { product_uuid: uuid, identitate: IDENTITATE_SIMPLU, produsExista: false, skuDorit: null, nelegata: true };
    }
    const variante = parseVariants(p.page_sections);
    if (!variante) {
      return { product_uuid: uuid, identitate: IDENTITATE_SIMPLU, produsExista: true, skuDorit: skuCurat(p.sku), nelegata: false };
    }
    const titlu = titlulVariantei(l, variante.combinations, bazin);
    /* Prima combinatie cu titlul cerut, activa intai (aceeasi alegere ca `findCombo`), apoi oricare:
       combinatia poate fi stinsa intre comanda si trimitere, iar linia tot pe ea s-a vandut. */
    const combo = titlu
      ? variante.combinations.find((c) => c?.title === titlu && c.enabled) ?? variante.combinations.find((c) => c?.title === titlu) ?? null
      : null;
    if (!combo) {
      return { product_uuid: uuid, identitate: IDENTITATE_SIMPLU, produsExista: true, skuDorit: null, nelegata: true };
    }
    const skuCombo = skuCurat(combo.sku);
    const skuParinte = skuCurat(p.sku);
    const skuDorit = skuCombo && (!skuParinte || skuCombo.toLowerCase() !== skuParinte.toLowerCase()) ? skuCombo : null;
    return { product_uuid: uuid, identitate: identitateCombinatie(combo), produsExista: true, skuDorit, nelegata: false };
  });
}

/* ─── Alocarea in baza ────────────────────────────────────────────────────── */

type Admin = SupabaseClient<Database>;

interface RandArticol {
  id: number;
  product_uuid: string;
  identitate: string;
  sku_trimis: string | null;
}

/** Codul Postgres al unei incalcari de unicitate, si pe ce. */
function unicitate(e: { code?: string; message?: string } | null): "cheie" | "sku" | null {
  if (!e || e.code !== "23505") return null;
  const m = e.message ?? "";
  if (m.includes("easysales_produse_sku_idx")) return "sku";
  return "cheie";
}

/**
 * Randurile `easysales_produse` ale cheilor date: citite, completate sau create acum.
 *
 * ⚠ ARUNCA `EroareCitireBaza` cand baza nu raspunde: apelantul reia comanda mai tarziu. O citire
 * cazuta nu are voie sa produca un SKU nou peste unul deja trimis.
 *
 * ⚠ Cursa intre doi lucratori pe acelasi articol: insertul celui de-al doilea da 23505 pe cheie,
 * iar el reciteste randul castigatorului. Un SKU propriu deja luat de alt articol (23505 pe
 * `easysales_produse_sku_idx`) cade pe SKU-ul generat.
 */
export async function asiguraArticolele(
  admin: Admin, businessId: string, chei: ReadonlyArray<CheieArticol>,
): Promise<Map<string, { id: number; sku: string }>> {
  const unice = new Map<string, CheieArticol>();
  for (const c of chei) if (!unice.has(cheiaArticolului(c))) unice.set(cheiaArticolului(c), c);
  const out = new Map<string, { id: number; sku: string }>();
  if (unice.size === 0) return out;

  const citeste = async (): Promise<RandArticol[]> => {
    const uuids = [...new Set([...unice.values()].map((c) => c.product_uuid))];
    const { data, error } = await admin.from("easysales_produse")
      .select("id, product_uuid, identitate, sku_trimis")
      .eq("business_id", businessId).in("product_uuid", uuids);
    if (error) throw new EroareCitireBaza("easysales.articole", error.message);
    return (data ?? []) as RandArticol[];
  };

  const existente = new Map((await citeste()).map((r) => [cheiaArticolului(r), r]));

  for (const [cheie, c] of unice) {
    const generat = skuGenerat(c.product_uuid, c.identitate);
    const r = existente.get(cheie);
    if (r?.sku_trimis) {
      out.set(cheie, { id: Number(r.id), sku: r.sku_trimis });
      continue;
    }
    if (r) {
      /* Rand facut de catalog, inca netrimis: SKU-ul se ingheata acum, si numai daca e tot gol. */
      for (const [sku, generatAcum] of [[c.skuDorit ?? generat, !c.skuDorit], [generat, true]] as [string, boolean][]) {
        const { data, error } = await admin.from("easysales_produse")
          .update({ sku_trimis: sku, sku_generat: generatAcum, updated_at: new Date().toISOString() })
          .eq("id", r.id).is("sku_trimis", null).select("id, sku_trimis");
        if (unicitate(error) === "sku") continue;
        if (error) throw new EroareCitireBaza("easysales.articole", error.message);
        const scris = (data ?? [])[0] as { sku_trimis: string | null } | undefined;
        if (scris?.sku_trimis) { out.set(cheie, { id: Number(r.id), sku: scris.sku_trimis }); break; }
        /* Altcineva l-a inghetat intre timp: se ia al lui. */
        const acum = (await citeste()).find((x) => cheiaArticolului(x) === cheie);
        if (acum?.sku_trimis) { out.set(cheie, { id: Number(acum.id), sku: acum.sku_trimis }); break; }
      }
      continue;
    }

    for (const [sku, generatAcum] of [[c.skuDorit ?? generat, !c.skuDorit], [generat, true]] as [string, boolean][]) {
      const { data, error } = await admin.from("easysales_produse").insert({
        business_id: businessId,
        product_id: c.produsExista ? c.product_uuid : null,
        product_uuid: c.product_uuid,
        identitate: c.identitate,
        sku_trimis: sku,
        sku_generat: generatAcum,
        stare: "nou",
      }).select("id, sku_trimis").single();
      const fel = unicitate(error);
      if (fel === "sku") continue;
      if (fel === "cheie") {
        const acum = (await citeste()).find((x) => cheiaArticolului(x) === cheie);
        if (acum?.sku_trimis) out.set(cheie, { id: Number(acum.id), sku: acum.sku_trimis });
        break;
      }
      if (error) throw new EroareCitireBaza("easysales.articole", error.message);
      const rand = data as { id: number; sku_trimis: string };
      out.set(cheie, { id: Number(rand.id), sku: rand.sku_trimis });
      break;
    }
  }
  return out;
}

/** Articolele liniilor, pe indicele lor, din cheile si randurile alocate. */
export function articoleleLiniilor(
  chei: ReadonlyArray<CheieArticol | null>, alocate: ReadonlyMap<string, { id: number; sku: string }>,
): (ArticolLinie | null)[] {
  return chei.map((c) => {
    if (!c) return null;
    const a = alocate.get(cheiaArticolului(c));
    return a ? { productWebsiteId: a.id, sku: a.sku, nelegata: c.nelegata } : null;
  });
}
