import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import { citesteContul } from "./api";
import type { ContextEasySales } from "./client";
import { idText } from "./numere";
import { anuntaRar } from "./notificari";
import { incarcaContextul } from "./context";

/**
 * Prelucrarea livrarilor din `easysales_webhook_inbox` (planul, §6.1).
 *
 * ⚠ PAYLOAD-UL NU SCHIMBA NIMIC DIRECT. Fiecare eveniment de comanda devine o RECITIRE comasata in
 * coada (`comanda_citeste`), facuta cu tokenul nostru. Exceptiile, si de ce sunt sigure:
 *
 *   - `storno-invoice-created`: datele stornarii se pastreaza ca INFORMATIE AFISATA, pe cheia lor
 *     (serie + numar), numai pe o comanda gasita la noi; nu misca nici stare, nici stoc, nici bani;
 *   - `account-suspended` / `account-activated`: pauza se pune sau se ridica NUMAI dupa recitirea
 *     `GET /account` (un eveniment fals nu poate opri integrarea).
 *
 * Cautarea comenzii, pe fiecare eveniment [A: exemplele de payload; toate comparatiile pe TEXT]:
 *
 *   order-created/updated    `order.internal_id` -> `es_internal_id`, apoi `order.id` -> `es_order_id`
 *   awb-/invoice-created      `order_display_id` -> `es_display_id`, apoi `order_id` -> `es_order_id`
 *   storno-invoice-created   ca la factura
 *   delivery-status-updated  `order.order_display_id` -> `es_display_id`, `order.id` -> NUMAI `es_internal_id`
 */

type Admin = SupabaseClient<Database>;

export interface RandInboxCitit {
  id: string;
  business_id: string;
  slug: string | null;
  corp: unknown;
  semnatura_ok: boolean | null;
  motiv: string | null;
  incercari: number;
}

const COLOANE_INBOX = "id, business_id, slug, corp, semnatura_ok, motiv, incercari";

function obiect(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

type Cautare = { coloana: "es_internal_id" | "es_order_id" | "es_display_id"; valoare: string | null };

async function gasesteComanda(admin: Admin, businessId: string, cautari: Cautare[]): Promise<string | null> {
  for (const c of cautari) {
    if (!c.valoare) continue;
    const { data, error } = await admin.from("easysales_comenzi").select("order_uuid, stapan")
      .eq("business_id", businessId).eq("directie", "iesire").eq(c.coloana, c.valoare).limit(1);
    if (error) throw new EroareCitireBaza("easysales.inbox", error.message);
    const r = (data ?? [])[0] as { order_uuid: string | null; stapan: string } | undefined;
    if (r?.order_uuid) return r.stapan === "easysales" ? r.order_uuid : null;
  }
  return null;
}

async function puneInCoada(admin: Admin, businessId: string, op: string, cheie: string, prioritate: number): Promise<void> {
  const { error } = await admin.rpc("easysales_pune_in_coada", { p_business: businessId, p_op: op, p_cheie: cheie, p_prioritate: prioritate });
  if (error) throw new EroareCitireBaza("easysales.coada", error.message);
}

/** Cheile stornarii, pastrate ca informatie pe legatura (fara date personale). */
const CHEI_STORNO = ["id", "invoice_nr", "invoice_series", "date", "value", "correction_kind", "url", "order_return_id", "order_return_display_id"] as const;

async function pastreazaStornarea(admin: Admin, orderUuid: string, s: Record<string, unknown>): Promise<void> {
  const { data, error } = await admin.from("easysales_comenzi").select("id, facturi").eq("order_uuid", orderUuid).eq("directie", "iesire").maybeSingle();
  if (error) throw new EroareCitireBaza("easysales.storno", error.message);
  if (!data) return;
  const facturi = obiect(data.facturi) ?? {};
  const stornari = Array.isArray(facturi.stornari) ? (facturi.stornari as Record<string, unknown>[]) : [];
  const cheie = `${String(s.invoice_series ?? "")}|${String(s.invoice_nr ?? "")}`;
  if (stornari.some((x) => `${String(x.invoice_series ?? "")}|${String(x.invoice_nr ?? "")}` === cheie)) return;
  const nou: Record<string, unknown> = { anuntata_de_webhook: true };
  for (const k of CHEI_STORNO) if (s[k] !== undefined) nou[k] = s[k];
  const cor = obiect(s.corrected_invoice);
  if (cor) nou.corrected_invoice = { id: cor.id ?? null, invoice_nr: cor.invoice_nr ?? null, invoice_series: cor.invoice_series ?? null, url: cor.url ?? null };
  const { error: e } = await admin.from("easysales_comenzi")
    .update({ facturi: { ...facturi, stornari: [...stornari, nou] } as never }).eq("id", data.id);
  if (e) throw new EroareCitireBaza("easysales.storno", e.message);
}

export type RezultatLivrare = "prelucrata" | "ignorata" | "reincearca";

/** O livrare din inbox, dusa la capat. ⚠ Arunca `EroareCitireBaza` cand baza nu raspunde. */
export async function prelucreazaLivrarea(admin: Admin, ctx: ContextEasySales, rand: RandInboxCitit): Promise<RezultatLivrare> {
  if (rand.motiv === "oprita_impune" || rand.motiv === "corp_necitibil") return "ignorata";
  const corp = obiect(rand.corp);
  const p = obiect(corp?.payload);
  const b = ctx.businessId;

  switch (rand.slug) {
    case "order-created":
    case "order-updated": {
      const o = obiect(p?.order);
      const internalId = idText(o?.internal_id);
      const uuid = await gasesteComanda(admin, b, [
        { coloana: "es_internal_id", valoare: internalId },
        { coloana: "es_order_id", valoare: o?.marketplace ? null : idText(o?.id) },
      ]);
      if (uuid) { await puneInCoada(admin, b, "comanda_citeste", uuid, 2); return "prelucrata"; }
      /* Comanda altui canal: semnal pentru bucla de stoc (E4), numai daca e pornita. */
      if (internalId && ctx.cfg.stoc_activ) { await puneInCoada(admin, b, "extern_citeste", internalId, 3); return "prelucrata"; }
      return "ignorata";
    }
    case "awb-created":
    case "invoice-created":
    case "storno-invoice-created": {
      const x = obiect(rand.slug === "awb-created" ? p?.awb : rand.slug === "invoice-created" ? p?.invoice : p?.storno_invoice);
      const uuid = await gasesteComanda(admin, b, [
        { coloana: "es_display_id", valoare: idText(x?.order_display_id) },
        { coloana: "es_order_id", valoare: idText(x?.order_id) },
        { coloana: "es_internal_id", valoare: idText(x?.order_id) },
      ]);
      if (!uuid) return "ignorata";
      if (rand.slug === "storno-invoice-created" && x) await pastreazaStornarea(admin, uuid, x);
      await puneInCoada(admin, b, "comanda_citeste", uuid, 2);
      return "prelucrata";
    }
    case "delivery-status-updated": {
      const o = obiect(p?.order);
      const uuid = await gasesteComanda(admin, b, [
        { coloana: "es_display_id", valoare: idText(o?.order_display_id) },
        { coloana: "es_internal_id", valoare: idText(o?.id) },
      ]);
      if (!uuid) return "ignorata";
      await puneInCoada(admin, b, "comanda_citeste", uuid, 2);
      return "prelucrata";
    }
    case "account-suspended":
    case "account-activated":
      return verificaContul(admin, ctx, rand.slug);
    case "products-refresh-requested":
    case "stock-refresh-requested": {
      const w = obiect(p?.website);
      if (w?.token_ok !== true) return "ignorata";
      /* Catalogul (E3) si stocul (E4) au cererile lor de reimprospatare; pana atunci, doar semnalul. */
      const op = rand.slug === "stock-refresh-requested" ? "stoc" : "catalog";
      const activ = op === "stoc" ? ctx.cfg.stoc_activ : ctx.cfg.catalog_activ;
      if (!activ) return "ignorata";
      await ctx.dep.peticConfig(b, op === "stoc" ? { reimprospatare_stoc_ceruta_la: new Date().toISOString() } : { reimprospatare_catalog_ceruta_la: new Date().toISOString() });
      return "prelucrata";
    }
    default:
      return "ignorata";
  }
}

/**
 * Evenimentele de cont: pauza sau reluarea se hotarasc dupa `GET /account`, nu dupa payload.
 * `has_active_subscription: false` pune pauza; o citire reusita cu abonament activ o ridica, dar
 * numai pe cea pusa de suspendare (o pauza pusa de om nu se ridica singura).
 */
async function verificaContul(admin: Admin, ctx: ContextEasySales, slug: string): Promise<RezultatLivrare> {
  const r = await citesteContul(ctx);
  if (!r.ok) {
    if (r.verdict === "trecatoare" || r.verdict === "necunoscut") return "reincearca";
    /* Grantul website poate sa nu aiba voie la `/account` (M-AUTH-5): ramane notificarea. */
    await anuntaRar(admin, ctx.dep, ctx.businessId, ctx.cfg, `cont:${slug}`, 3600_000, {
      titlu: slug === "account-suspended" ? "easySales anunță suspendarea contului" : "easySales anunță reactivarea contului",
      mesaj: "Nu am putut verifica starea contului prin API. Verifică abonamentul în easySales.",
    });
    return "prelucrata";
  }
  const d = obiect(r.date) ?? {};
  const activ = d.has_active_subscription;
  if (activ === false) {
    if (!ctx.cfg.pauza) {
      await ctx.dep.peticConfig(ctx.businessId, { pauza: true, pauza_motiv: "Contul easySales nu are abonament activ." });
      await anuntaRar(admin, ctx.dep, ctx.businessId, ctx.cfg, "cont:suspendat", 3600_000, {
        titlu: "Integrarea easySales e în pauză",
        mesaj: "Contul easySales nu mai are abonament activ. Comenzile rămân în coadă și pleacă după reactivare; le poți prelua și în Edinio.",
        severitate: "error",
      });
    }
  } else if (activ === true && ctx.cfg.pauza && ctx.cfg.pauza_motiv === "Contul easySales nu are abonament activ.") {
    await ctx.dep.peticConfig(ctx.businessId, { pauza: false, pauza_motiv: null });
  }
  return "prelucrata";
}

/**
 * Prelucreaza randurile neprelucrate, cel mult `limita`. Folosita de cron si, pe un singur rand,
 * de `after` din ruta. Intoarce cate s-au incheiat.
 */
export async function prelucreazaInboxul(
  admin: Admin, p: { businessId?: string; id?: string; limita?: number },
): Promise<number> {
  let q = admin.from("easysales_webhook_inbox").select(COLOANE_INBOX).is("prelucrat_la", null)
    .or(`urmatoarea_incercare.is.null,urmatoarea_incercare.lte.${new Date().toISOString()}`)
    .order("primit_la", { ascending: true }).limit(p.limita ?? 50);
  if (p.businessId) q = q.eq("business_id", p.businessId);
  if (p.id) q = q.eq("id", p.id);
  const { data, error } = await q;
  if (error) throw new EroareCitireBaza("easysales.inbox", error.message);

  const contexte = new Map<string, Awaited<ReturnType<typeof incarcaContextul>>>();
  let gata = 0;
  for (const rand of (data ?? []) as RandInboxCitit[]) {
    let c = contexte.get(rand.business_id);
    if (!c) { c = await incarcaContextul(admin, rand.business_id, `inbox:${rand.id}`); contexte.set(rand.business_id, c); }
    let rez: RezultatLivrare;
    let eroare: string | null = null;
    if (c.fel === "deconectat") rez = "ignorata";
    else if (c.fel === "eroare") { rez = "reincearca"; eroare = c.mesaj; }
    else {
      try { rez = await prelucreazaLivrarea(admin, c.ctx, rand); } catch (e) { rez = "reincearca"; eroare = (e as Error).message; }
    }
    if (rez === "reincearca") {
      const incercari = rand.incercari + 1;
      await admin.from("easysales_webhook_inbox").update({
        incercari, eroare: eroare?.slice(0, 300) ?? null,
        urmatoarea_incercare: new Date(Date.now() + Math.min(60, 2 ** incercari) * 60_000).toISOString(),
        ...(incercari >= 10 ? { prelucrat_la: new Date().toISOString() } : {}),
      }).eq("id", rand.id);
      if (incercari >= 10) {
        await logError({ action: "easysales.inbox", severity: "error", businessId: rand.business_id, message: `o livrare n-a putut fi prelucrata dupa ${incercari} incercari: ${eroare ?? ""}`, details: { id: rand.id, slug: rand.slug } });
      }
      continue;
    }
    await admin.from("easysales_webhook_inbox").update({
      prelucrat_la: new Date().toISOString(), eroare: rez === "ignorata" ? "ignorata" : null,
    }).eq("id", rand.id);
    gata++;
  }
  return gata;
}
