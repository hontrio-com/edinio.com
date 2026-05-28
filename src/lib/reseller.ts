import crypto from "crypto";

const BASE_URL =
  "https://www.reseller.ro/portal/modules/addons/DomainsReseller/api/index.php";

/** Generates the HMAC-SHA256 token required by Reseller.ro.
 *
 * PHP equivalent:
 *   base64_encode(hash_hmac("sha256", $apiKey, "$email:".gmdate("y-m-d H")))
 *
 * Note: PHP hash_hmac returns a hex string. base64_encode is applied to that
 * hex string, NOT to the raw binary — so we replicate that here with .digest("hex")
 * followed by Buffer.from(...).toString("base64").
 */
function getToken(): string {
  const apiKey = process.env.RESELLER_API_KEY;
  const email = process.env.RESELLER_EMAIL;
  if (!apiKey || !email) {
    throw new Error("RESELLER_API_KEY or RESELLER_EMAIL env vars are not set");
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // gmdate("y-m-d H") → two-digit year, month, day, hour in UTC
  const dateStr = [
    String(now.getUTCFullYear()).slice(-2),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
  ].join("-") + " " + pad(now.getUTCHours());

  const hex = crypto
    .createHmac("sha256", `${email}:${dateStr}`)
    .update(apiKey)
    .digest("hex");

  return Buffer.from(hex).toString("base64");
}

/**
 * PHP http_build_query produces bracket notation for nested objects/arrays:
 *   { addons: { dnsmanagement: 1 } } → "addons%5Bdnsmanagement%5D=1"
 * We replicate that so the Reseller.ro API understands nested params.
 */
function buildQuery(data: unknown, prefix = ""): string {
  if (data === null || data === undefined) return "";

  if (typeof data !== "object") {
    return prefix
      ? `${encodeURIComponent(prefix)}=${encodeURIComponent(String(data))}`
      : "";
  }

  const entries: [string, unknown][] = Array.isArray(data)
    ? data.map((v, i) => [String(i), v])
    : Object.entries(data as Record<string, unknown>);

  return entries
    .map(([k, v]) => buildQuery(v, prefix ? `${prefix}[${k}]` : k))
    .filter(Boolean)
    .join("&");
}

export async function resellerCall(
  action: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    username: process.env.RESELLER_EMAIL!,
    token: getToken(),
  };

  const options: RequestInit = { method, headers };

  if (method === "POST" && body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = buildQuery(body);
  }

  const url = `${BASE_URL}${action}`;
  const res = await fetch(url, options);
  const text = await res.text();

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { result: "error", message: text };
  }
}
