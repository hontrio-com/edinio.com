import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import * as api from "./api";
import type { ContextEasySales } from "./client";
import { RETRIMITERE_DUPA_MS } from "./constante";
import { anunta } from "./notificari";
import { idText } from "./numere";

/**
 * Verificarea catalogului: ce a ajuns la ei, citit din lista lor (planul, §5.4.5, pasul 3).
 *
 * ═══ UN LOT TERMINAT NU INSEAMNA REUSITA ═══
 *
 * `products/save/bulk` raspunde `data: null` [A]. Ce a intrat se afla numai citind
 * `GET /products?website=<nume>&page=N` (50 pe pagina [A]) si legand fiecare produs de randul nostru
 * pe DOI martori: `product_website_id` (id-ul randului) SI `sku`. Un singur martor ar putea lega un
 * produs al altui website al contului, cu acelasi SKU.
 *
 * ═══ ⚠ FILTRUL `?website=` NU E DOCUMENTAT (M-PROD-7) ═══
 *
 * Poate fi strict, partial sau ignorat. Deci fiecare produs citit se refiltreaza aici pe
 * `website.name` exact. Iar daca omul redenumeste website-ul in easySales, filtrul cu numele vechi
 * da zero: o verificare naiva ar declara tot catalogul disparut si l-ar retrimite element cu element
 * (la esafero, zeci de mii de Save-uri). De aceea:
 *
 *   - inaintea oricarei treceri complete, numele trebuie sa fie inca in `GET /websites/list`;
 *     altfel catalogul intra in pauza si omul e anuntat (`websiteulExista`);
 *   - o trecere completa care nu vede NIMIC, sau care ar declara disparute peste 30% din
 *     articolele confirmate, nu declara nimic disparut: opreste catalogul si cere omul.
 *
 * ═══ CE SE FACE CU CE LIPSESTE ═══
 *
 *   `trimis`, nevazut dupa 15 minute   se retrimite O DATA (Save pe element), apoi `respins`;
 *   `confirmat`, nevazut               lipsa se noteaza; abia a doua trecere completa la rand il face
 *                                      `disparut`, iar `disparut` nu se recreeaza singur.
 */

type Admin = SupabaseClient<Database>;
type Job = Database["public"]["Tables"]["easysales_joburi"]["Row"];

const MINUT = 60_000;
/** Pana la atatea articole `trimis`, se verifica fiecare cu `?sku=`; peste, o trecere completa. */
const TINTIT_PANA_LA = 20;
/** O trecere care ar declara disparute peste atat din articolele confirmate e suspecta. */
const PRAG_DISPARUTE = 0.3;

export type ExistaWebsite = "da" | "nu" | "necunoscut";

/** Numele website-ului nostru e inca in lista lor? */
export async function websiteulExista(ctx: ContextEasySales): Promise<ExistaWebsite> {
  const nume = (ctx.cfg.website_nume ?? "").trim();
  if (!nume) return "necunoscut";
  const r = await api.listaWebsiteuri(ctx);
  if (!r.ok) return "necunoscut";
  const lista = Array.isArray(r.date) ? r.date : [];
  return lista.some((w) => (w?.name ?? "").trim() === nume) ? "da" : "nu";
}

/** Pauza „website redenumit", cu anuntul. */
export async function pauzaWebsiteRedenumit(admin: Admin, ctx: ContextEasySales): Promise<void> {
  if (ctx.cfg.catalog_pauza === "website-redenumit") return;
  await ctx.dep.peticConfig(ctx.businessId, { catalog_pauza: "website-redenumit" });
  ctx.cfg.catalog_pauza = "website-redenumit";
  await anunta(admin, ctx.businessId, {
    titlu: "Website-ul Edinio nu mai apare în easySales",
    mesaj: `Nu mai găsim website-ul „${ctx.cfg.website_nume ?? ""}” în easySales (poate a fost redenumit sau șters). Am oprit catalogul, ca să nu retrimitem toate produsele. Verifică în easySales, apoi apasă „Reia catalogul” în Edinio.`,
    severitate: "error",
  });
}

interface ProdusCitit {
  id?: unknown;
  sku?: unknown;
  stock?: unknown;
  product_website_id?: unknown;
  website?: { name?: unknown } | null;
}

/** Produsele citite care sunt chiar ale website-ului nostru (refiltrarea locala, M-PROD-7). */
function aleNoastre(lista: unknown, nume: string): ProdusCitit[] {
  return (Array.isArray(lista) ? (lista as ProdusCitit[]) : [])
    .filter((p) => typeof p?.website?.name === "string" ? (p.website.name as string).trim() === nume : false);
}

/**
 * Leaga produsele citite de randurile noastre, pe ambii martori, si le marcheaza vazute.
 * Intoarce cate s-au legat.
 */
async function noteazaVazute(admin: Admin, businessId: string, produse: ProdusCitit[]): Promise<number> {
  const ids = [...new Set(produse.map((p) => Number(idText(p.product_website_id))).filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (ids.length === 0) return 0;
  const { data, error } = await admin.from("easysales_produse").select("id, sku_trimis, stare, es_product_id, confirmat_la")
    .eq("business_id", businessId).in("id", ids);
  if (error) throw new EroareCitireBaza("easysales.verificare", error.message);
  const randuri = new Map(((data ?? []) as { id: number; sku_trimis: string | null; stare: string; es_product_id: string | null; confirmat_la: string | null }[])
    .map((r) => [Number(r.id), r]));
  const acum = new Date().toISOString();
  let legate = 0;
  for (const p of produse) {
    const r = randuri.get(Number(idText(p.product_website_id)));
    if (!r || !r.sku_trimis || String(p.sku ?? "").toLowerCase() !== r.sku_trimis.toLowerCase()) continue;
    legate++;
    const esId = idText(p.id);
    const petic: Database["public"]["Tables"]["easysales_produse"]["Update"] = { verificat_la: acum, lipsa_la: null, updated_at: acum };
    /* Stocul de la ei, pentru deriva (E4): se compara cu ce am trimite (`bucla.ts`, `pasulDerivei`). */
    const stoc = Number(p.stock);
    if (Number.isFinite(stoc)) { petic.stoc_la_ei = Math.floor(stoc); petic.stoc_la_ei_la = acum; }
    if (esId && esId !== r.es_product_id) petic.es_product_id = esId;
    if (r.stare === "trimis" || r.stare === "disparut") {
      petic.stare = "confirmat";
      petic.confirmat_la = r.confirmat_la ?? acum;
      petic.motiv = null;
    }
    const { error: e } = await admin.from("easysales_produse").update(petic).eq("id", r.id);
    if (e) throw new EroareCitireBaza("easysales.verificare", e.message);
  }
  return legate;
}

/**
 * Un articol `trimis` nevazut: retrimis o data (amprenta stearsa + coada), apoi `respins`.
 * ⚠ Retrimiterea in masa trece intai prin paza website-ului (apelantul).
 */
async function nevazut(admin: Admin, businessId: string, r: { id: number; product_uuid: string; retrimis_la: string | null }): Promise<void> {
  const acum = new Date().toISOString();
  if (!r.retrimis_la) {
    await admin.from("easysales_produse").update({ amprenta: null, retrimis_la: acum, updated_at: acum }).eq("id", r.id);
    await admin.rpc("easysales_pune_in_coada", { p_business: businessId, p_op: "articol_continut", p_cheie: r.product_uuid, p_prioritate: 5 });
    return;
  }
  await admin.from("easysales_produse").update({
    stare: "respins", motiv: "Produsul nu apare în easySales nici după retrimitere. Verifică lista de produse a website-ului în easySales.", updated_at: acum,
  }).eq("id", r.id);
}

/** Verificarea tintita: cateva articole `trimis`, fiecare cu `?sku=`. */
async function verificaTintit(admin: Admin, ctx: ContextEasySales, randuri: { id: number; product_uuid: string; sku_trimis: string | null; trimis_la: string | null; retrimis_la: string | null }[], maiAreTimp: () => boolean): Promise<void> {
  const nume = (ctx.cfg.website_nume ?? "").trim();
  for (const r of randuri) {
    if (!maiAreTimp() || !r.sku_trimis) return;
    const raspuns = await api.listaProduse(ctx, { sku: r.sku_trimis, website: nume });
    if (!raspuns.ok) return;
    const legate = await noteazaVazute(admin, ctx.businessId, aleNoastre(raspuns.date, nume));
    if (legate > 0) continue;
    const trimisLa = r.trimis_la ? Date.parse(r.trimis_la) : 0;
    if (Date.now() - trimisLa > RETRIMITERE_DUPA_MS) await nevazut(admin, ctx.businessId, r);
  }
}

async function jobulViu(admin: Admin, businessId: string): Promise<Job | null> {
  const { data, error } = await admin.from("easysales_joburi").select("*")
    .eq("business_id", businessId).eq("fel", "verificare").eq("stare", "in_lucru").maybeSingle();
  if (error) throw new EroareCitireBaza("easysales.joburi", error.message);
  return (data as Job | null) ?? null;
}

/** Porneste o trecere completa, daca nu e deja una. Intoarce jobul viu. */
export async function pornesteVerificarea(admin: Admin, businessId: string): Promise<Job | null> {
  const viu = await jobulViu(admin, businessId);
  if (viu) return viu;
  const { error } = await admin.from("easysales_joburi").insert({ business_id: businessId, fel: "verificare" });
  /* 23505: alt fir l-a pornit intre timp (indexul unic pe jobul viu). */
  if (error && error.code !== "23505") throw new EroareCitireBaza("easysales.joburi", error.message);
  return jobulViu(admin, businessId);
}

/** Inchide trecerea completa: ce n-a fost vazut. */
async function inchideTrecerea(admin: Admin, ctx: ContextEasySales, job: Job): Promise<void> {
  const b = ctx.businessId;
  const acum = new Date().toISOString();
  const vazute = Number((job.contoare as { vazute?: unknown } | null)?.vazute ?? 0);
  const { count: confirmate, error: e1 } = await admin.from("easysales_produse").select("id", { count: "exact", head: true })
    .eq("business_id", b).eq("stare", "confirmat");
  if (e1) throw new EroareCitireBaza("easysales.verificare", e1.message);
  const { data: lipsa, error: e2 } = await admin.from("easysales_produse").select("id, lipsa_la")
    .eq("business_id", b).eq("stare", "confirmat").or(`verificat_la.is.null,verificat_la.lt."${job.pornit_la}"`).limit(5000);
  if (e2) throw new EroareCitireBaza("easysales.verificare", e2.message);
  const absente = (lipsa ?? []) as { id: number; lipsa_la: string | null }[];

  /* Paza: o trecere care nu vede nimic, sau care ar sterge o treime din catalog, nu declara nimic. */
  if ((confirmate ?? 0) > 0 && (vazute === 0 || absente.length > PRAG_DISPARUTE * (confirmate ?? 0))) {
    await admin.from("easysales_joburi").update({
      stare: "oprit", eroare: `trecerea a vazut ${vazute} produse si ar fi declarat disparute ${absente.length} din ${confirmate}`,
      terminat_la: acum, actualizat_la: acum, revendicat_pana: null,
    }).eq("id", job.id);
    await ctx.dep.peticConfig(b, { catalog_pauza: "verificare-suspecta", catalog_verificare_la: acum });
    ctx.cfg.catalog_pauza = "verificare-suspecta";
    await anunta(admin, b, {
      titlu: "Verificarea catalogului easySales s-a oprit",
      mesaj: `Lista de produse a website-ului în easySales arată ${vazute} produse, iar Edinio are ${confirmate} confirmate. Am oprit catalogul în loc să retrimitem tot. Verifică website-ul în easySales (numele, produsele), apoi apasă „Reia catalogul”.`,
      severitate: "error",
    });
    return;
  }

  for (const r of absente) {
    if (r.lipsa_la && r.lipsa_la < job.pornit_la) {
      await admin.from("easysales_produse").update({
        stare: "disparut", motiv: "Produsul nu mai apare în easySales (arhivat sau șters acolo). Nu-l retrimitem singuri: alege „Retrimite” sau „Exclude”.", updated_at: acum,
      }).eq("id", r.id);
    } else if (!r.lipsa_la) {
      await admin.from("easysales_produse").update({ lipsa_la: acum, updated_at: acum }).eq("id", r.id);
    }
  }

  const prag = new Date(Date.parse(job.pornit_la) - RETRIMITERE_DUPA_MS).toISOString();
  const { data: netrecute, error: e3 } = await admin.from("easysales_produse").select("id, product_uuid, retrimis_la")
    .eq("business_id", b).eq("stare", "trimis").lt("trimis_la", prag).or(`verificat_la.is.null,verificat_la.lt."${job.pornit_la}"`).limit(2000);
  if (e3) throw new EroareCitireBaza("easysales.verificare", e3.message);
  for (const r of (netrecute ?? []) as { id: number; product_uuid: string; retrimis_la: string | null }[]) await nevazut(admin, b, r);

  await admin.from("easysales_joburi").update({ stare: "gata", terminat_la: acum, actualizat_la: acum, revendicat_pana: null }).eq("id", job.id);
  await ctx.dep.peticConfig(b, { catalog_verificare_la: acum });
  ctx.cfg.catalog_verificare_la = acum;
}

/** Paginile unei treceri complete, cat tine bugetul. */
async function ruleazaJobul(admin: Admin, ctx: ContextEasySales, job: Job, maiAreTimp: () => boolean): Promise<void> {
  const b = ctx.businessId;
  const nume = (ctx.cfg.website_nume ?? "").trim();
  const acumIso = () => new Date().toISOString();
  const { data: luat } = await admin.from("easysales_joburi")
    .update({ revendicat_pana: new Date(Date.now() + 90_000).toISOString(), actualizat_la: acumIso() })
    .eq("id", job.id).eq("stare", "in_lucru").or(`revendicat_pana.is.null,revendicat_pana.lt."${acumIso()}"`).select("*");
  const j = ((luat ?? []) as Job[])[0];
  if (!j) return;
  try {
    if (j.pagina === 0) {
      const w = await websiteulExista(ctx);
      if (w === "nu") {
        await admin.from("easysales_joburi").update({ stare: "oprit", eroare: "website-ul nu mai e in lista", terminat_la: acumIso(), revendicat_pana: null }).eq("id", j.id);
        await pauzaWebsiteRedenumit(admin, ctx);
        return;
      }
      if (w === "necunoscut") return;
    }
    let pagina = j.pagina;
    let ultima = j.ultima_pagina ?? null;
    let vazute = Number((j.contoare as { vazute?: unknown } | null)?.vazute ?? 0);
    while (maiAreTimp() && (ultima === null || pagina < ultima)) {
      const r = await api.listaProduse(ctx, { website: nume, page: pagina + 1 });
      if (!r.ok) return;
      const meta = ((r.corp ?? {}) as { meta?: { last_page?: unknown; total?: unknown } }).meta ?? {};
      vazute += await noteazaVazute(admin, b, aleNoastre(r.date, nume));
      pagina += 1;
      const ult = Number(meta.last_page);
      ultima = Number.isFinite(ult) && ult >= 1 ? ult : pagina;
      await admin.from("easysales_joburi").update({
        pagina, ultima_pagina: ultima, total: Number.isFinite(Number(meta.total)) ? Number(meta.total) : null,
        contoare: { vazute }, actualizat_la: acumIso(), revendicat_pana: new Date(Date.now() + 90_000).toISOString(),
      }).eq("id", j.id);
    }
    if (ultima !== null && pagina >= ultima) await inchideTrecerea(admin, ctx, { ...j, pagina, ultima_pagina: ultima, contoare: { vazute } });
  } finally {
    await admin.from("easysales_joburi").update({ revendicat_pana: null }).eq("id", j.id).eq("stare", "in_lucru");
  }
}

/**
 * Pasul verificarii, in trecerea cronului pe magazin. Nu arunca: o pana se jurnalizeaza si se reia.
 *
 *   - cateva articole `trimis` mai vechi de 2 minute: fiecare cu `?sku=`;
 *   - multe, sau trecuta o zi de la ultima trecere completa: o trecere completa, pe felii.
 */
export async function pasulVerificarii(admin: Admin, ctx: ContextEasySales, maiAreTimp: () => boolean): Promise<void> {
  const b = ctx.businessId;
  try {
    const prag = new Date(Date.now() - 2 * MINUT).toISOString();
    const { data, count, error } = await admin.from("easysales_produse")
      .select("id, product_uuid, sku_trimis, trimis_la, retrimis_la", { count: "exact" })
      .eq("business_id", b).eq("stare", "trimis").lt("trimis_la", prag).order("trimis_la").limit(TINTIT_PANA_LA);
    if (error) throw new EroareCitireBaza("easysales.verificare", error.message);
    let job = await jobulViu(admin, b);
    const zi = ctx.cfg.catalog_verificare_la ? Date.now() - Date.parse(ctx.cfg.catalog_verificare_la) > 24 * 60 * MINUT : true;
    if (!job && ((count ?? 0) > TINTIT_PANA_LA || zi)) job = await pornesteVerificarea(admin, b);
    if (job) {
      await ruleazaJobul(admin, ctx, job, maiAreTimp);
    } else if ((count ?? 0) > 0) {
      await verificaTintit(admin, ctx, (data ?? []) as { id: number; product_uuid: string; sku_trimis: string | null; trimis_la: string | null; retrimis_la: string | null }[], maiAreTimp);
    }
  } catch (e) {
    await logError({ action: "easysales.verificare", severity: "warning", businessId: b, message: (e as Error).message });
  }
}
