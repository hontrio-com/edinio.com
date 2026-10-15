import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { imaginiPentruEmag } from "@/lib/emag/imagini";
import { stergeDacaNeschimbat, scrieDacaNeschimbat } from "@/lib/marketplace/coada-cas";
import type { RegimTvaMagazin } from "@/lib/pepita/pret";
import { storeBaseUrl } from "@/lib/seo";
import { permalinkuriDin } from "@/lib/storefront/permalinkuri";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import * as api from "./api";
import type { ContextEasySales } from "./client";
import { trimiteInLoturi, type RezultatLot, type SoartaElement } from "./catalog-loturi";
import { calculatorDeStoc, prelucreazaLotulStocului, type StareBucla } from "./bucla";
import {
  STARI_LA_EI, bucati, citesteProdusele, citesteRandurile, inParalel, inchis, laEi, scrieRand, type Rand,
} from "./catalog-baza";
import { COADA, asteptareaDupaPauze, type ElementCoada, type Soarta } from "./coada-element";
import {
  ASTEPTARE_DUPA_CATEGORII_MS, CATALOG_PORNIT, CATEGORIE_RECENTA_MS, CHEIE_CATEGORIE_DE_REZERVA, LOT_ARHIVARE,
  LOT_CATEGORII, LOT_PRETURI, LOT_PRODUSE, LOT_PRODUSE_OCTETI, SAVE_PE_ELEMENT_PANA_LA, SIGURANTA_MASA,
  ZILE_ARHIVARE_BLOCATA,
} from "./constante";
import { verificaMagazinul } from "./conectare";
import {
  hotarareaProdusului, setarileCatalogului, skuDuplicateleMagazinului,
  type ArticolCatalog, type HotarareProdus, type Motiv, type ProdusCatalog, type SetariCatalog,
} from "./eligibilitate";
import { eTrecatoare, mesajPentruOm, tineDeConexiune, type Clasificare } from "./erori";
import { IDENTITATE_PARINTE, skuGenerat } from "./identitate";
import { caracteristicileArticolului } from "./mapare-caracteristici";
import { categoriileDeTrimis, motivulRezervei, rezolvitorDeCategorii, type CategorieEdinio } from "./mapare-categorii";
import {
  amprentaContinutului, corpulProdusului, imaginileArticolului, octetii, preturileArticolului, type CorpProdus,
} from "./mapare-produs";
import { anunta, anuntaRar } from "./notificari";
import { idText } from "./numere";
import type { EasySalesConfig } from "./tipuri";

/**
 * Lucratorul catalogului (E3): categoriile, caracteristicile, produsele, preturile si arhivarea
 * (planul, §5.4 si §5.5).
 *
 * ═══ CINE DECIDE CE ═══
 *
 *   `eligibilitate.ts`   ce pleaca si de ce nu (aceeasi hotarare si pentru raportul de pregatire);
 *   `mapare-*.ts`        cum arata ce pleaca;
 *   `catalog-loturi.ts`  cum pleaca un sir de produse (pe element sau in loturi, cu vinovatul aflat);
 *   aici                 citirile din baza, ordinea (categoriile si caracteristicile INAINTEA
 *                        produselor care le folosesc [A]), scrierile in `easysales_produse` si coada.
 *
 * ═══ ⚠ CE NU PLEACA NICIODATA DE AICI ═══
 *
 *   - un pret NOU pe un articol deja trimis: pretul nou pleaca numai pe drumul lui
 *     (`/products/prices/bulk`), prin siguranta de masa. Save-ul de continut poarta pretul trimis
 *     ULTIMA oara (`pret_trimis`);
 *   - stoc real: in E3 totul pleaca pe 0 (planul, §5.4.8). Bucla de stoc e E4 (`STOC_PORNIT`);
 *   - un articol `arhivat`, `exclus` sau `disparut`: nici continut, nici pret, nici stoc. Un SKU
 *     confirmat care a disparut la ei nu se recreeaza singur (hotararea omului, planul §5.4.7).
 *
 * ═══ ⚠ SKU-UL SE INGHEATA, SI SE OPRESTE IN LOC SA SE INLOCUIASCA ═══
 *
 * Spre deosebire de linia unei comenzi (`asiguraArticolele`, care cade pe SKU-ul generat), un
 * articol de catalog al carui SKU propriu e deja luat de alt articol SE OPRESTE cu motivul
 * `sku-duplicat`. Catalogul poate astepta omul; o comanda nu.
 */

type Admin = SupabaseClient<Database>;
type RandCategorie = Database["public"]["Tables"]["easysales_categorii"]["Row"];

export interface OptiuniLucru {
  maiAreTimp: () => boolean;
  /** Poarta; implicit `catalogulPoateLucra`. Numai probele dau alta. */
  poarta?: (cfg: EasySalesConfig) => PoateLucra;
  /** Aducerea imaginilor la un format primit; implicit `imaginiPentruEmag`. Numai probele dau alta. */
  imagini?: typeof imaginiPentruEmag;
  /** Poarta buclei de stoc (E4); implicit `bucla`. Numai probele dau alta. */
  poartaBuclei?: (cfg: EasySalesConfig) => StareBucla | null;
}

/** Ce iese dintr-un pas al catalogului pentru un produs (sau pentru tot pasul). */
export type SoartaProdus =
  | { fel: "gata" }
  /** Imaginile se convertesc inca (`imaginiPentruEmag` le amana pe trecerea urmatoare). */
  | { fel: "imagini" }
  | { fel: "reincearca"; mesaj: string }
  | { fel: "asteapta_omul"; mesaj: string }
  /** O arhivare refuzata cu `blocked` (comenzi active la ei): se reia a doua zi. */
  | { fel: "blocat_la_ei"; mesaj: string };

const GATA: SoartaProdus = { fel: "gata" };

/* ═══════════════════════════════════════════════════════════════════════════
   POARTA
   ═══════════════════════════════════════════════════════════════════════════ */

export type PoateLucra = { da: true } | { da: false; sterge: boolean; motiv: string };

/**
 * Poate lucra catalogul acum?
 *
 * `sterge` spune ce se face cu lucrarile din coada: cand catalogul e OPRIT (in cod sau pe magazin)
 * ele n-au unde pleca si se sterg; cand e doar in PAUZA (token, pauza omului, website redenumit),
 * asteapta.
 */
export function catalogulPoateLucra(cfg: EasySalesConfig): PoateLucra {
  if (!CATALOG_PORNIT) return { da: false, sterge: true, motiv: "catalogul easySales nu e pornit in Edinio (E3 asteapta masuratorile E0)" };
  return poartaMagazinului(cfg);
}

/**
 * Partea de magazin a portii, fara comutatorul din cod.
 *
 * ⚠ O folosesc NUMAI probele de pe DEMO (`opt.poarta`), ca sa treaca lucratorul cap la cap fara sa
 * porneasca nimic in productie. Proba `catalogul-si-migratia-merg-impreuna.test.ts` cere ca niciun
 * fisier al aplicatiei sa n-o dea mai departe.
 */
export function poartaMagazinului(cfg: EasySalesConfig): PoateLucra {
  if (!cfg.connected || !cfg.catalog_activ) return { da: false, sterge: true, motiv: "catalogul e oprit pe magazin" };
  if (cfg.pauza) return { da: false, sterge: false, motiv: "integrarea e in pauza" };
  if (cfg.needs_reconnect) return { da: false, sterge: false, motiv: "tokenul cere reconectare" };
  if (cfg.catalog_pauza) return { da: false, sterge: false, motiv: `catalogul e in pauza: ${cfg.catalog_pauza}` };
  return { da: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MEDIUL MAGAZINULUI
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MediuMagazin {
  magazin: RegimTvaMagazin;
  moneda: string | null;
  /** Cota asa cum sta in setari, pentru verificarea legalitatii. */
  cotaBruta: unknown;
  baza: string;
  prefixProdus: string;
  setari: SetariCatalog;
  categorii: CategorieEdinio[];
}

/** Categoriile magazinului, toate (paginat: PostgREST taie la 1000). */
export async function citesteCategoriile(admin: Admin, businessId: string): Promise<CategorieEdinio[]> {
  const out: CategorieEdinio[] = [];
  let dupa: string | null = null;
  for (;;) {
    let q = admin.from("categories").select("id, name, parent_id").eq("business_id", businessId).order("id").limit(1000);
    if (dupa) q = q.gt("id", dupa);
    const { data, error } = await q;
    if (error) throw new EroareCitireBaza("easysales.categorii", error.message);
    const r = (data ?? []) as CategorieEdinio[];
    out.push(...r);
    if (r.length < 1000) break;
    dupa = r[r.length - 1].id;
  }
  return out;
}

/** Tot ce intra in produs fara sa fie pe `products`, citit o data pe lot. Arunca `EroareCitireBaza`. */
export async function incarcaMediul(admin: Admin, businessId: string, cfg: EasySalesConfig): Promise<MediuMagazin> {
  const [s, b, categorii] = await Promise.all([
    admin.from("store_settings")
      .select("vat_enabled, vat_rate, prices_include_vat, currency, permalinks:page_content->permalinks")
      .eq("business_id", businessId).maybeSingle(),
    admin.from("businesses").select("slug, custom_domain").eq("id", businessId).maybeSingle(),
    citesteCategoriile(admin, businessId),
  ]);
  if (s.error) throw new EroareCitireBaza("easysales.mediu", s.error.message);
  if (b.error || !b.data) throw new EroareCitireBaza("easysales.mediu", b.error?.message ?? "magazinul lipseste");
  const set = (s.data ?? {}) as unknown as {
    vat_enabled?: boolean | null; vat_rate?: unknown; prices_include_vat?: boolean | null; currency?: string | null; permalinks?: unknown;
  };
  const biz = b.data as { slug: string; custom_domain: string | null };
  return {
    magazin: {
      vat_enabled: set.vat_enabled === true,
      vat_rate: Number(set.vat_rate ?? 0) || 0,
      /* ⚠ Implicit ADEVARAT, ca peste tot in checkout: altfel s-ar adauga TVA a doua oara. */
      prices_include_vat: set.prices_include_vat ?? true,
    },
    moneda: typeof set.currency === "string" ? set.currency : null,
    cotaBruta: set.vat_rate,
    baza: storeBaseUrl(biz),
    prefixProdus: permalinkuriDin({ permalinks: set.permalinks }).produs,
    setari: setarileCatalogului(cfg),
    categorii,
  };
}

/**
 * Amprenta a ce schimba produsele trimise fara sa atinga `products`: TVA-ul, adresa magazinului,
 * prefixul produselor, setarile catalogului care schimba corpul sau eligibilitatea.
 *
 * ⚠ IN LOC DE CHEMARI SCRISE DE MANA in fiecare drum care schimba domeniul, permalinkurile sau TVA-ul
 * (planul, §5.4.6): o amprenta socotita la fiecare trecere prinde si drumurile de maine.
 */
export function amprentaMediului(m: MediuMagazin): string {
  const s = m.setari;
  return createHash("sha256").update(JSON.stringify([
    m.magazin.vat_enabled, m.magazin.vat_rate, m.magazin.prices_include_vat, m.baza, m.prefixProdus,
    s.skuGenerat, s.descriereDinNume, s.stocFix, s.termenZile,
  ]), "utf8").digest("hex").slice(0, 32);
}

/** Ce opreste catalogul intreg: moneda nu e RON (D29), cota de TVA nu e legala. `null` = trece. */
export function problemaMediului(m: MediuMagazin): string | null {
  return verificaMagazinul({ currency: m.moneda, vat_enabled: m.magazin.vat_enabled, vat_rate: m.cotaBruta });
}

/** Pune catalogul in pauza, cu motivul, si anunta omul o singura data. */
export async function puneCatalogulInPauza(admin: Admin, ctx: ContextEasySales, motiv: string, mesaj: string): Promise<void> {
  if (ctx.cfg.catalog_pauza === motiv) return;
  await ctx.dep.peticConfig(ctx.businessId, { catalog_pauza: motiv });
  ctx.cfg.catalog_pauza = motiv;
  await anuntaRar(admin, ctx.dep, ctx.businessId, ctx.cfg, `catalog-pauza:${motiv}`, 24 * 3600_000, {
    titlu: "Catalogul easySales e în pauză", mesaj, severitate: "error",
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SKU-URILE DUPLICATE, O DATA PE ORA
   ═══════════════════════════════════════════════════════════════════════════ */

const ORA = 3600_000;

/**
 * SKU-urile duplicate ale magazinului, din tot catalogul, pe o forma subtire (SKU-ul si variantele).
 * Arunca `EroareCitireBaza`.
 */
export async function socotesteSkuDuplicate(admin: Admin, businessId: string): Promise<Set<string>> {
  const produse: { sku: string | null; page_sections: unknown; is_active: boolean; is_bundle: boolean }[] = [];
  let dupa: string | null = null;
  for (;;) {
    let q = admin.from("products").select("id, sku, is_active, is_bundle, variants:page_sections->variants")
      .eq("business_id", businessId).order("id").limit(1000);
    if (dupa) q = q.gt("id", dupa);
    const { data, error } = await q;
    if (error) throw new EroareCitireBaza("easysales.sku-duplicate", error.message);
    const r = (data ?? []) as unknown as { id: string; sku: string | null; is_active: boolean; is_bundle: boolean; variants: unknown }[];
    for (const p of r) produse.push({ sku: p.sku, is_active: p.is_active, is_bundle: p.is_bundle, page_sections: { variants: p.variants } });
    if (r.length < 1000) break;
    dupa = r[r.length - 1].id;
  }
  return skuDuplicateleMagazinului(produse);
}

/** Reface lista SKU-urilor duplicate cand e mai veche de o ora. Nu arunca. */
export async function improspateazaSkuDuplicate(admin: Admin, ctx: ContextEasySales, fortat = false): Promise<void> {
  const la = ctx.cfg.catalog_sku_duplicate_la ? Date.parse(ctx.cfg.catalog_sku_duplicate_la) : 0;
  if (!fortat && Number.isFinite(la) && Date.now() - la < ORA) return;
  try {
    const set = await socotesteSkuDuplicate(admin, ctx.businessId);
    const lista = [...set].slice(0, 5000);
    const acum = new Date().toISOString();
    await ctx.dep.peticConfig(ctx.businessId, { catalog_sku_duplicate: lista, catalog_sku_duplicate_la: acum });
    ctx.cfg.catalog_sku_duplicate = lista;
    ctx.cfg.catalog_sku_duplicate_la = acum;
  } catch (e) {
    await logError({ action: "easysales.catalog", severity: "warning", businessId: ctx.businessId, message: `SKU-urile duplicate: ${(e as Error).message}` });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   AJUTOARE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Verdictul unui raspuns, dus la ce face pasul: mai departe, reincercare sau omul. */
function cePasDupa(c: Clasificare): SoartaProdus | null {
  if (c.verdict === "reusit") return null;
  if (eTrecatoare(c.verdict) || c.verdict === "necunoscut") return { fel: "reincearca", mesaj: c.mesaj || mesajPentruOm(c) };
  if (tineDeConexiune(c.verdict) || c.verdict === "interzis" || c.verdict === "plafon") {
    return { fel: "asteapta_omul", mesaj: mesajPentruOm(c) };
  }
  return null;
}

function primulMotiv(motive: readonly Motiv[]): string {
  return (motive.find((m) => m.nivel === "blocheaza") ?? motive[0])?.mesaj ?? "";
}

/* ═══════════════════════════════════════════════════════════════════════════
   CATEGORIILE
   ═══════════════════════════════════════════════════════════════════════════ */

export type RezultatPas = { fel: "gata" } | { fel: "reincearca"; mesaj: string } | { fel: "asteapta_omul"; mesaj: string };

/**
 * ⚠ easySales creeaza categoriile si caracteristicile IN FUNDAL: `save/bulk` raspunde 200 pe loc, dar
 * un produs care le foloseste in secundele urmatoare primeste 422 (masurat pe 15.10.2026, vezi
 * `ASTEPTARE_DUPA_CATEGORII_MS`). Cele doua reguli de mai jos tin produsul departe de fereastra aceea.
 */

/** Trimisa de destul timp ca un produs s-o poata folosi? Fara `trimis_la` (randuri vechi): da. */
export function eAsezata(trimisLa: string | null | undefined, acumMs: number, pragMs = ASTEPTARE_DUPA_CATEGORII_MS): boolean {
  if (!trimisLa) return true;
  const la = Date.parse(trimisLa);
  return !Number.isFinite(la) || acumMs - la >= pragMs;
}

/**
 * Un 422 al produsului e de fapt „categoria (sau caracteristica) lui inca nu exista la ei”? Da, numai
 * cand eroarea e chiar pe campul acela si produsul poarta una trimisa de curand
 * (`CATEGORIE_RECENTA_MS`). Atunci produsul se reia; altfel ramane `respins`, la om.
 *
 * Campul vine in doua forme: `product.categories.0: ...` (Save pe element) si `categories.0: ...`
 * (elementul unui lot, fara `products.N.`, vezi `eroriPeElement`).
 */
export function refuzPeCategorieProaspata(
  mesaj: string,
  corp: Pick<CorpProdus, "categories" | "characteristics">,
  categoriiRecente: ReadonlySet<number>,
  caracteristiciRecente: ReadonlySet<number>,
): boolean {
  if (/(?:^|[\s;.])categories\.\d+/.test(mesaj) && corp.categories.some((id) => categoriiRecente.has(Number(id)))) return true;
  if (/(?:^|[\s;.])characteristics\.\d+/.test(mesaj) && corp.characteristics.some((c) => caracteristiciRecente.has(Number(c.id)))) return true;
  return false;
}

async function citesteRandurileCategoriilor(admin: Admin, businessId: string): Promise<RandCategorie[]> {
  const { data, error } = await admin.from("easysales_categorii").select("*").eq("business_id", businessId).limit(5000);
  if (error) throw new EroareCitireBaza("easysales.categorii", error.message);
  return (data ?? []) as RandCategorie[];
}

/**
 * Arborele de categorii, adus la zi la ei: categoriile noi si cele redenumite (calea lor s-a schimbat)
 * pleaca prin `categories/save/bulk`, cate cel mult 100.
 *
 * ⚠ O categorie stearsa din Edinio NU se sterge la ei (o categorie atasata da 422 [A]; curatenia e o
 * hotarare, E5): randul ei devine `scoasa`, iar produsele care o purtau dupa nume se retrimit, fiindca
 * acum pleaca in categoria de rezerva.
 */
export async function sincronizeazaCategoriile(admin: Admin, ctx: ContextEasySales, mediu: MediuMagazin): Promise<RezultatPas> {
  const b = ctx.businessId;
  const dorite = categoriileDeTrimis(mediu.categorii);
  let randuri = await citesteRandurileCategoriilor(admin, b);
  const dupaCheie = new Map(randuri.map((r) => [r.cheie, r]));

  const lipsa = dorite.filter((d) => !dupaCheie.has(d.cheie));
  if (lipsa.length) {
    const { error } = await admin.from("easysales_categorii").upsert(
      lipsa.map((d) => ({ business_id: b, cheie: d.cheie, category_id: d.categoryId, nume_edinio: d.numeEdinio, stare: "de_trimis" })),
      { onConflict: "business_id,cheie", ignoreDuplicates: true },
    );
    if (error) throw new EroareCitireBaza("easysales.categorii", error.message);
    randuri = await citesteRandurileCategoriilor(admin, b);
  }
  const acum = new Map(randuri.map((r) => [r.cheie, r]));

  /* Categoriile sterse din Edinio: `scoasa`, iar produsele lor inapoi in coada. */
  const cheiDorite = new Set(dorite.map((d) => d.cheie));
  for (const r of randuri) {
    if (cheiDorite.has(r.cheie) || r.stare === "scoasa") continue;
    await admin.from("easysales_categorii").update({ stare: "scoasa", updated_at: new Date().toISOString() }).eq("id", r.id);
    if (r.nume_edinio) {
      const { data } = await admin.from("products").select("id").eq("business_id", b).eq("category", r.nume_edinio).limit(5000);
      for (const p of (data ?? []) as { id: string }[]) {
        await admin.rpc("easysales_pune_in_coada", { p_business: b, p_op: "articol_continut", p_cheie: p.id, p_prioritate: 5 });
      }
    }
  }

  const deTrimis = dorite
    .map((d) => ({ d, r: acum.get(d.cheie) }))
    .filter((x): x is { d: (typeof dorite)[number]; r: RandCategorie } => !!x.r)
    .filter(({ d, r }) => r.stare === "de_trimis" || r.nume_trimis !== d.nume || r.stare === "scoasa");
  for (const lot of bucati(deTrimis, LOT_CATEGORII)) {
    const raspuns = await api.salveazaCategoriile(ctx, lot.map(({ d, r }) => ({ category_website_id: Number(r.id), name: d.nume })));
    if (raspuns.verdict === "validare" && lot.length > 1) {
      /* Lotul nu spune care categorie supara: fiecare pleaca singura, ca sa se afle. */
      for (const x of lot) {
        const unul = await api.salveazaCategoriile(ctx, [{ category_website_id: Number(x.r.id), name: x.d.nume }]);
        const p = cePasDupa(unul);
        if (p && p.fel !== "gata") return p as RezultatPas;
        await admin.from("easysales_categorii").update(unul.ok
          ? { stare: "trimis", nume_trimis: x.d.nume, nume_edinio: x.d.numeEdinio, category_id: x.d.categoryId, trimis_la: new Date().toISOString(), motiv: null, updated_at: new Date().toISOString() }
          : { stare: "respins", motiv: unul.campuri.join("; ").slice(0, 500) || unul.mesaj, updated_at: new Date().toISOString() }).eq("id", x.r.id);
      }
      continue;
    }
    const p = cePasDupa(raspuns);
    if (p && p.fel !== "gata") return p as RezultatPas;
    const acumIso = new Date().toISOString();
    await inParalel(lot, 8, async ({ d, r }) => {
      await admin.from("easysales_categorii").update(raspuns.ok
        ? { stare: "trimis", nume_trimis: d.nume, nume_edinio: d.numeEdinio, category_id: d.categoryId, trimis_la: acumIso, motiv: null, updated_at: acumIso }
        : { stare: "respins", motiv: (raspuns.campuri.join("; ") || raspuns.mesaj).slice(0, 500), updated_at: acumIso }).eq("id", r.id);
    });
  }
  return { fel: "gata" };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CARACTERISTICILE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Caracteristicile cerute (cheie -> nume), aduse la ei. Intoarce id-urile celor trimise, cheile celor
 * prea proaspete ca un produs sa le foloseasca inca (`eAsezata`) si id-urile celor trimise de curand
 * (`refuzPeCategorieProaspata`).
 */
async function asiguraCaracteristicile(
  admin: Admin, ctx: ContextEasySales, dorite: Map<string, string>,
): Promise<{ fel: "gata"; iduri: Map<string, number>; proaspete: Set<string>; recente: Set<number> } | { fel: "reincearca" | "asteapta_omul"; mesaj: string }> {
  const b = ctx.businessId;
  const iduri = new Map<string, number>();
  const proaspete = new Set<string>();
  const recente = new Set<number>();
  if (dorite.size === 0) return { fel: "gata", iduri, proaspete, recente };
  const chei = [...dorite.keys()];
  const citeste = async () => {
    const out: Database["public"]["Tables"]["easysales_caracteristici"]["Row"][] = [];
    for (const lot of bucati(chei, 100)) {
      const { data, error } = await admin.from("easysales_caracteristici").select("*").eq("business_id", b).in("cheie_normalizata", lot);
      if (error) throw new EroareCitireBaza("easysales.caracteristici", error.message);
      out.push(...(data ?? []));
    }
    return out;
  };
  let randuri = await citeste();
  const lipsa = chei.filter((k) => !randuri.some((r) => r.cheie_normalizata === k));
  if (lipsa.length) {
    const { error } = await admin.from("easysales_caracteristici").upsert(
      lipsa.map((k) => ({ business_id: b, cheie_normalizata: k, nume: dorite.get(k)!, stare: "de_trimis" })),
      { onConflict: "business_id,cheie_normalizata", ignoreDuplicates: true },
    );
    if (error) throw new EroareCitireBaza("easysales.caracteristici", error.message);
    randuri = await citeste();
  }
  const deTrimis = randuri.filter((r) => r.stare === "de_trimis");
  for (const lot of bucati(deTrimis, LOT_CATEGORII)) {
    const raspuns = await api.salveazaCaracteristicile(ctx, lot.map((r) => ({ characteristic_website_id: Number(r.id), name: r.nume })));
    const p = cePasDupa(raspuns);
    if (p && (p.fel === "reincearca" || p.fel === "asteapta_omul")) return p;
    const acumIso = new Date().toISOString();
    await inParalel(lot, 8, async (r) => {
      await admin.from("easysales_caracteristici").update(raspuns.ok
        ? { stare: "trimis", trimis_la: acumIso, motiv: null, updated_at: acumIso }
        : { stare: "respins", motiv: (raspuns.campuri.join("; ") || raspuns.mesaj).slice(0, 500), updated_at: acumIso }).eq("id", r.id);
      r.stare = raspuns.ok ? "trimis" : "respins";
      if (raspuns.ok) r.trimis_la = acumIso;
    });
  }
  const acumMs = Date.now();
  for (const r of randuri) {
    if (r.stare !== "trimis") continue;
    iduri.set(r.cheie_normalizata, Number(r.id));
    if (!eAsezata(r.trimis_la, acumMs)) proaspete.add(r.cheie_normalizata);
    if (!eAsezata(r.trimis_la, acumMs, CATEGORIE_RECENTA_MS)) recente.add(Number(r.id));
  }
  return { fel: "gata", iduri, proaspete, recente };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ALOCAREA ARTICOLELOR
   ═══════════════════════════════════════════════════════════════════════════ */

function eUnicitate(e: { code?: string; message?: string } | null, pe: "sku" | "cheie"): boolean {
  if (!e || e.code !== "23505") return false;
  const pePeSku = (e.message ?? "").includes("easysales_produse_sku_idx");
  return pe === "sku" ? pePeSku : !pePeSku;
}

/**
 * Randul articolului, creat sau completat, cu SKU-ul inghetat acum daca n-are inca unul.
 * Intoarce randul, sau `null` cand SKU-ul dorit e deja al altui articol (articolul se opreste).
 */
async function asiguraRandul(
  admin: Admin, businessId: string, productUuid: string, identitate: string,
  skuPropriu: string | null, existent: Rand | undefined, parinteId: number | null,
): Promise<Rand | null> {
  const sku = skuPropriu ?? skuGenerat(productUuid, identitate);
  const recitit = async () => {
    const { data, error } = await admin.from("easysales_produse").select("*")
      .eq("business_id", businessId).eq("product_uuid", productUuid).eq("identitate", identitate).maybeSingle();
    if (error) throw new EroareCitireBaza("easysales.articole", error.message);
    return (data as Rand | null) ?? null;
  };
  if (existent?.sku_trimis) {
    if (parinteId != null && existent.parinte_id !== parinteId) await scrieRand(admin, existent.id, { parinte_id: parinteId });
    return existent;
  }
  if (existent) {
    const { data, error } = await admin.from("easysales_produse")
      .update({ sku_trimis: sku, sku_generat: !skuPropriu, parinte_id: parinteId, updated_at: new Date().toISOString() })
      .eq("id", existent.id).is("sku_trimis", null).select("*");
    if (eUnicitate(error, "sku")) return null;
    if (error) throw new EroareCitireBaza("easysales.articole", error.message);
    return ((data ?? [])[0] as Rand | undefined) ?? (await recitit());
  }
  const { data, error } = await admin.from("easysales_produse").insert({
    business_id: businessId, product_id: productUuid, product_uuid: productUuid, identitate,
    sku_trimis: sku, sku_generat: !skuPropriu, parinte_id: parinteId, stare: "de_trimis",
  }).select("*").single();
  if (eUnicitate(error, "sku")) return null;
  if (eUnicitate(error, "cheie")) return recitit();
  if (error) throw new EroareCitireBaza("easysales.articole", error.message);
  return data as Rand;
}

/** Randul parintelui variantelor: `parent_id` al combinatiilor. Netrimis, fara SKU. */
async function asiguraParintele(admin: Admin, businessId: string, productUuid: string, existent: Rand | undefined): Promise<number> {
  if (existent) return Number(existent.id);
  const { error } = await admin.from("easysales_produse").upsert(
    { business_id: businessId, product_id: productUuid, product_uuid: productUuid, identitate: IDENTITATE_PARINTE, stare: "nou" },
    { onConflict: "business_id,product_uuid,identitate", ignoreDuplicates: true },
  );
  if (error) throw new EroareCitireBaza("easysales.articole", error.message);
  const { data, error: e2 } = await admin.from("easysales_produse").select("id")
    .eq("business_id", businessId).eq("product_uuid", productUuid).eq("identitate", IDENTITATE_PARINTE).single();
  if (e2 || !data) throw new EroareCitireBaza("easysales.articole", e2?.message ?? "parintele lipseste");
  return Number((data as { id: number }).id);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTINUTUL
   ═══════════════════════════════════════════════════════════════════════════ */

interface DeTrimis {
  rand: Rand;
  corp: CorpProdus;
  amprenta: string;
  productUuid: string;
}

/** Cheia categoriei frunza a produsului, si avertismentul cand pleaca in rezerva. */
function categoriaProdusului(p: ProdusCatalog, mediu: MediuMagazin): { cheie: string; motiv: Motiv | null } {
  const r = rezolvitorDeCategorii(mediu.categorii)(p.category);
  if (r.fel === "gasita") return { cheie: r.cheie, motiv: null };
  return { cheie: CHEIE_CATEGORIE_DE_REZERVA, motiv: { cod: "categorie-de-rezerva", nivel: "avertisment", mesaj: motivulRezervei(r.motiv, p.category) } };
}

/**
 * Articolele scoase din produs (combinatie stearsa sau stinsa, trecerea simplu <-> variante): ce s-a
 * trimis ramane la ei. D30: stoc 0 (implicit; in E3 totul e deja pe 0) sau arhivare.
 *
 * ⚠ Inainte de a socoti un articol „scos", se cauta daca n-a fost doar REDENUMIT: o combinatie fara
 * `uid` isi schimba identitatea odata cu titlul. Daca un articol nou are exact SKU-ul inghetat al unui
 * articol scos al aceluiasi produs, e acelasi articol: randul se re-cheie, nu se naste un produs nou
 * la ei (planul, §5.4.7).
 */
async function reCheieRedenumirile(admin: Admin, h: HotarareProdus, randuri: Rand[]): Promise<Rand[]> {
  const curente = new Set(h.articole.map((a) => a.identitate));
  const scoase = randuri.filter((r) => r.identitate !== IDENTITATE_PARINTE && !curente.has(r.identitate) && r.sku_trimis && !inchis(r));
  if (scoase.length === 0) return randuri;
  const cuRand = new Set(randuri.map((r) => r.identitate));
  for (const a of h.articole) {
    if (cuRand.has(a.identitate) || !a.combo) continue;
    const propriu = (a.combo.sku ?? "").trim().toLowerCase();
    if (!propriu) continue;
    const potriviri = scoase.filter((r) => (r.sku_trimis ?? "").toLowerCase() === propriu);
    if (potriviri.length !== 1) continue;
    const r = potriviri[0];
    const { data, error } = await admin.from("easysales_produse")
      .update({ identitate: a.identitate, updated_at: new Date().toISOString() })
      .eq("id", r.id).eq("identitate", r.identitate).select("*");
    if (!error && (data ?? []).length === 1) {
      Object.assign(r, (data as Rand[])[0]);
      cuRand.add(a.identitate);
      scoase.splice(scoase.indexOf(r), 1);
    }
  }
  return randuri;
}

/**
 * Continutul produselor date: ce s-a schimbat pleaca, ce nu, nu (amprenta), iar fiecare articol
 * isi scrie starea. Intoarce soarta fiecarui produs, pentru coada. Arunca `EroareCitireBaza`.
 */
export async function prelucreazaContinutul(
  admin: Admin, ctx: ContextEasySales, mediu: MediuMagazin, uuids: string[], opt: OptiuniLucru,
): Promise<Map<string, SoartaProdus>> {
  const imaginile = opt.imagini ?? imaginiPentruEmag;
  const b = ctx.businessId;
  const out = new Map<string, SoartaProdus>();
  const produse = await citesteProdusele(admin, b, uuids);
  const toateRandurile = await citesteRandurile(admin, b, uuids);
  const randuriPe = new Map<string, Rand[]>();
  for (const r of toateRandurile) randuriPe.set(r.product_uuid, [...(randuriPe.get(r.product_uuid) ?? []), r]);
  const dup = new Set(ctx.cfg.catalog_sku_duplicate ?? []);

  /* Produsul sters intre punere si prelucrare: drumul stergerii il ia. */
  for (const u of uuids) {
    if (!produse.has(u)) {
      if ((randuriPe.get(u) ?? []).length) await admin.rpc("easysales_pune_in_coada", { p_business: b, p_op: "articol_sterge", p_cheie: u, p_prioritate: 6 });
      out.set(u, GATA);
    }
  }

  /* Categoriile trebuie sa existe la ei INAINTEA produselor care le folosesc [A]. */
  let categorii = await citesteRandurileCategoriilor(admin, b);
  const nevoie = new Set([...produse.values()].map((p) => categoriaProdusului(p, mediu).cheie));
  if ([...nevoie].some((k) => categorii.find((c) => c.cheie === k)?.stare !== "trimis")) {
    const r = await sincronizeazaCategoriile(admin, ctx, mediu);
    if (r.fel !== "gata") {
      for (const u of produse.keys()) out.set(u, r);
      return out;
    }
    categorii = await citesteRandurileCategoriilor(admin, b);
  }
  /* O categorie abia trimisa nu se da inca produselor: ele asteapta trecerea urmatoare (`eAsezata`). */
  const acumMs = Date.now();
  const idCategorie = new Map(categorii.filter((c) => c.stare === "trimis" && eAsezata(c.trimis_la, acumMs)).map((c) => [c.cheie, Number(c.id)]));
  const categoriiRecente = new Set(categorii.filter((c) => c.stare === "trimis" && !eAsezata(c.trimis_la, acumMs, CATEGORIE_RECENTA_MS)).map((c) => Number(c.id)));

  /* Hotararile si alocarea. */
  const deTrimis: DeTrimis[] = [];
  const dorite = new Map<string, string>();
  const peArticol: { p: ProdusCatalog; h: HotarareProdus; a: ArticolCatalog; rand: Rand; parinteId: number | null; caracteristici: { cheie: string; valoare: string }[]; cheieCategorie: string }[] = [];
  const deArhivat: Rand[] = [];

  for (const [u, p] of produse) {
    let randuri = randuriPe.get(u) ?? [];
    const dupaIdentitate = () => new Map(randuri.map((r) => [r.identitate, r]));
    const inghetat = (pu: string, id: string) => {
      const r = dupaIdentitate().get(id);
      return pu === u && r?.sku_trimis ? r.sku_trimis : null;
    };
    const h = hotarareaProdusului(p, { setari: mediu.setari, skuDuplicate: dup, skuInghetat: inghetat });
    randuri = await reCheieRedenumirile(admin, h, randuri);
    const harta = dupaIdentitate();
    const cat = categoriaProdusului(p, mediu);

    /* Articolele scoase din produs. */
    const curente = new Set(h.articole.map((a) => a.identitate));
    for (const r of randuri) {
      if (r.identitate === IDENTITATE_PARINTE || curente.has(r.identitate) || inchis(r)) continue;
      if (laEi(r) && mediu.setari.combinatieScoasa === "arhivare") deArhivat.push(r);
      else if (r.motiv !== "Varianta nu mai există în Edinio.") await scrieRand(admin, r.id, { motiv: "Varianta nu mai există în Edinio." });
    }

    const eligibile = h.articole.filter((a) => a.eligibil);
    /* Ce nu pleaca isi scrie motivul, daca are rand si n-a plecat inca. */
    for (const a of h.articole) {
      if (a.eligibil) continue;
      const r = harta.get(a.identitate);
      if (!r || inchis(r)) continue;
      const motiv = primulMotiv([...h.motive, ...a.motive]).slice(0, 500);
      if (laEi(r)) {
        if (r.motiv !== motiv) await scrieRand(admin, r.id, { motiv });
      } else if (r.stare !== "blocat" || r.motiv !== motiv) {
        await scrieRand(admin, r.id, { stare: "blocat", motiv });
      }
    }
    if (eligibile.length === 0) { out.set(u, GATA); continue; }

    /* O categorie refuzata de ei (`respins`) nu tine produsul pe loc: pleaca in rezerva, cu motivul in rand. */
    const refuzata = categorii.find((c) => c.cheie === cat.cheie)?.stare === "respins";
    const cheieCategorie = idCategorie.has(cat.cheie) ? cat.cheie
      : refuzata && idCategorie.has(CHEIE_CATEGORIE_DE_REZERVA) ? CHEIE_CATEGORIE_DE_REZERVA : null;
    if (!cheieCategorie) {
      out.set(u, { fel: "reincearca", mesaj: "categoria produsului n-a ajuns inca in easySales" });
      continue;
    }
    const parinteId = h.segment === "variante" ? await asiguraParintele(admin, b, u, harta.get(IDENTITATE_PARINTE)) : null;
    for (const a of eligibile) {
      const existent = harta.get(a.identitate);
      if (existent && inchis(existent)) continue;
      const rand = await asiguraRandul(admin, b, u, a.identitate, a.sku, existent, parinteId);
      if (!rand) {
        const motiv = `SKU-ul ${a.sku} e deja folosit de alt articol trimis în easySales. În easySales SKU-ul trebuie să fie unic.`;
        if (existent) await scrieRand(admin, existent.id, { stare: "blocat", motiv });
        continue;
      }
      const { caracteristici } = caracteristicileArticolului(p.page_sections, h.variante, a.combo);
      for (const c of caracteristici) if (!dorite.has(c.cheie)) dorite.set(c.cheie, c.nume);
      peArticol.push({ p, h, a, rand, parinteId, caracteristici, cheieCategorie });
    }
    if (!out.has(u)) out.set(u, GATA);
  }

  /*
   * Stocul care pleaca in Save: 0 cat bucla de stoc e oprita (E3); cu bucla pornita, cel proaspat la
   * un articol nou si cel mai mic dintre trimis si proaspat la unul vechi (`calculatorDeStoc`).
   */
  const stocul = peArticol.length
    ? await calculatorDeStoc(admin, ctx, { maiAreTimp: opt.maiAreTimp, poarta: opt.poartaBuclei })
    : () => 0;

  /* Caracteristicile, INAINTEA produselor. */
  const car = await asiguraCaracteristicile(admin, ctx, dorite);
  if (car.fel !== "gata") {
    for (const x of peArticol) out.set(x.p.id, car);
    return out;
  }

  /* Imaginile, o data pe produs, pentru toate articolele lui. */
  const imaginiPe = new Map<string, { noi: Map<string, string>; amanat: boolean }>();
  for (const p of new Set(peArticol.map((x) => x.p))) {
    if (!opt.maiAreTimp()) { out.set(p.id, { fel: "reincearca", mesaj: "bugetul trecerii s-a terminat" }); continue; }
    const toate = [...new Set(peArticol.filter((x) => x.p === p).flatMap((x) => imaginileArticolului(p, x.a)))];
    const r = await imaginile(b, toate);
    const amanat = r.nereusite.some((n) => /amânat/.test(n.motiv));
    imaginiPe.set(p.id, { noi: r.noi, amanat });
    if (amanat) out.set(p.id, { fel: "imagini" });
  }

  for (const x of peArticol) {
    /* O caracteristica abia trimisa: produsul asteapta, ca sa nu plece fara ea sau sa primeasca 422. */
    if (x.caracteristici.some((c) => car.proaspete.has(c.cheie))) {
      out.set(x.p.id, { fel: "reincearca", mesaj: "caracteristicile produsului abia au plecat in easySales" });
      continue;
    }
    const im = imaginiPe.get(x.p.id);
    if (!im || im.amanat || out.get(x.p.id)?.fel === "reincearca") continue;
    const imagini = imaginileArticolului(x.p, x.a).map((u) => im.noi.get(u)).filter((u): u is string => !!u);
    const caracteristici = x.caracteristici
      .filter((c) => car.iduri.has(c.cheie))
      .map((c) => ({ id: car.iduri.get(c.cheie)!, value: c.valoare }));
    const preturi = laEi(x.rand) && x.rand.pret_trimis != null
      ? { sale_price: Number(x.rand.pret_trimis), full_price: Number(x.rand.pret_vechi_trimis ?? x.rand.pret_trimis) }
      : preturileArticolului(x.a, mediu.magazin);
    const corp = corpulProdusului({
      produs: x.p, articol: x.a, productWebsiteId: Number(x.rand.id), sku: x.rand.sku_trimis!, parinteId: x.parinteId,
      magazin: mediu.magazin, baza: mediu.baza, prefixProdus: mediu.prefixProdus,
      categorii: [idCategorie.get(x.cheieCategorie)!],
      caracteristici, imagini, stoc: stocul(x.p, x.a, x.rand), preturi, termenZile: mediu.setari.termenZile, descriereDinNume: mediu.setari.descriereDinNume,
    });
    const amprenta = amprentaContinutului(corp);
    if (amprenta === x.rand.amprenta && (laEi(x.rand) || x.rand.stare === "respins")) continue;
    deTrimis.push({ rand: x.rand, corp, amprenta, productUuid: x.p.id });
  }

  /* Trimiterea. */
  const soarta = await trimiteInLoturi<DeTrimis>({
    elemente: deTrimis,
    octeti: (e) => octetii(e.corp),
    maxLot: LOT_PRODUSE, maxOcteti: LOT_PRODUSE_OCTETI, peElementPanaLa: SAVE_PE_ELEMENT_PANA_LA,
    maiAreTimp: opt.maiAreTimp,
    trimiteLot: async (lot): Promise<RezultatLot> => {
      const r = await api.salveazaProdusele(ctx, lot.map((e) => e.corp));
      if (r.ok) return { fel: "ok" };
      if (r.verdict === "necunoscut") return { fel: "necunoscut" };
      if (r.verdict === "validare") return { fel: "validare", campuri: r.campuri };
      return { fel: "opreste", mesaj: r.mesaj || mesajPentruOm(r) };
    },
    trimiteUnul: async (e): Promise<SoartaElement> => {
      const r = await api.salveazaProdusul(ctx, e.corp);
      if (r.ok) {
        const d = (r.date ?? {}) as Record<string, unknown>;
        const seVede = String(d.sku ?? "").toLowerCase() === e.corp.sku.toLowerCase()
          && idText(d.product_website_id) === String(e.corp.product_website_id);
        return seVede ? { fel: "confirmat", esId: idText(d.id) } : { fel: "trimis" };
      }
      if (r.verdict === "necunoscut") return { fel: "trimis" };
      if (r.verdict === "validare" || r.verdict === "refuz") return { fel: "respins", mesaj: (r.campuri.join("; ") || r.mesaj).slice(0, 500) };
      return { fel: "oprit", mesaj: r.mesaj || mesajPentruOm(r) };
    },
  });

  const acum = new Date().toISOString();
  let oprire: SoartaProdus | null = null;
  await inParalel(deTrimis.map((e, i) => ({ e, s: soarta[i] })), 8, async ({ e, s }) => {
    const pretTrimis = { pret_trimis: e.corp.sale_price, pret_vechi_trimis: e.corp.full_price, stoc_trimis: e.corp.stock };
    switch (s.fel) {
      case "confirmat":
        await scrieRand(admin, e.rand.id, {
          stare: "confirmat", amprenta: e.amprenta, ...pretTrimis, trimis_la: acum, confirmat_la: e.rand.confirmat_la ?? acum,
          verificat_la: acum, lipsa_la: null, motiv: null, ...(s.esId ? { es_product_id: s.esId } : {}),
        });
        break;
      case "trimis":
        await scrieRand(admin, e.rand.id, { stare: e.rand.stare === "confirmat" ? "confirmat" : "trimis", amprenta: e.amprenta, ...pretTrimis, trimis_la: acum, motiv: null });
        break;
      case "respins":
        /* Refuzul pe o categorie sau caracteristica trimisa de curand: inca n-o creasera. Se reia, fara amprenta. */
        if (refuzPeCategorieProaspata(s.mesaj, e.corp, categoriiRecente, car.recente)) {
          out.set(e.productUuid, { fel: "reincearca", mesaj: `easySales inca n-a creat categoria sau caracteristicile produsului: ${s.mesaj}`.slice(0, 500) });
          break;
        }
        /* Amprenta se scrie si aici: acelasi continut nu se mai trimite pana nu se schimba ceva. */
        await scrieRand(admin, e.rand.id, { stare: e.rand.stare === "confirmat" ? "confirmat" : "respins", amprenta: e.amprenta, motiv: `easySales a refuzat produsul: ${s.mesaj}`.slice(0, 500) });
        break;
      case "oprit":
        oprire = { fel: "reincearca", mesaj: s.mesaj };
        out.set(e.productUuid, oprire);
        break;
    }
  });

  if (deArhivat.length) {
    const r = await arhiveaza(admin, ctx, deArhivat);
    if (r.fel === "reincearca" || r.fel === "asteapta_omul") {
      for (const x of deArhivat) out.set(x.product_uuid, r);
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ARHIVAREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `PATCH /products/archive/bulk`, cate cel mult 50 [A]. `archived` si `not_found` inchid articolul;
 * `blocked` (comenzi active la ei) il lasa cum e, cu ziua primei refuzari, ca sa se reia a doua zi.
 */
async function arhiveaza(admin: Admin, ctx: ContextEasySales, randuri: Rand[]): Promise<SoartaProdus> {
  let rezultat: SoartaProdus = GATA;
  for (const lot of bucati(randuri.filter((r) => r.sku_trimis), LOT_ARHIVARE)) {
    const r = await api.arhiveazaProdusele(ctx, lot.map((x) => x.sku_trimis!));
    const p = cePasDupa(r);
    if (p) return p;
    if (!r.ok) {
      await logError({ action: "easysales.catalog", severity: "warning", businessId: ctx.businessId, message: `arhivarea refuzata: ${r.mesaj}` });
      return { fel: "reincearca", mesaj: r.mesaj };
    }
    const d = (r.date ?? {}) as { archived?: unknown; not_found?: unknown; blocked?: unknown };
    const lista = (v: unknown) => new Set((Array.isArray(v) ? v : []).map((x) => String(x).toLowerCase()));
    const arhivate = lista(d.archived);
    const negasite = lista(d.not_found);
    const blocate = lista(d.blocked);
    const acum = new Date().toISOString();
    for (const x of lot) {
      const s = x.sku_trimis!.toLowerCase();
      if (arhivate.has(s)) await scrieRand(admin, x.id, { stare: "arhivat", arhivat_la: acum, arhivare_blocata_de_la: null, motiv: null });
      else if (negasite.has(s)) await scrieRand(admin, x.id, { stare: "arhivat", arhivat_la: acum, arhivare_blocata_de_la: null, motiv: "Nu mai exista in easySales cand s-a cerut arhivarea." });
      else if (blocate.has(s)) {
        await scrieRand(admin, x.id, { arhivare_blocata_de_la: x.arhivare_blocata_de_la ?? acum, motiv: "easySales n-a arhivat produsul: are comenzi active acolo. Reîncercăm zilnic." });
        rezultat = { fel: "blocat_la_ei", mesaj: "comenzi active la ei" };
      }
    }
  }
  return rezultat;
}

/** Produsele sterse din Edinio: arhivarea la ei (D21), daca setarea o cere. */
export async function prelucreazaStergerile(
  admin: Admin, ctx: ContextEasySales, mediu: MediuMagazin, uuids: string[],
): Promise<Map<string, SoartaProdus>> {
  const out = new Map<string, SoartaProdus>();
  const randuri = await citesteRandurile(admin, ctx.businessId, uuids);
  /* Un produs „sters" care exista totusi (punerea in coada s-a facut dintr-o cursa) nu se arhiveaza. */
  const traiesc = await citesteProdusele(admin, ctx.businessId, uuids);
  for (const u of uuids) {
    if (traiesc.has(u)) { out.set(u, GATA); continue; }
    const aleLui = randuri.filter((r) => r.product_uuid === u && r.identitate !== IDENTITATE_PARINTE && !inchis(r));
    const laEle = aleLui.filter((r) => laEi(r) || r.stare === "respins");
    if (!mediu.setari.arhivareLaStergere || laEle.length === 0) {
      for (const r of aleLui) if (!laEi(r)) await scrieRand(admin, r.id, { motiv: "Produsul a fost șters din Edinio." });
      out.set(u, GATA);
      continue;
    }
    /* Arhivarea blocata de mai mult de 14 zile: se anunta omul si se renunta. */
    const prima = laEle.map((r) => (r.arhivare_blocata_de_la ? Date.parse(r.arhivare_blocata_de_la) : NaN)).filter(Number.isFinite);
    if (prima.length && Date.now() - Math.min(...prima) > ZILE_ARHIVARE_BLOCATA * 24 * ORA) {
      await anunta(admin, ctx.businessId, {
        titlu: "Un produs șters din Edinio n-a putut fi arhivat în easySales",
        mesaj: `easySales refuză de ${ZILE_ARHIVARE_BLOCATA} zile arhivarea (are comenzi active acolo): ${laEle.map((r) => r.sku_trimis).join(", ")}. Arhivează-l din easySales după ce închizi comenzile.`,
        detalii: { productUuid: u },
      });
      out.set(u, GATA);
      continue;
    }
    out.set(u, await arhiveaza(admin, ctx, laEle));
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRETURILE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Siguranta de masa pe preturi (D22): o trecere care ar schimba pretul la peste 200 de produse, sau la
 * peste 30% din articolele trimise, asteapta confirmarea omului.
 *
 * ⚠ SE NUMARA PRODUSELE DIN COADA, nu variatia fiecarui pret. Pragul planului cerea si o variatie de
 * peste 20%; socotita, ar fi cerut citirea intregului val inainte de primul pret trimis. Regula de
 * aici e mai stricta (intreaba si la o scumpire de 2% pe tot catalogul), si asta e directia sigura.
 *
 * Valul se termina cand coada de preturi se goleste: confirmarea lui nu acopera urmatorul.
 */
export async function porteaPreturilor(admin: Admin, ctx: ContextEasySales): Promise<{ trece: boolean; inCoada: number }> {
  const b = ctx.businessId;
  const [coada, trimise] = await Promise.all([
    admin.from("easysales_sync_queue").select("id", { count: "exact", head: true }).eq("business_id", b).eq("op", "articol_pret").is("abandonat_la", null),
    admin.from("easysales_produse").select("id", { count: "exact", head: true }).eq("business_id", b).in("stare", [...STARI_LA_EI]),
  ]);
  if (coada.error || trimise.error) throw new EroareCitireBaza("easysales.preturi", (coada.error ?? trimise.error)!.message);
  const inCoada = coada.count ?? 0;
  const laEle = trimise.count ?? 0;
  const mare = inCoada > SIGURANTA_MASA.articole || (laEle > 0 && (inCoada * 100) / laEle > SIGURANTA_MASA.procent && inCoada > 20);
  const asteapta = ctx.cfg.catalog_preturi_asteapta;
  const confirmat = ctx.cfg.catalog_preturi_confirmate_la && asteapta && ctx.cfg.catalog_preturi_confirmate_la >= asteapta.cerut_la;
  if (!mare || confirmat) return { trece: true, inCoada };
  if (!asteapta) {
    const cerut = { cerut_la: new Date().toISOString(), produse: inCoada };
    await ctx.dep.peticConfig(b, { catalog_preturi_asteapta: cerut });
    ctx.cfg.catalog_preturi_asteapta = cerut;
    await anunta(admin, b, {
      titlu: "Confirmă prețurile trimise în easySales",
      mesaj: `Prețul s-a schimbat la ${inCoada} de produse deodată. Înainte să le trimitem în easySales (de unde pot ajunge pe marketplace-uri), confirmă schimbarea din Integrări, easySales, Catalog.`,
      severitate: "warning",
    });
  }
  return { trece: false, inCoada };
}

/**
 * Valul de preturi s-a terminat cand coada lor e goala: confirmarea lui nu acopera urmatorul.
 * ⚠ Nu in poarta: acolo coada are mereu cel putin lotul care tocmai se prelucreaza.
 */
export async function incheieValulPreturilor(admin: Admin, ctx: ContextEasySales): Promise<void> {
  if (!ctx.cfg.catalog_preturi_asteapta && !ctx.cfg.catalog_preturi_confirmate_la) return;
  const { count, error } = await admin.from("easysales_sync_queue").select("id", { count: "exact", head: true })
    .eq("business_id", ctx.businessId).eq("op", "articol_pret").is("abandonat_la", null);
  if (error || (count ?? 1) > 0) return;
  await ctx.dep.peticConfig(ctx.businessId, { catalog_preturi_asteapta: null, catalog_preturi_confirmate_la: null });
  ctx.cfg.catalog_preturi_asteapta = null;
  ctx.cfg.catalog_preturi_confirmate_la = null;
}

/** Preturile produselor date, pentru articolele aflate la ei, cate cel mult 100 pe cerere. */
export async function prelucreazaPreturile(
  admin: Admin, ctx: ContextEasySales, mediu: MediuMagazin, uuids: string[],
): Promise<Map<string, SoartaProdus>> {
  const out = new Map<string, SoartaProdus>();
  const produse = await citesteProdusele(admin, ctx.businessId, uuids);
  const randuri = (await citesteRandurile(admin, ctx.businessId, uuids)).filter((r) => laEi(r) && r.sku_trimis);
  const dup = new Set(ctx.cfg.catalog_sku_duplicate ?? []);
  const schimbate: { rand: Rand; sale_price: number; full_price: number }[] = [];
  for (const u of uuids) {
    out.set(u, GATA);
    const p = produse.get(u);
    if (!p) continue;
    const h = hotarareaProdusului(p, { setari: mediu.setari, skuDuplicate: dup });
    for (const r of randuri.filter((x) => x.product_uuid === u)) {
      const a = h.articole.find((x) => x.identitate === r.identitate);
      if (!a || a.pret <= 0) continue;
      const pr = preturileArticolului(a, mediu.magazin);
      if (Number(r.pret_trimis) === pr.sale_price && Number(r.pret_vechi_trimis ?? r.pret_trimis) === pr.full_price) continue;
      schimbate.push({ rand: r, ...pr });
    }
  }
  for (const lot of bucati(schimbate, LOT_PRETURI)) {
    const r = await api.actualizeazaPreturile(ctx, lot.map((x) => ({ sku: x.rand.sku_trimis!, sale_price: x.sale_price, full_price: x.full_price })));
    const p = cePasDupa(r);
    if (p) {
      for (const x of lot) out.set(x.rand.product_uuid, p);
      return out;
    }
    if (!r.ok) {
      for (const x of lot) out.set(x.rand.product_uuid, { fel: "reincearca", mesaj: r.mesaj });
      continue;
    }
    const rez = (r.date?.result ?? {}) as { success?: unknown; errors?: unknown };
    const reusite = new Set((Array.isArray(rez.success) ? rez.success : []).map((s) => String(s).toLowerCase()));
    const acum = new Date().toISOString();
    await inParalel(lot, 8, async (x) => {
      if (reusite.has(x.rand.sku_trimis!.toLowerCase())) {
        await scrieRand(admin, x.rand.id, { pret_trimis: x.sale_price, pret_vechi_trimis: x.full_price, motiv: null });
      } else {
        /* Nu spune de ce: verificarea afla daca produsul mai e la ei. Pana atunci, nu se pierde pretul. */
        await scrieRand(admin, x.rand.id, { motiv: `easySales n-a primit prețul de ${x.sale_price} lei (${acum.slice(0, 10)}).` });
        out.set(x.rand.product_uuid, { fel: "reincearca", mesaj: "pretul n-a fost primit" });
      }
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   COADA
   ═══════════════════════════════════════════════════════════════════════════ */

const PRIORITATE_OP: Record<string, number> = { categorie: 2, articol_sterge: 6, articol_continut: 5, articol_pret: 4, articol_stoc: 3, caracteristica: 5 };
export const OPERATII_CATALOG = Object.keys(PRIORITATE_OP);

async function amana(admin: Admin, el: ElementCoada, ms: number, eroare: string, refuz = false): Promise<Soarta> {
  await scrieDacaNeschimbat(admin, COADA, el, {
    ...(refuz ? { incercari: el.incercari + 1 } : { pauze: el.pauze + 1 }),
    ultima_eroare: eroare.slice(0, 500),
    next_retry_at: new Date(Date.now() + ms).toISOString(),
  });
  return "amanat";
}

async function dupaSoarta(admin: Admin, el: ElementCoada, s: SoartaProdus | undefined): Promise<Soarta> {
  if (!s || s.fel === "gata") {
    await stergeDacaNeschimbat(admin, COADA, el);
    return "gata";
  }
  switch (s.fel) {
    case "imagini": return amana(admin, el, 2 * 60_000, "imaginile se convertesc");
    case "reincearca": return amana(admin, el, asteptareaDupaPauze(el.pauze), s.mesaj);
    case "asteapta_omul": return amana(admin, el, 5 * 60_000, s.mesaj);
    case "blocat_la_ei": return amana(admin, el, 24 * ORA, s.mesaj);
  }
}

/**
 * Un lot de lucrari de catalog ale aceluiasi magazin si aceleiasi operatii, revendicate deja.
 * ⚠ Nu arunca: o pana a bazei amana lotul.
 */

export async function prelucreazaLotulCatalogului(
  admin: Admin, ctx: ContextEasySales, op: string, elemente: ElementCoada[], opt: OptiuniLucru,
): Promise<Soarta[]> {
  const poarta = (opt.poarta ?? catalogulPoateLucra)(ctx.cfg);
  if (!poarta.da) {
    return Promise.all(elemente.map(async (el) => {
      if (poarta.sterge) { await stergeDacaNeschimbat(admin, COADA, el); return "gata" as Soarta; }
      return amana(admin, el, 30 * 60_000, poarta.motiv);
    }));
  }
  try {
    if (op === "articol_stoc") {
      /* Bucla de stoc (E4): cu ea oprita, lucrarea se sterge (totul e pe 0 la ei). */
      return prelucreazaLotulStocului(admin, ctx, elemente, { maiAreTimp: opt.maiAreTimp, poarta: opt.poartaBuclei });
    }
    const mediu = await incarcaMediul(admin, ctx.businessId, ctx.cfg);
    const problema = problemaMediului(mediu);
    if (problema) {
      await puneCatalogulInPauza(admin, ctx, problema.startsWith("Magazinul vinde") ? "moneda" : "cota-tva", problema);
      return Promise.all(elemente.map((el) => amana(admin, el, 30 * 60_000, problema)));
    }
    if (op === "categorie" || op === "caracteristica") {
      const r = await sincronizeazaCategoriile(admin, ctx, mediu);
      return Promise.all(elemente.map((el) => dupaSoarta(admin, el, r)));
    }
    const uuids = [...new Set(elemente.map((el) => el.cheie))];
    let soarta: Map<string, SoartaProdus>;
    if (op === "articol_continut") soarta = await prelucreazaContinutul(admin, ctx, mediu, uuids, opt);
    else if (op === "articol_pret") {
      const g = await porteaPreturilor(admin, ctx);
      if (!g.trece) return Promise.all(elemente.map((el) => amana(admin, el, 10 * 60_000, "asteapta confirmarea preturilor")));
      soarta = await prelucreazaPreturile(admin, ctx, mediu, uuids);
    } else if (op === "articol_sterge") soarta = await prelucreazaStergerile(admin, ctx, mediu, uuids);
    else {
      return Promise.all(elemente.map((el) => dupaSoarta(admin, el, GATA)));
    }
    return Promise.all(elemente.map((el) => dupaSoarta(admin, el, soarta.get(el.cheie))));
  } catch (e) {
    await logError({ action: "easysales.catalog", severity: "warning", businessId: ctx.businessId, message: `${op}: ${(e as Error).message}` });
    return Promise.all(elemente.map((el) => amana(admin, el, asteptareaDupaPauze(el.pauze), (e as Error).message)));
  }
}

/** Revendica si prelucreaza lucrarile de catalog ale unui magazin, pe operatii, cat tine bugetul. */
export async function golesteCoadaCatalogului(
  admin: Admin, ctx: ContextEasySales, opt: OptiuniLucru,
): Promise<{ gata: number; amanate: number }> {
  const rez = { gata: 0, amanate: 0 };
  const ordine: [string, number][] = [["categorie", 10], ["articol_sterge", LOT_ARHIVARE], ["articol_pret", LOT_PRETURI], ["articol_continut", LOT_PRODUSE], ["articol_stoc", 100]];
  for (const [op, cate] of ordine) {
    if (!opt.maiAreTimp()) break;
    const { data, error } = await admin.rpc("easysales_revendica_catalogul", { p_business: ctx.businessId, p_ops: [op], p_limita: cate });
    if (error) {
      await logError({ action: "easysales.catalog", severity: "warning", businessId: ctx.businessId, message: `revendicarea ${op}: ${error.message}` });
      break;
    }
    const elemente = (data ?? []) as unknown as ElementCoada[];
    if (elemente.length === 0) continue;
    for (const s of await prelucreazaLotulCatalogului(admin, ctx, op, elemente, opt)) {
      if (s === "gata") rez.gata++;
      else rez.amanate++;
    }
  }
  await incheieValulPreturilor(admin, ctx);
  return rez;
}
