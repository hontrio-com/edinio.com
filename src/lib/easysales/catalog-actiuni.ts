import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import type { ContextEasySales } from "./client";
import {
  amprentaMediului, improspateazaSkuDuplicate, incarcaMediul, problemaMediului, socotesteSkuDuplicate,
} from "./catalog";
import { retrimiteCatalogulIntreg } from "./catalog-pas";
import { CATALOG_PORNIT } from "./constante";
import {
  agregatorDePregatire, COLOANE_PRODUS_CATALOG, hotarareaProdusului, setarileCatalogului,
  type Motiv, type ProdusCatalog, type RaportPregatire, type SetariCatalog,
} from "./eligibilitate";
import { motivulRezervei, rezolvitorDeCategorii } from "./mapare-categorii";
import type { EasySalesConfig } from "./tipuri";
import { websiteulExista } from "./verificare";

/**
 * Ce face omul cu catalogul (planul, §7.4): raportul de pregatire, pornirea, oprirea, reluarea,
 * retrimiterea, excluderea unui articol, confirmarea preturilor, setarile.
 *
 * Fisierul NU e „use server": actiunile din `easysales.actions.ts` pun garda proprietarului si il
 * cheama cu clientul de serviciu.
 *
 * ⚠ RAPORTUL NU ASTEAPTA E0 si nu atinge tabelele migratiei 74: citeste produsele, categoriile,
 * setarile si `easysales_produse` (migratia 72). Asa poate rula pe productie inainte de pornirea E3
 * si arata comerciantului golurile de SKU si de descriere (planul, §10).
 */

type Admin = SupabaseClient<Database>;

export type RezultatOm = { ok: true; mesaj?: string } | { ok: false; eroare: string };

/* ═══════════════════════════════════════════════════════════════════════════
   RAPORTUL DE PREGATIRE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RaportMagazin extends RaportPregatire {
  /** Moneda sau cota de TVA care opresc tot catalogul. */
  problemaMagazin: string | null;
  totalProduse: number;
  /** Bugetul s-a terminat inainte de capat: raportul acopera numai `produse` din `totalProduse`. */
  taiat: boolean;
  calculatLa: string;
}

const PAGINA_RAPORT = 500;

export async function raportulMagazinului(
  admin: Admin, businessId: string, cfg: EasySalesConfig, bugetMs = 45_000,
): Promise<RaportMagazin> {
  const inceput = Date.now();
  const mediu = await incarcaMediul(admin, businessId, cfg);
  const duplicate = await socotesteSkuDuplicate(admin, businessId);

  /* SKU-urile deja inghetate: castiga (`eligibilitate.ts`). */
  const inghetate = new Map<string, string>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin.from("easysales_produse").select("product_uuid, identitate, sku_trimis")
      .eq("business_id", businessId).not("sku_trimis", "is", null).order("id").range(de, de + 999);
    if (error) throw new EroareCitireBaza("easysales.raport", error.message);
    for (const r of (data ?? []) as { product_uuid: string; identitate: string; sku_trimis: string }[]) {
      inghetate.set(`${r.product_uuid}|${r.identitate}`, r.sku_trimis);
    }
    if ((data ?? []).length < 1000) break;
  }

  const { count, error: eNumar } = await admin.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  if (eNumar) throw new EroareCitireBaza("easysales.raport", eNumar.message);
  const categoria = rezolvitorDeCategorii(mediu.categorii);
  const ag = agregatorDePregatire();
  let dupa: string | null = null;
  let taiat = false;
  for (;;) {
    if (Date.now() - inceput > bugetMs) { taiat = true; break; }
    let q = admin.from("products").select(COLOANE_PRODUS_CATALOG).eq("business_id", businessId).order("id").limit(PAGINA_RAPORT);
    if (dupa) q = q.gt("id", dupa);
    const { data, error } = await q;
    if (error) throw new EroareCitireBaza("easysales.raport", error.message);
    const pagina = (data ?? []) as unknown as ProdusCatalog[];
    for (const p of pagina) {
      const h = hotarareaProdusului(p, {
        setari: mediu.setari, skuDuplicate: duplicate,
        skuInghetat: (u, id) => inghetate.get(`${u}|${id}`) ?? null,
      });
      const inPlus: Motiv[] = [];
      const c = categoria(p.category);
      if (c.fel === "rezerva" && !h.exclus) inPlus.push({ cod: "categorie-de-rezerva", nivel: "avertisment", mesaj: motivulRezervei(c.motiv, p.category) });
      ag.adauga(h, p.name, inPlus);
    }
    if (pagina.length < PAGINA_RAPORT) break;
    dupa = pagina[pagina.length - 1].id;
  }
  return { ...ag.rezultat(), problemaMagazin: problemaMediului(mediu), totalProduse: count ?? 0, taiat, calculatLa: new Date().toISOString() };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STAREA, PENTRU PANOU
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ProblemaArticol {
  id: number;
  productUuid: string;
  productId: string | null;
  identitate: string;
  sku: string | null;
  stare: string;
  motiv: string | null;
}

export interface StareCatalog {
  /** Comutatorul din cod (E3 asteapta E0). */
  pornitInCod: boolean;
  activ: boolean;
  pauza: string | null;
  pornitLa: string | null;
  setari: SetariCatalog;
  preturiAsteapta: { cerut_la: string; produse: number } | null;
  articole: Record<string, number>;
  inCoada: { continut: number; pret: number; stergeri: number };
  verificatLa: string | null;
  incarcare: { inLucru: boolean; pornitLa: string | null } | null;
  probleme: ProblemaArticol[];
}

export async function stareaCatalogului(admin: Admin, businessId: string, cfg: EasySalesConfig): Promise<StareCatalog> {
  const baza: StareCatalog = {
    pornitInCod: CATALOG_PORNIT,
    activ: !!cfg.catalog_activ,
    pauza: cfg.catalog_pauza ?? null,
    pornitLa: cfg.catalog_pornit_la ?? null,
    setari: setarileCatalogului(cfg),
    preturiAsteapta: cfg.catalog_preturi_asteapta ?? null,
    articole: {},
    inCoada: { continut: 0, pret: 0, stergeri: 0 },
    verificatLa: cfg.catalog_verificare_la ?? null,
    incarcare: null,
    probleme: [],
  };
  /* ⚠ Fara comutator, tabelele migratiei 74 pot lipsi (productia, inainte de E3): nu se ating. */
  if (!CATALOG_PORNIT) return baza;

  for (const stare of ["de_trimis", "trimis", "confirmat", "blocat", "respins", "disparut", "exclus", "arhivat"]) {
    const { count } = await admin.from("easysales_produse").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("stare", stare).neq("identitate", "#parinte");
    baza.articole[stare] = count ?? 0;
  }
  for (const [op, cheie] of [["articol_continut", "continut"], ["articol_pret", "pret"], ["articol_sterge", "stergeri"]] as const) {
    const { count } = await admin.from("easysales_sync_queue").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("op", op).is("abandonat_la", null);
    baza.inCoada[cheie] = count ?? 0;
  }
  const { data: job } = await admin.from("easysales_joburi").select("stare, pornit_la")
    .eq("business_id", businessId).eq("fel", "incarcare").order("pornit_la", { ascending: false }).limit(1).maybeSingle();
  if (job) baza.incarcare = { inLucru: (job as { stare: string }).stare === "in_lucru", pornitLa: (job as { pornit_la: string }).pornit_la };
  const { data: probleme } = await admin.from("easysales_produse")
    .select("id, product_uuid, product_id, identitate, sku_trimis, stare, motiv")
    .eq("business_id", businessId).in("stare", ["blocat", "respins", "disparut"]).order("updated_at", { ascending: false }).limit(100);
  baza.probleme = ((probleme ?? []) as { id: number; product_uuid: string; product_id: string | null; identitate: string; sku_trimis: string | null; stare: string; motiv: string | null }[])
    .map((r) => ({ id: Number(r.id), productUuid: r.product_uuid, productId: r.product_id, identitate: r.identitate, sku: r.sku_trimis, stare: r.stare, motiv: r.motiv }));
  return baza;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE FACE OMUL
   ═══════════════════════════════════════════════════════════════════════════ */

const NU_E_PORNIT = "Trimiterea catalogului în easySales pornește după proba pe contul de test easySales. Raportul de pregătire îl poți folosi de acum.";

async function websiteConfirmat(ctx: ContextEasySales): Promise<string | null> {
  const w = await websiteulExista(ctx);
  if (w === "da") return null;
  if (w === "nu") return `Website-ul „${ctx.cfg.website_nume ?? ""}” nu mai apare în easySales. Verifică numele lui acolo; până atunci catalogul nu pleacă.`;
  return "Nu am putut verifica website-ul în easySales. Reîncearcă peste un minut.";
}

/** „Trimite catalogul": categoriile intai, apoi tot catalogul, pe felii, prin coada. */
export async function pornesteCatalogul(admin: Admin, ctx: ContextEasySales): Promise<RezultatOm> {
  if (!CATALOG_PORNIT) return { ok: false, eroare: NU_E_PORNIT };
  if (!ctx.cfg.connected) return { ok: false, eroare: "Conectează întâi contul easySales." };
  if (ctx.cfg.needs_reconnect) return { ok: false, eroare: "Conexiunea cu easySales cere reconectare." };
  const mediu = await incarcaMediul(admin, ctx.businessId, ctx.cfg);
  const problema = problemaMediului(mediu);
  if (problema) return { ok: false, eroare: problema };
  const w = await websiteConfirmat(ctx);
  if (w) return { ok: false, eroare: w };

  const acum = new Date().toISOString();
  await ctx.dep.peticConfig(ctx.businessId, {
    catalog_activ: true, catalog_pornit_la: acum, catalog_pauza: null, catalog_amprenta_mediu: amprentaMediului(mediu),
  });
  Object.assign(ctx.cfg, { catalog_activ: true, catalog_pornit_la: acum, catalog_pauza: null });
  await improspateazaSkuDuplicate(admin, ctx, true);
  const { error: e1 } = await admin.rpc("easysales_pune_in_coada", { p_business: ctx.businessId, p_op: "categorie", p_cheie: "*", p_prioritate: 2 });
  const { error: e2 } = await admin.rpc("easysales_pune_catalogul_in_coada", { p_business: ctx.businessId, p_ops: ["articol_continut"] });
  if (e1 || e2) return { ok: false, eroare: "Catalogul nu s-a putut pune în coadă. Reîncearcă." };
  const { error: e3 } = await admin.from("easysales_joburi").insert({ business_id: ctx.businessId, fel: "incarcare" });
  if (e3 && e3.code !== "23505") return { ok: false, eroare: "Catalogul a intrat în coadă, dar progresul nu s-a putut înregistra." };
  return { ok: true, mesaj: "Catalogul pleacă în easySales pe felii, în următoarele minute. Toate produsele pleacă cu stocul 0." };
}

/** „Oprește catalogul": nimic nu mai pleaca; produsele raman la ei, pe stoc 0. */
export async function opresteCatalogul(admin: Admin, ctx: ContextEasySales): Promise<RezultatOm> {
  await ctx.dep.peticConfig(ctx.businessId, { catalog_activ: false });
  ctx.cfg.catalog_activ = false;
  if (CATALOG_PORNIT) {
    await admin.from("easysales_sync_queue").delete().eq("business_id", ctx.businessId)
      .in("op", ["articol_continut", "articol_pret", "articol_stoc", "articol_sterge", "categorie", "caracteristica"]);
    await admin.from("easysales_joburi").update({ stare: "oprit", terminat_la: new Date().toISOString() })
      .eq("business_id", ctx.businessId).eq("stare", "in_lucru");
  }
  return { ok: true, mesaj: "Catalogul nu mai pleacă în easySales. Produsele trimise rămân acolo, cu stocul 0." };
}

/** „Reia catalogul" dupa o pauza: numai daca motivul pauzei nu mai sta in picioare. */
export async function reiaCatalogul(admin: Admin, ctx: ContextEasySales): Promise<RezultatOm> {
  if (!CATALOG_PORNIT) return { ok: false, eroare: NU_E_PORNIT };
  const mediu = await incarcaMediul(admin, ctx.businessId, ctx.cfg);
  const problema = problemaMediului(mediu);
  if (problema) return { ok: false, eroare: problema };
  const w = await websiteConfirmat(ctx);
  if (w) return { ok: false, eroare: w };
  await ctx.dep.peticConfig(ctx.businessId, { catalog_pauza: null });
  ctx.cfg.catalog_pauza = null;
  return { ok: true, mesaj: "Catalogul pornește din nou la următoarea trecere." };
}

/** „Retrimite tot": dupa paza website-ului, amprentele se sterg si tot catalogul intra in coada. */
export async function retrimiteTot(admin: Admin, ctx: ContextEasySales): Promise<RezultatOm> {
  if (!CATALOG_PORNIT || !ctx.cfg.catalog_activ) return { ok: false, eroare: NU_E_PORNIT };
  const w = await websiteConfirmat(ctx);
  if (w) return { ok: false, eroare: w };
  await retrimiteCatalogulIntreg(admin, ctx.businessId);
  return { ok: true, mesaj: "Tot catalogul pleacă din nou, pe felii." };
}

async function randulMagazinului(admin: Admin, businessId: string, id: number) {
  const { data, error } = await admin.from("easysales_produse").select("id, product_uuid, identitate, stare")
    .eq("business_id", businessId).eq("id", id).maybeSingle();
  if (error) throw new EroareCitireBaza("easysales.articole", error.message);
  return data as { id: number; product_uuid: string; identitate: string; stare: string } | null;
}

/** „Retrimite" pe un articol respins, blocat, disparut sau exclus. */
export async function retrimiteArticolul(admin: Admin, ctx: ContextEasySales, id: number): Promise<RezultatOm> {
  if (!CATALOG_PORNIT || !ctx.cfg.catalog_activ) return { ok: false, eroare: NU_E_PORNIT };
  const r = await randulMagazinului(admin, ctx.businessId, id);
  if (!r || r.identitate === "#parinte") return { ok: false, eroare: "Articolul nu există." };
  if (r.stare === "arhivat") return { ok: false, eroare: "Articolul e arhivat în easySales. Restaurează-l din easySales, apoi retrimite." };
  await admin.from("easysales_produse").update({
    stare: r.stare === "confirmat" || r.stare === "trimis" ? r.stare : "de_trimis",
    amprenta: null, retrimis_la: null, lipsa_la: null, motiv: null, updated_at: new Date().toISOString(),
  }).eq("id", r.id);
  await admin.rpc("easysales_pune_in_coada", { p_business: ctx.businessId, p_op: "articol_continut", p_cheie: r.product_uuid, p_prioritate: 3 });
  return { ok: true, mesaj: "Articolul pleacă din nou în câteva minute." };
}

/** „Exclude": articolul nu mai pleaca deloc (nici continut, nici pret, nici stoc). */
export async function excludeArticolul(admin: Admin, ctx: ContextEasySales, id: number): Promise<RezultatOm> {
  if (!CATALOG_PORNIT) return { ok: false, eroare: NU_E_PORNIT };
  const r = await randulMagazinului(admin, ctx.businessId, id);
  if (!r || r.identitate === "#parinte") return { ok: false, eroare: "Articolul nu există." };
  await admin.from("easysales_produse").update({ stare: "exclus", motiv: "Exclus de tine din catalogul easySales.", updated_at: new Date().toISOString() }).eq("id", r.id);
  return { ok: true, mesaj: "Articolul nu mai pleacă în easySales. Ce e deja acolo rămâne neatins." };
}

/** „Confirma preturile": siguranta de masa lasa valul curent sa plece. */
export async function confirmaPreturile(_admin: Admin, ctx: ContextEasySales): Promise<RezultatOm> {
  if (!ctx.cfg.catalog_preturi_asteapta) return { ok: true, mesaj: "Nu așteaptă nicio confirmare." };
  const acum = new Date().toISOString();
  await ctx.dep.peticConfig(ctx.businessId, { catalog_preturi_confirmate_la: acum });
  ctx.cfg.catalog_preturi_confirmate_la = acum;
  return { ok: true, mesaj: "Prețurile pleacă în easySales la următoarea trecere." };
}

export interface SetariCatalogTrimise {
  skuGenerat: boolean;
  descriereDinNume: boolean;
  stocFix: number | null;
  arhivareLaStergere: boolean;
  combinatieScoasa: "stoc_zero" | "arhivare";
  termenZile: number | null;
}

/** Setarile catalogului (D8, D9, D10, D21, D30, termenul). Validate aici, nu crezute din browser. */
export async function salveazaSetarileCatalogului(ctx: ContextEasySales, s: SetariCatalogTrimise): Promise<RezultatOm> {
  const stoc = s.stocFix == null ? null : Number(s.stocFix);
  if (stoc != null && (!Number.isInteger(stoc) || stoc < 0 || stoc > 100_000)) return { ok: false, eroare: "Stocul fix trebuie să fie un număr întreg între 0 și 100.000." };
  const termen = s.termenZile == null ? null : Number(s.termenZile);
  if (termen != null && (!Number.isInteger(termen) || termen < 0 || termen > 365)) return { ok: false, eroare: "Termenul de expediere trebuie să fie un număr întreg de zile, între 0 și 365." };
  await ctx.dep.peticConfig(ctx.businessId, {
    catalog_sku_generat: s.skuGenerat === true,
    catalog_descriere_din_nume: s.descriereDinNume === true,
    catalog_stoc_fix: stoc,
    catalog_arhivare_la_stergere: s.arhivareLaStergere === true,
    catalog_combinatie_scoasa: s.combinatieScoasa === "arhivare" ? "arhivare" : "stoc_zero",
    catalog_termen_zile: termen,
  });
  return { ok: true, mesaj: "Setările catalogului au fost salvate." };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STAREA UNUI PRODUS, PENTRU PAGINA LUI
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ArticolInPagina {
  titlu: string;
  /** Pleaca (sau ar pleca, cand catalogul e pornit). */
  eligibil: boolean;
  /** Motivele, pentru om: ce-l opreste si ce doar se spune. */
  motive: { nivel: "blocheaza" | "avertisment"; mesaj: string }[];
  /** SKU-ul inghetat (cel de la ei), daca a plecat vreodata. */
  skuTrimis: string | null;
  /** Starea la ei, daca are rand. */
  stare: string | null;
  motivRand: string | null;
}

export interface StareProdusEasySales {
  catalogPornit: boolean;
  catalogActiv: boolean;
  motiveProdus: { nivel: "blocheaza" | "avertisment"; mesaj: string }[];
  articole: ArticolInPagina[];
  /** SKU-urile duplicate nu s-au putut verifica fara raportul complet (lista lipseste). */
  duplicateNeverificate: boolean;
}

/**
 * Ce se intampla cu produsul asta in easySales: aceeasi hotarare ca raportul si lucratorul, plus
 * randurile `easysales_produse` (coloanele migratiei 72, deci merge si inainte de E3).
 *
 * ⚠ SKU-urile duplicate se iau din lista socotita de cron (o data pe ora); fara ea, verificarea pe
 * tot catalogul ramane raportului, nu paginii de produs.
 */
export async function stareaProdusului(
  admin: Admin, businessId: string, productId: string, cfg: EasySalesConfig,
): Promise<StareProdusEasySales | null> {
  const { data: p, error } = await admin.from("products").select(COLOANE_PRODUS_CATALOG)
    .eq("business_id", businessId).eq("id", productId).maybeSingle();
  if (error) throw new EroareCitireBaza("easysales.produs", error.message);
  if (!p) return null;
  const { data: randuri, error: e2 } = await admin.from("easysales_produse").select("identitate, sku_trimis, stare, motiv")
    .eq("business_id", businessId).eq("product_uuid", productId);
  if (e2) throw new EroareCitireBaza("easysales.produs", e2.message);
  const dupaIdentitate = new Map(((randuri ?? []) as { identitate: string; sku_trimis: string | null; stare: string; motiv: string | null }[])
    .map((r) => [r.identitate, r]));
  const lista = cfg.catalog_sku_duplicate;
  const h = hotarareaProdusului(p as unknown as ProdusCatalog, {
    setari: setarileCatalogului(cfg),
    skuDuplicate: new Set(lista ?? []),
    skuInghetat: (_u, id) => dupaIdentitate.get(id)?.sku_trimis ?? null,
  });
  const simplu = (m: Motiv) => ({ nivel: m.nivel, mesaj: m.mesaj });
  return {
    catalogPornit: CATALOG_PORNIT,
    catalogActiv: !!cfg.catalog_activ,
    motiveProdus: h.motive.map(simplu),
    articole: h.articole.map((a) => {
      const r = dupaIdentitate.get(a.identitate);
      return {
        titlu: a.titlu, eligibil: a.eligibil, motive: a.motive.map(simplu),
        skuTrimis: r?.sku_trimis ?? null, stare: r?.stare ?? null, motivRand: r?.motiv ?? null,
      };
    }),
    duplicateNeverificate: !lista,
  };
}
