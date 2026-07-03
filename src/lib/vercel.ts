const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

const BASE = "https://api.vercel.com";

async function vercelFetch(
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: Record<string, unknown>
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    return { ok: false, data: { error: "VERCEL_TOKEN or VERCEL_PROJECT_ID not set" } };
  }

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, options);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  return { ok: res.ok, data };
}

/** Bare apex of a hostname (drops a leading "www."). */
function apexOf(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Whether we should also register the "www." twin for this domain. Only for
 * true apex domains (2 labels, e.g. "magazin.ro"); a subdomain like
 * "shop.magazin.ro" gets no "www." twin.
 */
function shouldPairWww(apex: string): boolean {
  return apex.split(".").length === 2;
}

async function addOne(name: string, body?: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const { ok, data } = await vercelFetch(
    `/v10/projects/${VERCEL_PROJECT_ID}/domains`,
    "POST",
    { name, ...body },
  );
  if (ok) return { success: true };
  const err = (data.error as Record<string, unknown>)?.message ?? data.message ?? "Eroare Vercel API";
  // Domain already added is not an error.
  if (String(err).includes("already") || String(data.code).includes("domain_already")) {
    return { success: true };
  }
  return { success: false, error: String(err) };
}

/**
 * Add a custom domain to the Vercel project. Vercel provisions SSL once DNS is
 * configured. We register BOTH the apex and its "www." twin (the www twin as a
 * 308 redirect to the apex) so a visitor hitting www gets a valid certificate
 * instead of an SSL "wrong principal" error. The apex stays canonical.
 */
export async function addDomainToVercel(
  domain: string
): Promise<{ success: boolean; error?: string }> {
  const apex = apexOf(domain);

  const primary = await addOne(apex);
  if (!primary.success) return primary;

  // Best-effort: the www twin must not block a successful apex connect.
  if (shouldPairWww(apex)) {
    await addOne(`www.${apex}`, { redirect: apex, redirectStatusCode: 308 });
  }

  return { success: true };
}

/**
 * Remove a custom domain from the Vercel project (apex + its www twin).
 */
export async function removeDomainFromVercel(
  domain: string
): Promise<{ success: boolean; error?: string }> {
  const apex = apexOf(domain);

  if (shouldPairWww(apex)) {
    // Best-effort — ignore if the twin was never added.
    await vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains/www.${apex}`, "DELETE");
  }

  const { ok, data } = await vercelFetch(
    `/v10/projects/${VERCEL_PROJECT_ID}/domains/${apex}`,
    "DELETE"
  );

  if (!ok) {
    const err = (data.error as Record<string, unknown>)?.message ?? data.message ?? "Eroare Vercel API";
    return { success: false, error: String(err) };
  }

  return { success: true };
}

/**
 * Get domain configuration/status from Vercel.
 */
export async function getDomainFromVercel(
  domain: string
): Promise<{ exists: boolean; verified: boolean; error?: string }> {
  const { ok, data } = await vercelFetch(
    `/v10/projects/${VERCEL_PROJECT_ID}/domains/${domain}`
  );

  if (!ok) return { exists: false, verified: false };

  return {
    exists: true,
    verified: data.verified === true,
  };
}
