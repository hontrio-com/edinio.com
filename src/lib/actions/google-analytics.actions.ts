"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAuthUrl, signState, googleAnalyticsConfigured, obtineTokenul, type EroareToken } from "@/lib/google-analytics/oauth";
import {
  listAccountSummaries, listDataStreams, batchRunReports, runRealtimeReport, listMeasurementProtocolSecrets, totalTimpReal,
  fluxulMagazinului,
  type GaReport, type GaReportRequest,
} from "@/lib/google-analytics/client";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";
import { logError } from "@/lib/error-logger";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const FEATURE_PATH = "/dashboard/features/google-analytics";
const EXPIRED_MSG = "Sesiunea Google a expirat. Reconecteaza-te.";

/*
 * ⚠ Un mesaj pe MOTIV. Inainte, orice cadere a tokenului spunea „Sesiunea a expirat. Reconecteaza-te”,
 * inclusiv cand Google era cazut cateva secunde: omul refacea tot dansul OAuth degeaba. Vezi `obtineTokenul`.
 */
const MESAJ_TOKEN: Record<EroareToken, string> = {
  revocat: EXPIRED_MSG,
  "fara-drept": "Contul Google conectat nu ne-a dat dreptul de a citi Google Analytics. Reconecteaza-te si lasa bifat accesul la Analytics.",
  indisponibil: "Google nu a raspuns acum. Incearca din nou peste cateva minute.",
};

interface OwnBiz { id: string; slug: string; custom_domain: string | null }

async function ownedBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<OwnBiz | null> {
  const { data } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain")
    .eq("id", businessId).eq("user_id", userId).single();
  return (data as OwnBiz) ?? null;
}

/*
 * Citirea se face cu SERVICE ROLE, nu cu clientul utilizatorului.
 *
 * `privat.decripteaza_config` iese pe prima linie pentru `anon`/`authenticated`,
 * deci pe clientul utilizatorului (inclusiv aici, in „use server") vederea
 * intoarce `refresh_token` ca sirul `enc.v1.…`. Nu da eroare si nu da null: da
 * un sir plauzibil, care pleaca asa la Google, primeste `invalid_grant`, si
 * comerciantul vede „Sesiunea Google a expirat. Reconecteaza-te." la fiecare
 * intrare in pagina — iar reconectarea nu repara nimic, fiindca defectul e la
 * citire. Ruta frate `api/google-analytics/oauth/callback` face deja asa.
 *
 * Service role ocoleste RLS, deci proprietatea magazinului TREBUIE dovedita
 * separat. Toti cei noua apelanti cheama `ownedBusiness()` inainte.
 *
 * Parametrul cu clientul utilizatorului a fost SCOS dinadins: lasat pe loc, ar
 * fi invitat pe urmatorul sa creada ca citirea se face cu el.
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
async function loadConfig(businessId: string): Promise<GoogleAnalyticsConfig> {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("google_analytics_config").eq("business_id", businessId).maybeSingle();
  if (error) {
    throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  }
  return ((data?.google_analytics_config as GoogleAnalyticsConfig) ?? {}) || {};
}

async function saveConfig(supabase: ServerClient, businessId: string, config: GoogleAnalyticsConfig): Promise<boolean> {
  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();
  if (existing) {
    const { error } = await supabase.from("store_settings")
      .update({ google_analytics_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    return !error;
  }
  const { error } = await supabase.from("store_settings")
    .insert({ business_id: businessId, google_analytics_config: config as never });
  return !error;
}

// ── Status (for the integration page) ───────────────────────────────────────────

export interface GaStatus {
  configured: boolean;          // platform has Google OAuth credentials
  connected: boolean;           // OAuth done + property picked, OR manual Measurement ID saved
  manual: boolean;              // connected without OAuth (tracking only, no in-app reports)
  needsProperty: boolean;       // OAuth done but no property picked yet
  email?: string;
  propertyId?: string;
  propertyName?: string;
  accountName?: string;
  measurementId?: string;       // undefined = property has no web data stream
  trackingEnabled: boolean;
  hasApiSecret: boolean;        // server-side Measurement Protocol configured
  apiSecretVerificat: boolean;  // gasit printre secretele fluxului legat (doar la OAuth)
}

export async function getGaStatus(businessId: string): Promise<GaStatus | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  return {
    configured: googleAnalyticsConfigured(),
    connected: !!config.connected && (!!config.property_id || !!config.manual),
    manual: !!config.manual,
    needsProperty: !!config.refresh_token && !config.property_id,
    email: config.connected_email,
    propertyId: config.property_id,
    propertyName: config.property_name,
    accountName: config.account_name,
    measurementId: config.measurement_id,
    trackingEnabled: config.tracking_enabled !== false,
    hasApiSecret: !!config.api_secret,
    apiSecretVerificat: !!config.api_secret && !!config.api_secret_verificat_la,
  };
}

// ── OAuth start ──────────────────────────────────────────────────────────────────

export async function startGoogleAnalyticsOAuth(businessId: string): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };
  if (!googleAnalyticsConfigured()) return { error: "Integrarea Google nu este configurata pe server." };
  return { url: buildAuthUrl(signState(businessId)) };
}

// ── Manual connect (no OAuth) ────────────────────────────────────────────────────
// Storefront tracking only needs the Measurement ID, so merchants can activate
// measurement before Google approves our OAuth app. In-app reports stay off in
// this mode (they need the Data API, i.e. OAuth); connecting with Google later
// upgrades the config and clears `manual`.

export async function connectGaManual(businessId: string, measurementId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const id = (measurementId ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (id.startsWith("UA-")) return { error: "Acesta este un ID Universal Analytics (UA-), care nu mai functioneaza. Creeaza o proprietate GA4 si foloseste ID-ul de masurare care incepe cu G-." };
  if (id.startsWith("GTM-")) return { error: "Acesta este un container Google Tag Manager (GTM-). Introdu ID-ul de masurare GA4, care incepe cu G-." };
  if (id.startsWith("AW-")) return { error: "Acesta este un ID Google Ads (AW-). Introdu ID-ul de masurare GA4, care incepe cu G-." };
  if (!/^G-[A-Z0-9]{4,16}$/.test(id)) return { error: "ID de masurare invalid. Trebuie sa inceapa cu G- (ex: G-ABC12DEF34)." };

  // Fresh config on purpose (no spread): manual connect means "use ONLY this
  // ID" — leftover OAuth state (refresh_token without property) would otherwise
  // strand the UI on the property picker.
  const config = await loadConfig(businessId);
  const ok = await saveConfig(supabase, businessId, {
    connected: true,
    manual: true,
    measurement_id: id,
    tracking_enabled: config.tracking_enabled ?? true,
    connected_at: config.connected_at ?? new Date().toISOString(),
  });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Property discovery + selection ───────────────────────────────────────────────

export interface GaPropertyGroup {
  account: string;
  properties: { id: string; name: string }[];
}

export async function listGaProperties(businessId: string): Promise<{ groups: GaPropertyGroup[] } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  if (!config.refresh_token) return { error: "Conecteaza-te mai intai cu Google." };
  const tok = await obtineTokenul(config.refresh_token);
  if ("eroare" in tok) return { error: MESAJ_TOKEN[tok.eroare] };
  const token = tok.token;

  const res = await listAccountSummaries(token);
  if ("error" in res) return { error: res.error };

  const groups: GaPropertyGroup[] = (res.data.accountSummaries ?? [])
    .map((acc) => ({
      account: acc.displayName || acc.account || "Cont Google Analytics",
      properties: (acc.propertySummaries ?? [])
        .map((p) => ({ id: (p.property ?? "").split("/").pop() ?? "", name: p.displayName ?? "" }))
        .filter((p) => p.id),
    }))
    .filter((g) => g.properties.length > 0);
  return { groups };
}

/**
 * Pick a GA4 property: finds its web data stream and stores the Measurement ID
 * so the storefront tag activates automatically. Also used to re-scan streams
 * ("Cauta din nou") when the property had no web stream at connect time.
 */
export async function selectGaProperty(
  businessId: string, propertyId: string, propertyName?: string, accountName?: string,
): Promise<{ success: true; measurementId: string | null } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const biz = await ownedBusiness(supabase, businessId, user.id);
  if (!biz) return { error: "Magazin negasit" };

  const cleanId = propertyId.replace(/\D/g, "");
  if (!cleanId) return { error: "ID de proprietate invalid." };

  const config = await loadConfig(businessId);
  if (!config.refresh_token) return { error: "Conecteaza-te mai intai cu Google." };
  const tok = await obtineTokenul(config.refresh_token);
  if ("eroare" in tok) return { error: MESAJ_TOKEN[tok.eroare] };
  const token = tok.token;

  const streamsRes = await listDataStreams(token, cleanId);
  if ("error" in streamsRes) {
    logError({ action: "ga.listDataStreams", message: streamsRes.error, details: { businessId, propertyId: cleanId }, userId: user.id });
    return { error: `Nu am putut citi proprietatea: ${streamsRes.error}` };
  }

  // Fluxul magazinului: domeniul propriu, apoi `edinio.com/<slug>`, apoi primul. Vezi `fluxulMagazinului`.
  const stream = fluxulMagazinului(streamsRes.data.dataStreams ?? [], { customDomain: biz.custom_domain, slug: biz.slug });

  const ok = await saveConfig(supabase, businessId, {
    ...config,
    connected: true,
    manual: undefined, // OAuth path replaces a previous manual (tracking-only) connect
    property_id: cleanId,
    property_name: propertyName ?? config.property_name,
    account_name: accountName ?? config.account_name,
    measurement_id: stream?.webStreamData?.measurementId,
    stream_name: stream?.name,
    /* ⚠ Alt flux, alt set de secrete: verificarea facuta pe fluxul vechi nu mai spune nimic. */
    api_secret_verificat_la: stream?.name === config.stream_name ? config.api_secret_verificat_la : undefined,
    tracking_enabled: config.tracking_enabled ?? true,
    connected_at: config.connected_at ?? new Date().toISOString(),
  });
  if (!ok) return { error: "Eroare la salvare." };

  clearDashboardCache(cleanId);
  revalidatePath(FEATURE_PATH);
  return { success: true, measurementId: stream?.webStreamData?.measurementId ?? null };
}

export async function setGaTracking(businessId: string, enabled: boolean): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  if (!config.connected) return { error: "Conecteaza mai intai Google Analytics." };
  const ok = await saveConfig(supabase, businessId, { ...config, tracking_enabled: enabled });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/**
 * Secretul se cauta printre secretele CHIAR ale fluxului legat. `true` = gasit, `false` = sigur NU e al
 * fluxului, `null` = nu se poate spune (conectare manuala, Google indisponibil).
 */
async function secretulEAlFluxului(config: GoogleAnalyticsConfig, secret: string): Promise<boolean | null> {
  if (!config.refresh_token || !config.stream_name) return null;
  const tok = await obtineTokenul(config.refresh_token);
  if ("eroare" in tok) return null;
  const res = await listMeasurementProtocolSecrets(tok.token, config.stream_name);
  if ("error" in res) return null;
  return res.data.secrete.some((x) => x.secretValue === secret);
}

/*
 * ═══ ⚠⚠ DE CE SE VERIFICA (17.09.2026) ═══
 *
 * Measurement Protocol raspunde 2xx si la un `api_secret` GRESIT: evenimentele se arunca la Google, iar la
 * noi nu ajunge nimic. Un secret copiat din alt flux, sau cu o litera lipsa, facea ca toate achizitiile si
 * rambursarile de pe server sa dispara in tacere, cu eticheta „Activ” in panou.
 */
export async function setGaApiSecret(
  businessId: string, apiSecret: string,
): Promise<{ success: true; verificat: boolean | null } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const secret = (apiSecret ?? "").trim();
  const config = await loadConfig(businessId);
  if (!config.connected) return { error: "Conecteaza mai intai Google Analytics." };

  let verificat: boolean | null = null;
  if (secret) {
    verificat = await secretulEAlFluxului(config, secret);
    if (verificat === false) {
      return {
        error: `Secretul nu apartine fluxului legat${config.measurement_id ? ` (${config.measurement_id})` : ""}. `
          + "Copiaza-l din Administrare, Fluxuri de date, fluxul cu acest ID, Measurement Protocol API secrets.",
      };
    }
  }
  const ok = await saveConfig(supabase, businessId, {
    ...config,
    api_secret: secret || undefined,
    api_secret_verificat_la: secret && verificat ? new Date().toISOString() : undefined,
  });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true, verificat };
}

/** Verifica secretul DEJA salvat, fara sa-l ceara din nou (pentru cele salvate inainte de verificare). */
export async function verificaGaApiSecret(
  businessId: string,
): Promise<{ success: true; verificat: boolean | null } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  if (!config.api_secret) return { error: "Nu exista niciun secret salvat." };
  const verificat = await secretulEAlFluxului(config, config.api_secret);
  if (verificat === null) return { success: true, verificat };
  const ok = await saveConfig(supabase, businessId, {
    ...config,
    api_secret_verificat_la: verificat ? new Date().toISOString() : undefined,
  });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true, verificat };
}

export async function disconnectGoogleAnalytics(businessId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  if (config.property_id) clearDashboardCache(config.property_id);
  await saveConfig(supabase, businessId, {});
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Reports (the stats dashboard) ────────────────────────────────────────────────
// Responses are cached in-process per property+period to protect the Data API
// quota (25k tokens/day per property, shared project-level quota). GA data is
// processed with hours of delay anyway, so a short TTL loses nothing.

const DASHBOARD_TTL_MS = 10 * 60_000;
const dashboardCache = new Map<string, { data: GaDashboardData; exp: number }>();
const realtimeCache = new Map<string, { data: GaRealtimeData; exp: number }>();

/**
 * ⚠ 403 NU INSEAMNA MEREU „RECONECTEAZA-TE”. Poate fi un drept lipsa pe token (atunci da), dar si un cont
 * care nu mai are acces la proprietate, unde reconectarea cu acelasi cont nu repara nimic. Se spune
 * ce a spus Google.
 */
function mesajEroareGoogle(e: { error: string; status: number }): string {
  if (e.status === 401) return EXPIRED_MSG;
  if (e.status === 403 && /scope/i.test(e.error)) return MESAJ_TOKEN["fara-drept"];
  if (e.status === 403) return `Contul Google conectat nu are acces la aceasta proprietate Google Analytics (${e.error}).`;
  return `Google Analytics: ${e.error}`;
}

function clearDashboardCache(propertyId: string) {
  for (const key of dashboardCache.keys()) if (key.startsWith(`${propertyId}:`)) dashboardCache.delete(key);
  realtimeCache.delete(propertyId);
}

export interface GaTotals {
  activeUsers: number;
  sessions: number;
  pageViews: number;
  engagementRate: number;      // 0..1
  avgSessionDuration: number;  // seconds
  keyEvents: number;
  transactions: number;
  revenue: number;
}

export interface GaDashboardData {
  days: number;
  totals: GaTotals;
  prevTotals: GaTotals;
  timeseries: { date: string; label: string; users: number; sessions: number }[];
  channels: { name: string; sessions: number }[];
  sources: { name: string; sessions: number }[];
  pages: { path: string; views: number }[];
  countries: { name: string; users: number }[];
  devices: { name: string; sessions: number }[];
  products: { name: string; quantity: number; revenue: number }[];
  fetchedAt: string;
}

const TOTALS_METRICS = [
  "activeUsers", "sessions", "screenPageViews", "engagementRate",
  "averageSessionDuration", "keyEvents", "transactions", "purchaseRevenue",
];

function metricNum(report: GaReport | undefined, rowIdx: number, metricIdx: number): number {
  const v = report?.rows?.[rowIdx]?.metricValues?.[metricIdx]?.value;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseTotals(report: GaReport | undefined): GaTotals {
  return {
    activeUsers: metricNum(report, 0, 0),
    sessions: metricNum(report, 0, 1),
    pageViews: metricNum(report, 0, 2),
    engagementRate: metricNum(report, 0, 3),
    avgSessionDuration: metricNum(report, 0, 4),
    keyEvents: metricNum(report, 0, 5),
    transactions: metricNum(report, 0, 6),
    revenue: metricNum(report, 0, 7),
  };
}

function dimRows(report: GaReport | undefined): { dim: string; metrics: number[] }[] {
  return (report?.rows ?? []).map((r) => ({
    dim: r.dimensionValues?.[0]?.value ?? "",
    metrics: (r.metricValues ?? []).map((m) => {
      const n = Number(m.value);
      return Number.isFinite(n) ? n : 0;
    }),
  }));
}

const MONTHS_RO = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** yyyymmdd keys for the last `days` days in the store's timezone (RO). */
function dateKeys(days: number): { key: string; label: string }[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" });
  const out: { key: string; label: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const iso = fmt.format(d); // yyyy-mm-dd
    const [y, m, day] = iso.split("-");
    out.push({ key: `${y}${m}${day}`, label: `${Number(day)} ${MONTHS_RO[Number(m) - 1]}` });
  }
  return out;
}

export async function getGaDashboard(
  businessId: string, days: 7 | 28 | 90, force = false,
): Promise<{ data: GaDashboardData } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  if (!config.connected || !config.property_id || !config.refresh_token) {
    return { error: "Conecteaza mai intai Google Analytics." };
  }
  const propertyId = config.property_id;

  const cacheKey = `${propertyId}:${days}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached && cached.exp > Date.now() && !force) return { data: cached.data };

  const tok = await obtineTokenul(config.refresh_token);
  if ("eroare" in tok) return { error: MESAJ_TOKEN[tok.eroare] };
  const token = tok.token;

  const current = { startDate: `${days - 1}daysAgo`, endDate: "today" };
  const previous = { startDate: `${2 * days - 1}daysAgo`, endDate: `${days}daysAgo` };
  const m = (names: string[]) => names.map((name) => ({ name }));

  const batch1: GaReportRequest[] = [
    { dateRanges: [current], metrics: m(TOTALS_METRICS) },
    { dateRanges: [previous], metrics: m(TOTALS_METRICS) },
    {
      dateRanges: [current], dimensions: [{ name: "date" }], metrics: m(["activeUsers", "sessions"]),
      orderBys: [{ dimension: { dimensionName: "date" } }], limit: 120,
    },
    {
      dateRanges: [current], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: m(["sessions"]),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 8,
    },
    {
      dateRanges: [current], dimensions: [{ name: "pagePath" }], metrics: m(["screenPageViews"]),
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 10,
    },
  ];
  const batch2: GaReportRequest[] = [
    {
      dateRanges: [current], dimensions: [{ name: "sessionSource" }], metrics: m(["sessions"]),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 10,
    },
    {
      dateRanges: [current], dimensions: [{ name: "country" }], metrics: m(["activeUsers"]),
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 10,
    },
    {
      dateRanges: [current], dimensions: [{ name: "deviceCategory" }], metrics: m(["sessions"]),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 5,
    },
    {
      dateRanges: [current], dimensions: [{ name: "itemName" }], metrics: m(["itemsPurchased", "itemRevenue"]),
      orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }], limit: 10,
    },
  ];

  const [res1, res2] = await Promise.all([
    batchRunReports(token, propertyId, batch1),
    batchRunReports(token, propertyId, batch2),
  ]);
  if ("error" in res1 || "error" in res2) {
    const err = "error" in res1 ? res1 : (res2 as { error: string; status: number });
    logError({ action: "ga.dashboard", message: err.error, details: { businessId, propertyId, status: err.status }, userId: user.id });
    return { error: mesajEroareGoogle(err) };
  }

  const r1 = res1.data.reports ?? [];
  const r2 = res2.data.reports ?? [];

  // Fill missing days so the chart has a continuous axis.
  const byDate = new Map(dimRows(r1[2]).map((r) => [r.dim, r.metrics]));
  const timeseries = dateKeys(days).map(({ key, label }) => ({
    date: key,
    label,
    users: byDate.get(key)?.[0] ?? 0,
    sessions: byDate.get(key)?.[1] ?? 0,
  }));

  const data: GaDashboardData = {
    days,
    totals: parseTotals(r1[0]),
    prevTotals: parseTotals(r1[1]),
    timeseries,
    channels: dimRows(r1[3]).map((r) => ({ name: r.dim, sessions: r.metrics[0] ?? 0 })),
    pages: dimRows(r1[4]).map((r) => ({ path: r.dim, views: r.metrics[0] ?? 0 })),
    sources: dimRows(r2[0]).map((r) => ({ name: r.dim, sessions: r.metrics[0] ?? 0 })),
    countries: dimRows(r2[1]).map((r) => ({ name: r.dim, users: r.metrics[0] ?? 0 })),
    devices: dimRows(r2[2]).map((r) => ({ name: r.dim, sessions: r.metrics[0] ?? 0 })),
    products: dimRows(r2[3]).map((r) => ({ name: r.dim, quantity: r.metrics[0] ?? 0, revenue: r.metrics[1] ?? 0 })),
    fetchedAt: new Date().toISOString(),
  };

  dashboardCache.set(cacheKey, { data, exp: Date.now() + DASHBOARD_TTL_MS });
  return { data };
}

// ── Realtime ─────────────────────────────────────────────────────────────────────

export interface GaRealtimeData {
  total: number;
  countries: { name: string; users: number }[];
  fetchedAt: string;
}

export async function getGaRealtime(businessId: string): Promise<{ data: GaRealtimeData } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  if (!config.connected || !config.property_id || !config.refresh_token) {
    return { error: "Conecteaza mai intai Google Analytics." };
  }

  const cached = realtimeCache.get(config.property_id);
  if (cached && cached.exp > Date.now()) return { data: cached.data };

  const tok = await obtineTokenul(config.refresh_token);
  if ("eroare" in tok) return { error: MESAJ_TOKEN[tok.eroare] };
  const token = tok.token;

  const res = await runRealtimeReport(token, config.property_id, {
    dimensions: [{ name: "country" }],
    metrics: [{ name: "activeUsers" }],
    limit: 10,
    metricAggregations: ["TOTAL"],
  });
  if ("error" in res) {
    return { error: mesajEroareGoogle(res) };
  }

  const countries = dimRows(res.data).map((r) => ({ name: r.dim, users: r.metrics[0] ?? 0 }));
  const data: GaRealtimeData = {
    /*
     * ⚠ Totalul din AGREGAREA lui Google, nu suma randurilor: cererea aduce doar primele 10 tari, deci
     * suma lor numara mai putin cand vizitatorii vin din mai multe. Documentatia `runRealtimeReport`:
     * `metricAggregations` -> `totals[]`. Suma ramane doar ca rezerva.
     */
    total: totalTimpReal(res.data, countries),
    countries,
    fetchedAt: new Date().toISOString(),
  };
  realtimeCache.set(config.property_id, { data, exp: Date.now() + 30_000 });
  return { data };
}
