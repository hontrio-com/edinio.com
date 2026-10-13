import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import { tranzitieComandaMarketplace, type RezultatTranzitie } from "@/lib/orders/tranzitie-marketplace";
import { marcajUrmator } from "@/lib/marketplace/marcaj";
import { citesteComanda, listaComenzi } from "./api";
import type { ContextEasySales } from "./client";
import { STARI_COMANDA } from "./constante";
import { COLOANE_LEGATURA, gasesteLaEi, scrieLegatura, type LegaturaComenzii } from "./comenzi";
import { idText, suma } from "./numere";
import { anunta } from "./notificari";
import { awburile, decide, type SteagEasySales } from "./stari";
import type { ComandaEasySales } from "./tipuri";

/**
 * Starea, AWB-ul si factura se intorc din easySales in Edinio (planul, §5.2).
 *
 * ═══ PAYLOAD-UL E UN SEMNAL, RECITIREA E ADEVARUL ═══
 *
 * Webhook-urile si banda de lista spun doar „s-a schimbat ceva". Ce se scrie vine din
 * `GET /orders/{internal_id}` (sau din randul listei, care are si `updated_at`), cu tokenul nostru.
 *
 * ═══ CE SE SCRIE UNDE ═══
 *
 *   - starea Edinio: NUMAI prin `tranzitieComandaMarketplace`, cu `elibereazaStoc` explicit;
 *   - AWB-urile, facturile, erorile, cererea de anulare: in `easysales_comenzi` (jsonb), nu in
 *     coloane noi pe `orders`;
 *   - steagurile (`stari.ts`) se tin in `raspuns_brut.steaguri`, ca notificarea sa plece numai la
 *     APARITIA unui steag, nu la fiecare recitire.
 *
 * ⚠ Comenzile preluate in Edinio (`stapan: "edinio"`) nu mai primesc nimic de la easySales.
 */

type Admin = SupabaseClient<Database>;

const COLOANE_RECITIRE = `${COLOANE_LEGATURA}, directie, es_updated_at, awb_viu, awb_la, raspuns_brut, cancel_request, facturi`;

export interface LegaturaRecitita extends LegaturaComenzii {
  /** `iesire` = comanda vitrinei; `intrare` = comanda altui canal, adusa de bucla de stoc (E4). */
  directie: string;
  es_updated_at: string | null;
  awb_viu: string | null;
  awb_la: string | null;
  raspuns_brut: Json | null;
  cancel_request: string | null;
  facturi: Json | null;
}

/**
 * `facturi` are doua parti: `emise`, rescrisa la fiecare recitire din `invoices[]`, si `stornari`,
 * scrisa NUMAI din `storno-invoice-created` (`inbox.ts`). Recitirea pastreaza stornarile.
 */
export function faptulFacturilor(vechi: Json | null, emise: unknown[] | null): Json {
  const v = vechi && typeof vechi === "object" && !Array.isArray(vechi) ? (vechi as Record<string, unknown>) : {};
  return { emise: emise ?? [], stornari: Array.isArray(v.stornari) ? v.stornari : [] } as unknown as Json;
}

const TITLU_STEAG: Readonly<Record<SteagEasySales, string | null>> = {
  cerere_anulare: "Clientul a cerut anularea comenzii în easySales",
  erori: "easySales semnalează o eroare la comandă",
  probabil_retur: "Comandă anulată în easySales după emiterea AWB-ului (probabil retur)",
  retur: "Retur în easySales",
  total_diferit: "Comanda a fost modificată în easySales",
  fara_awb_finalizata: "Comandă finalizată în easySales fără AWB",
  /* Numai jurnal: o eticheta noua la ei nu e treaba comerciantului. */
  stare_necunoscuta: null,
};

const MESAJ_STEAG: Readonly<Record<SteagEasySales, string>> = {
  cerere_anulare: "Anuleaz-o din easySales sau cu butonul „Anulează în easySales” din comanda Edinio.",
  erori: "Deschide comanda în easySales: o operație automată (factură sau AWB) a eșuat acolo.",
  probabil_retur: "Comanda are AWB, deci nu am schimbat-o în Edinio. Verifică returul și stornarea în easySales.",
  retur: "Returul și stornarea se fac în easySales. Repune marfa în stoc din Edinio, dacă e vandabilă.",
  total_diferit: "Totalul din easySales nu mai e cel încasat în Edinio. Banii comenzii din Edinio nu se schimbă.",
  fara_awb_finalizata: "Am trecut-o „În procesare”, nu „Expediată”: fără AWB nu a plecat niciun colet.",
  stare_necunoscuta: "",
};

function steaguriVechi(raspuns: Json | null): Set<string> {
  const s = raspuns && typeof raspuns === "object" && !Array.isArray(raspuns) ? (raspuns as { steaguri?: unknown }).steaguri : null;
  return new Set(Array.isArray(s) ? s.filter((x): x is string => typeof x === "string") : []);
}

function textCerere(v: unknown): string | null {
  if (v == null || v === "" || v === false) return null;
  if (typeof v === "string") return v.slice(0, 500);
  try { return JSON.stringify(v).slice(0, 500); } catch { return "da"; }
}

export async function citesteLegaturaPentruRecitire(
  admin: Admin, businessId: string,
  f: { orderUuid?: string; internalId?: string; esOrderId?: string; directie?: "iesire" | "intrare" },
): Promise<LegaturaRecitita | null> {
  let q = admin.from("easysales_comenzi").select(COLOANE_RECITIRE).eq("business_id", businessId).eq("directie", f.directie ?? "iesire");
  if (f.orderUuid) q = q.eq("order_uuid", f.orderUuid);
  else if (f.internalId) q = q.eq("es_internal_id", f.internalId);
  else if (f.esOrderId) q = q.eq("es_order_id", f.esOrderId);
  else return null;
  const { data, error } = await q.maybeSingle();
  if (error) throw new EroareCitireBaza("easysales.legatura", error.message);
  return (data as unknown as LegaturaRecitita | null) ?? null;
}

/**
 * Aplica in Edinio o comanda citita de la ei.
 *
 * @param opt.updatedAt `updated_at` din banda de lista: un rand mai vechi decat ce s-a scris deja
 *                      nu rescrie nimic (pe drumul webhook, garda e rangul starii).
 */
export async function aplicaComandaLor(
  admin: Admin, ctx: ContextEasySales, leg: LegaturaRecitita, c: ComandaEasySales, opt: { updatedAt?: string | null } = {},
): Promise<RezultatTranzitie> {
  if (leg.stapan !== "easysales" || !leg.order_uuid) return "ok";
  const nou = opt.updatedAt ? Date.parse(opt.updatedAt) : NaN;
  const vechi = leg.es_updated_at ? Date.parse(leg.es_updated_at) : NaN;
  if (Number.isFinite(nou) && Number.isFinite(vechi) && nou < vechi) return "ok";

  const { data: o, error } = await admin.from("orders")
    .select("id, order_number, status, total, payment_status, payment_method")
    .eq("id", leg.order_uuid).eq("business_id", ctx.businessId).maybeSingle();
  if (error) return "reincearca";
  if (!o) return "definitiv";

  const d = decide(c, o.status, Number(o.total) || 0);
  const awburi = awburile(c);
  const viu = d.awbViu;
  const numarViu = viu?.numere[0] ?? null;
  const acum = new Date().toISOString();
  const cerere = textCerere(c.cancel_request);

  const petic: Database["public"]["Tables"]["easysales_comenzi"]["Update"] = {
    es_status_cod: d.cod,
    es_status_text: typeof c.status === "string" ? c.status.slice(0, 60) : d.cod !== null ? STARI_COMANDA[d.cod as keyof typeof STARI_COMANDA] : null,
    es_custom_status: (c.custom_status ?? null) as Json,
    es_livrare_cod: viu?.livrare ?? null,
    awb: awburi as unknown as Json,
    awb_viu: numarViu,
    awb_curier: viu?.curier ?? null,
    awb_la: numarViu && numarViu !== leg.awb_viu ? acum : (numarViu ? leg.awb_la : null),
    facturi: faptulFacturilor(leg.facturi, Array.isArray(c.invoices) ? c.invoices.map((f) => ({ series: f?.series ?? null, number: idText(f?.number), url: f?.URL ?? null, type: f?.type ?? null })) : null),
    erori: (Array.isArray(c.errors) && c.errors.length ? c.errors.slice(0, 10) : null) as Json,
    cancel_request: cerere,
    citita_la: acum,
    ultima_veste_la: acum,
    raspuns_brut: { steaguri: d.steaguri, total_lor: suma(c.total_value) } as unknown as Json,
    ...(Number.isFinite(nou) ? { es_updated_at: new Date(nou).toISOString() } : {}),
  };
  const { error: eScriere } = await admin.from("easysales_comenzi").update(petic).eq("id", leg.id).eq("stapan", "easysales");
  if (eScriere) return "reincearca";

  /* Notificarile: numai steagurile care apar ACUM. */
  const erau = steaguriVechi(leg.raspuns_brut);
  for (const s of d.steaguri) {
    if (erau.has(s)) continue;
    const titlu = TITLU_STEAG[s];
    if (!titlu) {
      await logError({ action: "easysales.stare", severity: "info", businessId: ctx.businessId, message: `stare necunoscuta la ei: ${String(c.status)}`, details: { orderId: o.id } });
      continue;
    }
    await anunta(admin, ctx.businessId, { titlu: `${titlu}: #${o.order_number}`, mesaj: MESAJ_STEAG[s], detalii: { orderId: o.id, steag: s } });
  }

  if (!d.tinta) return "ok";
  const r = await tranzitieComandaMarketplace(admin, {
    orderId: o.id, businessId: ctx.businessId, status: d.tinta, sursa: "easysales", elibereazaStoc: d.elibereazaStoc,
  });
  /*
   * ⚠ Rambursarea GA4 si anuntul „banii nu s-au intors" sunt ale comenzilor VITRINEI. O comanda adusa
   * de pe alt canal (`intrare`) n-a fost raportata in GA4, iar banii ei ii tine marketplace-ul.
   */
  if (r === "ok" && d.tinta === "cancelled" && leg.directie !== "intrare") {
    try {
      const { raporteazaRambursareaGa4 } = await import("@/lib/orders/ga4-comanda");
      await raporteazaRambursareaGa4(o.id, admin);
    } catch (e) {
      await logError({ action: "easysales.ga4", severity: "info", businessId: ctx.businessId, message: (e as Error).message, details: { orderId: o.id } });
    }
    if (o.payment_status === "paid" && o.payment_method !== "cash_on_delivery") {
      await anunta(admin, ctx.businessId, {
        titlu: `Comanda #${o.order_number} a fost anulată în easySales`,
        mesaj: "Comanda era plătită online: banii NU s-au întors automat. Rambursează plata din procesatorul de plăți.",
        severitate: "error", detalii: { orderId: o.id },
      });
    }
  }
  return r;
}

export type RezultatRecitire = "ok" | "reincearca" | "definitiv" | "asteapta_omul";

/** Recitirea unei comenzi trimise, pe `internal_id`. */
export async function recitesteComanda(admin: Admin, ctx: ContextEasySales, orderUuid: string): Promise<RezultatRecitire> {
  const leg = await citesteLegaturaPentruRecitire(admin, ctx.businessId, { orderUuid });
  if (!leg || leg.stapan !== "easysales") return "ok";
  let internalId = leg.es_internal_id;
  if (!internalId) {
    if (!["trimisa", "necunoscuta", "conflict"].includes(leg.stare)) return "ok";
    const g = await gasesteLaEi(ctx, leg.es_order_id);
    if (g.fel === "eroare") return "reincearca";
    if (g.fel === "absenta" || !g.internalId) return "ok";
    internalId = g.internalId;
    await scrieLegatura(admin, leg, [leg.stare], { es_internal_id: internalId, ...(leg.stare === "necunoscuta" ? { stare: "trimisa" } : {}) });
  }
  const r = await citesteComanda(ctx, internalId);
  if (!r.ok) {
    if (r.verdict === "negasit") {
      if (leg.stare !== "conflict") {
        await scrieLegatura(admin, leg, [leg.stare], { motiv: "comanda nu mai exista in easySales" });
        await anunta(admin, ctx.businessId, {
          titlu: "O comandă trimisă nu mai există în easySales",
          mesaj: `Comanda cu id-ul ${leg.es_order_id} nu se mai găsește la ei. Verifică în easySales; dacă a fost ștearsă acolo, o poți prelua în Edinio.`,
          detalii: { orderUuid },
        });
      }
      return "definitiv";
    }
    if (r.verdict === "neautorizat" || r.verdict === "website_token_invalid" || r.verdict === "website_dezactivat" || r.verdict === "scope_lipsa") return "asteapta_omul";
    return "reincearca";
  }
  return aplicaComandaLor(admin, ctx, leg, r.date ?? {});
}

/* ─── Banda de lista ──────────────────────────────────────────────────────── */

/** `YYYY-mm-dd HH:ii:ss` [A: „format: 2020-05-01 00:00:00"], in UTC: cu suprapunerea de 3 ore, nicio interpretare a lor nu lasa o gaura. */
export function dataFiltrului(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

export const SUPRAPUNERE_BANDA_MS = 3 * 3600_000;

/**
 * `updated_at`-ul lor ca ISO, sau `null`. Fara fus scris („2026-10-13 10:00:00"), se citeste UTC: tot
 * ce conteaza e sa fie citit MEREU la fel, fiindca serveste doar la comparatia cu cel scris inainte.
 */
export function clipaLor(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  let t = v.trim().replace(" ", "T");
  if (!/(Z|[+-]\d\d:?\d\d)$/.test(t)) t += "Z";
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export interface RezultatBanda {
  ok: boolean;
  citite: number;
  aplicate: number;
  /** Clipa la care s-a mutat marcajul, sau `null` cand ramane pe loc. */
  marcaj: string | null;
  /** Comenzile care nu sunt ale noastre, cu `updated_at`-ul lor (E4 le reciteste, daca bucla e pornita). */
  externe: { id: string; la: string | null }[];
}

/**
 * `GET /orders?modified_after=<marcaj - 3 h>`, pagina cu pagina (planul, §5.2).
 *
 * ⚠ Marcajul se muta cu `marcajUrmator`: dupa o trecere completa, la clipa de start; dupa una
 * taiata, la cursorul atins (numai daca lista vine in ordinea lui `updated_at`); altfel ramane.
 * Un `reincearca` al unei tranzitii taie trecerea: marcajul nu trece peste o comanda neaplicata.
 *
 * Comenzile care nu sunt ale noastre se intorc in `externe` (E4 le recitește, daca bucla e pornita).
 */
export async function bandaDeLista(
  admin: Admin, ctx: ContextEasySales, p: { runStartMs: number; maxPagini?: number; bugetMs?: number },
): Promise<RezultatBanda> {
  const maxPagini = p.maxPagini ?? 5;
  const bugetMs = p.bugetMs ?? 20_000;
  const start = Date.now();
  const marcajVechi = ctx.cfg.marcaj_comenzi ? Date.parse(ctx.cfg.marcaj_comenzi) : NaN;
  const de_la = Number.isFinite(marcajVechi)
    ? marcajVechi
    : (ctx.cfg.conectat_la ? Date.parse(ctx.cfg.conectat_la) : p.runStartMs - 24 * 3600_000);
  const dupa = dataFiltrului(de_la - SUPRAPUNERE_BANDA_MS);

  let ok = true;
  let citite = 0;
  let aplicate = 0;
  let cursorMs: number | undefined;
  let ordonate = true;
  let ultimulMs = -Infinity;
  const externe: { id: string; la: string | null }[] = [];

  for (let pagina = 1; ; pagina++) {
    if (pagina > maxPagini || Date.now() - start > bugetMs) { ok = false; break; }
    const r = await listaComenzi(ctx, { modified_after: dupa, page: pagina, per_page: 100 });
    if (!r.ok) { ok = false; break; }
    const lista = Array.isArray(r.date) ? r.date : [];
    let taiata = false;
    for (const c of lista) {
      citite++;
      const internalId = idText(c?.internal_id);
      const clipa = clipaLor(c?.updated_at);
      const ms = clipa ? Date.parse(clipa) : NaN;
      if (!Number.isFinite(ms) || ms < ultimulMs) ordonate = false;
      if (Number.isFinite(ms)) ultimulMs = Math.max(ultimulMs, ms);

      let leg = internalId ? await citesteLegaturaPentruRecitire(admin, ctx.businessId, { internalId }) : null;
      if (!leg && !c?.marketplace) {
        const id = idText(c?.id);
        if (id) leg = await citesteLegaturaPentruRecitire(admin, ctx.businessId, { esOrderId: id });
        if (leg && internalId && !leg.es_internal_id) await scrieLegatura(admin, leg, [leg.stare], { es_internal_id: internalId });
      }
      if (!leg) {
        if (internalId) externe.push({ id: internalId, la: clipa });
        continue;
      }
      const rez = await aplicaComandaLor(admin, ctx, leg, c, { updatedAt: clipa });
      if (rez === "reincearca") { taiata = true; break; }
      aplicate++;
      if (Number.isFinite(ms)) cursorMs = ms;
    }
    if (taiata) { ok = false; break; }
    const ultima = Number(r.corp && typeof r.corp === "object" ? (r.corp as { meta?: { last_page?: unknown } }).meta?.last_page : NaN);
    if (!Number.isFinite(ultima) || pagina >= ultima || lista.length === 0) break;
  }

  const urmator = marcajUrmator(
    { ok, cursorMs: ordonate ? cursorMs : undefined },
    { runStartMs: p.runStartMs, overlapMs: 0 },
  );
  let marcaj: string | null = null;
  if (urmator !== null && (!Number.isFinite(marcajVechi) || urmator > marcajVechi)) {
    marcaj = new Date(urmator).toISOString();
    await ctx.dep.peticConfig(ctx.businessId, { marcaj_comenzi: marcaj });
    ctx.cfg.marcaj_comenzi = marcaj;
  } else if (!ok) {
    await logError({
      action: "easysales.banda", severity: "warning", businessId: ctx.businessId,
      message: `banda de comenzi s-a oprit inainte de capat (${citite} citite); marcajul ramane`,
    });
  }
  return { ok, citite, aplicate, marcaj, externe };
}

/**
 * Plasa pe comanda: comenzile trimise, neterminale si fara nicio veste de 24 de ore se pun in coada
 * pentru recitire. Acopera cazul in care `modified_after` nu se misca la AWB, factura sau livrare
 * (M-COM-5). Intoarce cate s-au pus.
 */
export async function plasaPeComanda(admin: Admin, businessId: string, limita = 20): Promise<number> {
  const prag = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await admin.from("easysales_comenzi")
    .select("order_uuid, es_status_cod, es_livrare_cod")
    .eq("business_id", businessId).eq("directie", "iesire").eq("stapan", "easysales").eq("stare", "trimisa")
    .or(`ultima_veste_la.is.null,ultima_veste_la.lt.${prag}`)
    .order("ultima_veste_la", { ascending: true, nullsFirst: true })
    .limit(limita * 3);
  if (error) throw new EroareCitireBaza("easysales.plasa", error.message);
  let puse = 0;
  for (const r of (data ?? []) as { order_uuid: string | null; es_status_cod: number | null; es_livrare_cod: number | null }[]) {
    if (puse >= limita) break;
    if (!r.order_uuid || r.es_status_cod === 0 || r.es_status_cod === 6 || r.es_livrare_cod === 4) continue;
    const { error: e } = await admin.rpc("easysales_pune_in_coada", { p_business: businessId, p_op: "comanda_citeste", p_cheie: r.order_uuid, p_prioritate: 5 });
    if (!e) puse++;
  }
  return puse;
}
