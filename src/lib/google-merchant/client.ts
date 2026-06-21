// Thin authenticated REST wrapper over the Google Merchant API
// (merchantapi.googleapis.com). Versions are centralized so they're easy to bump.

const BASE = "https://merchantapi.googleapis.com";
// Merchant API v1 (the v1beta sub-APIs were discontinued 2026-02-28).
// Migration guide: https://developers.google.com/merchant/api/guides/compatibility/migrate-v1beta-v1
const V = {
  accounts: "accounts/v1",
  datasources: "datasources/v1",
  products: "products/v1",
  notifications: "notifications/v1",
};

export type ApiResult<T = Record<string, unknown>> = { data: T } | { error: string; status: number };

async function call<T = Record<string, unknown>>(
  accessToken: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
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
    return { error: "Eroare de retea catre Google Merchant.", status: 0 };
  }
}

// ── Accounts ───────────────────────────────────────────────────────────────────
// Accounts accessible to the authenticated user.
export function listAccounts(accessToken: string) {
  return call<{ accounts?: { name: string; accountId?: string; accountName?: string }[] }>(
    accessToken, "GET", `/${V.accounts}/accounts`,
  );
}

// v1 prerequisite: register the calling GCP project against the merchant account
// before other v1 write operations. Idempotent in practice — re-registering an
// already-registered project returns an ALREADY_EXISTS-style error the caller
// should treat as success. `developerEmail` gets the API_DEVELOPER role.
export function registerGcp(accessToken: string, accountId: string, developerEmail?: string) {
  return call<{ name?: string }>(
    accessToken, "POST",
    `/${V.accounts}/accounts/${accountId}/developerRegistration:registerGcp`,
    developerEmail ? { developerEmail } : {},
  );
}

// ── Data sources ───────────────────────────────────────────────────────────────
export function listDataSources(accessToken: string, accountId: string) {
  return call<{ dataSources?: { name: string; displayName?: string; primaryProductDataSource?: unknown }[] }>(
    accessToken, "GET", `/${V.datasources}/accounts/${accountId}/dataSources`,
  );
}

export function createApiDataSource(
  accessToken: string, accountId: string, displayName: string, feedLabel: string, contentLanguage: string,
) {
  return call<{ name: string }>(
    accessToken, "POST", `/${V.datasources}/accounts/${accountId}/dataSources`,
    { displayName, primaryProductDataSource: { contentLanguage, feedLabel } },
  );
}

// ── Products ───────────────────────────────────────────────────────────────────
export function productName(accountId: string, lang: string, feedLabel: string, offerId: string): string {
  return `accounts/${accountId}/products/online~${lang}~${feedLabel}~${offerId}`;
}

export function insertProductInput(
  accessToken: string, accountId: string, dataSourceName: string, productInput: Record<string, unknown>,
) {
  return call(
    accessToken, "POST",
    `/${V.products}/accounts/${accountId}/productInputs:insert?dataSource=${encodeURIComponent(dataSourceName)}`,
    productInput,
  );
}

export function deleteProductInput(
  accessToken: string, accountId: string, lang: string, feedLabel: string, offerId: string, dataSourceName: string,
) {
  const name = `accounts/${accountId}/productInputs/online~${lang}~${feedLabel}~${offerId}`;
  return call(accessToken, "DELETE", `/${V.products}/${name}?dataSource=${encodeURIComponent(dataSourceName)}`);
}

export interface MerchantProductStatus {
  productStatus?: {
    destinationStatuses?: { reportingContext?: string; status?: string }[];
    itemLevelIssues?: { code?: string; severity?: string; description?: string; detail?: string; resolution?: string }[];
  };
}

export function getProduct(accessToken: string, accountId: string, lang: string, feedLabel: string, offerId: string) {
  const name = productName(accountId, lang, feedLabel, offerId);
  return call<MerchantProductStatus & Record<string, unknown>>(accessToken, "GET", `/${V.products}/${name}`);
}

// Normalize a Merchant API product status into our simplified shape.
export function mapProductStatus(data: Record<string, unknown>): { status: string; issues: unknown[]; destinations: unknown[] } {
  const ps = (data?.productStatus ?? {}) as {
    destinationStatuses?: { reportingContext?: string; status?: string }[];
    itemLevelIssues?: { code?: string; severity?: string; description?: string }[];
  };
  const issues = ps.itemLevelIssues ?? [];
  const destinations = ps.destinationStatuses ?? [];
  const disapproved = issues.some((i) => String(i.severity ?? "").toLowerCase() === "error" || String(i.severity ?? "").toLowerCase() === "disapproval");
  const approved = destinations.some((d) => String(d.status ?? "").toLowerCase() === "approved");
  return { status: disapproved ? "disapproved" : approved ? "active" : "pending", issues, destinations };
}

// ── Notifications (webhooks) ─────────────────────────────────────────────────────
export function createNotificationSubscription(accessToken: string, accountId: string, callbackUri: string) {
  return call<{ name: string }>(
    accessToken, "POST", `/${V.notifications}/accounts/${accountId}/notificationsubscriptions`,
    { registeredEvent: "PRODUCT_STATUS_CHANGE", callBackUri: callbackUri, allManagedAccounts: false },
  );
}

export function deleteNotificationSubscription(accessToken: string, subscriptionName: string) {
  return call(accessToken, "DELETE", `/${V.notifications}/${subscriptionName}`);
}
