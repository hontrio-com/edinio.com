// Thin authenticated REST wrappers over the Google Analytics APIs:
//  - Admin API (analyticsadmin.googleapis.com)  — accounts, properties, streams
//  - Data API  (analyticsdata.googleapis.com)   — reports (stats)
// Versions are centralized so they're easy to bump when v1beta graduates.

const ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";

export type ApiResult<T = Record<string, unknown>> = { data: T } | { error: string; status: number };

async function call<T = Record<string, unknown>>(
  accessToken: string,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = (json?.error?.message as string) ?? `HTTP ${res.status}`;
      return { error: msg, status: res.status };
    }
    return { data: json as T };
  } catch {
    return { error: "Eroare de retea catre Google Analytics.", status: 0 };
  }
}

// ── Admin API ──────────────────────────────────────────────────────────────────

export interface GaPropertySummary {
  property?: string;      // "properties/123456789"
  displayName?: string;
  propertyType?: string;
}
export interface GaAccountSummary {
  account?: string;       // "accounts/12345"
  displayName?: string;
  propertySummaries?: GaPropertySummary[];
}

/** All GA accounts + GA4 properties the authenticated user can access. */
export async function listAccountSummaries(accessToken: string): Promise<ApiResult<{ accountSummaries: GaAccountSummary[] }>> {
  const all: GaAccountSummary[] = [];
  let pageToken = "";
  for (let i = 0; i < 5; i++) {
    const qs = new URLSearchParams({ pageSize: "200" });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await call<{ accountSummaries?: GaAccountSummary[]; nextPageToken?: string }>(
      accessToken, "GET", `${ADMIN_BASE}/accountSummaries?${qs.toString()}`,
    );
    if ("error" in res) return res;
    all.push(...(res.data.accountSummaries ?? []));
    pageToken = res.data.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return { data: { accountSummaries: all } };
}

export interface GaDataStream {
  name?: string;          // "properties/x/dataStreams/y"
  type?: string;          // "WEB_DATA_STREAM" | "ANDROID_APP_DATA_STREAM" | "IOS_APP_DATA_STREAM"
  displayName?: string;
  webStreamData?: { measurementId?: string; defaultUri?: string };
}

export function listDataStreams(accessToken: string, propertyId: string) {
  return call<{ dataStreams?: GaDataStream[] }>(
    accessToken, "GET", `${ADMIN_BASE}/properties/${propertyId}/dataStreams?pageSize=200`,
  );
}

/**
 * Fluxul web al MAGAZINULUI dintr-o proprietate cu mai multe fluxuri.
 *
 * ⚠ Se potrivea doar pe domeniul propriu. Dar 58 din 71 de magazine stau pe `www.edinio.com/<slug>`, deci
 * pentru ele se lua orbeste PRIMUL flux web, care poate fi al altui site al comerciantului: masuratorile
 * magazinului plecau atunci in fluxul gresit. Acum se cauta intai domeniul propriu, apoi adresa
 * `edinio.com/<slug>`, si abia apoi primul flux (cele mai multe proprietati au unul singur).
 */
export function fluxulMagazinului(
  fluxuri: GaDataStream[],
  magazin: { customDomain?: string | null; slug?: string | null },
): GaDataStream | undefined {
  const web = fluxuri.filter((s) => s.type === "WEB_DATA_STREAM" && s.webStreamData?.measurementId);
  const adresa = (s: GaDataStream) => (s.webStreamData?.defaultUri ?? "").toLowerCase();
  const domeniu = magazin.customDomain?.trim().toLowerCase();
  const slug = magazin.slug?.trim().toLowerCase();
  return (
    (domeniu ? web.find((s) => adresa(s).includes(domeniu)) : undefined)
    ?? (slug ? web.find((s) => new RegExp(`edinio\\.com/${slug.replace(/[^a-z0-9-]/g, "")}(?:[/?#]|$)`).test(adresa(s))) : undefined)
    ?? web[0]
  );
}

export interface GaMpSecret { name?: string; displayName?: string; secretValue?: string }

/**
 * Secretele Measurement Protocol ale unui flux (`properties/x/dataStreams/y`).
 *
 * ⚠ Merge cu `analytics.readonly` (documentatia `measurementProtocolSecrets.list`: „Requires one of
 * analytics.readonly, analytics.edit") si intoarce `secretValue`. Deci un secret lipit de comerciant se
 * poate VERIFICA, fara niciun drept in plus. Conteaza fiindca Measurement Protocol raspunde 2xx si la un
 * `api_secret` gresit: evenimentele se arunca, iar nimic nu spune asta.
 */
export async function listMeasurementProtocolSecrets(
  accessToken: string, streamName: string,
): Promise<ApiResult<{ secrete: GaMpSecret[] }>> {
  if (!/^properties\/\d+\/dataStreams\/\d+$/.test(streamName)) {
    return { error: "Flux Google Analytics necunoscut.", status: 0 };
  }
  const toate: GaMpSecret[] = [];
  let pageToken = "";
  for (let i = 0; i < 5; i++) {
    const qs = new URLSearchParams({ pageSize: "200" });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await call<{ measurementProtocolSecrets?: GaMpSecret[]; nextPageToken?: string }>(
      accessToken, "GET", `${ADMIN_BASE}/${streamName}/measurementProtocolSecrets?${qs.toString()}`,
    );
    if ("error" in res) return res;
    toate.push(...(res.data.measurementProtocolSecrets ?? []));
    pageToken = res.data.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return { data: { secrete: toate } };
}

// ── Data API (reports) ─────────────────────────────────────────────────────────

export interface GaDateRange { startDate: string; endDate: string }
/**
 * Filtru pe o dimensiune. Doar formele de care avem nevoie, nu toata gramatica
 * Data API — un tip care descrie tot ar fi tot atat de nefolositor ca `unknown`.
 */
export type GaDimensionFilter =
  | { filter: { fieldName: string; stringFilter: { value: string; matchType?: "EXACT" | "BEGINS_WITH" | "CONTAINS" } } }
  | { filter: { fieldName: string; inListFilter: { values: string[] } } }
  | { andGroup: { expressions: GaDimensionFilter[] } }
  | { orGroup: { expressions: GaDimensionFilter[] } }
  | { notExpression: GaDimensionFilter };

export interface GaReportRequest {
  dateRanges: GaDateRange[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  dimensionFilter?: GaDimensionFilter;
  orderBys?: ({ dimension: { dimensionName: string }; desc?: boolean } | { metric: { metricName: string }; desc?: boolean })[];
  limit?: number;
}
export interface GaReportRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}
export interface GaReport {
  dimensionHeaders?: { name?: string }[];
  metricHeaders?: { name?: string }[];
  rows?: GaReportRow[];
  /** Doar cand cererea are `metricAggregations`. */
  totals?: GaReportRow[];
  rowCount?: number;
}

export function runReport(accessToken: string, propertyId: string, request: GaReportRequest) {
  return call<GaReport>(accessToken, "POST", `${DATA_BASE}/properties/${propertyId}:runReport`, request);
}

/** Up to 5 report requests per batch (Data API limit). */
export function batchRunReports(accessToken: string, propertyId: string, requests: GaReportRequest[]) {
  return call<{ reports?: GaReport[] }>(
    accessToken, "POST", `${DATA_BASE}/properties/${propertyId}:batchRunReports`, { requests },
  );
}

/**
 * Totalul utilizatorilor activi dintr-un raport de timp real cerut cu `metricAggregations: ["TOTAL"]`.
 *
 * ⚠ Nu suma randurilor: cererea aduce primele N tari, deci suma numara mai putin cand vin din mai multe.
 * Suma ramane doar ca rezerva, daca Google n-a intors agregarea.
 */
export function totalTimpReal(raport: GaReport, tari: { users: number }[]): number {
  const brut = raport.totals?.[0]?.metricValues?.[0]?.value;
  const n = Number(brut);
  return brut !== undefined && Number.isFinite(n) ? n : tari.reduce((s, c) => s + c.users, 0);
}

export function runRealtimeReport(
  accessToken: string, propertyId: string,
  request: { dimensions?: { name: string }[]; metrics: { name: string }[]; limit?: number; metricAggregations?: "TOTAL"[] },
) {
  return call<GaReport>(accessToken, "POST", `${DATA_BASE}/properties/${propertyId}:runRealtimeReport`, request);
}
