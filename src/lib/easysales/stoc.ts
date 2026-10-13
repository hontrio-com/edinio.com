import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { comboStock } from "@/lib/storefront/variants";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import { SIGURANTA_MASA } from "./constante";
import type { ArticolCatalog, ProdusCatalog, SetariCatalog } from "./eligibilitate";
import { cheileLiniilor, cheiaArticolului, COLOANE_PRODUS_IDENTITATE, type ProdusPentruIdentitate } from "./identitate";

/**
 * Stocul trimis la easySales: bucla de stoc (E4; planul, §5.5).
 *
 * ═══ ⚠ MODELUL LOR DE STOC NU E DOCUMENTAT IN API ═══
 *
 * Centrul de ajutor descrie un model cu REZERVARE: la intrarea unei comenzi, easySales rezerva
 * cantitatea (`reserved_stock`, alt camp decat `stock`), nu scade copia; rezervarea dispare la
 * finalizare (AWB) sau la factura, iar scaderea efectiva se face „la finalizare" sau „la facturare",
 * dupa o setare a contului din 10.2025 (IPOTEZA, M-STOC-1, ES-8, ES-22). Daca e asa, o formula care
 * presupune ca ei isi scad copia ar scadea aceeasi bucata de DOUA ori. Deci formula e un parametru,
 * cu ambele variante scrise dinainte, si se alege dupa masuratoare, nu dupa o presupunere:
 *
 *   (a) `scadere`    ei isi scad copia la vanzare:     trimis = max(0, E - Z_ext)
 *                    Z_ext = vanzarile externe vazute la ei si inca neconsumate in Edinio; fara
 *                    scadere, o impingere facuta intre vanzare si consum ar invia bucata;
 *   (b) `rezervare`  ei rezerva, apoi scad la AWB/factura: trimis = E + R_consumate
 *                    R_consumate = rezervarile lor pentru comenzile deja consumate in Edinio si inca
 *                    nefinalizate la ei; fara adaos, aceeasi bucata s-ar scadea o data in Edinio
 *                    (consumul) si inca o data la ei (rezervarea), pana la AWB sau factura.
 *
 * Pana la M-STOC-1, `FORMULA_STOC` e `null` (`constante.ts`), iar nicio cantitate reala nu pleaca.
 *
 * ═══ CE E „E" ═══
 *
 * Stocul Edinio al articolului, o singura functie (`stoculEdinio`), folosita si de impingere, si de
 * deriva: inactiv, pachet, `out_of_stock` sau neeligibil -> 0; fara evidenta -> stocul fix (D9);
 * combinatie -> stocul ei, citit tolerant (1.094 de combinatii il tin ca sir [C]); stocul comun al
 * variantelor nu pleaca deloc (articolul nu e eligibil).
 */

type Admin = SupabaseClient<Database>;

export type FormulaStoc = "scadere" | "rezervare";

export interface CorectieStoc {
  /** (a): bucati vandute la ei, vazute, inca neconsumate in Edinio. */
  externeNeconsumate: number;
  /** (b): bucati consumate in Edinio si inca rezervate la ei (fara AWB, fara factura). */
  rezervariConsumate: number;
}

export const FARA_CORECTIE: CorectieStoc = { externeNeconsumate: 0, rezervariConsumate: 0 };

/** Stocul Edinio al articolului (E). Pura. */
export function stoculEdinio(p: ProdusCatalog, a: ArticolCatalog | undefined, setari: SetariCatalog): number {
  if (!a || !a.eligibil || !p.is_active || p.is_bundle) return 0;
  const status = (p.page_sections as { stock_status?: unknown } | null)?.stock_status;
  if (status === "out_of_stock") return 0;
  if (!p.track_inventory) return setari.stocFix ?? 0;
  if (a.combo) {
    const s = comboStock(a.combo);
    return s == null ? 0 : s;
  }
  const n = Math.floor(Number(p.stock_quantity));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Stocul de trimis, dupa formula. Pura; niciodata negativ. */
export function stocDeTrimis(E: number, formula: FormulaStoc, c: CorectieStoc): number {
  const e = Math.max(0, Math.floor(E));
  if (formula === "scadere") return Math.max(0, e - Math.max(0, Math.floor(c.externeNeconsumate)));
  return Math.max(0, e + Math.max(0, Math.floor(c.rezervariConsumate)));
}

/**
 * Siguranta de masa pe stoc (D22): un val care ar pune pe 0 peste 200 de articole, sau peste 30% din
 * articolele trimise care aveau stoc, se opreste si cere confirmarea omului. Pura.
 *
 * ⚠ SE NUMARA PE VAL, nu pe trecere. Un feed stricat care pune pe 0 tot catalogul ajunge in coada ca
 * mii de lucrari, prelucrate cate 100 pe trecere: o regula pe trecere n-ar vedea niciodata mai mult de
 * 100, deci n-ar opri nimic. Valul tine pana se goleste coada de stoc.
 */
export function stoculCereConfirmare(laZeroInVal: number, articoleCuStoc: number): boolean {
  if (laZeroInVal > SIGURANTA_MASA.articole) return true;
  return articoleCuStoc > 0 && laZeroInVal > 20 && (laZeroInVal * 100) / articoleCuStoc > SIGURANTA_MASA.procent;
}

export type HotarareDeriva = "nimic" | "trimite" | "recitesteComenzile" | "alarma";

/**
 * Deriva dintre stocul lor si cel pe care l-am trimite (planul, §5.5). Pura.
 *
 *   la ei MAI MULT   se trimite valoarea noastra: e directia sigura (nu se vinde ce nu e);
 *   la ei MAI PUTIN  NU se trimite nimic: se recitesc comenzile pe SKU-ul acela (poate o vanzare
 *                    nevazuta explica diferenta); a doua observatie la rand porneste alarma
 *                    „diferenta neexplicata".
 *
 * ⚠ Regula „numai in jos" se revizuieste dupa M-STOC-1: daca ei isi scad copia la finalizare sau la
 * factura, o valoare mai mica la ei poate fi corecta, iar regula ar fixa o sub-numarare produsa chiar
 * de ei. De aceea a doua observatie da alarma, nu o corectie.
 */
export function hotarareaDerivei(alLor: number, alNostru: number, derivaVazutaInainte: boolean): HotarareDeriva {
  if (alLor === alNostru) return "nimic";
  if (alLor > alNostru) return "trimite";
  return derivaVazutaInainte ? "alarma" : "recitesteComenzile";
}

/* ═══════════════════════════════════════════════════════════════════════════
   CORECTIILE, DIN LEGATURILE COMENZILOR
   ═══════════════════════════════════════════════════════════════════════════ */

interface LinieConsumata {
  product_id?: unknown;
  variant_title?: unknown;
  quantity?: unknown;
  identitate?: unknown;
}

/** Statusurile lor dupa care nu mai exista rezervare: anulata, finalizata, retur [A: filtrul `status`]. */
const FARA_REZERVARE = new Set([0, 3, 6]);

function adauga(m: Map<string, CorectieStoc>, cheie: string, camp: keyof CorectieStoc, n: number) {
  const c = m.get(cheie) ?? { ...FARA_CORECTIE };
  c[camp] += Math.max(0, Math.floor(n));
  m.set(cheie, c);
}

/**
 * Corectia fiecarui articol (cheia `product_uuid|identitate`), dupa formula, din `easysales_comenzi`.
 * Arunca `EroareCitireBaza`: o citire picata nu are voie sa trimita un stoc fara corectie.
 *
 *   (a) `scadere`    comenzile venite de la ei (`intrare`), vanzari ale noastre (`externa`) inca
 *                    neconsumate, neanulate;
 *   (b) `rezervare`  comenzile consumate in Edinio si inca rezervate la ei: cele trimise de vitrina
 *                    (`iesire`, `trimisa`) si cele aduse de la ei si consumate (`consumata`), fara AWB,
 *                    fara factura emisa, neanulate si nefinalizate.
 */
export async function corectiileStocului(admin: Admin, businessId: string, formula: FormulaStoc): Promise<Map<string, CorectieStoc>> {
  const out = new Map<string, CorectieStoc>();
  if (formula === "scadere") {
    const { data, error } = await admin.from("easysales_comenzi").select("linii")
      .eq("business_id", businessId).eq("directie", "intrare").eq("stare", "externa").is("es_anulata_la", null).limit(2000);
    if (error) throw new EroareCitireBaza("easysales.corectii", error.message);
    for (const r of (data ?? []) as { linii: unknown }[]) {
      for (const l of (Array.isArray(r.linii) ? r.linii : []) as LinieConsumata[]) {
        if (typeof l.product_id !== "string" || typeof l.identitate !== "string") continue;
        adauga(out, cheiaArticolului({ product_uuid: l.product_id, identitate: l.identitate }), "externeNeconsumate", Number(l.quantity) || 0);
      }
    }
    return out;
  }

  const { data, error } = await admin.from("easysales_comenzi")
    .select("directie, stare, order_uuid, linii, awb_viu, facturi, es_status_cod")
    .eq("business_id", businessId).is("es_anulata_la", null).is("awb_viu", null)
    .in("stare", ["trimisa", "consumata"]).limit(2000);
  if (error) throw new EroareCitireBaza("easysales.corectii", error.message);
  const randuri = ((data ?? []) as { directie: string; stare: string; order_uuid: string | null; linii: unknown; facturi: unknown; es_status_cod: number | null }[])
    .filter((r) => !(r.es_status_cod != null && FARA_REZERVARE.has(Number(r.es_status_cod))))
    .filter((r) => {
      const emise = (r.facturi as { emise?: unknown } | null)?.emise;
      return !(Array.isArray(emise) && emise.length > 0);
    });

  for (const r of randuri.filter((x) => x.directie === "intrare")) {
    for (const l of (Array.isArray(r.linii) ? r.linii : []) as LinieConsumata[]) {
      if (typeof l.product_id !== "string" || typeof l.identitate !== "string") continue;
      adauga(out, cheiaArticolului({ product_uuid: l.product_id, identitate: l.identitate }), "rezervariConsumate", Number(l.quantity) || 0);
    }
  }

  /* Comenzile vitrinei: liniile se refac din `items` si `stoc_rezervat`, ca la trimitere (`cheileLiniilor`). */
  const comenzi = randuri.filter((x) => x.directie === "iesire" && x.order_uuid).map((x) => x.order_uuid as string);
  for (let i = 0; i < comenzi.length; i += 100) {
    const { data: o, error: eo } = await admin.from("orders").select("id, items, stoc_rezervat").in("id", comenzi.slice(i, i + 100));
    if (eo) throw new EroareCitireBaza("easysales.corectii", eo.message);
    const linii = (o ?? []) as { id: string; items: unknown; stoc_rezervat: unknown }[];
    const uuids = [...new Set(linii.flatMap((x) => (Array.isArray(x.items) ? x.items : []).map((l) => String((l as { product_id?: unknown })?.product_id ?? ""))))]
      .filter((u) => /^[0-9a-f-]{36}$/i.test(u));
    const produse = new Map<string, ProdusPentruIdentitate>();
    for (let j = 0; j < uuids.length; j += 100) {
      const { data: p, error: ep } = await admin.from("products").select(COLOANE_PRODUS_IDENTITATE).in("id", uuids.slice(j, j + 100));
      if (ep) throw new EroareCitireBaza("easysales.corectii", ep.message);
      for (const x of (p ?? []) as unknown as ProdusPentruIdentitate[]) produse.set(x.id, x);
    }
    for (const x of linii) {
      const items = Array.isArray(x.items) ? x.items : [];
      cheileLiniilor(items, x.stoc_rezervat, produse).forEach((c, k) => {
        if (!c || c.nelegata) return;
        adauga(out, cheiaArticolului(c), "rezervariConsumate", Number((items[k] as { quantity?: unknown })?.quantity) || 0);
      });
    }
  }
  return out;
}
