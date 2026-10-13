import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { scrieDacaNeschimbat, stergeDacaNeschimbat } from "@/lib/marketplace/coada-cas";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import * as api from "./api";
import type { ContextEasySales } from "./client";
import {
  bucati, citesteProdusele, citesteRandurile, inchis, inParalel, laEi, scrieRand, type Rand,
} from "./catalog-baza";
import { COADA, asteptareaDupaPauze, type ElementCoada, type Soarta } from "./coada-element";
import { CATALOG_PORNIT, FORMULA_STOC, LOT_STOC, STOC_PORNIT } from "./constante";
import { hotarareaProdusului, setarileCatalogului, type ArticolCatalog, type ProdusCatalog } from "./eligibilitate";
import { citesteCanaleleNative } from "./exclusivitate";
import { cheiaArticolului } from "./identitate";
import { anunta, anuntaRar } from "./notificari";
import { bandaDeLista } from "./oglinda";
import {
  FARA_CORECTIE, corectiileStocului, hotarareaDerivei, stocDeTrimis, stoculCereConfirmare, stoculEdinio,
  type CorectieStoc, type FormulaStoc,
} from "./stoc";
import type { EasySalesConfig } from "./tipuri";
import { prelucreazaComandaExterna, type ModBucla } from "./vanzari-externe";

/**
 * Bucla de stoc (E4; planul, §5.5 si §5.6): poarta, comenzile altor canale, impingerea stocului,
 * pornirea si oprirea.
 *
 * ═══ ⚠ ORDINEA E REGULA ═══
 *
 * Inaintea fiecarui lot de impingeri, aceeasi trecere citeste comenzile lor (banda de lista), daca
 * ultima citire e mai veche de 60 de secunde, si consuma vanzarile noi. Altfel o impingere facuta
 * intre o vanzare de pe marketplace si consumul ei in Edinio ar invia bucata vanduta (formula
 * `scadere`) sau ar trimite un stoc fara rezervarea abia facuta (formula `rezervare`). O citire care
 * cade NU trimite nimic.
 *
 * ═══ CE PORNESTE BUCLA ═══
 *
 *   in cod      `CATALOG_PORNIT`, `STOC_PORNIT` si, pentru orice cantitate reala, `FORMULA_STOC`;
 *   pe magazin  `stoc_activ`, cu modul ales de om: `umbra` (numai clasificare), `canar` (5-20 de
 *               SKU-uri, cu stoc si consum reale), `efect` (tot catalogul).
 *
 * Opririle planificate (oprirea buclei, deconectarea) pun INTAI stocul pe 0 la ei, verificat pe SKU
 * (D20). Cele neplanificate (token mort, cont suspendat) nu mai pot scrie: anunta omul.
 */

type Admin = SupabaseClient<Database>;

export interface StareBucla {
  mod: ModBucla;
  formula: FormulaStoc | null;
  /** SKU-urile canarului, cu litere mici. */
  canar: Set<string>;
}

/** Partea de magazin a portii, fara comutatoarele din cod. ⚠ NUMAI probele o dau mai departe. */
export function buclaPeMagazin(cfg: EasySalesConfig): StareBucla | null {
  if (!cfg.connected || !cfg.catalog_activ || !cfg.stoc_activ) return null;
  if (cfg.pauza || cfg.needs_reconnect || cfg.catalog_pauza) return null;
  const mod: ModBucla = cfg.stoc_mod === "canar" || cfg.stoc_mod === "efect" ? cfg.stoc_mod : "umbra";
  return { mod, formula: FORMULA_STOC, canar: new Set((cfg.stoc_canar ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean)) };
}

/** Bucla poate lucra? `null` = nu (in cod sau pe magazin). */
export function bucla(cfg: EasySalesConfig): StareBucla | null {
  if (!CATALOG_PORNIT || !STOC_PORNIT) return null;
  return buclaPeMagazin(cfg);
}

export interface OptiuniBucla {
  maiAreTimp: () => boolean;
  /** Poarta; implicit `bucla`. Numai probele dau alta. */
  poarta?: (cfg: EasySalesConfig) => StareBucla | null;
}

/** Cantitatile reale pleaca? Numai cu formula aleasa si in `canar` sau `efect`. */
export function impinge(s: StareBucla | null): s is StareBucla & { formula: FormulaStoc } {
  return !!s && s.formula !== null && s.mod !== "umbra";
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMENZILE ALTOR CANALE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Comenzile lor care nu sunt ale noastre intra in coada (`extern_citeste`), numai cele noi sau
 * schimbate de la ultima citire: fiecare costa o cerere Get Order.
 */
export async function puneExterneleInCoada(admin: Admin, businessId: string, externe: { id: string; la: string | null }[]): Promise<number> {
  if (externe.length === 0) return 0;
  let puse = 0;
  for (const lot of bucati(externe, 100)) {
    const { data, error } = await admin.from("easysales_comenzi").select("es_order_id, es_updated_at")
      .eq("business_id", businessId).eq("directie", "intrare").in("es_order_id", lot.map((x) => x.id));
    if (error) throw new EroareCitireBaza("easysales.externe", error.message);
    const vazute = new Map(((data ?? []) as { es_order_id: string; es_updated_at: string | null }[]).map((r) => [r.es_order_id, r.es_updated_at]));
    for (const x of lot) {
      const la = vazute.get(x.id);
      if (vazute.has(x.id) && la && x.la && Date.parse(x.la) <= Date.parse(la)) continue;
      const { error: e } = await admin.rpc("easysales_pune_in_coada", { p_business: businessId, p_op: "extern_citeste", p_cheie: x.id, p_prioritate: 2 });
      if (!e) puse++;
    }
  }
  return puse;
}

async function amana(admin: Admin, el: ElementCoada, ms: number, eroare: string): Promise<Soarta> {
  await scrieDacaNeschimbat(admin, COADA, el, {
    pauze: el.pauze + 1, ultima_eroare: eroare.slice(0, 500), next_retry_at: new Date(Date.now() + ms).toISOString(),
  });
  return "amanat";
}

/** O lucrare `extern_citeste`, dusa la capat. Nu arunca. */
export async function prelucreazaExterna(admin: Admin, ctx: ContextEasySales, el: ElementCoada, opt: OptiuniBucla): Promise<Soarta> {
  const stare = (opt.poarta ?? bucla)(ctx.cfg);
  if (!stare) {
    await stergeDacaNeschimbat(admin, COADA, el);
    return "gata";
  }
  try {
    const canale = await citesteCanaleleNative(admin, ctx.businessId);
    const r = await prelucreazaComandaExterna(admin, ctx, el.cheie, { mod: stare.mod, canar: stare.canar, canaleConectate: canale });
    if (r === "gata") { await stergeDacaNeschimbat(admin, COADA, el); return "gata"; }
    if (r === "asteapta_omul") return amana(admin, el, 5 * 60_000, "conexiunea cere omul");
    return amana(admin, el, asteptareaDupaPauze(el.pauze), "citirea comenzii a cazut");
  } catch (e) {
    await logError({ action: "easysales.externe", severity: "warning", businessId: ctx.businessId, message: (e as Error).message, details: { internalId: el.cheie } });
    return amana(admin, el, asteptareaDupaPauze(el.pauze), (e as Error).message);
  }
}

/** Lucrarile `extern_citeste` ale magazinului, cat tine bugetul. */
export async function prelucreazaExternele(admin: Admin, ctx: ContextEasySales, opt: OptiuniBucla): Promise<void> {
  /* ⚠ Poarta intai: fara bucla, revendicarea (migratia 74) poate lipsi. */
  if (!(opt.poarta ?? bucla)(ctx.cfg)) return;
  for (let tura = 0; tura < 5 && opt.maiAreTimp(); tura++) {
    const { data, error } = await admin.rpc("easysales_revendica_catalogul", { p_business: ctx.businessId, p_ops: ["extern_citeste"], p_limita: 20 });
    if (error) throw new EroareCitireBaza("easysales.externe", error.message);
    const elemente = (data ?? []) as unknown as ElementCoada[];
    if (elemente.length === 0) return;
    for (const el of elemente) {
      if (!opt.maiAreTimp()) return;
      await prelucreazaExterna(admin, ctx, el, opt);
    }
  }
}

/**
 * Comenzile lor citite si consumate, cel mult o data la 60 de secunde. `false` = n-am putut citi:
 * apelantul nu trimite niciun stoc.
 */
export async function comenzileCititeProaspat(admin: Admin, ctx: ContextEasySales, opt: OptiuniBucla): Promise<boolean> {
  const la = ctx.cfg.stoc_comenzi_citite_la ? Date.parse(ctx.cfg.stoc_comenzi_citite_la) : 0;
  if (Number.isFinite(la) && Date.now() - la < 60_000) return true;
  const r = await bandaDeLista(admin, ctx, { runStartMs: Date.now(), maxPagini: 3, bugetMs: 10_000 });
  if (!r.ok) return false;
  await puneExterneleInCoada(admin, ctx.businessId, r.externe);
  await prelucreazaExternele(admin, ctx, opt);
  /* Vanzarile care inca asteapta in coada (o pana) nu se pot socoti consumate. */
  const { count, error } = await admin.from("easysales_sync_queue").select("id", { count: "exact", head: true })
    .eq("business_id", ctx.businessId).eq("op", "extern_citeste").is("abandonat_la", null);
  if (error || (count ?? 0) > 0) return false;
  const acum = new Date().toISOString();
  await ctx.dep.peticConfig(ctx.businessId, { stoc_comenzi_citite_la: acum });
  ctx.cfg.stoc_comenzi_citite_la = acum;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   STOCUL DE TRIMIS
   ═══════════════════════════════════════════════════════════════════════════ */

export type CalculatorStoc = (p: ProdusCatalog, a: ArticolCatalog, rand: Rand | undefined) => number;

/**
 * Stocul care pleaca intr-un Save de continut (`catalog.ts`).
 *
 *   bucla oprita sau in umbra          0 (E3: totul pe 0);
 *   articol NOU, bucla cu efect        `stocDeTrimis` proaspat (o crestere de la nimic, directia sigura);
 *   articol deja trimis                cel mai mic dintre stocul trimis ultima oara si cel proaspat:
 *                                      un Save de continut nu creste niciodata stocul (asta e drumul
 *                                      stocului, cu siguranta lui de masa) si nici nu inviaza o bucata.
 *
 * Daca citirea proaspata a comenzilor cade: articolele trimise pastreaza stocul trimis, cele noi pleaca pe 0.
 */
export async function calculatorDeStoc(admin: Admin, ctx: ContextEasySales, opt: OptiuniBucla): Promise<CalculatorStoc> {
  const stare = (opt.poarta ?? bucla)(ctx.cfg);
  if (!impinge(stare)) return () => 0;
  const setari = setarileCatalogului(ctx.cfg);
  const proaspat = await comenzileCititeProaspat(admin, ctx, opt);
  if (!proaspat) return (_p, _a, r) => (r && laEi(r) ? Math.max(0, r.stoc_trimis ?? 0) : 0);
  const corectii = await corectiileStocului(admin, ctx.businessId, stare.formula);
  return (p, a, r) => {
    if (stare.mod === "canar" && !(r?.sku_trimis && stare.canar.has(r.sku_trimis.toLowerCase())) && !(a.sku && stare.canar.has(a.sku.toLowerCase()))) return 0;
    const c: CorectieStoc = corectii.get(cheiaArticolului({ product_uuid: p.id, identitate: a.identitate })) ?? FARA_CORECTIE;
    const tinta = stocDeTrimis(stoculEdinio(p, a, setari), stare.formula, c);
    return r && laEi(r) ? Math.min(Math.max(0, r.stoc_trimis ?? 0), tinta) : tinta;
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   IMPINGEREA
   ═══════════════════════════════════════════════════════════════════════════ */

export type SoartaStoc = { fel: "gata" } | { fel: "reincearca"; mesaj: string } | { fel: "asteapta"; mesaj: string };

/** Siguranta de masa pe val: cate articole aveau stoc la ei, si daca valul trebuie confirmat. */
async function poartaValului(admin: Admin, ctx: ContextEasySales, laZeroAcum: number): Promise<boolean> {
  if (laZeroAcum === 0) return true;
  const { count, error } = await admin.from("easysales_produse").select("id", { count: "exact", head: true })
    .eq("business_id", ctx.businessId).in("stare", ["trimis", "confirmat"]).gt("stoc_trimis", 0);
  if (error) throw new EroareCitireBaza("easysales.stoc", error.message);
  const val = ctx.cfg.stoc_val ?? { inceput_la: new Date().toISOString(), la_zero: 0 };
  const asteapta = ctx.cfg.stoc_val_asteapta;
  const confirmat = !!(asteapta && ctx.cfg.stoc_val_confirmat_la && ctx.cfg.stoc_val_confirmat_la >= asteapta.cerut_la);
  if (confirmat || !stoculCereConfirmare(val.la_zero + laZeroAcum, count ?? 0)) return true;
  if (!asteapta) {
    const cerut = { cerut_la: new Date().toISOString(), la_zero: val.la_zero + laZeroAcum };
    await ctx.dep.peticConfig(ctx.businessId, { stoc_val_asteapta: cerut });
    ctx.cfg.stoc_val_asteapta = cerut;
    await anunta(admin, ctx.businessId, {
      titlu: "Confirmă stocul trimis în easySales",
      mesaj: `Stocul ar trece pe 0 la ${cerut.la_zero} de articole deodată. Înainte să-l trimitem în easySales (de unde se oprește vânzarea pe marketplace-uri), confirmă schimbarea din Integrări, easySales, Stoc.`,
      severitate: "warning",
    });
  }
  return false;
}

/** Valul de stoc s-a terminat (coada de stoc goala): confirmarea lui nu acopera urmatorul. */
export async function incheieValulStocului(admin: Admin, ctx: ContextEasySales): Promise<void> {
  if (!ctx.cfg.stoc_val && !ctx.cfg.stoc_val_asteapta && !ctx.cfg.stoc_val_confirmat_la) return;
  const { count, error } = await admin.from("easysales_sync_queue").select("id", { count: "exact", head: true })
    .eq("business_id", ctx.businessId).eq("op", "articol_stoc").is("abandonat_la", null);
  if (error || (count ?? 1) > 0) return;
  await ctx.dep.peticConfig(ctx.businessId, { stoc_val: null, stoc_val_asteapta: null, stoc_val_confirmat_la: null });
  ctx.cfg.stoc_val = null;
  ctx.cfg.stoc_val_asteapta = null;
  ctx.cfg.stoc_val_confirmat_la = null;
}

/** Trimite stocurile date (`/stocks/bulk`, cate 100) si scrie pe fiecare SKU ce s-a primit. */
async function trimiteStocuri(admin: Admin, ctx: ContextEasySales, schimbari: { rand: Rand; stoc: number }[]): Promise<SoartaStoc> {
  for (const lot of bucati(schimbari, LOT_STOC)) {
    const r = await api.actualizeazaStocul(ctx, lot.map((x) => ({ sku: x.rand.sku_trimis!, stock: x.stoc })));
    if (!r.ok) {
      /* Un raspuns necunoscut la scriere se reia: valoarea e absoluta, deci o repetare nu strica. */
      return { fel: "reincearca", mesaj: r.mesaj || "stocul n-a plecat" };
    }
    const rez = (r.date?.result ?? {}) as { success?: unknown; errors?: unknown; error_messages?: unknown };
    const reusite = new Set((Array.isArray(rez.success) ? rez.success : []).map((s) => String(s).toLowerCase()));
    const mesaje = new Map((Array.isArray(rez.error_messages) ? rez.error_messages : [])
      .map((m) => [String((m as { sku?: unknown })?.sku ?? "").toLowerCase(), String((m as { message?: unknown })?.message ?? "")]));
    const primite = new Map((Array.isArray(r.date?.products) ? (r.date!.products as { sku?: unknown; stock?: unknown }[]) : [])
      .map((p) => [String(p?.sku ?? "").toLowerCase(), Number(p?.stock)]));
    const acum = new Date().toISOString();
    await inParalel(lot, 8, async (x) => {
      const sku = x.rand.sku_trimis!.toLowerCase();
      if (reusite.has(sku)) {
        const primit = primite.get(sku);
        if (primit !== undefined && primit !== x.stoc) {
          await logError({ action: "easysales.stoc", severity: "warning", businessId: ctx.businessId, message: `stocul primit (${primit}) nu e cel trimis (${x.stoc}) pentru ${x.rand.sku_trimis}` });
        }
        await scrieRand(admin, x.rand.id, { stoc_trimis: x.stoc });
      } else if (/not found/i.test(mesaje.get(sku) ?? "")) {
        await scrieRand(admin, x.rand.id, {
          stare: "disparut", motiv: `easySales nu mai găsește produsul (${acum.slice(0, 10)}). Nu-l retrimitem singuri: alege „Retrimite” sau „Exclude”.`,
        });
      } else {
        await scrieRand(admin, x.rand.id, { motiv: `easySales n-a primit stocul: ${mesaje.get(sku) || "fără motiv"}`.slice(0, 500) });
      }
    });
  }
  return { fel: "gata" };
}

/**
 * Stocul produselor date (lucrarile `articol_stoc`). In `umbra`, sau fara formula, nu pleaca nimic.
 * Arunca `EroareCitireBaza`.
 */
export async function impingeStocul(admin: Admin, ctx: ContextEasySales, uuids: string[], opt: OptiuniBucla): Promise<SoartaStoc> {
  const stare = (opt.poarta ?? bucla)(ctx.cfg);
  if (!impinge(stare)) return { fel: "gata" };
  if (!(await comenzileCititeProaspat(admin, ctx, opt))) return { fel: "reincearca", mesaj: "comenzile lor n-au putut fi citite inaintea stocului" };
  const setari = setarileCatalogului(ctx.cfg);
  const corectii = await corectiileStocului(admin, ctx.businessId, stare.formula);
  const produse = await citesteProdusele(admin, ctx.businessId, uuids);
  const randuri = (await citesteRandurile(admin, ctx.businessId, uuids)).filter((r) => laEi(r) && r.sku_trimis && !inchis(r));
  const dup = new Set(ctx.cfg.catalog_sku_duplicate ?? []);
  const schimbari: { rand: Rand; stoc: number }[] = [];
  for (const r of randuri) {
    if (stare.mod === "canar" && !stare.canar.has(r.sku_trimis!.toLowerCase())) continue;
    const p = produse.get(r.product_uuid);
    let tinta = 0;
    if (p) {
      const a = hotarareaProdusului(p, { setari, skuDuplicate: dup, skuInghetat: (_u, id) => (id === r.identitate ? r.sku_trimis : null) })
        .articole.find((x) => x.identitate === r.identitate);
      const c = corectii.get(cheiaArticolului(r)) ?? FARA_CORECTIE;
      tinta = stocDeTrimis(stoculEdinio(p, a, setari), stare.formula, c);
    }
    if (tinta !== (r.stoc_trimis ?? null)) schimbari.push({ rand: r, stoc: tinta });
  }
  if (schimbari.length === 0) return { fel: "gata" };
  const laZero = schimbari.filter((x) => (x.rand.stoc_trimis ?? 0) > 0 && x.stoc === 0).length;
  if (!(await poartaValului(admin, ctx, laZero))) return { fel: "asteapta", mesaj: "stocul asteapta confirmarea" };
  const r = await trimiteStocuri(admin, ctx, schimbari);
  if (r.fel === "gata" && laZero > 0) {
    const val = { inceput_la: ctx.cfg.stoc_val?.inceput_la ?? new Date().toISOString(), la_zero: (ctx.cfg.stoc_val?.la_zero ?? 0) + laZero };
    await ctx.dep.peticConfig(ctx.businessId, { stoc_val: val });
    ctx.cfg.stoc_val = val;
  }
  return r;
}

/** Lucrarile `articol_stoc` ale magazinului, cate 100, cat tine bugetul. */
export async function golesteCoadaStocului(admin: Admin, ctx: ContextEasySales, opt: OptiuniBucla): Promise<void> {
  /* ⚠ Poarta intai: fara bucla, revendicarea (migratia 74) poate lipsi. */
  if (!(opt.poarta ?? bucla)(ctx.cfg)) return;
  for (let tura = 0; tura < 5 && opt.maiAreTimp(); tura++) {
    const { data, error } = await admin.rpc("easysales_revendica_catalogul", { p_business: ctx.businessId, p_ops: ["articol_stoc"], p_limita: LOT_STOC });
    if (error) throw new EroareCitireBaza("easysales.stoc", error.message);
    const elemente = (data ?? []) as unknown as ElementCoada[];
    if (elemente.length === 0) break;
    await prelucreazaLotulStocului(admin, ctx, elemente, opt);
  }
  await incheieValulStocului(admin, ctx);
}

/** Un lot de lucrari `articol_stoc` revendicate deja. Nu arunca. */
export async function prelucreazaLotulStocului(admin: Admin, ctx: ContextEasySales, elemente: ElementCoada[], opt: OptiuniBucla): Promise<Soarta[]> {
  let s: SoartaStoc;
  try {
    s = await impingeStocul(admin, ctx, [...new Set(elemente.map((e) => e.cheie))], opt);
  } catch (e) {
    await logError({ action: "easysales.stoc", severity: "warning", businessId: ctx.businessId, message: (e as Error).message });
    s = { fel: "reincearca", mesaj: (e as Error).message };
  }
  return Promise.all(elemente.map(async (el) => {
    if (s.fel === "gata") { await stergeDacaNeschimbat(admin, COADA, el); return "gata" as Soarta; }
    return amana(admin, el, s.fel === "asteapta" ? 10 * 60_000 : asteptareaDupaPauze(el.pauze), s.mesaj);
  }));
}

/* ═══════════════════════════════════════════════════════════════════════════
   PORNIREA SI OPRIREA
   ═══════════════════════════════════════════════════════════════════════════ */

export type RezultatBucla = { ok: true; mesaj?: string } | { ok: false; eroare: string };

const NU_E_PORNITA = "Sincronizarea stocului cu easySales pornește după proba pe contul de test easySales.";

/**
 * Pornirea buclei: `umbra` intai (recomandat, planul §5.6), apoi `canar`, apoi `efect`.
 * Cu efect, tot stocul intra in coada (o singura data, prin aceeasi siguranta de masa).
 */
export async function pornesteBucla(
  admin: Admin, ctx: ContextEasySales, mod: ModBucla, canar: string[], poarta: (cfg: EasySalesConfig) => StareBucla | null = bucla,
): Promise<RezultatBucla> {
  if (poarta === bucla && (!CATALOG_PORNIT || !STOC_PORNIT)) return { ok: false, eroare: NU_E_PORNITA };
  if (!ctx.cfg.catalog_activ) return { ok: false, eroare: "Pornește întâi catalogul: stocul pleacă numai pe produsele trimise." };
  if (mod !== "umbra" && poarta === bucla && FORMULA_STOC === null) return { ok: false, eroare: NU_E_PORNITA };
  const curate = [...new Set(canar.map((s) => s.trim()).filter(Boolean))].slice(0, 20);
  if (mod === "canar" && curate.length < 1) return { ok: false, eroare: "Alege între 1 și 20 de SKU-uri pentru canar." };
  const acum = new Date().toISOString();
  await ctx.dep.peticConfig(ctx.businessId, { stoc_activ: true, stoc_mod: mod, stoc_canar: curate, stoc_pornit_la: acum });
  Object.assign(ctx.cfg, { stoc_activ: true, stoc_mod: mod, stoc_canar: curate, stoc_pornit_la: acum });
  if (mod !== "umbra") {
    const { error } = await admin.rpc("easysales_pune_catalogul_in_coada", { p_business: ctx.businessId, p_ops: ["articol_stoc"] });
    if (error) return { ok: false, eroare: "Stocul nu s-a putut pune în coadă. Reîncearcă." };
  }
  return {
    ok: true,
    mesaj: mod === "umbra"
      ? "Bucla rulează în umbră: comenzile din celelalte canale se clasifică, fără să schimbe stocul."
      : mod === "canar" ? `Canarul pornește pe ${curate.length} SKU-uri.` : "Stocul pleacă în easySales pentru tot catalogul.",
  };
}

/**
 * Oprirea buclei (D20): stocul trece INTAI pe 0 la ei, verificat pe SKU, apoi consumul se opreste.
 * ⚠ Daca punerea pe 0 nu reuseste, bucla NU se opreste: altfel marfa ar ramane de vanzare la ei, fara
 * ca vanzarile sa mai scada stocul din Edinio.
 */
export async function opresteBucla(
  admin: Admin, ctx: ContextEasySales, poarta: (cfg: EasySalesConfig) => StareBucla | null = bucla,
): Promise<RezultatBucla> {
  /* ⚠ Fara comutatoarele din cod, coloanele stocului (migratia 74) pot lipsi: nu se atinge nimic. */
  if (poarta === bucla && (!CATALOG_PORNIT || !STOC_PORNIT)) return { ok: true, mesaj: "Sincronizarea stocului nu e pornită." };
  const { data, error } = await admin.from("easysales_produse").select("*")
    .eq("business_id", ctx.businessId).in("stare", ["trimis", "confirmat"]).gt("stoc_trimis", 0).limit(20_000);
  if (error) return { ok: false, eroare: "Stocul trimis nu s-a putut citi. Reîncearcă." };
  const deZero = ((data ?? []) as Rand[]).filter((r) => r.sku_trimis).map((rand) => ({ rand, stoc: 0 }));
  const r = await trimiteStocuri(admin, ctx, deZero);
  if (r.fel !== "gata") return { ok: false, eroare: `Stocul n-a putut fi pus pe 0 în easySales (${r.mesaj}). Bucla rămâne pornită; reîncearcă.` };
  const { count } = await admin.from("easysales_produse").select("id", { count: "exact", head: true })
    .eq("business_id", ctx.businessId).in("stare", ["trimis", "confirmat"]).gt("stoc_trimis", 0);
  if ((count ?? 0) > 0) return { ok: false, eroare: `${count} articole n-au trecut pe 0 în easySales. Bucla rămâne pornită; vezi „Produse de verificat”.` };
  await ctx.dep.peticConfig(ctx.businessId, { stoc_activ: false, stoc_val: null, stoc_val_asteapta: null, stoc_val_confirmat_la: null });
  ctx.cfg.stoc_activ = false;
  await admin.from("easysales_sync_queue").delete().eq("business_id", ctx.businessId).in("op", ["articol_stoc", "extern_citeste"]);
  return { ok: true, mesaj: `Stocul a trecut pe 0 în easySales (${deZero.length} articole), iar vânzările de acolo nu mai scad stocul din Edinio.` };
}

/** „Confirma stocul": valul curent poate pune articolele pe 0. */
export async function confirmaStocul(ctx: ContextEasySales): Promise<RezultatBucla> {
  if (!ctx.cfg.stoc_val_asteapta) return { ok: true, mesaj: "Nu așteaptă nicio confirmare." };
  const acum = new Date().toISOString();
  await ctx.dep.peticConfig(ctx.businessId, { stoc_val_confirmat_la: acum });
  ctx.cfg.stoc_val_confirmat_la = acum;
  return { ok: true, mesaj: "Stocul pleacă în easySales la următoarea trecere." };
}

/**
 * Pornirea simetrica (planul, §5.6): comenzile vazute in umbra, inca deschise, se consuma acum, la
 * cererea omului (recomandat cand stocul din Edinio e cel fizic). Se readuc la „prima vedere" si se
 * recitesc.
 */
export async function consumaComenzileDinUmbra(admin: Admin, ctx: ContextEasySales): Promise<RezultatBucla> {
  const stare = bucla(ctx.cfg);
  if (!impinge(stare)) return { ok: false, eroare: "Comenzile din umbră se consumă numai cu bucla în canar sau cu efect." };
  const { data, error } = await admin.from("easysales_comenzi").select("id, es_order_id")
    .eq("business_id", ctx.businessId).eq("directie", "intrare").eq("stare", "externa").eq("efect", "umbra")
    .is("es_anulata_la", null).not("es_status_cod", "in", "(0,3,6)").limit(500);
  if (error) return { ok: false, eroare: "Comenzile din umbră nu s-au putut citi." };
  const randuri = (data ?? []) as { id: string; es_order_id: string }[];
  for (const r of randuri) {
    await admin.from("easysales_comenzi").update({ efect: null }).eq("id", r.id).eq("efect", "umbra");
    await admin.rpc("easysales_pune_in_coada", { p_business: ctx.businessId, p_op: "extern_citeste", p_cheie: r.es_order_id, p_prioritate: 2 });
  }
  return { ok: true, mesaj: `${randuri.length} comenzi deschise se consumă în câteva minute.` };
}

/* ═══════════════════════════════════════════════════════════════════════════
   DERIVA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Deriva stocului (planul, §5.5), pe ce a citit verificarea zilnica (`stoc_la_ei`, din lista lor).
 * Nu se foloseste niciodata `/products/stock/list`: n-are filtru de website [A].
 *
 *   la ei mai mult     stocul nostru pleaca din nou (directia sigura);
 *   la ei mai putin    nu pleaca nimic; se recitesc comenzile pe SKU (`?product_sku=`), iar a doua
 *                      observatie la rand, neexplicata, porneste alarma „diferenta neexplicata".
 *
 * Se uita numai la articolele citite de la ultima trecere a derivei. Nu arunca.
 */
export async function pasulDerivei(admin: Admin, ctx: ContextEasySales, opt: OptiuniBucla): Promise<void> {
  const stare = (opt.poarta ?? bucla)(ctx.cfg);
  if (!impinge(stare)) return;
  const b = ctx.businessId;
  try {
    const dela = ctx.cfg.stoc_deriva_la ?? "1970-01-01T00:00:00Z";
    const { data, error } = await admin.from("easysales_produse").select("*")
      .eq("business_id", b).in("stare", ["trimis", "confirmat"]).gt("stoc_la_ei_la", dela).not("stoc_trimis", "is", null).limit(1000);
    if (error) throw new EroareCitireBaza("easysales.deriva", error.message);
    const randuri = ((data ?? []) as Rand[]).filter((r) => r.sku_trimis && (stare.mod !== "canar" || stare.canar.has(r.sku_trimis.toLowerCase())));
    if (randuri.length === 0) return;
    if (!(await comenzileCititeProaspat(admin, ctx, opt))) return;
    const setari = setarileCatalogului(ctx.cfg);
    const corectii = await corectiileStocului(admin, b, stare.formula);
    const produse = await citesteProdusele(admin, b, [...new Set(randuri.map((r) => r.product_uuid))]);
    const dup = new Set(ctx.cfg.catalog_sku_duplicate ?? []);
    const neexplicate: string[] = [];
    const acum = new Date().toISOString();
    for (const r of randuri) {
      if (!opt.maiAreTimp()) return;
      const p = produse.get(r.product_uuid);
      const a = p ? hotarareaProdusului(p, { setari, skuDuplicate: dup, skuInghetat: (_u, id) => (id === r.identitate ? r.sku_trimis : null) })
        .articole.find((x) => x.identitate === r.identitate) : undefined;
      const alNostru = p ? stocDeTrimis(stoculEdinio(p, a, setari), stare.formula, corectii.get(cheiaArticolului(r)) ?? FARA_CORECTIE) : 0;
      const alLor = Math.max(0, Number(r.stoc_la_ei) || 0);
      const h = hotarareaDerivei(alLor, alNostru, !!r.deriva_la);
      if (h === "nimic") {
        if (r.deriva_la) await scrieRand(admin, r.id, { deriva_la: null });
      } else if (h === "trimite") {
        await scrieRand(admin, r.id, { stoc_trimis: null, deriva_la: null });
        await admin.rpc("easysales_pune_in_coada", { p_business: b, p_op: "articol_stoc", p_cheie: r.product_uuid, p_prioritate: 3 });
      } else if (h === "recitesteComenzile") {
        await scrieRand(admin, r.id, { deriva_la: acum });
        const raspuns = await api.listaComenzi(ctx, { product_sku: r.sku_trimis!, modified_after: new Date(Date.now() - 7 * 24 * 3600_000).toISOString().replace("T", " ").slice(0, 19) });
        if (raspuns.ok) {
          const externe = (Array.isArray(raspuns.date) ? raspuns.date : []).map((c) => ({ id: String(c?.internal_id ?? ""), la: typeof c?.updated_at === "string" ? c.updated_at : null })).filter((x) => x.id);
          await puneExterneleInCoada(admin, b, externe);
        }
      } else {
        neexplicate.push(`${r.sku_trimis} (la ei ${alLor}, în Edinio ${alNostru})`);
      }
    }
    if (neexplicate.length) {
      await anuntaRar(admin, ctx.dep, b, ctx.cfg, "stoc-deriva", 24 * 3600_000, {
        titlu: "Stocul din easySales e mai mic decât cel din Edinio, fără o comandă care să explice",
        mesaj: `Diferențe neexplicate la a doua verificare: ${neexplicate.slice(0, 10).join("; ")}${neexplicate.length > 10 ? ` și încă ${neexplicate.length - 10}` : ""}. Verifică în easySales „Sursă stoc produse” și dacă cineva a schimbat stocul acolo.`,
        severitate: "error",
      });
    }
    await ctx.dep.peticConfig(b, { stoc_deriva_la: acum });
    ctx.cfg.stoc_deriva_la = acum;
  } catch (e) {
    await logError({ action: "easysales.deriva", severity: "warning", businessId: b, message: (e as Error).message });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   STAREA, PENTRU PANOU
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ComandaExternaPanou {
  internalId: string;
  numar: string | null;
  canal: string | null;
  stare: string;
  efect: string | null;
  motiv: string | null;
  linii: { sku: string; cantitate: number }[];
  cititaLa: string | null;
}

export interface StareBuclaPanou {
  /** Comutatoarele din cod (E4 asteapta E0 si M-STOC-1). */
  pornitaInCod: boolean;
  formula: FormulaStoc | null;
  activa: boolean;
  mod: ModBucla | null;
  canar: string[];
  pornitaLa: string | null;
  valAsteapta: { cerut_la: string; la_zero: number } | null;
  /** Comenzile altor canale, pe stari: `umbra`, `consumata`, `neconsumata`, `externa` (neinregistrata). */
  comenzi: Record<string, number>;
  ultimele: ComandaExternaPanou[];
}

/** ⚠ Fara comutatoarele din cod nu se atinge nimic din migratia 74 (`easysales_comenzi.linii`). */
export async function stareaBuclei(admin: Admin, businessId: string, cfg: EasySalesConfig): Promise<StareBuclaPanou> {
  const baza: StareBuclaPanou = {
    pornitaInCod: CATALOG_PORNIT && STOC_PORNIT,
    formula: FORMULA_STOC,
    activa: !!cfg.stoc_activ,
    mod: cfg.stoc_activ ? (cfg.stoc_mod ?? "umbra") : null,
    canar: cfg.stoc_canar ?? [],
    pornitaLa: cfg.stoc_pornit_la ?? null,
    valAsteapta: cfg.stoc_val_asteapta ?? null,
    comenzi: {},
    ultimele: [],
  };
  if (!baza.pornitaInCod) return baza;
  for (const [cheie, stare, efect] of [["umbra", "externa", "umbra"], ["consumata", "consumata", null], ["neconsumata", "neconsumata", null], ["externa", "externa", null]] as const) {
    let q = admin.from("easysales_comenzi").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("directie", "intrare").eq("stare", stare);
    q = efect ? q.eq("efect", efect) : stare === "externa" ? q.is("efect", null) : q;
    const { count } = await q;
    baza.comenzi[cheie] = count ?? 0;
  }
  const { data } = await admin.from("easysales_comenzi").select("es_order_id, es_display_id, canal, stare, efect, motiv, linii, citita_la")
    .eq("business_id", businessId).eq("directie", "intrare").order("citita_la", { ascending: false }).limit(20);
  baza.ultimele = ((data ?? []) as { es_order_id: string; es_display_id: string | null; canal: string | null; stare: string; efect: string | null; motiv: string | null; linii: unknown; citita_la: string | null }[])
    .map((r) => ({
      internalId: r.es_order_id, numar: r.es_display_id, canal: r.canal, stare: r.stare, efect: r.efect, motiv: r.motiv, cititaLa: r.citita_la,
      linii: (Array.isArray(r.linii) ? r.linii : []).map((l) => ({ sku: String((l as { sku?: unknown })?.sku ?? ""), cantitate: Number((l as { quantity?: unknown })?.quantity) || 0 })),
    }));
  return baza;
}
