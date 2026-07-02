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

// ── Data API (reports) ─────────────────────────────────────────────────────────

export interface GaDateRange { startDate: string; endDate: string }
export interface GaReportRequest {
  dateRanges: GaDateRange[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
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

export function runRealtimeReport(
  accessToken: string, propertyId: string,
  request: { dimensions?: { name: string }[]; metrics: { name: string }[]; limit?: number },
) {
  return call<GaReport>(accessToken, "POST", `${DATA_BASE}/properties/${propertyId}:runRealtimeReport`, request);
}
