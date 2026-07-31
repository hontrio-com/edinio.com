// SSRF-hardened image fetch. We resolve the hostname and refuse private/reserved
// IP ranges (incl. the cloud metadata endpoint 169.254.169.254) and reject
// redirects outright, so a public URL cannot bounce us onto an internal target.
// Server-only (uses node:dns / node:net).

import dns from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = 12 * 1024 * 1024; // 12MB / image
const TIMEOUT_MS = 15000;
const USER_AGENT = "Mozilla/5.0 (compatible; EdinioImport/1.0; +https://edinio.com)";

export type FetchImageResult =
  | { buffer: Buffer; contentType: string }
  | { error: string };

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (low.startsWith("fe80")) return true; // link-local
    if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique local
    const mapped = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("blocked:host");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("blocked:ip");
    return;
  }
  const records = await dns.lookup(host, { all: true });
  if (!records.length) throw new Error("blocked:dns");
  for (const r of records) {
    if (isPrivateIp(r.address)) throw new Error("blocked:ip");
  }
}

const MAX_TEXT_BYTES = 8 * 1024 * 1024; // 8MB / feed, cat si incarcarea manuala

export type FetchTextResult = { text: string } | { error: string };

/**
 * Descarca un fisier text (feed de stocuri) cu aceleasi garantii ca imaginile.
 *
 * Sta aici, langa `safeFetchImage`, ca sa foloseasca ACELASI `assertPublicHost`.
 * O adresa data de comerciant si citita de serverul nostru e o cale directa spre
 * reteaua interna, iar apararea nu trebuie sa existe in doua copii care pot
 * ajunge sa nu mai semene.
 *
 * Tipul de continut nu se verifica strict: furnizorii servesc CSV-uri drept
 * `text/plain`, `application/octet-stream` sau chiar `text/html`. Refuzam doar
 * ce e clar binar, iar decizia finala o ia parserul de CSV.
 */
export async function safeFetchText(rawUrl: string): Promise<FetchTextResult> {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "Protocol invalid" };
    await assertPublicHost(u.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(u, {
        redirect: "error",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/csv, text/plain, */*" },
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return { error: `HTTP ${res.status}` };

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
      return { error: "Adresa nu returneaza un fisier text" };
    }

    const declared = res.headers.get("content-length");
    if (declared && Number(declared) > MAX_TEXT_BYTES) return { error: "Fisier prea mare" };

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) return { error: "Fisier gol" };
    if (buffer.byteLength > MAX_TEXT_BYTES) return { error: "Fisier prea mare" };

    return { text: buffer.toString("utf-8") };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("blocked:")) return { error: "Adresa interzisa" };
    if (e instanceof Error && e.name === "AbortError") return { error: "Timeout" };
    return { error: "Descarcare esuata" };
  }
}

/** Download a remote image with SSRF protection, size/time/content-type limits. */
export async function safeFetchImage(rawUrl: string): Promise<FetchImageResult> {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "Protocol invalid" };
    await assertPublicHost(u.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(u, {
        // Refuse redirects: prevents a public host from bouncing us to an internal IP.
        redirect: "error",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return { error: `HTTP ${res.status}` };

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return { error: "Continut non-imagine" };

    const declared = res.headers.get("content-length");
    if (declared && Number(declared) > MAX_BYTES) return { error: "Imagine prea mare" };

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) return { error: "Imagine goala" };
    if (buffer.byteLength > MAX_BYTES) return { error: "Imagine prea mare" };

    return { buffer, contentType };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("blocked:")) return { error: "Adresa interzisa" };
    if (e instanceof Error && e.name === "AbortError") return { error: "Timeout" };
    return { error: "Descarcare esuata" };
  }
}
