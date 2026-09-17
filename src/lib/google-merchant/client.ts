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

/**
 * ⚠ `reason` e `details[].metadata.REASON` din raspunsul de eroare. Ghidul „Handle error responses”:
 * „Use details.metadata.REASON for logic ... Don't parse the error message”, fiindca mesajul se poate
 * schimba fara anunt. Lipseste la sub-API-urile care inca raspund in formatul vechi.
 */
export type ApiResult<T = Record<string, unknown>> = { data: T } | { error: string; status: number; reason?: string };

/** REASON-ul unei erori Merchant API, daca raspunsul il are. */
export function motivulErorii(json: unknown): string | undefined {
  const detalii = (json as { error?: { details?: { metadata?: { REASON?: unknown } }[] } } | null)?.error?.details;
  if (!Array.isArray(detalii)) return undefined;
  for (const d of detalii) {
    const r = d?.metadata?.REASON;
    if (typeof r === "string" && r) return r;
  }
  return undefined;
}

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
    let json: Record<string, unknown> & { error?: { message?: string } } = {};
    /* ⚠ Un raspuns care nu e JSON (o pagina de eroare a unui proxy) nu are voie sa arunce: ar fi iesit
       drept „eroare de retea”, adica exact mesajul care ascunde ce s-a intamplat. */
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!res.ok) {
      const msg = (json?.error?.message as string) ?? `HTTP ${res.status}`;
      return { error: msg, status: res.status, reason: motivulErorii(json) };
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
// v1 dropped the channel segment from resource names (was `online~...` in v1beta).
export function productName(accountId: string, lang: string, feedLabel: string, offerId: string): string {
  return `accounts/${accountId}/products/${lang}~${feedLabel}~${offerId}`;
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
  const name = `accounts/${accountId}/productInputs/${lang}~${feedLabel}~${offerId}`;
  return call(accessToken, "DELETE", `/${V.products}/${name}?dataSource=${encodeURIComponent(dataSourceName)}`);
}

export interface MerchantItemLevelIssue {
  code?: string;
  severity?: string;         // NOT_IMPACTED | DEMOTED | DISAPPROVED
  resolution?: string;       // MERCHANT_ACTION | PENDING_PROCESSING
  attribute?: string;
  reportingContext?: string;
  description?: string;
  detail?: string;
  /**
   * ⚠ `documentation`, NU `documentationUri`. Proto-ul v1 (`ProductStatus.ItemLevelIssue`): `string
   * documentation = 8`. Panoul citea `documentationUri`, deci linkul „cum rezolv” n-a aparut niciodata,
   * desi toate cele 228 de probleme stocate il aveau. (La problemele de CONT campul chiar se numeste
   * `documentationUri`; de acolo venea confuzia.)
   */
  documentation?: string;
  applicableCountries?: string[];
}
export interface MerchantProductStatus {
  productStatus?: {
    destinationStatuses?: { reportingContext?: string; approvedCountries?: string[]; pendingCountries?: string[]; disapprovedCountries?: string[] }[];
    itemLevelIssues?: MerchantItemLevelIssue[];
  };
}

export function getProduct(accessToken: string, accountId: string, lang: string, feedLabel: string, offerId: string) {
  const name = productName(accountId, lang, feedLabel, offerId);
  return call<MerchantProductStatus & Record<string, unknown>>(accessToken, "GET", `/${V.products}/${name}`);
}

// Normalize a Merchant API product status into our simplified shape.
export function mapProductStatus(data: Record<string, unknown>): { status: string; issues: unknown[]; destinations: unknown[] } {
  const ps = (data?.productStatus ?? {}) as {
    destinationStatuses?: { approvedCountries?: string[]; pendingCountries?: string[]; disapprovedCountries?: string[] }[];
    itemLevelIssues?: { severity?: string }[];
  };
  const issues = ps.itemLevelIssues ?? [];
  const destinations = ps.destinationStatuses ?? [];
  // v1 item severities are NOT_IMPACTED | DEMOTED | DISAPPROVED; destinations carry
  // approved/pending/disapproved COUNTRY lists (there is no single status field).
  const disapproved =
    issues.some((i) => String(i.severity ?? "").toUpperCase() === "DISAPPROVED") ||
    destinations.some((d) => (d.disapprovedCountries?.length ?? 0) > 0);
  const approved = destinations.some((d) => (d.approvedCountries?.length ?? 0) > 0);
  return { status: disapproved ? "disapproved" : approved ? "active" : "pending", issues, destinations };
}

// ── Notifications (webhooks) ─────────────────────────────────────────────────────
export interface MerchantNotificationSubscription {
  name?: string;
  registeredEvent?: string;
  targetAccount?: string;
  allManagedAccounts?: boolean;
  callBackUri?: string;
}

/**
 * Corpul unei abonari la schimbarile de stare ale produselor unui cont.
 *
 * ═══ ⚠⚠ ABONAREA NU S-A CREAT NICIODATA, LA NICIUN MAGAZIN (masurat 17.09.2026: 0 din 7) ═══
 *
 * Trimiteam `allManagedAccounts: false`. In proto-ul v1, `interested_in` e un `oneof` intre
 * `all_managed_accounts` si `target_account`, deci corpul spunea „nu vreau conturile gestionate” si
 * NU spunea pentru ce cont vrea notificari. Ghidul oficial, pentru un cont obisnuit: „use your own
 * account ID for both variables", adica `targetAccount: accounts/{id}`. Iar eroarea se inghitea, deci
 * webhook-ul n-a primit niciodata nimic si starile veneau doar din cron, la 30 de minute.
 */
export function corpAbonare(accountId: string, callbackUri: string): MerchantNotificationSubscription {
  return { registeredEvent: "PRODUCT_STATUS_CHANGE", targetAccount: `accounts/${accountId}`, callBackUri: callbackUri };
}

export function createNotificationSubscription(accessToken: string, accountId: string, callbackUri: string) {
  return call<{ name: string }>(
    accessToken, "POST", `/${V.notifications}/accounts/${accountId}/notificationsubscriptions`,
    corpAbonare(accountId, callbackUri),
  );
}

/**
 * Abonarile existente ale contului.
 *
 * ⚠ Documentatia nu permite doua abonari „pentru sine” la acelasi eveniment („we will not allow multiple
 * self subscriptions"). O reconectare care ar crea orbeste una noua ar fi cazut, deci intai se cauta cea
 * existenta si se refoloseste.
 */
export function listNotificationSubscriptions(accessToken: string, accountId: string) {
  return call<{ notificationSubscriptions?: MerchantNotificationSubscription[] }>(
    accessToken, "GET", `/${V.notifications}/accounts/${accountId}/notificationsubscriptions`,
  );
}

export function updateNotificationSubscriptionUri(accessToken: string, subscriptionName: string, callbackUri: string) {
  return call<{ name: string }>(
    accessToken, "PATCH", `/${V.notifications}/${subscriptionName}?update_mask=callBackUri`,
    { callBackUri: callbackUri },
  );
}

export function deleteNotificationSubscription(accessToken: string, subscriptionName: string) {
  return call(accessToken, "DELETE", `/${V.notifications}/${subscriptionName}`);
}

// ── Account issues (account-level problems: shipping/tax not configured, policy) ──
export interface MerchantAccountIssue {
  title?: string;
  severity?: string;      // CRITICAL | ERROR | SUGGESTION
  detail?: string;
  documentationUri?: string;
}
// ── Programs (listari gratuite, Shopping ads) ───────────────────────────────────────
export interface MerchantProgram {
  name?: string;                 // accounts/{id}/programs/free-listings
  documentationUri?: string;
  state?: string;                // NOT_ELIGIBLE | ELIGIBLE | ENABLED
  activeRegionCodes?: string[];
  unmetRequirements?: { title?: string; documentationUri?: string; affectedRegionCodes?: string[] }[];
}

/**
 * Programele contului si ce le lipseste.
 *
 * ⚠ DE CE (17.09.2026): la 6 din 7 magazine, Google intorcea produsele cu ZERO destinatii, deci
 * panoul le arata „In asteptare” la nesfarsit. Un produs fara destinatie nu e in verificare: nu are
 * unde sa apara, fiindca programul nu e pornit sau are cerinte neindeplinite. Numai `programs` spune asta.
 */
export function listPrograms(accessToken: string, accountId: string) {
  return call<{ programs?: MerchantProgram[] }>(accessToken, "GET", `/${V.accounts}/accounts/${accountId}/programs`);
}

export function listAccountIssues(accessToken: string, accountId: string) {
  return call<{ accountIssues?: MerchantAccountIssue[] }>(
    accessToken, "GET", `/${V.accounts}/accounts/${accountId}/issues?languageCode=ro&pageSize=100`,
  );
}

/**
 * Porneste un program pe cont. ⚠ Panoul il foloseste DOAR pentru `free-listings` si DOAR cand starea e
 * `ELIGIBLE`: un program `NOT_ELIGIBLE` are cerinte neindeplinite, pe care numai comerciantul le poate
 * rezolva in Merchant Center. Cere drept de administrator pe cont.
 */
export function enableProgram(accessToken: string, accountId: string, programId: string) {
  return call<MerchantProgram>(
    accessToken, "POST", `/${V.accounts}/accounts/${accountId}/programs/${encodeURIComponent(programId)}:enable`, {},
  );
}
