import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import { campuriDinConfigurare } from "@/lib/orders/detalii-pentru-awb";
import { adaugaMetadate, anuleazaComandaLaEi, citesteComanda, listaComenzi, salveazaComanda } from "./api";
import type { ContextEasySales, Raspuns } from "./client";
import {
  COLOANE_COMANDA, construiesteComanda, modulDePlata,
  type ComandaPentruEasySales, type MagazinPentruEasySales,
} from "./mapare-comanda";
import {
  COLOANE_PRODUS_IDENTITATE, articoleleLiniilor, asiguraArticolele, cheileLiniilor,
  type ProdusPentruIdentitate,
} from "./identitate";
import { acelasiId, idText } from "./numere";
import { anunta } from "./notificari";
import { awburile, codulStarii } from "./stari";
import type { ComandaEasySales } from "./tipuri";

/**
 * Comenzile vitrinei in easySales: trimiterea, recuperarea dupa un raspuns pierdut, anularea la
 * ei si intoarcerea la Edinio (planul, §5.1 si §5.3).
 *
 * ═══ CINE DECIDE CE ═══
 *
 * Declansatorii din baza (migratia comenzilor) stampileaza comanda si pun `comanda_trimite` in
 * coada; aici se face apelul. Starea legaturii (`easysales_comenzi.stare`) se scrie cu
 * compare-and-set pe starea citita: o anulare venita in timpul apelului muta randul, iar scrierea
 * noastra nu are voie sa o calce.
 *
 * ═══ ⚠ UN SAVE NU SE REIA ORB ═══
 *
 * Cheia de potrivire a lui Save nu e documentata (M-COM-1). Dupa un timp expirat sau un 5xx pe
 * scriere, legatura trece in `necunoscuta`, iar inaintea oricarui nou Save se cauta comanda la ei
 * (`?order_display_id=`). Un rezultat gol nu dovedeste lipsa: abia dupa 10 minute si doua citiri
 * goale se trimite din nou.
 *
 * ═══ ⚠ DUPA CE `internal_id` E CUNOSCUT, NICIUN SAVE AUTOMAT ═══
 *
 * Nu stim ce suprascrie Save peste o comanda procesata (factura, AWB). „Retrimite" e o actiune a
 * omului, cu recitirea starii inainte.
 */

type Admin = SupabaseClient<Database>;

export const COLOANE_LEGATURA =
  "id, business_id, order_id, order_uuid, es_order_id, es_internal_id, es_display_id, stapan, stare, "
  + "motiv, incercari, trimisa_la, created_at, es_anulata_la, es_status_cod";

export interface LegaturaComenzii {
  id: string;
  business_id: string;
  order_id: string | null;
  order_uuid: string | null;
  es_order_id: string;
  es_internal_id: string | null;
  es_display_id: string | null;
  stapan: string;
  stare: string;
  motiv: string | null;
  incercari: number;
  trimisa_la: string | null;
  created_at: string;
  es_anulata_la: string | null;
  es_status_cod: number | null;
}

/** Starile in care o comanda inca n-a ajuns (sigur) la ei. */
export const STARI_NETRIMISE = ["asteapta_plata", "de_trimis", "refuzata", "respinsa_local", "blocata_plafon", "abandonata"] as const;

/** Dupa atatea minute si atatea citiri goale, o comanda `necunoscuta` se socoteste absenta. */
const RECUPERARE_MINUTE = 10;
const RECUPERARE_CITIRI = 2;

export async function citesteLegatura(admin: Admin, businessId: string, orderUuid: string): Promise<LegaturaComenzii | null> {
  const { data, error } = await admin.from("easysales_comenzi").select(COLOANE_LEGATURA)
    .eq("business_id", businessId).eq("order_uuid", orderUuid).eq("directie", "iesire").maybeSingle();
  if (error) throw new EroareCitireBaza("easysales.legatura", error.message);
  return (data as LegaturaComenzii | null) ?? null;
}

/** Scrie peste legatura NUMAI daca starea e inca una din cele asteptate. `true` = a prins. */
export async function scrieLegatura(
  admin: Admin, leg: Pick<LegaturaComenzii, "id">, stariAsteptate: readonly string[],
  petic: Database["public"]["Tables"]["easysales_comenzi"]["Update"],
): Promise<boolean> {
  const { data, error } = await admin.from("easysales_comenzi").update(petic)
    .eq("id", leg.id).in("stare", [...stariAsteptate]).select("id");
  if (error) throw new EroareCitireBaza("easysales.legatura", error.message);
  return (data ?? []).length > 0;
}

type ComandaCitita = ComandaPentruEasySales & {
  business_id: string;
  status: string;
  payment_status: string | null;
  stoc_rezervat: unknown;
  order_source: unknown;
};

async function citesteComandaEdinio(admin: Admin, businessId: string, orderUuid: string): Promise<ComandaCitita | null> {
  const { data, error } = await admin.from("orders").select(COLOANE_COMANDA)
    .eq("id", orderUuid).eq("business_id", businessId).maybeSingle();
  if (error) throw new EroareCitireBaza("easysales.comanda", error.message);
  return (data as unknown as ComandaCitita | null) ?? null;
}

/** Stampila de pe comanda, sau `null`. */
export function stampila(orderSource: unknown): { stapan?: unknown } | null {
  const s = orderSource && typeof orderSource === "object" ? (orderSource as Record<string, unknown>).easysales : null;
  return s && typeof s === "object" && !Array.isArray(s) ? (s as { stapan?: unknown }) : null;
}

interface MagazinCitit extends MagazinPentruEasySales {
  slug: string | null;
}

async function citesteMagazinul(admin: Admin, businessId: string, ctx: ContextEasySales): Promise<MagazinCitit> {
  const [setari, biz] = await Promise.all([
    admin.from("store_settings")
      .select("vat_enabled, vat_rate, prices_include_vat, checkout:page_content->checkout_config")
      .eq("business_id", businessId).maybeSingle(),
    admin.from("businesses").select("slug").eq("id", businessId).maybeSingle(),
  ]);
  if (setari.error) throw new EroareCitireBaza("easysales.magazin", setari.error.message);
  const s = (setari.data ?? {}) as { vat_enabled?: boolean | null; vat_rate?: unknown; prices_include_vat?: boolean | null; checkout?: unknown };
  return {
    vat_enabled: s.vat_enabled === true,
    vat_rate: s.vat_rate ?? 0,
    prices_include_vat: s.prices_include_vat !== false,
    serieFacturi: ctx.cfg.serie_facturi ?? "",
    campuriCheckout: campuriDinConfigurare(s.checkout),
    variantaTotal: ctx.cfg.varianta_total === "definitie" ? "definitie" : "incasat",
    slug: (biz.data as { slug?: string | null } | null)?.slug ?? null,
  };
}

async function citesteProdusele(admin: Admin, businessId: string, items: unknown): Promise<Map<string, ProdusPentruIdentitate>> {
  const uuids = [...new Set((Array.isArray(items) ? items : [])
    .map((l) => (l as { product_id?: unknown }).product_id)
    .filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))];
  const out = new Map<string, ProdusPentruIdentitate>();
  for (let i = 0; i < uuids.length; i += 100) {
    const { data, error } = await admin.from("products").select(COLOANE_PRODUS_IDENTITATE)
      .eq("business_id", businessId).in("id", uuids.slice(i, i + 100));
    if (error) throw new EroareCitireBaza("easysales.produse", error.message);
    for (const p of (data ?? []) as ProdusPentruIdentitate[]) out.set(p.id, p);
  }
  return out;
}

/* ─── Cautarea la ei ──────────────────────────────────────────────────────── */

export type Gasire =
  | { fel: "gasita"; comanda: ComandaEasySales; internalId: string | null }
  | { fel: "absenta" }
  | { fel: "eroare"; mesaj: string };

/**
 * Comanda noastra la ei, dupa `order_id`-ul trimis.
 *
 * ⚠ Filtrul `order_display_id` cauta dupa „display, marketplace or website order ID" [A]: un id de
 * marketplace al altei comenzi poate potrivi. Se primeste numai comanda al carei `id` (comparat ca
 * text) e chiar `es_order_id`, si care nu e de marketplace.
 */
export async function gasesteLaEi(ctx: ContextEasySales, esOrderId: string): Promise<Gasire> {
  const r = await listaComenzi(ctx, { order_display_id: esOrderId, per_page: 100 });
  if (!r.ok) return { fel: "eroare", mesaj: r.mesaj };
  const lista = Array.isArray(r.date) ? r.date : [];
  const a = lista.find((c) => acelasiId(c?.id, esOrderId) && !c?.marketplace);
  return a ? { fel: "gasita", comanda: a, internalId: idText(a.internal_id) } : { fel: "absenta" };
}

/* ─── Trimiterea ──────────────────────────────────────────────────────────── */

export type RezultatTrimitere =
  | { fel: "trimisa"; internalId: string | null }
  | { fel: "nimic"; motiv: string }
  | { fel: "refuzata"; mesaj: string }
  | { fel: "respinsa_local"; mesaj: string }
  | { fel: "plafon"; mesaj: string }
  | { fel: "intoarsa"; motiv: string }
  /** Trecatoare (retea pe citire, 429, 5xx, baza): se reia fara sa consume incercari. */
  | { fel: "reincearca"; mesaj: string }
  /** Tokenul sau website-ul cer mana omului: asteapta, fara sa consume incercari. */
  | { fel: "asteapta_omul"; mesaj: string }
  | { fel: "necunoscuta"; mesaj: string }
  | { fel: "definitiv"; mesaj: string };

/** Verdictele de autorizare, care nu tin de comanda. */
function eDeAutorizare(v: Raspuns<unknown>["verdict"]): boolean {
  return v === "neautorizat" || v === "scope_lipsa" || v === "website_token_invalid" || v === "website_dezactivat";
}

/** Mesajul pentru om al unui refuz de autorizare, si starea in care trece magazinul. */
async function semnaleazaAutorizarea(ctx: ContextEasySales, r: Raspuns<unknown>): Promise<void> {
  if (r.verdict === "website_token_invalid") {
    await ctx.dep.peticConfig(ctx.businessId, {
      needs_reconnect: true,
      motiv_reconectare: "easySales nu mai recunoaște website token-ul (a fost reîmprospătat sau website-ul a fost șters). Lipește tokenul nou în Edinio.",
    });
  } else if (r.verdict === "website_dezactivat") {
    await ctx.dep.peticConfig(ctx.businessId, { pauza: true, pauza_motiv: "Website-ul a fost dezactivat în easySales." });
  } else if (r.verdict === "scope_lipsa") {
    await logError({
      action: "easysales.scope", severity: "critical", businessId: ctx.businessId,
      message: `tokenul n-are un scope cerut: ${r.mesaj}`,
    });
  }
}

/**
 * Trimite comanda in easySales, daca e inca de trimis.
 *
 * ⚠ ARUNCA `EroareCitireBaza` cand baza nu raspunde: coada o reia.
 *
 * @param opt.fortat „Trimite totusi": trece si cand `comenzi_active` e stins.
 */
export async function trimiteComanda(
  admin: Admin, ctx: ContextEasySales, orderUuid: string, opt: { fortat?: boolean } = {},
): Promise<RezultatTrimitere> {
  const leg = await citesteLegatura(admin, ctx.businessId, orderUuid);
  if (!leg) return { fel: "definitiv", mesaj: "comanda n-are legatura easySales" };
  if (leg.stapan !== "easysales") return { fel: "nimic", motiv: "comanda se proceseaza din Edinio" };

  if (ctx.cfg.pauza) return { fel: "asteapta_omul", mesaj: ctx.cfg.pauza_motiv || "integrarea e in pauza" };
  if (ctx.cfg.needs_reconnect) return { fel: "asteapta_omul", mesaj: ctx.cfg.motiv_reconectare || "conexiunea cere reconectare" };

  /* Comenzile stinse sau deconectarea: netrimisa sigur, comanda trece la Edinio (planul, §4.8). */
  if ((!ctx.cfg.connected || !ctx.cfg.comenzi_active) && !opt.fortat && (leg.stare === "de_trimis" || leg.stare === "asteapta_plata")) {
    const r = await intoarceLaEdinio(admin, ctx, leg, "trimiterea comenzilor in easySales e oprita", { faraDovada: !leg.trimisa_la });
    return r === "intoarsa" ? { fel: "intoarsa", motiv: "comenzile easySales sunt oprite" } : { fel: "reincearca", mesaj: `intoarcerea: ${r}` };
  }

  if (leg.stare === "necunoscuta") {
    const g = await gasesteLaEi(ctx, leg.es_order_id);
    if (g.fel === "eroare") return { fel: "reincearca", mesaj: `cautarea comenzii la ei: ${g.mesaj}` };
    if (g.fel === "gasita") {
      await scrieLegatura(admin, leg, ["necunoscuta"], {
        stare: "trimisa", es_internal_id: g.internalId, es_display_id: idText(g.comanda.order_display_id),
        motiv: null, incercari: 0,
      });
      if (g.internalId) await scrieMetadatele(admin, ctx, orderUuid, g.internalId);
      return { fel: "trimisa", internalId: g.internalId };
    }
    const deLa = leg.trimisa_la ? Date.parse(leg.trimisa_la) : 0;
    const destulDeVeche = Date.now() - deLa >= RECUPERARE_MINUTE * 60_000;
    if (!destulDeVeche || leg.incercari + 1 < RECUPERARE_CITIRI) {
      await scrieLegatura(admin, leg, ["necunoscuta"], { incercari: leg.incercari + 1 });
      return { fel: "reincearca", mesaj: "comanda nu se vede inca la ei; se cauta din nou" };
    }
    /* Absenta dovedita: inapoi in `de_trimis`, si se trimite chiar acum. */
    if (!(await scrieLegatura(admin, leg, ["necunoscuta"], { stare: "de_trimis", incercari: 0 }))) {
      return { fel: "nimic", motiv: "legatura s-a schimbat intre timp" };
    }
    leg.stare = "de_trimis";
  }
  if (leg.stare !== "de_trimis") return { fel: "nimic", motiv: `starea ${leg.stare}` };

  const o = await citesteComandaEdinio(admin, ctx.businessId, orderUuid);
  if (!o) {
    await scrieLegatura(admin, leg, ["de_trimis"], { stare: "abandonata", motiv: "comanda a fost stearsa din Edinio" });
    return { fel: "definitiv", mesaj: "comanda nu mai exista" };
  }
  if (stampila(o.order_source)?.stapan !== "easysales") {
    await scrieLegatura(admin, leg, ["de_trimis"], { stapan: "edinio", stare: "preluata_edinio" });
    return { fel: "nimic", motiv: "stampila nu mai e a easySales" };
  }
  if (o.status === "cancelled" || o.status === "refunded") {
    await scrieLegatura(admin, leg, ["de_trimis"], { stare: "anulata_inainte" });
    return { fel: "nimic", motiv: "comanda a fost anulata inainte de trimitere" };
  }
  if (modulDePlata(o.payment_method) !== 2 && o.payment_status !== "paid") {
    await scrieLegatura(admin, leg, ["de_trimis"], { stare: "asteapta_plata" });
    return { fel: "nimic", motiv: "plata nu e inca incasata" };
  }

  const magazin = await citesteMagazinul(admin, ctx.businessId, ctx);
  const produse = await citesteProdusele(admin, ctx.businessId, o.items);
  const chei = cheileLiniilor(o.items, o.stoc_rezervat, produse);
  const alocate = await asiguraArticolele(admin, ctx.businessId, chei.filter((c): c is NonNullable<typeof c> => c !== null));
  const articole = articoleleLiniilor(chei, alocate);
  const m = construiesteComanda(o, magazin, articole, Number(leg.es_order_id));

  if (m.fel === "refuz") {
    if (await scrieLegatura(admin, leg, ["de_trimis"], { stare: "respinsa_local", motiv: m.mesaj.slice(0, 500) })) {
      await anunta(admin, ctx.businessId, {
        titlu: `Comanda #${o.order_number} n-a plecat în easySales`,
        mesaj: `Am oprit-o înainte de trimitere: ${m.mesaj}. O poți prelua în Edinio din pagina integrării.`,
        severitate: m.motiv === "sume" ? "critical" : "error",
        detalii: { orderId: o.id, motiv: m.motiv, ...(m.detalii ?? {}) },
      });
    }
    return { fel: "respinsa_local", mesaj: m.mesaj };
  }
  if (m.avertismente.length) {
    await logError({ action: "easysales.comanda", severity: "info", businessId: ctx.businessId, message: m.avertismente.join("; "), details: { orderId: o.id } });
  }

  /* Prima incercare isi lasa clipa: recuperarea dupa un raspuns pierdut se masoara de aici. */
  const acum = new Date().toISOString();
  if (!leg.trimisa_la) {
    await scrieLegatura(admin, leg, ["de_trimis"], { trimisa_la: acum });
    leg.trimisa_la = acum;
  }

  const r = await salveazaComanda(ctx, m.order as unknown as Record<string, unknown>);

  if (r.verdict === "reusit") {
    let internalId = idText(r.date?.internal_id);
    let displayId = idText(r.date?.order_display_id);
    if (!internalId) {
      /* Raspunsul Save nu e documentat (exemplul e copiat de la Add): se afla prin cautare. */
      const g = await gasesteLaEi(ctx, leg.es_order_id);
      if (g.fel === "gasita") {
        internalId = g.internalId;
        displayId = displayId ?? idText(g.comanda.order_display_id);
      }
    }
    const scrisa = await scrieLegatura(admin, leg, ["de_trimis"], {
      stare: "trimisa", es_internal_id: internalId, es_display_id: displayId, motiv: null, incercari: 0, raspuns_brut: null,
    });
    if (!scrisa) await dupaOCursaLaTrimitere(admin, ctx, leg, internalId, displayId);
    if (internalId) await scrieMetadatele(admin, ctx, orderUuid, internalId, o, magazin.slug);
    return { fel: "trimisa", internalId };
  }

  if (r.verdict === "necunoscut") {
    await scrieLegatura(admin, leg, ["de_trimis"], { stare: "necunoscuta", incercari: 0, motiv: r.mesaj.slice(0, 500) });
    return { fel: "necunoscuta", mesaj: r.mesaj };
  }
  if (r.verdict === "trecatoare") return { fel: "reincearca", mesaj: r.mesaj };
  if (eDeAutorizare(r.verdict)) {
    await semnaleazaAutorizarea(ctx, r);
    return { fel: "asteapta_omul", mesaj: r.mesaj };
  }
  if (r.verdict === "plafon") {
    if (await scrieLegatura(admin, leg, ["de_trimis"], { stare: "blocata_plafon", motiv: r.mesaj.slice(0, 500) })) {
      await anunta(admin, ctx.businessId, {
        titlu: "easySales: plafonul de comenzi e atins",
        mesaj: `Comanda #${o.order_number} n-a intrat în easySales: abonamentul lor a atins numărul maxim de comenzi. Mărește planul în easySales și apasă „Reia”, sau preia comanda în Edinio.`,
        severitate: "error", detalii: { orderId: o.id },
      });
    }
    return { fel: "plafon", mesaj: r.mesaj };
  }

  /* Validare (422) si celelalte refuzuri definitive: comanda nu e la ei, deci se intoarce la Edinio. */
  const motiv = r.campuri.length ? r.campuri.slice(0, 5).join("; ") : r.mesaj;
  if (r.verdict === "json_invalid") {
    await logError({ action: "easysales.comanda", severity: "critical", businessId: ctx.businessId, message: `corpul Save a fost respins ca JSON invalid: ${r.mesaj}`, details: { orderId: o.id } });
  }
  if (await scrieLegatura(admin, leg, ["de_trimis"], {
    stare: "refuzata", motiv: motiv.slice(0, 500),
    raspuns_brut: { status: r.status, mesaj: r.mesaj, campuri: r.campuri } as unknown as Json,
  })) {
    const intoarsa = await intoarceLaEdinio(admin, ctx, { ...leg, stare: "refuzata" }, `easySales a refuzat comanda: ${motiv}`);
    if (intoarsa === "reincearca") return { fel: "reincearca", mesaj: "refuzata; intoarcerea la Edinio se reia" };
  }
  return { fel: "refuzata", mesaj: motiv };
}

/**
 * Save a reusit, dar legatura nu mai era `de_trimis`: o anulare a venit in timpul apelului.
 * Faptele raman adevarate (comanda E la ei), deci se scriu, iar anularea pleaca si la ei.
 */
async function dupaOCursaLaTrimitere(
  admin: Admin, ctx: ContextEasySales, leg: LegaturaComenzii, internalId: string | null, displayId: string | null,
): Promise<void> {
  const acum = await citesteLegatura(admin, ctx.businessId, leg.order_uuid ?? "");
  if (!acum) return;
  await scrieLegatura(admin, acum, [acum.stare], {
    stare: acum.stare === "anulata_inainte" ? "trimisa" : acum.stare,
    es_internal_id: internalId, es_display_id: displayId,
  });
  if (acum.stare === "anulata_inainte" && acum.order_uuid) {
    await admin.rpc("easysales_pune_in_coada", { p_business: ctx.businessId, p_op: "comanda_anuleaza", p_cheie: acum.order_uuid, p_prioritate: 1 });
  }
  await logError({
    action: "easysales.comanda", severity: "warning", businessId: ctx.businessId,
    message: `comanda a ajuns in easySales in timp ce legatura trecea in ${acum.stare}`,
    details: { orderId: acum.order_uuid, internalId },
  });
}

/** Metadatele pe comanda lor: legatura inapoi spre Edinio. Fara ele nu se strica nimic. */
async function scrieMetadatele(
  admin: Admin, ctx: ContextEasySales, orderUuid: string, internalId: string,
  o?: ComandaCitita | null, slug?: string | null,
): Promise<void> {
  try {
    const c = o ?? await citesteComandaEdinio(admin, ctx.businessId, orderUuid);
    const md = [
      { key: "edinio_order_id", value: orderUuid },
      ...(c ? [
        { key: "edinio_order_number", value: String(c.order_number) },
        { key: "edinio_plata", value: `${c.payment_method ?? ""}/${c.payment_status ?? ""}` },
      ] : []),
      ...(slug ? [{ key: "edinio_magazin", value: slug }] : []),
    ];
    const r = await adaugaMetadate(ctx, internalId, md);
    if (!r.ok) {
      await logError({ action: "easysales.metadate", severity: "info", businessId: ctx.businessId, message: `metadatele n-au intrat: ${r.mesaj}`, details: { orderUuid } });
    }
  } catch (e) {
    await logError({ action: "easysales.metadate", severity: "info", businessId: ctx.businessId, message: (e as Error).message, details: { orderUuid } });
  }
}

/* ─── Intoarcerea la Edinio ───────────────────────────────────────────────── */

/**
 * Comanda trece la Edinio: stampila devine `stapan: "edinio"` (imbinata, nu rescrisa), legatura
 * trece in `preluata_edinio`, iar facturarea automata isi face drumul obisnuit.
 *
 * ⚠ NUMAI dupa ce cautarea la ei dovedeste ca n-o au (`faraDovada` numai cand nu s-a incercat
 * niciodata trimiterea). Daca o au, legatura devine `conflict`, iar omul hotaraste.
 */
export async function intoarceLaEdinio(
  admin: Admin, ctx: ContextEasySales, leg: LegaturaComenzii, motiv: string, opt: { faraDovada?: boolean } = {},
): Promise<"intoarsa" | "conflict" | "reincearca"> {
  const orderUuid = leg.order_uuid;
  if (!orderUuid) return "reincearca";
  if (!opt.faraDovada) {
    const g = await gasesteLaEi(ctx, leg.es_order_id);
    if (g.fel === "eroare") return "reincearca";
    if (g.fel === "gasita") {
      if (await scrieLegatura(admin, leg, [...STARI_NETRIMISE, "necunoscuta"], {
        stare: "conflict", es_internal_id: g.internalId, motiv: `comanda exista in easySales: ${motiv}`.slice(0, 500),
      })) {
        await anunta(admin, ctx.businessId, {
          titlu: "easySales: comandă de verificat",
          mesaj: `O comandă pe care o credeam netrimisă există în easySales (id ${leg.es_order_id}). Verifică-o acolo înainte de orice factură sau AWB din Edinio.`,
          severitate: "error", detalii: { orderUuid },
        });
      }
      return "conflict";
    }
  }

  const { data, error } = await admin.rpc("easysales_schimba_stapanul", { p_business: ctx.businessId, p_order: orderUuid, p_stapan: "edinio" });
  if (error) {
    await logError({ action: "easysales.intoarcere", severity: "error", businessId: ctx.businessId, message: `stapanul nu s-a putut schimba: ${error.message}`, details: { orderUuid } });
    return "reincearca";
  }
  if (data === false) {
    /* Comanda nu (mai) e stampilata: legatura urmeaza oricum. */
    await scrieLegatura(admin, leg, [...STARI_NETRIMISE, "necunoscuta"], { stapan: "edinio", stare: "preluata_edinio" });
  }

  const o = await citesteComandaEdinio(admin, ctx.businessId, orderUuid).catch(() => null);
  if (o) {
    try {
      const { maybeAutoInvoice } = await import("@/lib/actions/invoice-auto.actions");
      await maybeAutoInvoice(ctx.businessId, orderUuid, o.status, o.payment_status ?? "", admin as never);
    } catch (e) {
      await logError({ action: "easysales.intoarcere", severity: "warning", businessId: ctx.businessId, message: `facturarea automata a cazut: ${(e as Error).message}`, details: { orderUuid } });
    }
  }
  await anunta(admin, ctx.businessId, {
    titlu: `Comanda #${o?.order_number ?? ""} se procesează din Edinio`,
    mesaj: `Nu a plecat în easySales (${motiv}). Factura și AWB-ul se fac din Edinio, ca la orice comandă.`,
    severitate: "warning", detalii: { orderUuid },
  });
  return "intoarsa";
}

/* ─── Anularea la ei ──────────────────────────────────────────────────────── */

export type RezultatAnulare =
  | { fel: "anulata" }
  | { fel: "nimic"; motiv: string }
  | { fel: "refuz"; mesaj: string }
  | { fel: "reincearca"; mesaj: string }
  | { fel: "asteapta_omul"; mesaj: string };

/**
 * Anuleaza comanda la ei, daca se mai poate: stare New sau Received si fara AWB [A: PATCH cancel].
 *
 * ⚠ Raspunsul unui `cancel` refuzat nu e documentat (M-COM-7): orice raspuns care nu arata
 * „Canceled" nu schimba nimic. Un timp expirat lasa anularea nestiuta, iar reluarea incepe cu
 * recitirea comenzii, nu cu inca un PATCH orb.
 */
export async function anuleazaLaEi(admin: Admin, ctx: ContextEasySales, orderUuid: string, motiv: string): Promise<RezultatAnulare> {
  const leg = await citesteLegatura(admin, ctx.businessId, orderUuid);
  if (!leg) return { fel: "nimic", motiv: "fara legatura" };
  if (leg.es_anulata_la) return { fel: "nimic", motiv: "deja anulata la ei" };
  let internalId = leg.es_internal_id;
  if (!internalId) {
    if (leg.stare !== "trimisa" && leg.stare !== "necunoscuta" && leg.stare !== "conflict") return { fel: "nimic", motiv: `starea ${leg.stare}` };
    const g = await gasesteLaEi(ctx, leg.es_order_id);
    if (g.fel === "eroare") return { fel: "reincearca", mesaj: g.mesaj };
    if (g.fel === "absenta") return { fel: "nimic", motiv: "comanda nu e la ei" };
    internalId = g.internalId;
    if (!internalId) return { fel: "reincearca", mesaj: "comanda lor n-are internal_id" };
    await scrieLegatura(admin, leg, [leg.stare], { es_internal_id: internalId, stare: leg.stare === "necunoscuta" ? "trimisa" : leg.stare });
  }

  const citita = await citesteComanda(ctx, internalId);
  if (!citita.ok) {
    if (eDeAutorizare(citita.verdict)) return { fel: "asteapta_omul", mesaj: citita.mesaj };
    if (citita.verdict === "negasit") return { fel: "nimic", motiv: "comanda a disparut la ei" };
    return { fel: "reincearca", mesaj: citita.mesaj };
  }
  const cod = codulStarii(citita.date?.status);
  if (cod === 0) {
    await scrieLegatura(admin, leg, [leg.stare, "trimisa"], { es_anulata_la: new Date().toISOString(), es_status_cod: 0 });
    return { fel: "anulata" };
  }
  const areAwb = awburile(citita.date ?? {}).some((a) => a.livrare !== 7);
  if ((cod !== 1 && cod !== 2) || areAwb) {
    return { fel: "refuz", mesaj: areAwb ? "comanda are deja AWB în easySales" : "comanda e deja în procesare în easySales" };
  }

  const r = await anuleazaComandaLaEi(ctx, internalId, motiv);
  if (r.ok && codulStarii(r.date?.status) === 0) {
    await scrieLegatura(admin, leg, [leg.stare, "trimisa"], { es_anulata_la: new Date().toISOString(), es_status_cod: 0 });
    return { fel: "anulata" };
  }
  if (r.verdict === "necunoscut" || r.verdict === "trecatoare") return { fel: "reincearca", mesaj: r.mesaj };
  if (eDeAutorizare(r.verdict)) return { fel: "asteapta_omul", mesaj: r.mesaj };
  return { fel: "refuz", mesaj: r.campuri.length ? r.campuri.join("; ") : r.mesaj || "easySales n-a confirmat anularea" };
}
