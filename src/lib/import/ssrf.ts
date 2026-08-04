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

export type FetchFileResult = { buffer: Buffer } | { error: string };

/**
 * Citeste corpul raspunsului IN FLUX si rupe conexiunea in clipa in care se
 * depaseste plafonul.
 *
 * DE CE nu `res.arrayBuffer()`: acela aduce TOT corpul in memorie si abia apoi
 * se putea verifica dimensiunea. Un server ostil (feedul de stoc si importul de
 * produse descarca adrese date de comerciant) putea raspunde fara
 * `Content-Length`, cu `Transfer-Encoding: chunked`, si trimite octeti la
 * nesfarsit — pana cadea functia. Sau ii putea trimite foarte incet, tinand-o
 * ocupata pana la termenul platformei.
 *
 * Cronometrul de abandon NU se opreste aici: apelantul il stinge abia DUPA ce
 * corpul a fost citit, tocmai ca termenul sa acopere si descarcarea, nu doar
 * anteturile.
 */
async function citesteCuPlafon(res: Response, maxOcteti: number): Promise<Buffer | { error: string }> {
  const declarat = res.headers.get("content-length");
  if (declarat && Number(declarat) > maxOcteti) return { error: "Fisier prea mare" };

  if (!res.body) return { error: "Raspuns gol" };

  const reader = res.body.getReader();
  const bucati: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxOcteti) {
        await reader.cancel().catch(() => {});
        return { error: "Fisier prea mare" };
      }
      bucati.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(bucati);
}

/**
 * Descarca un fisier tabelar (CSV sau XLSX) ca octeti bruti.
 *
 * Intoarce octeti, nu text, si asta e esential: un XLSX e o arhiva ZIP, iar citit
 * ca text UTF-8 se strica ireversibil. Cine primeste octetii decide apoi ce e,
 * din semnatura fisierului, nu din extensie.
 */
export async function safeFetchFile(rawUrl: string): Promise<FetchFileResult> {
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
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/plain, */*",
        },
        cache: "no-store",
      });

      if (!res.ok) return { error: `HTTP ${res.status}` };

      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
        return { error: "Adresa nu returneaza un fisier tabelar" };
      }

      const citit = await citesteCuPlafon(res, MAX_TEXT_BYTES);
      if ("error" in citit) return citit;
      if (citit.byteLength === 0) return { error: "Fisier gol" };

      return { buffer: citit };
    } finally {
      // Abia AICI, ca termenul sa acopere si descarcarea corpului, nu doar
      // anteturile. Inainte se oprea imediat dupa `fetch`, deci un server care
      // trimitea octeti la nesfarsit nu mai era intrerupt de nimic.
      clearTimeout(timer);
    }
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

      if (!res.ok) return { error: `HTTP ${res.status}` };

      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!contentType.startsWith("image/")) return { error: "Continut non-imagine" };

      const citit = await citesteCuPlafon(res, MAX_BYTES);
      if ("error" in citit) return { error: "Imagine prea mare" };
      if (citit.byteLength === 0) return { error: "Imagine goala" };

      return { buffer: citit, contentType };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("blocked:")) return { error: "Adresa interzisa" };
    if (e instanceof Error && e.name === "AbortError") return { error: "Timeout" };
    return { error: "Descarcare esuata" };
  }
}
