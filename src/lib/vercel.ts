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

/**
 * Add a custom domain to the Vercel project.
 * Vercel will automatically provision SSL once DNS is configured.
 */
export async function addDomainToVercel(
  domain: string
): Promise<{ success: boolean; error?: string }> {
  const { ok, data } = await vercelFetch(
    `/v10/projects/${VERCEL_PROJECT_ID}/domains`,
    "POST",
    { name: domain }
  );

  if (!ok) {
    const err = (data.error as Record<string, unknown>)?.message ?? data.message ?? "Eroare Vercel API";
    // Domain already added is not an error
    if (String(err).includes("already") || String(data.code).includes("domain_already")) {
      return { success: true };
    }
    return { success: false, error: String(err) };
  }

  return { success: true };
}

/**
 * Remove a custom domain from the Vercel project.
 */
export async function removeDomainFromVercel(
  domain: string
): Promise<{ success: boolean; error?: string }> {
  const { ok, data } = await vercelFetch(
    `/v10/projects/${VERCEL_PROJECT_ID}/domains/${domain}`,
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
