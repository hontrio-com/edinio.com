"use server";

// Dashboard server actions for the About You Marketplace integration (Faza 0:
// connect / test / disconnect / status / settings). Mirrors the OLX action
// pattern: an owner `guard`, config load/save on store_settings.aboutyou_config,
// and count-only status queries (safe past the 1000-row PostgREST cap).
//
// SECURITY: the API key lives in aboutyou_config (owner-only via RLS, like every
// other *_config secret). These actions NEVER return the raw key to the client —
// only a masked preview and booleans.

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { aboutyouGloballyEnabled, aboutyouWebhookUrl, maskApiKey } from "@/lib/aboutyou/auth";
import {
  createWebhookSubscription, deleteWebhookSubscription, getOrderDocument, getWebhookSubscription,
  isAboutYouError, mesajEroare, testConnection,
  type AboutYouAuth,
} from "@/lib/aboutyou/client";
import { ABOUTYOU_WEBHOOK_EVENTS, EVENIMENTE_ESENTIALE } from "@/lib/aboutyou/webhooks";
import { cancelOrderNow, returnOrderNow } from "@/lib/aboutyou/orders";
import { randCitit } from "@/lib/supabase/rand-citit";
import {
  getAllCategoriesCached, getAttributeGroupsCached, getBrandsCached, getCarriersCached,
  cereMarime, getCategoryChildrenCached, getCerintaMaterial, getCountriesCached, searchCategories,
} from "@/lib/aboutyou/taxonomy";
import {
  potrivesteCategorie, potrivireSigura, type PublicTinta, type SugestieCategorie,
} from "@/lib/aboutyou/ro-taxonomy";
import {
  loadAboutYouContext, publishProductNow, removeProductNow, syncProductNow, unpublishProductNow,
} from "@/lib/aboutyou/sync";
import {
  atasezaPreturileRon, deriveVariantSlots, TARI_EURO, validateListing,
  type AboutYouStoredMaterial, type MappableProduct,
} from "@/lib/aboutyou/mapping";
import { traduMotive, type MotivAfisat } from "@/lib/aboutyou/respingeri";
import type {
  AboutYouAttributeGroup, AboutYouBrand, AboutYouCarrier, AboutYouCategory, AboutYouCategoryMapEntry,
  AboutYouConfig, AboutYouCountriesResponse, AboutYouEnvironment, AboutYouFulfillmentType,
} from "@/lib/aboutyou/types";
import { DEFAULT_COUNTRY_OF_ORIGIN } from "@/lib/aboutyou/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
const FEATURE_PATH = "/dashboard/features/aboutyou";

interface OwnBiz {
  id: string; slug: string; store_name: string | null; business_name: string;
}

async function ownedBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<OwnBiz | null> {
  const { data } = await supabase
    .from("businesses")
    .select("id, slug, store_name, business_name")
    .eq("id", businessId).eq("user_id", userId).single();
  return (data as OwnBiz) ?? null;
}

async function guard(businessId: string): Promise<{ supabase: ServerClient; userId: string; biz: OwnBiz } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const biz = await ownedBusiness(supabase, businessId, user.id);
  if (!biz) return { error: "Magazin negasit" };
  return { supabase, userId: user.id, biz };
}

/*
 * Configurarea se citeste si se scrie MEREU cu clientul de serviciu, niciodata
 * cu cel al utilizatorului.
 *
 * `public.store_settings` e o vedere care decripteaza campurile sensibile prin
 * `privat.decripteaza_config`, iar aceea returneaza configul NEDECRIPTAT cand
 * rolul apelantului e `anon` sau `authenticated` — adica exact rolul cu care
 * ruleaza actiunile de aici. Citita asa, `api_key` iesea `enc.v1.…`, era trimisa
 * ca `X-API-Key` si About You raspundea 401 la fiecare cerere. Conectarea parea
 * sa reuseasca, pentru ca acolo cheia venea din formular, nu din baza.
 *
 * Ocolirea RLS e sigura: fiecare apelant trece intai prin `guard()`, care
 * verifica proprietatea magazinului. E acelasi tipar folosit deja in fisier
 * pentru tabelele `aboutyou_*`.
 */
/*
 * ⚠ O CITIRE CAZUTA NU ARE VOIE SA ARATE CA O CONFIGURARE GOALA.
 *
 * Forma dinainte ignora `error` si intorcea `{}` cand citirea dadea gres. Iar apelantii
 * fac apoi `saveConfig(...)` cu INTREGUL obiect — deci un gol inchipuit se scria peste
 * acreditari, si integrarea se deconecta singura, fara nicio eroare nicaieri.
 *
 * S-a intamplat: 24.08.2026, un magazin cu Trendyol si 1272 de listari active a ramas
 * cu `trendyol_config = {"reconcile_page": 20}`. Comerciantul n-a atins nimic.
 *
 * ⚠ `maybeSingle`, nu `single`: un magazin FARA rand e o stare legitima (nou creat), si
 * acolo `{}` e chiar raspunsul corect. Ce nu e legitim e sa nu poti citi si sa spui gol.
 * `single` le confunda: lipsa randului iesea tot ca eroare.
 *
 * ⚠ Aruncarea e voita. Apelantii au deja ramuri de esec; un gol tacut n-are.
 */
async function loadConfig(businessId: string): Promise<AboutYouConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).maybeSingle();
  if (error) {
    throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  }
  return ((data?.aboutyou_config as AboutYouConfig) ?? {}) || {};
}

async function saveConfig(businessId: string, config: AboutYouConfig): Promise<boolean> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("store_settings").select("id").eq("business_id", businessId).single();
  if (existing) {
    const { error } = await admin.from("store_settings")
      .update({ aboutyou_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    return !error;
  }
  const { error } = await admin.from("store_settings")
    .insert({ business_id: businessId, aboutyou_config: config as never });
  return !error;
}

// Human-readable readiness: what still blocks publishing to About You.
// Local (not exported): a "use server" module may only export async functions.
function aboutyouReadinessError(config: AboutYouConfig): string | null {
  if (!config.connected || !config.api_key) return "Conectează mai întâi contul About You (cheia API).";
  if (config.needs_reconnect) return "Sesiunea About You a expirat. Reconectează contul.";
  // Brandul e per PRODUS la About You: cel din setari e doar implicitul. Mesajul
  // de dinainte suna ca o constrangere pe tot catalogul.
  if (!config.brand_id) return "Alege brandul About You în setări (îl poți schimba apoi pe fiecare produs).";
  if (!config.ship_countries || config.ship_countries.length === 0) return "Alege cel puțin o țară de listare.";
  if (config.price_mode !== "manual_eur" && !(config.fx?.rate && config.fx.rate > 0)) {
    return "Setează cursul valutar RON -> EUR în setări.";
  }
  return null;
}

// ── Status ────────────────────────────────────────────────────────────────────
export interface AboutYouStatus {
  globallyEnabled: boolean;
  connected: boolean;
  needsReconnect: boolean;
  environment: AboutYouEnvironment;
  apiKeyMasked: string | null;
  apiKeyAddedAt?: string;
  sellerName?: string;
  fulfillmentType: AboutYouFulfillmentType;
  priceMode: "fx_from_ron" | "manual_eur";
  fxRate?: number;
  fxMarginPct?: number;
  fxUpdatedAt?: string;
  brandId?: number;
  brandName?: string;
  shipCountries: string[];
  targetAudience: PublicTinta | null;
  defaultCountryOfOrigin: string;
  defaultCarrierKey?: string;
  carrierMap: Record<string, string>;
  /** Curierii la care comerciantul a declarat ca AWB-ul de tur e valabil si la retur. */
  returBidirectional: Record<string, boolean>;
  autoSync: boolean;
  lastSyncAt?: string;
  webhookActive: boolean;
  ready: boolean;
  readinessError: string | null;
  categoryMap: Record<string, AboutYouCategoryMapEntry>;
  counts: { listings: number; published: number; rejected: number; variants: number; queued: number };
}

export async function getAboutYouStatus(businessId: string): Promise<AboutYouStatus | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const config = await loadConfig(businessId);

  const [{ count: listings }, { count: published }, { count: rejected }, { count: variants }, { count: queued }] = await Promise.all([
    supabase.from("aboutyou_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    // About You raporteaza produsele publicate cu statusul `active`, nu
    // `published` — acela e doar valoarea pe care o TRIMITEM la publicare. Numarat
    // doar pe „published", contorul arata mereu zero.
    supabase.from("aboutyou_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", ["published", "active"]),
    supabase.from("aboutyou_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "rejected"),
    supabase.from("aboutyou_variants").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("aboutyou_sync_queue").select("id", { count: "exact", head: true }).eq("business_id", businessId),
  ]);

  return {
    globallyEnabled: aboutyouGloballyEnabled(),
    connected: !!config.connected && !!config.api_key,
    needsReconnect: config.needs_reconnect === true,
    environment: config.environment ?? "production",
    apiKeyMasked: config.api_key ? maskApiKey(config.api_key) : null,
    apiKeyAddedAt: config.api_key_added_at,
    sellerName: config.seller_name,
    fulfillmentType: config.fulfillment_type ?? "dropshipping",
    priceMode: config.price_mode ?? "fx_from_ron",
    fxRate: config.fx?.rate,
    fxMarginPct: config.fx?.margin_pct,
    fxUpdatedAt: config.fx?.updated_at,
    brandId: config.brand_id,
    brandName: config.brand_name,
    shipCountries: config.ship_countries ?? [],
    targetAudience: config.target_audience ?? null,
    defaultCountryOfOrigin: config.default_country_of_origin ?? DEFAULT_COUNTRY_OF_ORIGIN,
    defaultCarrierKey: config.default_carrier_key,
    carrierMap: config.carrier_map ?? {},
    returBidirectional: config.retur_bidirectional ?? {},
    autoSync: config.auto_sync !== false,
    lastSyncAt: config.last_sync_at,
    webhookActive: !!config.webhook_subscription_id,
    ready: aboutyouReadinessError(config) === null,
    readinessError: aboutyouReadinessError(config),
    categoryMap: config.category_map ?? {},
    counts: {
      listings: listings ?? 0, published: published ?? 0, rejected: rejected ?? 0,
      variants: variants ?? 0, queued: queued ?? 0,
    },
  };
}

// ── Connect / disconnect ────────────────────────────────────────────────────────
export async function connectAboutYou(
  businessId: string, apiKeyRaw: string, environment: AboutYouEnvironment, label?: string,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!aboutyouGloballyEnabled()) return { error: "Integrarea About You nu este disponibilă momentan." };

  const apiKey = (apiKeyRaw ?? "").trim();
  if (apiKey.length < 8) return { error: "Cheia API pare invalidă. Copiaz-o din Seller Center > Settings > API Keys." };
  const env: AboutYouEnvironment = environment === "sandbox" ? "sandbox" : "production";

  const test = await testConnection({ apiKey, environment: env });
  if (!test.ok) return { error: test.error };

  const prev = await loadConfig(businessId);
  const next: AboutYouConfig = {
    ...prev,
    connected: true,
    api_key: apiKey,
    api_key_label: (label ?? "").trim() || prev.api_key_label,
    api_key_added_at: new Date().toISOString(),
    environment: env,
    needs_reconnect: false,
    // Sensible defaults from the locked decisions (kept if already set).
    fulfillment_type: prev.fulfillment_type ?? "dropshipping",
    price_mode: prev.price_mode ?? "fx_from_ron",
    default_country_of_origin: prev.default_country_of_origin ?? DEFAULT_COUNTRY_OF_ORIGIN,
    auto_sync: prev.auto_sync ?? true,
  };
  const ok = await saveConfig(businessId, next);
  if (!ok) {
    logError({ action: "aboutyou.connect", message: "saveConfig failed", details: { businessId }, businessId, userId: g.userId });
    return { error: "Eroare la salvarea conexiunii. Încearcă din nou." };
  }
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function disconnectAboutYou(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  /*
   * Abonamentul de webhook se sterge INAINTE de a arunca configul.
   *
   * Odata sters `webhook_subscription_id`, nu mai avem cum sa-l dezabonam: About
   * You continua sa trimita evenimente catre o ruta care nu mai are secretul de
   * verificat, ora de ora, iar comerciantul nu are de unde sa-l opreasca decat
   * din Seller Center. Esecul stergerii nu blocheaza deconectarea — omul a cerut
   * sa se deconecteze.
   */
  const prev = await loadConfig(businessId);
  if (prev.api_key && prev.webhook_subscription_id) {
    await deleteWebhookSubscription(
      { apiKey: prev.api_key, environment: prev.environment },
      prev.webhook_subscription_id,
    );
  }

  await saveConfig(businessId, {});
  const admin = createAdminClient();
  await admin.from("aboutyou_sync_queue").delete().eq("business_id", businessId);
  await admin.from("aboutyou_variants").delete().eq("business_id", businessId);
  await admin.from("aboutyou_batches").delete().eq("business_id", businessId);
  await admin.from("aboutyou_listings").delete().eq("business_id", businessId);
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Settings ────────────────────────────────────────────────────────────────────
export interface AboutYouSettingsInput {
  fulfillment_type?: AboutYouFulfillmentType;
  price_mode?: "fx_from_ron" | "manual_eur";
  fx_rate?: number | null;
  fx_margin_pct?: number | null;
  brand_id?: number | null;
  brand_name?: string | null;
  ship_countries?: string[];
  default_country_of_origin?: string;
  default_carrier_key?: string | null;
  auto_sync?: boolean;
  target_audience?: PublicTinta;
}

/*
 * Tarile de listare se valideaza pe moneda, nu doar pe cod.
 *
 * `PriceSchema` nu are camp de moneda: About You citeste pretul in moneda TARII.
 * Noi convertim RON in EUR o singura data si trimitem acelasi numar pentru toate
 * tarile — corect doar acolo unde moneda chiar e euro. Un produs de 100 lei
 * (≈20 EUR) trimis catre Polonia se citeste 20 PLN, adica sub un sfert din pret,
 * si se vinde asa la fiecare comanda.
 *
 * Pana cand conversia se face per moneda, blocam aici tarile non-euro. Blocajul
 * sta pe server, nu doar in interfata: alegerea tarii e o decizie despre bani.
 */
async function tariNeEuro(auth: AboutYouAuth, coduri: string[]): Promise<string[]> {
  if (coduri.length === 0) return [];
  const r = await getCountriesCached(auth);
  if (!r.ok) {
    /*
     * ═══ ⚠ AICI CADEA DESCHIS, SI ASTA E CHIAR SLABICIUNEA (26.08.2026) ═══
     *
     * Scria `return []` — „fara nomenclator nu inventam un blocaj". Suna prudent si nu e: o paza
     * care se stinge singura la o pana nu e o paza. O clipa proasta la cererea de nomenclator, si
     * Polonia intra in lista; de-acolo, 20 EUR pleaca drept 20 de ZLOTI, la fiecare vanzare, tacut.
     *
     * ⚠ Se cade pe lista ZONEI EURO, care e un fapt public si nu depinde de nicio cerere. Ce nu e
     * acolo se opreste — iar mesajul spune limpede ce sa scoata din selectie.
     */
    return coduri.filter((c) => !TARI_EURO.has(c.toUpperCase()));
  }
  const moneda = new Map((r.data.currencies ?? []).map((c) => [c.country_code, c.code]));
  return coduri.filter((c) => {
    const m = moneda.get(c);
    /* ⚠ Si cand nomenclatorul lor NU stie tara, se cade tot pe lista noastra: `m == null` insemna
       „treci", adica exact aceeasi cadere deschisa, pe alt drum. */
    if (m == null) return !TARI_EURO.has(c.toUpperCase());
    return m !== "EUR";
  });
}

export async function saveAboutYouSettings(
  businessId: string, input: AboutYouSettingsInput,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);

  if (input.ship_countries && input.ship_countries.length > 0) {
    const auth = authFromConfig(config);
    if (auth) {
      const neEuro = await tariNeEuro(auth, input.ship_countries);
      if (neEuro.length > 0) {
        return {
          error: `Momentan putem lista doar în țări cu moneda euro. Scoate din selecție: ${neEuro.join(", ")}.`,
        };
      }
    }
  }

  const fxRate = input.fx_rate == null ? config.fx?.rate : (input.fx_rate > 0 ? input.fx_rate : undefined);
  const fxMargin = input.fx_margin_pct == null ? config.fx?.margin_pct : Math.max(0, input.fx_margin_pct);
  const fxChanged = input.fx_rate != null || input.fx_margin_pct != null;

  const next: AboutYouConfig = {
    ...config,
    fulfillment_type: input.fulfillment_type ?? config.fulfillment_type ?? "dropshipping",
    price_mode: input.price_mode ?? config.price_mode ?? "fx_from_ron",
    fx: {
      rate: fxRate,
      margin_pct: fxMargin,
      updated_at: fxChanged ? new Date().toISOString() : config.fx?.updated_at,
    },
    brand_id: input.brand_id === null ? undefined : (input.brand_id ?? config.brand_id),
    brand_name: input.brand_name === null ? undefined : (input.brand_name ?? config.brand_name),
    ship_countries: input.ship_countries ?? config.ship_countries,
    default_country_of_origin: input.default_country_of_origin?.trim() || config.default_country_of_origin || DEFAULT_COUNTRY_OF_ORIGIN,
    default_carrier_key: input.default_carrier_key === null ? undefined : (input.default_carrier_key ?? config.default_carrier_key),
    auto_sync: input.auto_sync ?? config.auto_sync,
    target_audience: input.target_audience ?? config.target_audience,
  };
  const ok = await saveConfig(businessId, next);
  if (!ok) return { error: "Eroare la salvare." };

  /*
   * ═══ ⚠ O SETARE GLOBALA SCHIMBATA NU AJUNGEA NICIODATA LA PRODUSELE DEJA LISTATE (27.08.2026) ═══
   *
   * Comerciantul are cursul 1 EUR = 5 RON, deci un produs de 100 RON e 20 EUR la About You. Schimba
   * cursul pe 4.5. Se salva `fx.updated_at` — corect — dar NU se punea nimic la coada. La About You
   * ramaneau 20 EUR pana cand produsul se schimba din alt motiv, poate niciodata.
   *
   * ⚠ `valid_at` nu ajuta cu nimic aici: el apara ordinea intre doua trimiteri, nu inlocuieste o
   * trimitere care nu se face deloc.
   *
   * ⚠ CE SE PUNE LA COADA depinde de CE s-a schimbat, si nu e o subtilitate: `upsert` inseamna
   * produsul intreg, deci trece prin verificari, taxonomie si loturi de 100 — scump si lent. Cand
   * s-a schimbat doar un pret, `price` face exact ce trebuie si nimic in plus.
   */
  const doarPret = fxChanged
    || (input.price_mode != null && input.price_mode !== (config.price_mode ?? "fx_from_ron"));
  const dinNou = input.ship_countries != null
    || input.brand_id !== undefined
    || (input.default_country_of_origin != null
      && input.default_country_of_origin.trim() !== (config.default_country_of_origin ?? ""))
    || (input.target_audience != null && input.target_audience !== config.target_audience);

  if (dinNou || doarPret) {
    /* ⚠ Trimiterea intreaga o cuprinde si pe cea de pret: nu se pun amandoua pe acelasi produs. */
    const op = dinNou ? "upsert" as const : "price" as const;
    /*
     * ═══ ⚠ „INCOMPLET" ERA UN CAPAT DE DRUM (27.08.2026) ═══
     *
     * Se scria in jurnal si se raspundea `success`. La douazeci si cinci de mii de produse,
     * primele douazeci de mii intrau in coada si ultimele cinci mii NU — iar ecranul spunea
     * „Salvat". Preturile alea puteau ramane vechi la About You pentru totdeauna.
     *
     * ═══ ⚠ SI CURSORUL SE SCRIA DUPA LUCRU, FARA SA I SE CITEASCA RASPUNSUL (27.08.2026, noaptea) ═══
     *
     * Deci scrierea lui picata lasa iar ultimele cinci mii fara nimic care sa le atinga, si tot
     * cu „Salvat" pe ecran. Acum lucrarea se deschide INAINTE de prima transa: daca actiunea
     * moare la jumatate, randul exista deja si cronul o duce la capat.
     */
    const lucrare = await deschideLucrarea(businessId, op);
    if (!lucrare) {
      /*
       * ⚠ SETARILE S-AU SALVAT DEJA, deci nu se raspunde cu eroare — dar nici nu se tace: fara
       * lucrare, produsele nu se repun la coada, iar la About You raman valorile vechi.
       */
      logError({
        action: "aboutyou.saveSettings", severity: "critical",
        message: "setarile s-au salvat, dar raspandirea catre produse n-a putut fi pornita: apasa „Sincronizează tot”",
        details: { businessId, op }, businessId,
      });
    } else {
      const r = await enqueueForListings(g.supabase, businessId, op, undefined, undefined, lucrare.dupa);
      await mutaLucrarea(lucrare, r);
      if (r.incomplet) {
        logError({
          action: "aboutyou.saveSettings", severity: "info",
          message: `setarile s-au salvat; ${r.n} produse au intrat in coada, restul continua la trecerile urmatoare ale cronului`,
          details: { businessId, op, dupa: r.ultimulId }, businessId,
        });
      }
    }
  }

  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Nomenclature (live from About You, using the merchant's key) ────────────────
function authFromConfig(config: AboutYouConfig): AboutYouAuth | null {
  return config.api_key ? { apiKey: config.api_key, environment: config.environment } : null;
}

async function guardedAuth(
  businessId: string,
): Promise<{ supabase: ServerClient; userId: string; config: AboutYouConfig; auth: AboutYouAuth } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);
  const auth = authFromConfig(config);
  if (!auth) return { error: "Conectează mai întâi contul About You." };
  return { supabase: g.supabase, userId: g.userId, config, auth };
}

/*
 * Un esec de nomenclator ajunge la comerciant cu motivul real, si e si scris in
 * jurnal. Inainte, toate cadeau pe acelasi „Nu am putut …", indiferent daca era
 * cheie invalida, limita de rata sau retea — asa a putut sta ascuns un 401 care
 * lovea absolut fiecare cerere.
 *
 * Cand About You raspunde 401/403, marcam si `needs_reconnect`: bannerul din
 * pagina spune atunci ce e de facut, in loc sa lase omul sa reincerce la infinit.
 */
async function esecNomenclator(
  businessId: string, userId: string, ce: string, actiune: string, r: { error: string; status: number },
): Promise<{ error: string }> {
  logError({
    action: `aboutyou.${actiune}`,
    message: r.error,
    details: { businessId, status: r.status },
    businessId,
    userId,
  });
  if (r.status === 401 || r.status === 403) {
    const config = await loadConfig(businessId);
    if (config.api_key && !config.needs_reconnect) {
      await saveConfig(businessId, { ...config, needs_reconnect: true });
      revalidatePath(FEATURE_PATH);
    }
  }
  return { error: mesajEroare(ce, r.error, r.status) };
}

export async function getAboutYouBrands(businessId: string): Promise<{ brands: AboutYouBrand[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await getBrandsCached(g.auth);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca brandurile About You.", "brands", r);
  return { brands: r.data };
}

export async function getAboutYouCountries(businessId: string): Promise<{ data: AboutYouCountriesResponse } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await getCountriesCached(g.auth);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca țările About You.", "countries", r);
  return { data: r.data };
}

export async function getAboutYouCategoryChildren(businessId: string, parentId?: number): Promise<{ categories: AboutYouCategory[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await getCategoryChildrenCached(g.auth, parentId);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca categoriile About You.", "categories", r);
  return { categories: r.data };
}

export async function searchAboutYouCategories(businessId: string, query: string): Promise<{ categories: AboutYouCategory[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await searchCategories(g.auth, query, { publicImplicit: g.config.target_audience ?? null });
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut căuta categorii.", "categories.search", r);
  return { categories: r.data };
}

export async function getAboutYouAttributeGroups(businessId: string, categoryId: number): Promise<{ groups: AboutYouAttributeGroup[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await getAttributeGroupsCached(g.auth, categoryId);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca atributele categoriei.", "attribute-groups", r);
  return { groups: r.data };
}

// ── Category mapping (Edinio category -> About You category) ─────────────────────
export async function saveAboutYouCategoryMapEntry(
  businessId: string, edinioCategory: string, entry: AboutYouCategoryMapEntry | null,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);

  /*
   * Un nod intermediar nu e o categorie de produs, si alegerea nu se poate lua
   * inapoi: „once the product category is published & approved, there is no
   * possibility of changing the category." Verificarea se face pe SERVER, ca sa
   * acopere si alegerea manuala, nu doar potrivirea automata.
   */
  if (entry) {
    const auth = authFromConfig(config);
    if (auth) {
      const tax = await getAllCategoriesCached(auth);
      if (tax.ok && tax.data.some((c) => c.parent_id === entry.category_id)) {
        return { error: "Categoria aleasă are subcategorii. Alege una din ultimul nivel, altfel produsele sunt respinse la aprobare." };
      }
    }
  }

  const map = { ...(config.category_map ?? {}) };
  if (entry === null) delete map[edinioCategory];
  else map[edinioCategory] = entry;
  const ok = await saveConfig(businessId, { ...config, category_map: map });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/*
 * ── Mapare automata a categoriilor ──────────────────────────────────────────
 *
 * Comerciantul are „Genti", About You are `Fashion|Women|Accessories|Bags &
 * suitcases|Handbag`. Traducem (vezi ro-taxonomy.ts), dam un scor fiecarei
 * categorii si intoarcem propunerile.
 *
 * NU aplicam tot ce gasim. Se aplica singure doar potrivirile exacte, cu scor
 * mare si cu o a doua varianta vizibil mai slaba; restul raman propuneri pe care
 * omul le confirma dintr-un clic. O categorie mapata gresit inseamna produse
 * respinse la aprobare, iar aia se vede abia peste zile.
 */
export interface SugestieMapare {
  edinioCategory: string;
  /** Deja mapata inainte de rulare — nu se atinge fara „suprascrie". */
  mapataDeja: boolean;
  sigura: boolean;
  optiuni: { category_id: number; label: string; scor: number; motiv: string }[];
}

function optiuneDinSugestie(s: SugestieCategorie) {
  return { category_id: s.category_id, label: s.path, scor: Math.round(s.scor * 100) / 100, motiv: s.motiv };
}

export async function suggestAboutYouCategoryMap(
  businessId: string, categorii: string[],
): Promise<{ sugestii: SugestieMapare[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;

  const r = await getAllCategoriesCached(g.auth);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca categoriile About You.", "categories.all", r);

  const mapate = g.config.category_map ?? {};
  const publicImplicit = g.config.target_audience ?? null;

  const sugestii = categorii.slice(0, 500).map((cat) => {
    const optiuni = potrivesteCategorie(cat, r.data, { publicImplicit, limita: 5 });
    return {
      edinioCategory: cat,
      mapataDeja: !!mapate[cat],
      sigura: potrivireSigura(optiuni) !== null,
      optiuni: optiuni.map(optiuneDinSugestie),
    };
  });
  return { sugestii };
}

/**
 * Aplica potrivirile sigure. `suprascrie` decide daca se ating si categoriile
 * deja mapate manual — implicit nu, ca o rulare din greseala sa nu strice o
 * mapare corecta facuta de om.
 */
export async function applyAboutYouCategoryMap(
  businessId: string, categorii: string[], suprascrie = false,
): Promise<{ aplicate: number; ramase: number } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;

  const r = await getAllCategoriesCached(g.auth);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca categoriile About You.", "categories.all", r);

  const config = await loadConfig(businessId);
  const map = { ...(config.category_map ?? {}) };
  const publicImplicit = config.target_audience ?? null;

  let aplicate = 0;
  let ramase = 0;
  for (const cat of categorii.slice(0, 500)) {
    if (map[cat] && !suprascrie) continue;
    const sigura = potrivireSigura(potrivesteCategorie(cat, r.data, { publicImplicit, limita: 5 }));
    if (!sigura) { ramase++; continue; }
    map[cat] = { category_id: sigura.category_id, label: sigura.path };
    aplicate++;
  }

  if (aplicate > 0 && !(await saveConfig(businessId, { ...config, category_map: map }))) {
    return { error: "Eroare la salvarea mapării." };
  }
  revalidatePath(FEATURE_PATH);
  return { aplicate, ramase };
}

// ── Carriers (courier -> About You carrier_key mapping) ─────────────────────────
export async function getAboutYouCarriers(businessId: string): Promise<{ carriers: AboutYouCarrier[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await getCarriersCached(g.auth);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca curierii About You.", "carriers", r);
  return { carriers: r.data };
}

/**
 * Comerciantul declara ca la un curier acelasi AWB e valabil si la retur.
 *
 * ⚠ E O DECLARATIE, NU O SETARE DE COMODITATE. `return_tracking_key` e un camp separat de
 * `shipment_tracking_key` in schema lor, deci ei le tin drept doua documente. Daca la un curier
 * anume sunt acelasi, stie contractul comerciantului cu curierul — nu stim noi, si nu ghicim.
 * Nedeclarat, expedierea se opreste (vezi `shipOrderNow`).
 */
export async function saveAboutYouReturBidirectional(
  businessId: string, courierCode: string, valoare: boolean,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);
  const harta = { ...(config.retur_bidirectional ?? {}) };
  /* Sters, nu pus pe `false`: „nedeclarat" si „declarat ca nu" duc la aceeasi oprire. */
  if (valoare) harta[courierCode] = true;
  else delete harta[courierCode];
  const ok = await saveConfig(businessId, { ...config, retur_bidirectional: harta });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function saveAboutYouCarrierMap(
  businessId: string, courierCode: string, carrierKey: string | null,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);
  const map = { ...(config.carrier_map ?? {}) };
  if (!carrierKey) delete map[courierCode];
  else map[courierCode] = carrierKey;
  const ok = await saveConfig(businessId, { ...config, carrier_map: map });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Per-product listing editor ──────────────────────────────────────────────────
export interface AboutYouEditorVariant {
  key: string; label: string; sku: string; ron_price: number;
  /** Titlul real al combinatiei (null la produsele fara variante). */
  variantTitle: string | null;
  ean: string | null; size_id: number | null; second_size_id: number | null; color_id: number | null;
  quantity: number | null; retail_price_eur: number | null; sale_price_eur: number | null; enabled: boolean;
}
export interface AboutYouEditorData {
  productName: string;
  category: string | null;
  images: string[];
  mappedCategoryId: number | null;
  /**
   * Ce fel de compozitie cere categoria. Vine din taxonomie, nu din ce bifeaza
   * comerciantul: About You o cere pentru aproape toate categoriile, iar
   * textilele au si procente.
   */
  materialType: "textile" | "non-textile" | null;
  /** Calea categoriei la About You; de acolo iese cate grupe de material cere. */
  materialPath: string | null;
  /**
   * Taxonomia nu s-a putut citi. Nu e acelasi lucru cu „categoria nu cere
   * material": editorul trebuie sa blocheze, nu sa ascunda sectiunea.
   */
  taxonomyError: string | null;
  /**
   * Brandul din setari, aratat ca valoare implicita. Lipsind, editorul afisa
   * „Alege brand" gol pentru un produs care oricum ar fi plecat cu brandul
   * global — deci comerciantul nu avea cum sa vada ce brand se trimite.
   */
  defaultBrandId: number | null;
  defaultBrandName: string | null;
  listing: {
    brand_id: number | null; category_id: number | null; color_id: number | null;
    attributes: number[]; material: AboutYouStoredMaterial | null;
    country_of_origin: string | null; hs_code: string | null; status: string;
    /** `null` = listarea n-a plecat niciodata spre About You, deci nu se poate publica. */
    last_synced_at: string | null;
  } | null;
  variants: AboutYouEditorVariant[];
}

interface StoredVariantRow {
  sku: string; ean: string | null; size_id: number | null; second_size_id: number | null;
  color_id: number | null; quantity: number | null; retail_price_eur: number | null;
  sale_price_eur: number | null; enabled: boolean;
}

export async function getAboutYouListingEditor(businessId: string, productId: string): Promise<AboutYouEditorData | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);

  const { data: product } = await g.supabase
    .from("products")
    .select("id, name, category, images, price, compare_at_price, sku, page_sections, weight_grams, track_inventory, stock_quantity")
    .eq("id", productId).eq("business_id", businessId).maybeSingle();
  if (!product) return { error: "Produs negăsit." };

  const slots = deriveVariantSlots(product as unknown as MappableProduct);

  const { data: listing } = await g.supabase
    .from("aboutyou_listings")
    .select("id, brand_id, category_id, color_id, attributes, material_composition, country_of_origin, hs_code, status, last_synced_at")
    .eq("business_id", businessId).eq("product_id", productId).maybeSingle();

  let stored: StoredVariantRow[] = [];
  if (listing) {
    const { data: vs } = await g.supabase
      .from("aboutyou_variants")
      .select("sku, ean, size_id, second_size_id, color_id, quantity, retail_price_eur, sale_price_eur, enabled")
      .eq("listing_id", (listing as { id: string }).id);
    stored = (vs ?? []) as StoredVariantRow[];
  }
  const bySku = new Map(stored.map((v) => [v.sku, v]));

  const variants: AboutYouEditorVariant[] = slots.map((s) => {
    const ex = bySku.get(s.sku);
    return {
      key: s.key, label: s.label, sku: s.sku, ron_price: s.ron_price, variantTitle: s.variantTitle,
      // Codul de bare completat deja in fisa produsului se preia automat: era
      // scris in Edinio si totusi comerciantul era pus sa-l retasteze aici.
      ean: ex?.ean ?? s.gtin ?? null,
      size_id: ex?.size_id ?? null, second_size_id: ex?.second_size_id ?? null,
      color_id: ex?.color_id ?? null,
      quantity: ex?.quantity ?? s.quantity,
      retail_price_eur: ex?.retail_price_eur ?? null, sale_price_eur: ex?.sale_price_eur ?? null,
      enabled: ex?.enabled ?? true,
    };
  });

  const mappedCategoryId = product.category ? (config.category_map?.[product.category]?.category_id ?? null) : null;
  const l = listing as (Record<string, unknown> & { id: string }) | null;

  // Tipul compozitiei il decide categoria efectiva, nu comerciantul.
  const categorieEfectiva = ((l?.category_id as number | null) ?? mappedCategoryId) ?? null;
  let materialType: "textile" | "non-textile" | null = null;
  let materialPath: string | null = null;
  let taxonomyError: string | null = null;
  if (categorieEfectiva) {
    const auth = authFromConfig(config);
    if (!auth) {
      taxonomyError = "Conexiunea About You nu este disponibilă. Reconectează contul.";
    } else {
      const cerinta = await getCerintaMaterial(auth, categorieEfectiva);
      if (cerinta.ok) {
        materialType = cerinta.tip;
        materialPath = cerinta.path;
      } else {
        // Inainte, esecul era inghitit si `materialType` ramanea `null`, ceea ce
        // mai departe inseamna „categoria nu cere material": sectiunea disparea
        // din formular si produsul pleca gol.
        taxonomyError = cerinta.error;
      }
    }
  }

  return {
    productName: product.name,
    category: product.category,
    images: Array.isArray(product.images) ? (product.images as unknown[]).map(String) : [],
    mappedCategoryId,
    materialType,
    materialPath,
    taxonomyError,
    defaultBrandId: config.brand_id ?? null,
    defaultBrandName: config.brand_name ?? null,
    listing: l ? {
      brand_id: (l.brand_id as number | null) ?? null,
      category_id: (l.category_id as number | null) ?? null,
      color_id: (l.color_id as number | null) ?? null,
      attributes: Array.isArray(l.attributes) ? (l.attributes as number[]) : [],
      material: (l.material_composition as AboutYouStoredMaterial | null) ?? null,
      country_of_origin: (l.country_of_origin as string | null) ?? null,
      hs_code: (l.hs_code as string | null) ?? null,
      status: (l.status as string) ?? "local",
      last_synced_at: (l.last_synced_at as string | null) ?? null,
    } : null,
    variants,
  };
}

export interface AboutYouListingInput {
  brand_id: number | null;
  category_id: number | null;
  color_id: number | null;
  attributes: number[];
  material: AboutYouStoredMaterial | null;
  country_of_origin: string | null;
  hs_code: string | null;
  variants: {
    sku: string; ean: string | null; size_id: number | null; second_size_id: number | null;
    color_id: number | null; quantity: number | null; retail_price_eur: number | null;
    sale_price_eur: number | null; enabled: boolean;
    /**
     * Titlul REAL al combinatiei din Edinio („XXL / Negru"), sau `null` la un
     * produs fara variante. Fara el, o comanda About You nu stie ce combinatie sa
     * scada si cade pe stocul produsului, iar vitrina vinde a doua oara aceeasi
     * marime. Inventat, ar raporta fals lipsa de stoc la fiecare comanda.
     */
    variant_title?: string | null;
  }[];
}

/*
 * Tot ce blocheaza listarea, dintr-o singura trecere, INAINTE de trimitere.
 *
 * `validateListing` exista de la inceput in mapping.ts, dar nu era apelata de
 * nicaieri: comerciantul salva, trimitea, si afla peste minute „produs respins",
 * fara sa i se spuna ce lipseste. Iar cand aflau, aflau cate o problema pe rand,
 * pentru ca `buildAboutYouItems` se opreste la prima.
 */
export async function validateAboutYouListing(
  businessId: string, productId: string, input: AboutYouListingInput,
): Promise<{ issues: string[]; warnings: string[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);

  const { data: product } = await g.supabase
    .from("products")
    .select("id, name, description, category, images, price, compare_at_price, sku, page_sections, weight_grams, track_inventory, stock_quantity")
    .eq("id", productId).eq("business_id", businessId).maybeSingle();
  if (!product) return { error: "Produs negăsit." };
  const produs = product as unknown as MappableProduct;

  const categorie = input.category_id
    ?? (product.category ? config.category_map?.[product.category]?.category_id ?? null : null);
  /*
   * Cerinta de material are TREI stari, nu doua.
   *
   * Inainte, orice esec de citire a taxonomiei lasa `materialType` pe `null`,
   * adica exact valoarea care inseamna „categoria nu cere compozitie". Un 401 sau
   * o limita de rata faceau validarea sa treaca, si produsul pleca fara singurul
   * camp pe care About You il numeste explicit obligatoriu.
   */
  let cerintaMaterial: {
    tip: "textile" | "non-textile" | null; path: string | null; necunoscut?: boolean;
    cereMarime?: boolean | null;
  };
  if (!categorie) {
    cerintaMaterial = { tip: null, path: null };
  } else {
    const auth = authFromConfig(config);
    if (!auth) {
      cerintaMaterial = { tip: null, path: null, necunoscut: true };
    } else {
      const cerinta = await getCerintaMaterial(auth, categorie);
      // Mărimea se cere cand categoria are grup `size` — probat pe fir: About You
      // respinge cu „Size is required for this category" chiar si o geanta.
      const marime = await cereMarime(auth, categorie);
      cerintaMaterial = cerinta.ok
        ? { tip: cerinta.tip, path: cerinta.path, cereMarime: marime }
        : { tip: null, path: null, necunoscut: true, cereMarime: marime };
    }
  }

  const variants = atasezaPreturileRon(produs, input.variants.map((v) => ({
    sku: v.sku, ean: v.ean, size_id: v.size_id, second_size_id: v.second_size_id,
    color_id: v.color_id, quantity: v.quantity, retail_price_eur: v.retail_price_eur,
    sale_price_eur: v.sale_price_eur, enabled: v.enabled,
  })));

  const { issues, warnings } = validateListing({
    config,
    product: produs,
    listing: {
      brand_id: input.brand_id, category_id: input.category_id, color_id: input.color_id,
      attributes: input.attributes, material_composition: input.material,
      country_of_origin: input.country_of_origin, hs_code: input.hs_code,
    },
    variants,
  }, cerintaMaterial);

  /*
   * ═══ ⚠ DOUA REGULI ALE LOR PE CARE NU LE PUTEM CITI (27.08.2026) ═══
   *
   * Auditul spune ca (1) un produs `pending_approval` nu poate fi modificat — trebuie intors in
   * `draft`, actualizat, si retrimis — si ca (2) categoria nu se mai poate schimba dupa aprobare.
   * Documentatia lor sta in spatele contului de partener, deci n-am putut citi niciuna.
   *
   * ⚠ SE SPUN, NU SE IMPUN. Un blocaj construit pe o regula neverificata opreste lucruri care
   * poate merg — si asta e mai rau decat o cerere respinsa, fiindca respingerea se vede si se
   * poate relua, iar blocajul nostru nu se poate ocoli deloc. Aceeasi hotarare ca la `valid_at`
   * si la schema de semnatura.
   *
   * ⚠ SI DACA EI CHIAR REFUZA, comerciantul afla de ce: motivele respingerii ajung acum pe
   * listare prin `/products/rejected`, cerute pe nume. Deci calea „incearca si afla" nu mai e
   * oarba, cum era.
   */
  const rand = randCitit<{ status: string; category_id: number | null }>(
    "aboutyou.listareaDeVerificat", await createAdminClient()
      .from("aboutyou_listings").select("status, category_id")
      .eq("business_id", businessId).eq("product_id", productId).maybeSingle());

  if (rand?.status === "pending_approval") {
    warnings.push(
      /*
       * ⚠ TEXTUL S-A SCHIMBAT ODATA CU CODUL (27.08.2026, seara). Spunea „daca trimiterea e
       * respinsa, apasa «Retrage»" — adevarat cat timp trimiteam oricum si asteptam refuzul. Acum
       * `syncProductNow` face singur retragerea in ciorna si trimite la trecerea urmatoare, deci
       * vechiul text ar fi trimis omul sa faca de mana un lucru deja facut.
       */
      "Produsul e în curs de aprobare la About You, iar ei nu acceptă modificări în starea asta."
      + " Îl retragem automat în ciornă la trimitere, iar modificarea pleacă imediat după."
      + " Va trece din nou prin aprobarea lor.",
    );
  }

  const dupaAprobare = new Set(["active", "published", "pending_active", "inactive"]);
  const categoriaCeruta = input.category_id ?? config.category_map?.[produs.category ?? ""]?.category_id ?? null;
  if (rand && dupaAprobare.has(rand.status) && rand.category_id != null
    && categoriaCeruta != null && categoriaCeruta !== rand.category_id) {
    /*
     * ⚠ TEXTUL S-A SCHIMBAT ODATA CU CODUL. Spunea „About You POATE refuza" — adevarat cat timp
     * salvam si asteptam refuzul lor. Acum salvarea se opreste la noi, deci avertismentul e o
     * prevenire, nu o prezicere: omul afla inainte sa apese, nu dupa.
     */
    warnings.push(
      "Ai schimbat categoria unui produs deja aprobat. About You nu mai acceptă asta după aprobare,"
      + " iar salvarea va fi oprită: ca să-l muți în altă categorie, elimină listarea și creează una nouă.",
    );
  }

  return { issues, warnings };
}

export async function saveAboutYouListing(
  businessId: string, productId: string, input: AboutYouListingInput,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { data: product } = await g.supabase
    .from("products").select("id").eq("id", productId).eq("business_id", businessId).maybeSingle();
  if (!product) return { error: "Produs negăsit." };

  const admin = createAdminClient();
  const now = new Date().toISOString();

  /*
   * „CIORNA" INSEMNA DOUA LUCRURI OPUSE, si de aici veneau publicari in gol.
   *
   * Randul nou primea `status` din DEFAULT-ul bazei — `draft` — adica exact
   * valoarea pe care `pollOpenBatches` o scrie DUPA ce About You a acceptat
   * produsul. „Publică toate" filtreaza pe `draft`, deci punea la coada si
   * listari care nu plecasera niciodata: `PUT /products/status` nu avea pe ce
   * lucra, elementele se reincercau de cinci ori si dispareau din coada cu tot
   * cu motiv. Acum salvarea locala se numeste `local` si nu se confunda.
   *
   * Statusul se scrie DOAR la prima salvare: o listare deja activa pe About You,
   * editata si resalvata, nu are voie sa se intoarca la „local".
   *
   * De aceea INSERT si UPDATE sunt despartite explicit, in loc de un `upsert`
   * care omite coloana `status`. Un upsert ar depinde de o subtilitate: daca
   * PostgREST include in `DO UPDATE SET` doar coloanele din payload. Chiar daca
   * asa se comporta, un produs activ care s-ar intoarce la „local" e prea scump
   * ca sa depinda de o presupunere pe care n-o putem proba local.
   */
  const campuri = {
    brand_id: input.brand_id, category_id: input.category_id, color_id: input.color_id,
    attributes: input.attributes as never,
    material_composition: ((input.material ?? {}) as unknown) as never,
    country_of_origin: input.country_of_origin, hs_code: input.hs_code, updated_at: now,
  };

  /*
   * ⚠ Strict: o pana citita ca „nu exista" trimite pe calea de INSERT, iar acolo `UNIQUE
   * (business_id, style_key)` respinge — deci se ajungea pe ramura de cursa pentru un motiv care
   * n-avea nicio legatura cu o cursa, si mesajul ajuns la comerciant era despre altceva.
   */
  const { data: existent, error: eExistent } = await admin.from("aboutyou_listings")
    .select("id, status, category_id").eq("business_id", businessId).eq("style_key", productId).maybeSingle();
  if (eExistent) return { error: "Nu am putut citi listarea. Încearcă din nou." };

  /*
   * ═══ ⚠ CATEGORIA SI MARIMEA NU SE MAI SCHIMBA DUPA APROBARE (27.08.2026, tarziu) ═══
   *
   * Erau doar AVERTIZATE in editor, si se salvau. Comerciantul afla ca nu merge abia din lotul
   * respins, minute mai tarziu, iar intre timp datele locale spuneau altceva decat cele de la ei.
   *
   * ⚠ SE OPRESTE AICI, NU LA TRIMITERE, si asta e miezul: oprita la trimitere, schimbarea era deja
   * SALVATA la noi. De-acolo, orice comparatie intre ce credem si ce e la ei ar fi mintit, iar
   * urmatoarea trimitere ar fi incercat iar acelasi lucru imposibil.
   *
   * ⚠ SI ARE O IESIRE SCRISA. O regula care doar refuza, fara sa spuna ce se poate face, e o usa
   * incuiata fara clanta: listare noua pentru categorie, varianta noua pentru marime.
   */
  const APROBATE = new Set(["active", "published", "pending_active", "inactive"]);
  const randVechi = existent as { id: string; status?: string; category_id?: number | null } | null;
  if (randVechi && APROBATE.has(randVechi.status ?? "")) {
    const categoriaNoua = input.category_id ?? null;
    if (categoriaNoua != null && randVechi.category_id != null && categoriaNoua !== randVechi.category_id) {
      return {
        error: "About You nu mai acceptă schimbarea categoriei după ce produsul a fost aprobat."
          + " Ca să-l muți în altă categorie, elimină listarea și creează una nouă.",
      };
    }

    /*
     * ⚠ Marimea se compara PE SKU, nu pe pozitie: variantele se pot reordona intre doua deschideri
     * ale editorului, iar comparate pe indice ar fi parut schimbate toate.
     */
    const { data: vechi, error: eVechi } = await admin.from("aboutyou_variants")
      .select("sku, size_id, second_size_id").eq("listing_id", randVechi.id);
    if (eVechi) return { error: "Nu am putut citi variantele. Încearcă din nou." };
    const dupaSku = new Map((vechi ?? []).map((v) => [
      (v as { sku: string }).sku,
      v as { size_id: number | null; second_size_id: number | null },
    ]));
    for (const v of input.variants) {
      const sku = v.sku?.trim();
      if (!sku) continue;
      const vechea = dupaSku.get(sku);
      /* Varianta noua n-are ce sa incalce: regula e despre SCHIMBAREA uneia deja aprobate. */
      if (!vechea) continue;
      const schimbata = (v.size_id ?? null) !== (vechea.size_id ?? null)
        || (v.second_size_id ?? null) !== (vechea.second_size_id ?? null);
      if (schimbata && vechea.size_id != null) {
        return {
          error: `About You nu mai acceptă schimbarea mărimii la varianta „${sku}" după ce a fost aprobată.`
            + " Dezactivează varianta și adaugă una nouă, cu SKU nou, pentru mărimea corectă.",
        };
      }
    }
  }

  let listingId: string;
  if (existent) {
    const { error } = await admin.from("aboutyou_listings")
      .update(campuri as never).eq("id", (existent as { id: string }).id);
    if (error) return { error: "Eroare la salvarea listării." };
    listingId = (existent as { id: string }).id;
  } else {
    const { data: nou, error } = await admin.from("aboutyou_listings").insert({
      business_id: businessId, product_id: productId, style_key: productId,
      status: "local", ...campuri,
    } as never).select("id").single();
    if (nou) {
      listingId = (nou as { id: string }).id;
    } else {
      /*
       * Cursa: intre citire si insert, alta salvare a creat randul, iar
       * `UNIQUE (business_id, style_key)` respinge insertul. Recitim si scriem
       * ca la o listare existenta — fara sa atingem statusul.
       */
      const { data: iar } = await admin.from("aboutyou_listings")
        .select("id").eq("business_id", businessId).eq("style_key", productId).maybeSingle();
      if (!iar) {
        logError({ action: "aboutyou.saveListing", message: error?.message ?? "insert fara rand", details: { businessId, productId }, businessId });
        return { error: "Eroare la salvarea listării." };
      }
      const { error: eroareUpdate } = await admin.from("aboutyou_listings")
        .update(campuri as never).eq("id", (iar as { id: string }).id);
      if (eroareUpdate) return { error: "Eroare la salvarea listării." };
      listingId = (iar as { id: string }).id;
    }
  }

  // Build the new variant set and guard against SKU clashes BEFORE deleting
  // anything, so a duplicate SKU never wipes a listing's variants.
  const rows = input.variants.filter((v) => v.sku?.trim()).map((v) => ({
    listing_id: listingId, business_id: businessId, product_id: productId,
    sku: v.sku.trim(), ean: v.ean, size_id: v.size_id, second_size_id: v.second_size_id,
    color_id: v.color_id, quantity: v.quantity, retail_price_eur: v.retail_price_eur,
    sale_price_eur: v.sale_price_eur, enabled: v.enabled,
    variant_title: v.variant_title?.trim() || null,
  }));

  /*
   * DUPLICATELE DIN INTERIORUL ACELUIASI PRODUS, prinse primele.
   *
   * Verificarea de mai jos filtreaza explicit listarea curenta, deci vedea doar
   * coliziunile cu ALTE produse. Doua combinatii cu acelasi SKU in acelasi produs
   * treceau de ea, iar insertul cadea pe `UNIQUE (business_id, sku)` DUPA ce
   * stergerea se comisese, fara rollback: listarea rămânea fara nicio varianta,
   * cu marimile, culorile si preturile completate manual pierdute definitiv. Iar
   * campul de SKU al combinatiei e text liber, deci cazul e usor de atins.
   */
  const vazute = new Set<string>();
  const dublate = new Set<string>();
  for (const r of rows) {
    if (vazute.has(r.sku)) dublate.add(r.sku); else vazute.add(r.sku);
  }
  if (dublate.size > 0) {
    const lista = [...dublate].slice(0, 3).join(", ");
    return { error: `SKU-ul ${lista} apare la mai multe variante ale acestui produs. Fiecare variantă are nevoie de un SKU unic.` };
  }

  const newSkus = rows.map((r) => r.sku);
  if (newSkus.length > 0) {
    /*
     * ═══ ⚠ O PAZA CARE CADEA DESCHIS (27.08.2026, seara) ═══
     *
     * `const { data: clash }` inghitea eroarea. O citire picata dadea `null`, `?? []` o facea
     * lista goala, si de-acolo iesea „niciun conflict" — adica exact verdictul pe care paza
     * trebuia sa-l dea numai dupa ce a VERIFICAT. Doua produse ajungeau cu acelasi SKU la About
     * You, iar acolo al doilea il suprascrie pe primul, tacut.
     *
     * ⚠ Diferenta fata de citirile de AFISARE din editor: acolo o pana arata o lista goala si se
     * vede; aici arata „e in regula" si se scrie.
     */
    const { data: clash, error: eClash } = await admin.from("aboutyou_variants")
      .select("sku, listing_id").eq("business_id", businessId).in("sku", newSkus);
    if (eClash) return { error: "Nu am putut verifica dacă SKU-urile sunt libere. Încearcă din nou." };
    const conflict = (clash ?? []).find((c) => (c as { listing_id: string }).listing_id !== listingId);
    if (conflict) return { error: `SKU-ul „${(conflict as { sku: string }).sku}" este deja folosit de alt produs. Folosește SKU-uri unice.` };
  }
  /*
   * Se inlocuiesc DOAR randurile care vin din editor, nu toate.
   *
   * Un `delete` pe toata listarea stergea si randurile RETRASE — cele ale
   * variantelor care nu mai exista pe produs. Iar randul retras e singura urma a
   * maparii `sku -> product_id + variant_title`: fara el, o comanda About You
   * sosita pe acel SKU intra fara sa scada stoc, tacut. Pe langa asta, stergerea
   * ii lua si semnul `ay_status = "removed"`, deci `reconciliazaVariante` relua
   * retragerea la fiecare rulare.
   */
  /*
   * ═══ ⚠ STERGEREA SI INSERAREA ERAU DOUA TRANZACTII (27.08.2026, seara) ═══
   *
   * `delete` reusea, apoi `insert` putea pica dintr-un hop de-o clipa — iar randurile vechi erau
   * deja duse. Se pierdeau codurile EAN, maparea de marime, cea de culoare, preturile EUR scrise
   * de mana, comutatoarele `enabled` si titlurile de varianta. Nimic nu le mai refacea: sunt date
   * introduse de OM, nu date pe care sa le recitim de undeva. Si e chiar calea cea mai folosita:
   * fiecare apasare pe „Salveaza".
   *
   * ⚠ Acum intr-un singur RPC, deci intr-o singura tranzactie: ori se schimba tot, ori nimic.
   * Probat pe productie — o salvare care pica lasa cele doua randuri vechi neatinse, iar una care
   * merge inlocuieste doar SKU-ul cerut.
   */
  if (newSkus.length > 0) {
    const { data: rez, error: vErr } = await admin.rpc("aboutyou_salveaza_variante", {
      p_business_id: businessId, p_listing_id: listingId, p_randuri: rows as never,
    });
    const r = rez as { stare?: string; scrise?: number } | null;
    if (vErr || !r?.stare) {
      logError({
        action: "aboutyou.saveListing", severity: "error",
        message: `variantele nu s-au putut salva: ${vErr?.message ?? "raspuns nevalid"}`,
        details: { businessId, productId, cate: rows.length }, businessId,
      });
      return { error: "Eroare la salvarea variantelor. Verifică să nu ai SKU-uri duplicate." };
    }
    /* ⚠ „Listarea nu exista" nu e acelasi lucru cu „a mers": ar iesi tacut, fara nicio varianta. */
    if (r.stare === "lipsa") return { error: "Listarea About You nu mai există. Reîncarcă pagina." };
  }
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Push / publish / remove ─────────────────────────────────────────────────────
async function withContext<T>(businessId: string, fn: (admin: ReturnType<typeof createAdminClient>, ctx: NonNullable<Awaited<ReturnType<typeof loadAboutYouContext>>>) => Promise<T>): Promise<T | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();
  const ctx = await loadAboutYouContext(admin, businessId);
  if (!ctx) return { error: "Conexiunea About You nu este disponibilă. Reconectează contul." };
  return fn(admin, ctx);
}

export async function syncAboutYouProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => syncProductNow(admin, ctx, productId));
  if ("error" in res) {
    logError({ action: "aboutyou.sync", message: res.error, details: { businessId, productId }, businessId });
    return { error: res.error };
  }
  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function publishAboutYouProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => publishProductNow(admin, ctx, productId));
  if ("error" in res) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function unpublishAboutYouProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => unpublishProductNow(admin, ctx, productId));
  if ("error" in res) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function removeAboutYouListing(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => removeProductNow(admin, ctx, productId));
  if ("error" in res) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/products");
  return { success: true };
}

/*
 * ── Ce trebuie sa ai pregatit ────────────────────────────────────────────────
 *
 * Comerciantul afla cerintele blocante una cate una, pe parcurs: intra in editor,
 * completeaza zece minute, apasa trimite si abia atunci vede „Varianta X nu are cod
 * EAN". Iar cerintele globale — brand, tari, curs valutar — nu apar nicaieri pana
 * la prima trimitere. Primul comerciant real a stat zece zile cu toate cele cinci
 * tabele goale, oprit chiar in ecranul de setari.
 *
 * Numaratoarea se face cu interogari NUMAI DE CONTOR, nu citind produsele: doua
 * mii de randuri intr-un panou de dashboard nu se justifica. Filtrele pe cale
 * jsonb (`page_sections->google->>gtin`) si `images=neq.[]` sunt PROBATE pe
 * PostgREST-ul real, nu presupuse.
 */
export interface PreVerificareAboutYou {
  produseActive: number;
  /** Produse cu combinatii: la ele codul de bare se cere PE FIECARE varianta. */
  cuVariante: number;
  cuGreutate: number;
  cuImagini: number;
  cuEanLaProdus: number;
  cuSku: number;
  listari: number;
  categoriiNemapate: number;
  exempleNemapate: string[];
  /**
   * Produse active FARA nicio categorie. Blocheaza total listarea si erau excluse
   * din numaratoare, deci singurul blocaj complet nu apărea nicaieri.
   */
  faraCategorie: number;
  /** Ce lipseste din setarile magazinului, in ordinea in care blocheaza. */
  lipsuriGlobale: string[];
}

export async function getAboutYouPreVerificare(businessId: string): Promise<PreVerificareAboutYou | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);
  const sb = g.supabase;

  const mapate = Object.keys(config.category_map ?? {});
  // Interogare de contor pe produsele active ale magazinului.
  const active = () => sb.from("products").select("id", { count: "exact", head: true })
    .eq("business_id", businessId).eq("is_active", true);

  const [rTotal, rGreutate, rImagini, rEan, rSku, rVariante] = await Promise.all([
    active(),
    active().gt("weight_grams", 0),
    // `neq("images", "[]")` NU acopera `null`, de aceea si a doua conditie.
    active().neq("images", "[]").not("images", "is", null),
    /*
     * ⚠ Doar codul de bare de la nivel de PRODUS.
     *
     * Codurile per combinatie stau in `page_sections.variants.combinations[].gtin`
     * si nu se pot numara cu un filtru — de aceea eticheta din panou spune explicit
     * „la nivel de produs". Calea jsonb e probata pe PostgREST-ul real; tipurile
     * supabase-js nu cunosc coloane cu cale, de aici cast-ul.
     */
    // `not is null` NU exclude sirul gol: un `gtin: ""` era numarat drept prezent,
    // iar `validateListing` il refuza. Panoul ar fi aratat verde peste un blocaj.
    (active() as unknown as {
      not: (c: string, o: string, v: null) => { neq: (c: string, v: string) => Promise<{ count: number | null }> };
    }).not("page_sections->google->>gtin", "is", null).neq("page_sections->google->>gtin", ""),
    active().not("sku", "is", null).neq("sku", ""),
    /*
     * Cate produse au VARIANTE.
     *
     * Pentru ele, codul de bare se cere pe FIECARE combinatie, iar acela sta in
     * `page_sections.variants.combinations[].gtin` si nu se poate numara cu un
     * filtru. Fara numarul asta, pastila „Gata" se facea verde pe baza codurilor de
     * la nivel de produs — adica peste un magazin la care fiecare trimitere cade.
     */
    (active() as unknown as { eq: (c: string, v: string) => Promise<{ count: number | null }> })
      .eq("page_sections->variants->>enabled", "true"),
  ]);
  const produseActive = rTotal.count ?? 0;
  const cuGreutate = rGreutate.count ?? 0;
  const cuImagini = rImagini.count ?? 0;
  const cuEanLaProdus = rEan.count ?? 0;
  const cuSku = rSku.count ?? 0;
  const cuVariante = rVariante.count ?? 0;

  /*
   * Categoriile nemapate se afla prin DIFERENTA DE MULTIMI, in JS.
   *
   * O prima versiune construia filtrul `not.in.("a","b")` de mana. Doua defecte,
   * amandouă tacute: escaparea ghilimelelor prin dublare nu e cea a lui PostgREST
   * (acolo caracterul de escape e backslash-ul), deci o categorie numita
   * `Colecția "Vară"` nu mai era exclusa si apărea veșnic drept nemapata; iar
   * `.limit(500)` raporta un numar TRUNCHIAT ca si cum ar fi complet. Diferenta in
   * JS nu are nici problema de escapare, nici de trunchiere.
   */
  const categoriiVazute = new Set<string>();
  let faraCategorie = 0;
  {
    for (let de = 0; de < 20000; de += 1000) {
      const { data, error } = await sb.from("products").select("category")
        .eq("business_id", businessId).eq("is_active", true)
        .order("id", { ascending: true }).range(de, de + 999);
      if (error) break;
      const lot = data ?? [];
      for (const r of lot) {
        if (r.category) categoriiVazute.add(r.category);
        else faraCategorie++;
      }
      if (lot.length < 1000) break;
    }
  }
  const mapateSet = new Set(mapate);
  const nemapate = [...categoriiVazute].filter((c) => !mapateSet.has(c)).sort();
  const categoriiNemapate = nemapate.length;
  const exempleNemapate = nemapate.slice(0, 5);

  /*
   * Culoarea NU se numara aici, desi ar parea firesc.
   *
   * E validă in doua locuri — pe listare SAU pe fiecare varianta — iar un contor
   * pe `aboutyou_listings.color_id` ar raporta „lipsa" tocmai pentru produsele
   * multicolore, unde culoarea e pusa corect pe variante. Adica panoul ar
   * contrazice validarea. Culoarea are oricum feedback exact chiar in editor, la
   * locul unde se completeaza; aici putea doar sa induca in eroare.
   */
  const { count: listari } = await sb.from("aboutyou_listings")
    .select("id", { count: "exact", head: true }).eq("business_id", businessId);

  const lipsuriGlobale: string[] = [];
  if (!config.brand_id) lipsuriGlobale.push("Brandul About You (îl poți schimba apoi pe fiecare produs)");
  if (!config.ship_countries || config.ship_countries.length === 0) lipsuriGlobale.push("Cel puțin o țară de listare");
  if (config.price_mode !== "manual_eur" && !(config.fx?.rate && config.fx.rate > 0)) {
    lipsuriGlobale.push("Cursul valutar RON către EUR");
  }
  if (!config.target_audience) lipsuriGlobale.push("Publicul magazinului (folosit la maparea automată a categoriilor)");

  return {
    produseActive, cuVariante, cuGreutate, cuImagini, cuEanLaProdus, cuSku,
    listari: listari ?? 0,
    categoriiNemapate, exempleNemapate, faraCategorie, lipsuriGlobale,
  };
}

// ── Listings table ────────────────────────────────────────────────────────────────
export interface AboutYouListingRow {
  product_id: string | null;
  style_key: string;
  name: string;
  status: string;
  error: string | null;
  rejectionCount: number;
  /**
   * Motivele respingerii, traduse. Se numarau si nu se afisau nicaieri: omul
   * vedea „Respins" si nimic altceva, iar singurul loc care spune CE e greșit
   * rămânea in baza, necitit.
   */
  motive: MotivAfisat[];
  lastSyncedAt: string | null;
}

/*
 * O pagina de produse, cu listarile lor.
 *
 * Inainte, pagina incarca 300 de produse si 200 de listari si le imperechea in
 * memorie. Peste atat, produsele pur si simplu lipseau din lista — iar cele
 * listate DEJA pe About You, dar aflate dupa prima suta de listari, se afisau ca
 * „Nelistat": comerciantul apasa „Trimite" pe ceva ce era deja acolo. Fara nicio
 * cautare si fara paginare, la o mie de produse ecranul era inutilizabil.
 */
// Nu se exporta: intr-un fisier „use server" doar functiile async au voie sa fie
// exporturi, iar o constanta exportata rupe compilarea intregului modul.
const ABOUTYOU_PAGE_SIZE = 50;

export interface AboutYouProductPage {
  products: { id: string; name: string; category: string | null; is_active: boolean }[];
  listings: AboutYouListingRow[];
  total: number;
  page: number;
  pages: number;
}

export async function getAboutYouProductPage(
  businessId: string, page = 1, q = "",
): Promise<AboutYouProductPage | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const pagina = Math.max(1, Math.floor(page));
  const cautare = q.trim().slice(0, 80);
  const from = (pagina - 1) * ABOUTYOU_PAGE_SIZE;

  let query = g.supabase
    .from("products").select("id, name, category, is_active", { count: "exact" })
    .eq("business_id", businessId).eq("is_active", true);
  if (cautare) query = query.ilike("name", `%${cautare}%`);

  const { data, count } = await query
    .order("updated_at", { ascending: false })
    .range(from, from + ABOUTYOU_PAGE_SIZE - 1);

  const products = (data ?? []) as AboutYouProductPage["products"];
  const total = count ?? products.length;

  // Listarile se cer DOAR pentru produsele de pe pagina: asa nu mai poate exista
  // un produs listat caruia sa nu-i gasim listarea.
  let listings: AboutYouListingRow[] = [];
  if (products.length > 0) {
    const { data: ls } = await g.supabase
      .from("aboutyou_listings")
      .select("product_id, style_key, status, error, rejection_reasons, last_synced_at, products(name)")
      .eq("business_id", businessId)
      .in("product_id", products.map((p) => p.id));
    listings = (ls ?? []).map(randListare);
  }

  return { products, listings, total, page: pagina, pages: Math.max(1, Math.ceil(total / ABOUTYOU_PAGE_SIZE)) };
}

function randListare(r: {
  product_id: string | null; style_key: string; status: string; error: string | null;
  rejection_reasons: unknown; last_synced_at: string | null; products: unknown;
}): AboutYouListingRow {
  const prod = r.products as { name?: string } | { name?: string }[] | null;
  const name = Array.isArray(prod) ? prod[0]?.name : prod?.name;
  return {
    product_id: r.product_id,
    style_key: r.style_key,
    name: name ?? "Produs",
    status: r.status,
    error: r.error,
    rejectionCount: Array.isArray(r.rejection_reasons) ? r.rejection_reasons.length : 0,
    motive: traduMotive(r.rejection_reasons),
    lastSyncedAt: r.last_synced_at,
  };
}

export async function getAboutYouListings(businessId: string): Promise<AboutYouListingRow[]> {
  const g = await guard(businessId);
  if ("error" in g) return [];
  const { data } = await g.supabase
    .from("aboutyou_listings")
    .select("product_id, style_key, status, error, rejection_reasons, last_synced_at, products(name)")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(200);

  // Aceeasi conversie ca pe calea paginata: erau doua copii, iar cea de aici
  // uitase deja `motive`.
  return (data ?? []).map(randListare);
}

/*
 * ── Documentele comenzii ─────────────────────────────────────────────────────
 *
 * About You detine checkout-ul si emite factura catre cumparator, iar
 * comerciantul are nevoie de ea pentru contabilitate. Rutele existau in
 * specificatie si nu erau implementate nicaieri: singura cale era Seller Center.
 *
 * PDF-ul se intoarce ca base64: o actiune de server nu poate trimite un
 * `ArrayBuffer` la client prin granita de serializare.
 */
export async function getAboutYouOrderDocument(
  businessId: string, orderId: string, fel: "invoices" | "delivery-document",
): Promise<{ base64: string; tip: string; numeFisier: string } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  // Numarul comenzii se ia din randul NOSTRU, nu din ce trimite clientul: altfel
  // un `orderId` strain ar putea cere documentele altui comerciant.
  const { data: ay } = await admin
    .from("aboutyou_orders").select("aboutyou_order_number")
    .eq("business_id", businessId).eq("order_id", orderId).maybeSingle();
  const numar = (ay as { aboutyou_order_number?: string } | null)?.aboutyou_order_number;
  if (!numar) return { error: "Comanda nu este o comandă About You." };

  const res = await getOrderDocument(g.auth, numar, fel);
  if (isAboutYouError(res)) {
    // 404 inseamna, cel mai adesea, „nu s-a emis inca", nu o defectiune.
    if (res.status === 404) {
      return { error: fel === "invoices"
        ? "About You nu a emis încă factura pentru această comandă."
        : "About You nu a emis încă documentul de livrare pentru această comandă." };
    }
    return { error: res.error };
  }
  return {
    base64: Buffer.from(res.data.continut).toString("base64"),
    tip: res.data.tip,
    numeFisier: `${fel === "invoices" ? "factura" : "livrare"}-${numar}.pdf`,
  };
}

/*
 * ── Comenzile About You ──────────────────────────────────────────────────────
 *
 * Nu erau afisate nicaieri in panoul integrarii. Statusurile de eșec
 * (`ship_failed`, `cancel_failed`, `return_failed`) se scriau intr-o coloana pe
 * care n-o citea nicio pagina, deci o expediere pe care About You a respins-o
 * rămânea nevazuta si fara nicio cale de reluare.
 */
export interface RandComandaAboutYou {
  orderId: string | null;
  numarAy: string;
  numarEdinio: string | null;
  status: string;
  tara: string | null;
  fulfillment: string | null;
  ultimaSincronizare: string | null;
  creata: string;
  /**
   * Ce se poate cere la About You pentru comanda asta.
   *
   * ⚠ SE SOCOTESC DIN LINII, nu din statusul comenzii. La ei starea sta pe LINIE, iar comanda cu
   * linii in stari diferite e „mixed" — deci un buton legat de statusul comenzii ar fi fost si
   * ascuns cand trebuia, si aratat cand nu trebuia. Regula lor: anularea merge numai pe `open`,
   * returul numai pe `shipped`.
   *
   * ⚠ E ACEEASI regula pe care o pazeste si `idsArticoleInStarea` la trimitere. Aici doar nu se
   * arata un buton care oricum ar fi refuzat; hotararea adevarata ramane pe server.
   */
  sePoateAnula: boolean;
  sePoateReturna: boolean;
}

export async function getAboutYouOrders(businessId: string, doarProbleme = false): Promise<RandComandaAboutYou[]> {
  const g = await guard(businessId);
  if ("error" in g) return [];
  let q = g.supabase
    .from("aboutyou_orders")
    .select("order_id, aboutyou_order_number, status, shop_country, fulfillment_type, items, last_synced_at, created_at, orders(order_number)")
    .eq("business_id", businessId);
  if (doarProbleme) q = q.in("status", ["ship_failed", "cancel_failed", "return_failed"]);
  /* ⚠ Eroarea se citeste: inghitita, un hop al bazei ar fi aratat „nicio comanda About You". */
  const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
  if (error) {
    logError({
      action: "aboutyou.getOrders", message: `lista comenzilor nu s-a putut citi: ${error.message}`,
      details: { businessId }, businessId,
    });
    return [];
  }

  return (data ?? []).map((r) => {
    const o = r.orders as { order_number?: string } | { order_number?: string }[] | null;
    const numarEdinio = Array.isArray(o) ? o[0]?.order_number : o?.order_number;
    /*
     * ⚠ Din LINII, nu din statusul comenzii. Vezi nota de pe `RandComandaAboutYou`. Iar
     * comenzile onorate de ei nu se ating deloc: acolo marfa nici nu e la comerciant.
     */
    const linii = Array.isArray(r.items) ? (r.items as { status?: string }[]) : [];
    const aleLor = r.fulfillment_type === "fulfillment_by_marketplace";
    return {
      orderId: r.order_id,
      numarAy: r.aboutyou_order_number,
      numarEdinio: numarEdinio ?? null,
      status: r.status ?? "open",
      tara: r.shop_country,
      fulfillment: r.fulfillment_type,
      ultimaSincronizare: r.last_synced_at,
      creata: r.created_at,
      sePoateAnula: !aleLor && linii.some((l) => l.status === "open"),
      sePoateReturna: !aleLor && linii.some((l) => l.status === "shipped"),
    };
  });
}

/** Repune la coada expedierea unei comenzi About You care a eșuat. */
export async function reincearcaExpediereaAboutYou(businessId: string, orderId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const { error } = await admin.from("aboutyou_sync_queue").upsert(
    { business_id: businessId, product_id: null, offer_id: orderId, op: "ship", attempts: 0, last_error: null },
    { onConflict: "business_id,offer_id,op" },
  );
  if (error) return { error: "Nu am putut repune expedierea la coadă." };
  await admin.from("aboutyou_orders")
    .update({ status: "ship_pending", updated_at: new Date().toISOString() })
    .eq("business_id", businessId).eq("order_id", orderId);
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/*
 * ═══ ⚠ ANULAREA SI RETURUL EXISTAU SI NU LE CHEMA NIMENI (27.08.2026) ═══
 *
 * `cancelOrderNow` si `returnOrderNow` erau scrise, cu garzile lor pe stari, si nu aveau NICIUN
 * punct de chemare in tot depozitul. Adica: comerciantul nu putea nici anula, nici marca un
 * retur din Edinio — trebuia sa intre in Seller Center, iar la noi comanda ramanea cum era.
 *
 * ⚠ AMANDOUA SUNT EFECTE EXTERNE CU UN SINGUR FOC, deci trec prin `cuLotDurabil`: urma se scrie
 * inaintea cererii. Vezi nota de acolo.
 */
export async function anuleazaComandaAboutYou(
  businessId: string, orderId: string,
): Promise<{ success: true } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const ctx = await loadAboutYouContext(admin, businessId);
  if (!ctx) return { error: "Contul About You nu este conectat." };
  const r = await cancelOrderNow(admin, ctx, orderId);
  if (!r.ok) return { error: r.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function returneazaComandaAboutYou(
  businessId: string, orderId: string, awbRetur: string,
): Promise<{ success: true } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  /* ⚠ Verificat AICI, nu doar in ecran: o actiune de server e o ruta, si oricine o poate chema. */
  if (!awbRetur.trim()) return { error: "Completează numărul AWB de retur." };
  const admin = createAdminClient();
  const ctx = await loadAboutYouContext(admin, businessId);
  if (!ctx) return { error: "Contul About You nu este conectat." };
  const r = await returnOrderNow(admin, ctx, orderId, awbRetur);
  if (!r.ok) return { error: r.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Webhooks (stock.updated now; order events in Faza 3) ────────────────────────
/*
 * Diagnoza abonamentului: exista chiar acolo si acopera ce trebuie?
 *
 * Puteam doar sa CREAM si sa STERGEM un abonament, deci un abonament rupt — sters
 * din Seller Center, expirat, sau creat cu alte evenimente — tacea la nesfarsit,
 * iar comenzile veneau doar prin cron, cu intarziere. Acum se poate verifica.
 */
export interface DiagnozaWebhookAboutYou {
  abonamentLocal: string | null;
  existaLaEi: boolean;
  /** Comutatorul LOR. Oprit, abonamentul exista si totusi nu livreaza nimic. */
  activLaEi: boolean;
  evenimenteLipsa: string[];
  /** `true` cand URL-ul lor nu mai poarta tokenul nostru: ruta va respinge tot. */
  tokenNepotrivit: boolean;
  url: string | null;
  eroare: string | null;
}

export async function getAboutYouWebhookDiagnoza(businessId: string): Promise<DiagnozaWebhookAboutYou | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const gol = {
    abonamentLocal: null as string | null, existaLaEi: false, activLaEi: false,
    evenimenteLipsa: [] as string[], tokenNepotrivit: false, url: null as string | null,
    eroare: null as string | null,
  };
  const id = g.config.webhook_subscription_id ?? null;
  if (!id) return gol;

  const res = await getWebhookSubscription(g.auth, id);
  if (isAboutYouError(res)) {
    // 404 = abonamentul nu mai exista la ei, desi noi il credem viu.
    return { ...gol, abonamentLocal: id, eroare: res.status === 404 ? null : res.error };
  }
  const s = res.data ?? {};
  const evenimente = Array.isArray(s.events) ? s.events.map(String) : [];
  const url = typeof s.url === "string" ? s.url : null;
  return {
    abonamentLocal: id,
    existaLaEi: true,
    /*
     * `enabled` e comutatorul LOR, si se poate schimba din Seller Center cu aceeasi
     * cheie API. Ignorat, unealta facuta sa gaseasca abonamente rupte raporta verde
     * peste unul oprit — cu contrariul chiar in raspunsul pe care il citea.
     */
    activLaEi: s.enabled !== false,
    /*
     * ⚠ SE COMPARA CU CELE ESENTIALE, NU CU TOATE. About You poate primi abonamentul si sa taie
     * tacut evenimentele invechite din el. Comparat cu lista intreaga, panoul ar fi aratat pe veci
     * „trei evenimente lipsa", iar comerciantul s-ar fi reabonat la nesfarsit ca sa repare ceva ce
     * nu era stricat.
     */
    evenimenteLipsa: EVENIMENTE_ESENTIALE.filter((e) => !evenimente.includes(e)),
    // Tokenul din URL e a doua incuietoare a rutei. Daca URL-ul lor nu-l mai
    // poarta, fiecare eveniment va fi respins de noi, tacut.
    tokenNepotrivit: !!g.config.webhook_token && !!url && !url.includes(g.config.webhook_token),
    url,
    eroare: null,
  };
}

export async function subscribeAboutYouWebhook(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  /*
   * Tokenul din URL e a doua incuietoare a rutei de webhook.
   *
   * Schema de semnatura a lui About You nu e documentata, deci verificarea ei e o
   * deductie care poate cadea mereu. Tokenul asta il stie doar About You, pentru
   * ca doar in URL-ul lui de abonare l-am pus — si nu depinde de nimic ghicit.
   * Se genereaza la fiecare abonare, deci o reabonare il si roteste.
   */
  const token = randomBytes(24).toString("base64url");
  const url = `${aboutyouWebhookUrl()}?businessId=${encodeURIComponent(businessId)}&token=${token}`;
  /*
   * ⚠ SE CER DOAR CELE ESENTIALE. Vezi `EVENIMENTE_INVECHITE`: cele trei vechi sunt marcate
   * `deprecated` in specificatia lor si nu aduceau nimic — orice eveniment de comanda duce la
   * aceeasi recitire intreaga a comenzii. Cerute, erau doar inca un fel in care cererea intreaga
   * putea fi refuzata, lasand comerciantul fara NICIUN webhook.
   *
   * ⚠ RELUAREA PE LISTA SCURTA S-A SCOS ODATA CU ELE: lista ceruta E deja cea scurta, deci o
   * reluare ar fi retrimis exact aceleasi nume. Un cod care se preface ca mai are o sansa e mai
   * rau decat unul care n-are.
   */
  const res = await createWebhookSubscription(g.auth, { url, description: "Edinio sync", events: ABOUTYOU_WEBHOOK_EVENTS });
  if (isAboutYouError(res)) return { error: res.error };

  const next: AboutYouConfig = {
    ...g.config,
    webhook_token: token,
    // `id` vine INTREG in raspuns (SecretWebhookSubscriptionSchema), iar noi il
    // folosim ca segment de cale la dezabonare — deci il pastram ca sir.
    webhook_subscription_id: res.data?.id != null ? String(res.data.id) : g.config.webhook_subscription_id,
    webhook_secret: res.data?.client_secret ?? g.config.webhook_secret,
  };
  if (!(await saveConfig(businessId, next))) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function unsubscribeAboutYouWebhook(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  if (g.config.webhook_subscription_id) {
    await deleteWebhookSubscription(g.auth, g.config.webhook_subscription_id);
  }
  const next: AboutYouConfig = { ...g.config, webhook_subscription_id: undefined, webhook_secret: undefined, webhook_token: undefined };
  await saveConfig(businessId, next);
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Bulk operations (Faza 5) ────────────────────────────────────────────────────

/**
 * Deschide o lucrare in masa INAINTE de a pune ceva la coada.
 *
 * ═══ ⚠ URMA SE SCRIE INAINTEA LUCRULUI (27.08.2026, noaptea) ═══
 *
 * Pana azi se punea intai la coada cat apuca actiunea, si ABIA APOI se scria cursorul. Raspunsul
 * scrierii nici nu se citea. Deci:
 *
 *     25.000 de listari
 *     primele 20.000 intra in coada     ✅
 *     scrierea cursorului pica          ❌
 *     omul vede „Salvat"                ✅
 *
 * Ultimele 5.000 nu mai au NIMIC care sa le atinga vreodata. Aceeasi lectie ca la `cuLotDurabil`,
 * unde intentia se scrie inaintea cererii: ordinea nu e un amanunt, e chiar apararea.
 *
 * ⚠ INTOARCE `null` DACA LUCRAREA NU S-A PUTUT DESCHIDE, iar apelantul raspunde cu eroare. O
 * lucrare care nu exista nu se poate relua, deci n-avem voie sa spunem „am pornit".
 *
 * ⚠ O A DOUA APASARE PE ACELASI BUTON nu porneste inca o lucrare: indexul unic partial o refuza,
 * si atunci se continua cea deschisa — ceea ce si vrea omul care apasa a doua oara.
 */
interface Lucrare { id: string; dupa: string | null; puse: number }

async function deschideLucrarea(
  businessId: string, op: "upsert" | "publish" | "price",
  statusFilter?: string, doarTrimise?: boolean,
): Promise<Lucrare | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("aboutyou_bulk_jobs")
    .insert({
      business_id: businessId, op,
      status_filtru: statusFilter ?? null, doar_trimise: !!doarTrimise,
    } as never)
    .select("id, dupa, puse").maybeSingle();
  if (!error && data) return data as Lucrare;

  if ((error as { code?: string } | null)?.code === "23505") {
    const { data: veche } = await admin.from("aboutyou_bulk_jobs")
      .select("id, dupa, puse").eq("business_id", businessId).eq("op", op).eq("status", "deschis")
      .maybeSingle();
    if (veche) return veche as Lucrare;
  }
  logError({
    action: "aboutyou.deschideLucrarea", severity: "critical",
    message: `lucrarea in masa nu s-a putut deschide: ${error?.message ?? "necunoscut"}`,
    details: { businessId, op }, businessId,
  });
  return null;
}

/**
 * Muta cursorul lucrarii, sau o inchide daca s-a terminat.
 *
 * ⚠ SCRIEREA ASTA PICATA NU MAI PIERDE NIMIC, si asta e tot rostul randului: lucrarea ramane
 * deschisa cu cursorul dinainte, iar cronul reia de-acolo. Cel mai rau lucru care se intampla e
 * ca o parte din catalog intra a doua oara in coada — o pierdere de-o cerere, nu de catalog.
 */
async function mutaLucrarea(l: Lucrare, r: { n: number; incomplet: boolean; ultimulId: string | null }) {
  const acum = new Date().toISOString();
  await createAdminClient().from("aboutyou_bulk_jobs").update({
    dupa: r.ultimulId, puse: l.puse + r.n, atins_la: acum,
    ...(r.incomplet ? {} : { status: "gata", terminat_la: acum }),
  } as never).eq("id", l.id);
}

async function enqueueForListings(
  supabase: ServerClient, businessId: string,
  /* ⚠ `price` a intrat cand setarile globale au inceput sa repuna produsele la coada: o schimbare
     de curs cere doar preturi, nu produsul intreg. Vezi `saveAboutYouSettings`. */
  op: "upsert" | "publish" | "price", statusFilter?: string,
  doarTrimise?: boolean,
  /** De unde se reia, cand o trecere anterioara s-a oprit la plafon. */
  dupa?: string | null,
): Promise<{ n: number; incomplet: boolean; ultimulId: string | null }> {
  /*
   * Se citeste PE FERESTRE, nu cu `.limit(2000)`.
   *
   * PostgREST taie la 1000 de randuri, tacut. Peste atat, „Sincronizează tot"
   * sincroniza o mie si raporta succes — deci comerciantul credea ca a trimis tot
   * catalogul. Fereastra are nevoie de o ordine stabila, altfel paginile se pot
   * suprapune sau sari.
   */
  const PAS = 1000;
  const PLAFON = 20000;
  const brute: string[] = [];
  /*
   * „Am trimis tot" trebuie sa fie ADEVARAT.
   *
   * Cele doua ieșiri de mai jos — o pagina cazuta si atingerea plafonului — dadeau
   * o lista trunchiata pe care apelantul o raporta ca succes. Exact tiparul „taiere
   * tacuta care se citeste ca acoperire completa".
   */
  let incomplet = false;
  for (let de = 0; de < PLAFON; de += PAS) {
    let q = supabase.from("aboutyou_listings").select("product_id")
      .eq("business_id", businessId).not("product_id", "is", null);
    /*
     * ⚠ RELUAREA E EXACTA, nu aproximativa: ordinea e `product_id` crescator, deci „mai mare decat
     * ultimul dus la capat" nu poate nici sari, nici repeta. Un `offset` ar fi alunecat la fiecare
     * listare noua sau stearsa intre treceri.
     */
    if (dupa) q = q.gt("product_id", dupa);
    if (statusFilter) q = q.eq("status", statusFilter);
    // Publicarea are nevoie de un product master pe About You, iar acela exista
    // doar dupa ce produsul a plecat efectiv. Aceeasi proba o foloseste si
    // `stergeListare`: `last_synced_at` se scrie o singura data si nu se retrage.
    if (doarTrimise) q = q.not("last_synced_at", "is", null);
    const { data, error } = await q.order("product_id", { ascending: true }).range(de, de + PAS - 1);
    if (error) {
      logError({ action: "aboutyou.enqueueForListings", message: error.message, details: { businessId, op, de }, businessId });
      incomplet = true;
      break;
    }
    const lot = data ?? [];
    brute.push(...(lot.map((l) => l.product_id).filter(Boolean) as string[]));
    if (lot.length < PAS) break;            // ultima pagina, lista e completa
    if (de + PAS >= PLAFON) incomplet = true; // plafon atins cu o pagina PLINA
  }
  const ids = [...new Set(brute)];
  /*
   * ⚠ ULTIMUL DUS LA CAPAT, nu ultimul CITIT: daca scrierea se opreste la mijloc, reluarea
   * trebuie sa porneasca de la ce a intrat cu adevarat in coada. Se tine minte pe masura ce se
   * scrie, nu la sfarsit.
   */
  if (ids.length === 0) return { n: 0, incomplet, ultimulId: dupa ?? null };
  const admin = createAdminClient();
  const rows = ids.map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op }));
  for (let i = 0; i < rows.length; i += 1000) {
    const bucata = rows.slice(i, i + 1000);
    const { error } = await admin.from("aboutyou_sync_queue")
      .upsert(bucata as never, { onConflict: "business_id,offer_id,op" });
    if (error) {
      logError({ action: "aboutyou.enqueueForListings", message: error.message, details: { businessId, op }, businessId });
      /* Ce s-a scris pana aici e bun; reluarea porneste de dupa ultimul lot dus la capat. */
      return { n: i, incomplet: true, ultimulId: i > 0 ? ids[i - 1] : (dupa ?? null) };
    }
  }
  return { n: rows.length, incomplet, ultimulId: ids[ids.length - 1] };
}

/*
 * ═══ ⚠ „SINCRONIZEAZA TOT" SI „PUBLICA TOATE" AVEAU UN PLAFON TERMINAL (27.08.2026, noaptea) ═══
 *
 * Amandoua se sprijineau pe `enqueueForListings`, care se opreste la 20.000 de produse si intoarce
 * `incomplet`. Ecranul spunea „am pus N la coada", si atat: la 30.000 de produse, ultimele 10.000
 * nu intrau NICIODATA. Iar o noua apasare pornea de la inceput, deci exact ele n-ar fi plecat
 * vreodata — infometare, nu intarziere.
 *
 * ⚠ ACUM PLAFONUL E DOAR AL UNEI TRECERI. Lucrarea se deschide INAINTE de prima transa si tine
 * minte unde a ajuns; cronul o continua pana la capat, cu acelasi cursor exact. „Toate" inseamna
 * toate, chiar daca ia mai multe minute.
 */

// Re-send every enriched listing to About You (create/update).
export async function syncAllAboutYou(businessId: string): Promise<{ queued: number; incomplet: boolean } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const lucrare = await deschideLucrarea(businessId, "upsert");
  /* ⚠ Fara lucrare, nimic n-ar relua ce nu incape acum: mai bine o eroare limpede decat „Salvat". */
  if (!lucrare) return { error: "Nu am putut porni sincronizarea. Încearcă din nou." };
  const r = await enqueueForListings(g.supabase, businessId, "upsert", undefined, undefined, lucrare.dupa);
  await mutaLucrarea(lucrare, r);
  revalidatePath(FEATURE_PATH);
  return { queued: r.n, incomplet: r.incomplet };
}

// Publish every listing that already exists on About You as a draft.
export async function publishAllAboutYou(businessId: string): Promise<{ queued: number; incomplet: boolean } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const lucrare = await deschideLucrarea(businessId, "publish", "draft", true);
  if (!lucrare) return { error: "Nu am putut porni publicarea. Încearcă din nou." };
  const r = await enqueueForListings(g.supabase, businessId, "publish", "draft", true, lucrare.dupa);
  await mutaLucrarea(lucrare, r);
  revalidatePath(FEATURE_PATH);
  return { queued: r.n, incomplet: r.incomplet };
}
