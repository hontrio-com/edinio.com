"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { esteAdmin } from "@/lib/admin-guard";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { awburiDinRand, coloanelePortii } from "@/lib/orders/awb-propriu";
import { easysalesPermisPentru } from "@/lib/easysales/constante";
import { depozitDinSupabase } from "@/lib/easysales/depozit";
import { incarcaContextul } from "@/lib/easysales/context";
import { conecteazaWebsiteul, deconecteaza, verificaDatele, type AlegereWebsite, type DateConectare } from "@/lib/easysales/conectare";
import { depozitFaraScriere, testeazaConexiunea, type RaportSanatate } from "@/lib/easysales/sanatate";
import { declanseazaAbonarea } from "@/lib/easysales/api";
import { anuleazaLaEi, citesteLegatura, intoarceLaEdinio, scrieLegatura, STARI_NETRIMISE, type LegaturaComenzii } from "@/lib/easysales/comenzi";
import { citesteCanaleleNative, conflicteCanale, mesajConflict } from "@/lib/easysales/exclusivitate";
import { stareaComenzii, stareaPanoului, type StareComandaEasySales, type StareEasySales } from "@/lib/easysales/panou";
import type { CanalDeclarat } from "@/lib/easysales/tipuri";
import type { ContextEasySales } from "@/lib/easysales/client";
import {
  confirmaPreturile, excludeArticolul, opresteCatalogul, pornesteCatalogul, raportulMagazinului, reiaCatalogul,
  retrimiteArticolul, retrimiteTot, salveazaSetarileCatalogului, stareaCatalogului, stareaProdusului,
  type RaportMagazin, type RezultatOm, type SetariCatalogTrimise, type StareCatalog, type StareProdusEasySales,
} from "@/lib/easysales/catalog-actiuni";
import {
  bucla, confirmaStocul, consumaComenzileDinUmbra, opresteBucla, pornesteBucla, stareaBuclei, type StareBuclaPanou,
} from "@/lib/easysales/bucla";

/**
 * Actiunile panoului easySales si ale paginii comenzii.
 *
 * ⚠ FIECARE EXPORT E UN CAPAT HTTP („use server"): primul lucru e garda proprietarului, dupa
 * modelul Trendyol (`trendyol.actions.ts`). Logica sta in `src/lib/easysales/`, unde se probeaza.
 *
 * ⚠ Browserul nu primeste niciodata configurarea: numai `StareEasySales`, construita pe server.
 */

const CALEA = "/dashboard/features/easysales";

async function garda(businessId: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (!data) return { error: "Magazin negăsit" };
  return { userId: user.id };
}

/** `EASYSALES_LIVE=false` stinge conectarile noi; trec magazinele pilot si administratorii. */
async function deschisa(businessId: string): Promise<boolean> {
  return easysalesPermisPentru(businessId) || (await esteAdmin());
}

export async function getEasySalesStatus(businessId: string): Promise<StareEasySales | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  try {
    const s = await stareaPanoului(createAdminClient(), businessId);
    /*
     * ⚠ Administratorii trec si cu comutatorul de lansare stins, ca in hub si in actiunile de
     * conectare (`deschisa`): altfel cardul s-ar deschide, dar pagina ar spune „nu e inca deschisa".
     */
    return s.disponibila ? s : { ...s, disponibila: await esteAdmin() };
  } catch (e) {
    await logError({ action: "easysales.stare", severity: "warning", businessId, message: (e as Error).message });
    return { error: "Starea integrării nu s-a putut citi. Reîncarcă pagina." };
  }
}

export async function verificaDateleEasySales(businessId: string, date: DateConectare) {
  const g = await garda(businessId);
  if ("error" in g) return g;
  if (!(await deschisa(businessId))) return { error: "Integrarea easySales nu este disponibilă momentan." };
  if (!(await consumaLimita(`easysales-conectare:${businessId}`, 10, 3600)).permis) {
    return { error: "Prea multe încercări de conectare. Încearcă din nou peste o oră." };
  }
  const r = await verificaDatele(createAdminClient(), businessId, {
    client_id: String(date?.client_id ?? ""), client_secret: String(date?.client_secret ?? ""), website_token: String(date?.website_token ?? ""),
  });
  revalidatePath(CALEA);
  return r.ok ? r : { error: r.eroare };
}

export async function conecteazaEasySales(businessId: string, alegere: AlegereWebsite) {
  const g = await garda(businessId);
  if ("error" in g) return g;
  if (!(await deschisa(businessId))) return { error: "Integrarea easySales nu este disponibilă momentan." };
  const r = await conecteazaWebsiteul(createAdminClient(), businessId, {
    website_nume: String(alegere?.website_nume ?? ""),
    canale: Array.isArray(alegere?.canale) ? alegere.canale.slice(0, 30) : [],
    bife: {
      sursaStocWebsite: alegere?.bife?.sursaStocWebsite === true,
      clientDedicat: alegere?.bife?.clientDedicat === true,
      websiteInRon: alegere?.bife?.websiteInRon === true,
      statusCustomGol: alegere?.bife?.statusCustomGol === true,
    },
  });
  revalidatePath(CALEA);
  return r.ok ? { ok: true as const, abonari: r.abonari } : { error: r.eroare };
}

/** „Testeaza conexiunea": fara emitere de token si fara nicio scriere (`depozitFaraScriere`). */
export async function testeazaConexiuneaEasySales(businessId: string): Promise<RaportSanatate | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const dep = depozitDinSupabase(admin);
  let cfg;
  try { cfg = await dep.citesteConfig(businessId); } catch { return { error: "Configurarea nu s-a putut citi. Încearcă din nou." }; }
  if (!cfg.access_token) return { error: "Nu există încă o conexiune de testat." };
  const { data: biz } = await admin.from("businesses").select("cui").eq("id", businessId).maybeSingle();
  return testeazaConexiunea({ dep: depozitFaraScriere(dep), businessId, cfg, faraEmitere: true }, (biz as { cui?: string | null } | null)?.cui ?? null);
}

/** „Trimite un eveniment de proba": declanseaza abonarea `order-updated`; dovada e randul din inbox. */
export async function trimiteEvenimentDeProbaEasySales(businessId: string): Promise<{ ok: true; trimisLa: string } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const c = await incarcaContextul(createAdminClient(), businessId, "proba-webhook");
  if (c.fel !== "gata") return { error: "Integrarea nu e conectată." };
  const id = c.ctx.cfg.abonari?.["order-updated"];
  if (!id) return { error: "Abonarea la evenimentele de comandă lipsește. Testează conexiunea: abonările se refac zilnic." };
  const trimisLa = new Date().toISOString();
  const r = await declanseazaAbonarea(c.ctx, id);
  return r.ok ? { ok: true, trimisLa } : { error: r.mesaj || "easySales n-a primit cererea." };
}

/** A sosit vreo livrare dupa clipa data? Panoul intreaba dupa „Trimite un eveniment de proba". */
export async function aSositLivrareaEasySales(businessId: string, dupa: string): Promise<{ sosita: boolean; semnaturaOk: boolean | null } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const { data } = await createAdminClient().from("easysales_webhook_inbox").select("semnatura_ok")
    .eq("business_id", businessId).gte("primit_la", dupa).order("primit_la", { ascending: false }).limit(1);
  const r = (data ?? [])[0] as { semnatura_ok: boolean | null } | undefined;
  return { sosita: !!r, semnaturaOk: r?.semnatura_ok ?? null };
}

/**
 * Comutatorul comenzilor. Stins (fara deconectare): stampila nu se mai pune, iar comenzile
 * stampilate si netrimise trec la Edinio, cu notificare (planul, §4.8). Cele trimise raman la ei.
 */
export async function seteazaComenzileEasySales(businessId: string, active: boolean): Promise<{ ok: true; intoarse: number } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const c = await incarcaContextul(admin, businessId, "comutator");
  if (c.fel !== "gata") return { error: "Integrarea nu e conectată." };
  if (active && (c.ctx.cfg.needs_reconnect || !c.ctx.cfg.website_nume)) return { error: "Reconectează întâi integrarea." };
  if (!(await c.ctx.dep.peticConfig(businessId, { comenzi_active: active }))) return { error: "Setarea nu s-a putut salva." };
  c.ctx.cfg.comenzi_active = active;
  let intoarse = 0;
  if (!active) {
    const { data } = await admin.from("easysales_comenzi")
      .select("id, business_id, order_id, order_uuid, es_order_id, es_internal_id, es_display_id, stapan, stare, motiv, incercari, trimisa_la, created_at, es_anulata_la, es_status_cod")
      .eq("business_id", businessId).eq("directie", "iesire").eq("stapan", "easysales").in("stare", ["asteapta_plata", "de_trimis"]);
    for (const leg of (data ?? []) as LegaturaComenzii[]) {
      if ((await intoarceLaEdinio(admin, c.ctx, leg, "trimiterea comenzilor în easySales a fost oprită", { faraDovada: !leg.trimisa_la })) === "intoarsa") intoarse++;
    }
  }
  revalidatePath(CALEA);
  return { ok: true, intoarse };
}

export async function salveazaSetarileEasySales(
  businessId: string, s: { serie_facturi?: string; varianta_total?: "incasat" | "definitie"; canale?: CanalDeclarat[] },
): Promise<{ ok: true } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const petic: Record<string, unknown> = {};
  if (typeof s?.serie_facturi === "string") petic.serie_facturi = s.serie_facturi.trim().slice(0, 20);
  if (s?.varianta_total === "incasat" || s?.varianta_total === "definitie") petic.varianta_total = s.varianta_total;
  if (Array.isArray(s?.canale)) {
    const canale = s.canale.slice(0, 30)
      .filter((x) => x && typeof x.canal === "string" && /^[a-z]{2,12}$/.test(x.canal))
      .map((x) => ({ canal: x.canal, tara: String(x.tara || "ro").toLowerCase().slice(0, 2) }));
    try {
      const conflicte = conflicteCanale(canale, await citesteCanaleleNative(admin, businessId));
      if (conflicte.length) return { error: mesajConflict(conflicte) };
    } catch {
      return { error: "Nu am putut verifica integrările directe. Încearcă din nou." };
    }
    petic.canale = canale;
  }
  if (!(await depozitDinSupabase(admin).peticConfig(businessId, petic))) return { error: "Setările nu s-au putut salva." };
  revalidatePath(CALEA);
  return { ok: true };
}

/**
 * D20: cu bucla de stoc pornita, o oprire planificata (pauza, deconectarea) pune INTAI stocul pe 0 la
 * ei, verificat pe SKU. Altfel marfa ar ramane de vanzare pe marketplace-uri, fara ca vanzarile de
 * acolo sa mai scada stocul din Edinio. `null` = se poate merge mai departe.
 */
async function stoculPeZeroInainte(businessId: string, ce: string): Promise<{ error: string } | null> {
  const admin = createAdminClient();
  const c = await incarcaContextul(admin, businessId, "oprire");
  if (c.fel !== "gata" || !bucla(c.ctx.cfg)) return null;
  const r = await opresteBucla(admin, c.ctx);
  return r.ok ? null : { error: `${ce} s-a oprit: ${r.eroare}` };
}

/** Pauza pusa de om: nimic nu mai pleaca spre easySales; citirile si inboxul continua. */
export async function pauzaEasySales(businessId: string, pauza: boolean): Promise<{ ok: true } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  if (pauza) {
    const z = await stoculPeZeroInainte(businessId, "Pauza");
    if (z) return z;
  }
  const ok = await depozitDinSupabase(createAdminClient()).peticConfig(businessId, pauza
    ? { pauza: true, pauza_motiv: "Pusă în pauză din Edinio." }
    : { pauza: false, pauza_motiv: null });
  revalidatePath(CALEA);
  return ok ? { ok: true } : { error: "Setarea nu s-a putut salva." };
}

export async function deconecteazaEasySales(businessId: string): Promise<{ ok: true; intoarse: number; abonariRamase: number } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const c = await incarcaContextul(admin, businessId, "deconectare");
  if (c.fel === "eroare") return { error: "Configurarea nu s-a putut citi. Încearcă din nou." };
  if (c.fel === "deconectat") return { ok: true, intoarse: 0, abonariRamase: 0 };
  const z = await stoculPeZeroInainte(businessId, "Deconectarea");
  if (z) return z;
  const r = await deconecteaza(admin, c.ctx);
  revalidatePath(CALEA);
  return { ok: true, ...r };
}

/* ─── Comenzile deschise dinaintea activarii ──────────────────────────────── */

const COLOANE_DESCHISE = `id, order_source, status, smartbill_invoice_number, oblio_invoice_number, fgo_invoice_number, ${coloanelePortii().join(", ")}`;

async function comenzileDeschise(businessId: string, zile: number): Promise<string[] | { error: string }> {
  const z = Math.max(1, Math.min(30, Math.floor(Number(zile) || 7)));
  const { data, error } = await createAdminClient().from("orders").select(COLOANE_DESCHISE)
    .eq("business_id", businessId).in("status", ["pending", "confirmed", "processing"])
    .gte("created_at", new Date(Date.now() - z * 24 * 3600_000).toISOString()).limit(500);
  if (error) return { error: "Comenzile nu s-au putut citi." };
  return ((data ?? []) as unknown as Record<string, unknown>[]).filter((o) => {
    const src = o.order_source as Record<string, unknown> | null;
    if (src && typeof src === "object" && ("easysales" in src || (typeof src.marketplace === "string" && src.marketplace))) return false;
    if (o.smartbill_invoice_number || o.oblio_invoice_number || o.fgo_invoice_number) return false;
    return Object.values(awburiDinRand(o)).every((v) => !v);
  }).map((o) => String(o.id));
}

/** Cate comenzi deschise ar pleca (fara factura si fara AWB Edinio). Panoul o arata INAINTE. */
export async function numaraComenzileDeschiseEasySales(businessId: string, zile: number): Promise<{ cate: number } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const r = await comenzileDeschise(businessId, zile);
  return Array.isArray(r) ? { cate: r.length } : r;
}

export async function trimiteComenzileDeschiseEasySales(businessId: string, zile: number): Promise<{ trimise: number; sarite: number } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const ids = await comenzileDeschise(businessId, zile);
  if (!Array.isArray(ids)) return ids;
  const admin = createAdminClient();
  let trimise = 0;
  let sarite = 0;
  for (const id of ids) {
    const { data, error } = await admin.rpc("easysales_stampileaza_existenta", { p_business: businessId, p_order: id });
    if (!error && data === "stampilata") trimise++;
    else sarite++;
  }
  revalidatePath(CALEA);
  return { trimise, sarite };
}

/* ─── Pe comanda ──────────────────────────────────────────────────────────── */

export async function stareaEasySalesAComenzii(businessId: string, orderId: string): Promise<StareComandaEasySales | null | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  return stareaComenzii(createAdminClient(), businessId, orderId);
}

/**
 * „Preia in Edinio". Netrimisa: trece imediat. Trimisa: cere confirmarea omului si se anuleaza
 * INTAI la ei (numai New/Received, fara AWB); abia apoi stampila devine `stapan: "edinio"`.
 */
export async function preiaInEdinioEasySales(businessId: string, orderId: string, confirmat: boolean): Promise<{ ok: true } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const c = await incarcaContextul(admin, businessId, "preia");
  let leg: LegaturaComenzii | null;
  try { leg = await citesteLegatura(admin, businessId, orderId); } catch { return { error: "Legătura comenzii nu s-a putut citi." }; }
  if (!leg || leg.stapan !== "easysales") return { error: "Comanda nu se procesează în easySales." };

  if ((STARI_NETRIMISE as readonly string[]).includes(leg.stare)) {
    if (c.fel !== "gata" && leg.trimisa_la) return { error: "Integrarea nu e conectată, iar comanda trebuie verificată întâi în easySales." };
    const r = c.fel === "gata"
      ? await intoarceLaEdinio(admin, c.ctx, leg, "preluată de tine în Edinio", { faraDovada: !leg.trimisa_la })
      : (await admin.rpc("easysales_schimba_stapanul", { p_business: businessId, p_order: orderId, p_stapan: "edinio" })).error ? "reincearca" : "intoarsa";
    if (r === "conflict") return { error: "Comanda există deja în easySales. Verifică-o acolo." };
    if (r !== "intoarsa") return { error: "Nu am putut prelua comanda acum. Încearcă din nou." };
    revalidatePath(`/dashboard/orders/${orderId}`);
    return { ok: true };
  }

  if (!confirmat) return { error: "Comanda e deja în easySales. Confirmă că vrei s-o anulezi acolo și s-o procesezi din Edinio." };
  if (c.fel !== "gata") return { error: "Integrarea nu e conectată." };
  if (!leg.es_anulata_la) {
    const a = await anuleazaLaEi(admin, c.ctx, orderId, "Preluată în magazin.");
    if (a.fel !== "anulata" && !(a.fel === "nimic" && /deja anulata/.test(a.motiv))) {
      return { error: a.fel === "refuz" ? `easySales n-a anulat comanda: ${a.mesaj}` : "Nu am putut anula comanda în easySales acum. Încearcă din nou." };
    }
  }
  const { data, error } = await admin.rpc("easysales_schimba_stapanul", { p_business: businessId, p_order: orderId, p_stapan: "edinio" });
  if (error || data !== true) return { error: "Comanda s-a anulat în easySales, dar n-am putut-o prelua în Edinio. Încearcă din nou." };
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true };
}

/** „Anuleaza in easySales": intai la ei, apoi local (stocul se elibereaza), apoi GA4. */
export async function anuleazaInEasySales(businessId: string, orderId: string): Promise<{ ok: true } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const c = await incarcaContextul(admin, businessId, "anulare");
  if (c.fel !== "gata") return { error: "Integrarea nu e conectată." };
  const a = await anuleazaLaEi(admin, c.ctx, orderId, "Anulată din magazin.");
  if (a.fel === "refuz") return { error: `easySales n-a anulat comanda: ${a.mesaj}` };
  if (a.fel === "reincearca" || a.fel === "asteapta_omul") return { error: "Nu am putut anula comanda în easySales acum. Încearcă din nou." };
  if (a.fel === "nimic" && !/deja anulata/.test(a.motiv)) return { error: "Comanda nu e în easySales." };
  const r = await tranzitieComandaMarketplace(admin, { orderId, businessId, status: "cancelled", sursa: "easysales", elibereazaStoc: true });
  if (r !== "ok") return { error: "Comanda s-a anulat în easySales, dar starea din Edinio nu s-a putut schimba. Reîncarcă pagina." };
  try {
    const { raporteazaRambursareaGa4 } = await import("@/lib/orders/ga4-comanda");
    await raporteazaRambursareaGa4(orderId, admin);
  } catch { /* GA4 nu opreste anularea */ }
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true };
}

/** „Reia": dupa marirea planului lor, sau dupa ce omul a corectat comanda respinsa la noi. */
export async function reiaTrimitereaEasySales(businessId: string, orderId: string): Promise<{ ok: true } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  let leg: LegaturaComenzii | null;
  try { leg = await citesteLegatura(admin, businessId, orderId); } catch { return { error: "Legătura comenzii nu s-a putut citi." }; }
  if (!leg || leg.stapan !== "easysales") return { error: "Comanda nu se procesează în easySales." };
  if (!(await scrieLegatura(admin, leg, ["blocata_plafon", "respinsa_local", "abandonata"], { stare: "de_trimis", motiv: null, incercari: 0 }))) {
    return { error: "Comanda nu mai e în starea de reluat." };
  }
  await admin.rpc("easysales_pune_in_coada", { p_business: businessId, p_op: "comanda_trimite", p_cheie: orderId, p_prioritate: 1 });
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true };
}

// ── Catalogul (E3) ──────────────────────────────────────────────────────────
//
// ⚠ Trimiterea catalogului e oprita in cod pana dupa E0 (`CATALOG_PORNIT`); actiunile o spun omului.
// Raportul de pregatire merge de acum: citeste numai tabele care exista si pe productie.

/** Raportul de pregatire, pe motive. Greu pe magazinele mari: cel mult 6 pe ora. */
export async function raportulCataloguluiEasySales(businessId: string): Promise<RaportMagazin | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  if (!(await consumaLimita(`easysales-raport:${businessId}`, 6, 3600)).permis) {
    return { error: "Raportul s-a calculat de prea multe ori în ultima oră. Încearcă din nou mai târziu." };
  }
  const admin = createAdminClient();
  try {
    const cfg = await depozitDinSupabase(admin).citesteConfig(businessId);
    return await raportulMagazinului(admin, businessId, cfg);
  } catch (e) {
    await logError({ action: "easysales.raport", severity: "warning", businessId, message: (e as Error).message });
    return { error: "Raportul nu s-a putut calcula. Încearcă din nou." };
  }
}

export async function stareaCataloguluiEasySales(businessId: string): Promise<StareCatalog | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  try {
    return await stareaCatalogului(admin, businessId, await depozitDinSupabase(admin).citesteConfig(businessId));
  } catch (e) {
    await logError({ action: "easysales.catalog", severity: "warning", businessId, message: (e as Error).message });
    return { error: "Starea catalogului nu s-a putut citi." };
  }
}

/** Una dintre operatiile omului pe catalog, cu contextul magazinului conectat. */
async function peCatalog(
  businessId: string, fa: (admin: ReturnType<typeof createAdminClient>, ctx: ContextEasySales) => Promise<RezultatOm>,
): Promise<{ ok: true; mesaj?: string } | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const c = await incarcaContextul(admin, businessId, "panou");
  if (c.fel === "deconectat") return { error: "Conectează întâi contul easySales." };
  if (c.fel === "eroare") return { error: "Configurarea nu s-a putut citi. Reîncarcă pagina." };
  try {
    const r = await fa(admin, c.ctx);
    revalidatePath(CALEA);
    return r.ok ? { ok: true, mesaj: r.mesaj } : { error: r.eroare };
  } catch (e) {
    await logError({ action: "easysales.catalog", severity: "warning", businessId, message: (e as Error).message });
    return { error: "Operația nu s-a putut face. Încearcă din nou." };
  }
}

export async function pornesteCatalogulEasySales(businessId: string) {
  return peCatalog(businessId, pornesteCatalogul);
}
export async function opresteCatalogulEasySales(businessId: string) {
  return peCatalog(businessId, opresteCatalogul);
}
export async function reiaCatalogulEasySales(businessId: string) {
  return peCatalog(businessId, reiaCatalogul);
}
export async function retrimiteCatalogulEasySales(businessId: string) {
  return peCatalog(businessId, retrimiteTot);
}
export async function confirmaPreturileEasySales(businessId: string) {
  return peCatalog(businessId, confirmaPreturile);
}
export async function retrimiteArticolulEasySales(businessId: string, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "Articol invalid." };
  return peCatalog(businessId, (admin, ctx) => retrimiteArticolul(admin, ctx, id));
}
export async function excludeArticolulEasySales(businessId: string, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "Articol invalid." };
  return peCatalog(businessId, (admin, ctx) => excludeArticolul(admin, ctx, id));
}
export async function salveazaSetarileCataloguluiEasySales(businessId: string, s: SetariCatalogTrimise) {
  return peCatalog(businessId, async (_admin, ctx) => salveazaSetarileCatalogului(ctx, s));
}

/** Starea easySales a unui produs, pentru pagina lui. `null` = integrarea nu e conectata. */
export async function stareaEasySalesAProdusului(businessId: string, productId: string): Promise<StareProdusEasySales | null | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  try {
    const cfg = await depozitDinSupabase(admin).citesteConfig(businessId);
    if (!cfg.connected) return null;
    return await stareaProdusului(admin, businessId, productId, cfg);
  } catch (e) {
    await logError({ action: "easysales.produs", severity: "warning", businessId, message: (e as Error).message });
    return { error: "Starea easySales a produsului nu s-a putut citi." };
  }
}

// ── Bucla de stoc (E4) ──────────────────────────────────────────────────────
//
// ⚠ Oprita in cod pana dupa E0 si M-STOC-1 (`STOC_PORNIT`, `FORMULA_STOC`); actiunile o spun omului.

export async function stareaBucleiEasySales(businessId: string): Promise<StareBuclaPanou | { error: string }> {
  const g = await garda(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  try {
    return await stareaBuclei(admin, businessId, await depozitDinSupabase(admin).citesteConfig(businessId));
  } catch (e) {
    await logError({ action: "easysales.bucla", severity: "warning", businessId, message: (e as Error).message });
    return { error: "Starea sincronizării stocului nu s-a putut citi." };
  }
}

export async function pornesteBuclaEasySales(businessId: string, mod: "umbra" | "canar" | "efect", canar: string[]) {
  if (mod !== "umbra" && mod !== "canar" && mod !== "efect") return { error: "Mod necunoscut." };
  const lista = Array.isArray(canar) ? canar.filter((s) => typeof s === "string").map((s) => s.slice(0, 120)).slice(0, 20) : [];
  return peCatalog(businessId, async (admin, ctx) => {
    const r = await pornesteBucla(admin, ctx, mod, lista);
    return r.ok ? { ok: true, mesaj: r.mesaj } : { ok: false, eroare: r.eroare };
  });
}
export async function opresteBuclaEasySales(businessId: string) {
  return peCatalog(businessId, async (admin, ctx) => {
    const r = await opresteBucla(admin, ctx);
    return r.ok ? { ok: true, mesaj: r.mesaj } : { ok: false, eroare: r.eroare };
  });
}
export async function confirmaStoculEasySales(businessId: string) {
  return peCatalog(businessId, async (_admin, ctx) => {
    const r = await confirmaStocul(ctx);
    return r.ok ? { ok: true, mesaj: r.mesaj } : { ok: false, eroare: r.eroare };
  });
}
export async function consumaComenzileDinUmbraEasySales(businessId: string) {
  return peCatalog(businessId, async (admin, ctx) => {
    const r = await consumaComenzileDinUmbra(admin, ctx);
    return r.ok ? { ok: true, mesaj: r.mesaj } : { ok: false, eroare: r.eroare };
  });
}
