/*
  ═══════════════════════════════════════════════════════════════════════════════
  MARKETINGUL COMERCIANTULUI — RUNTIME. NUMAI IN MAGAZIN.
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ FISIERUL ASTA ARE UN EFECT LA INCARCARE (`installFlush`, mai jos). Importat
  oriunde, instaleaza `window.__edinioFlushQueue` si aduce cu el toata coada si
  toate trackerele. De aceea n-are ce cauta in afara magazinelor.

  ⚠ DACA VREI DOAR UN ANALIZOR DE ID sau o normalizare, ia-le din
  `@/lib/marketing-config` — sunt curate si nu aduc nimic dupa ele.

  ⚠ SI NU E RUNTIME-UL PLATFORMEI. Pixelii cu care ne masuram NOI stau in
  `src/components/platform/`. Cele doua sisteme n-au voie sa se atinga: vezi
  `src/lib/granita-tracking.test.ts`.
*/

import {
  normalizeEmail,
  normalizePhone,
  type PixelUser,
} from "@/lib/marketing-config";

// ─────────────────────────────────────────────────────────────────────────
// Event queue. Pixel scripts are injected lazily (behind a consent gate) and
// only execute `afterInteractive`, so a tracking helper called from an effect
// (e.g. Purchase on /confirm) can run BEFORE fbq/ttq/gtag exist. Without a
// queue the event is silently dropped — which is exactly why conversions were
// being lost. Helpers now enqueue when the library is not ready; each pixel
// bootstrap drains its own events the instant it defines the global.
// ─────────────────────────────────────────────────────────────────────────

type Vendor = "fb" | "tt" | "ga";
type QueuedCall = { vendor: Vendor; run: () => void };
const QUEUE_CAP = 50; // bound memory / replay if consent is never granted

function getQueue(): QueuedCall[] {
  const w = window as unknown as { __edinioQ?: QueuedCall[] };
  if (!w.__edinioQ) w.__edinioQ = [];
  return w.__edinioQ;
}

function ready(vendor: Vendor): boolean {
  const w = window as unknown as { fbq?: unknown; ttq?: { track?: unknown }; gtag?: unknown };
  if (vendor === "fb") return typeof w.fbq === "function";
  if (vendor === "tt") return !!w.ttq && typeof w.ttq.track === "function";
  return typeof w.gtag === "function";
}

function dispatch(vendor: Vendor, run: () => void): void {
  if (typeof window === "undefined") return;
  if (ready(vendor)) { run(); return; }
  const q = getQueue();
  if (q.length >= QUEUE_CAP) q.shift();
  q.push({ vendor, run });
}

/** Replay every queued call for a vendor whose library is now ready. */
export function flushQueue(vendor: Vendor): void {
  if (typeof window === "undefined") return;
  const all = getQueue();
  const keep: QueuedCall[] = [];
  for (const item of all) {
    if (item.vendor === vendor && ready(vendor)) item.run();
    else keep.push(item);
  }
  (window as unknown as { __edinioQ?: QueuedCall[] }).__edinioQ = keep;
}

// Expose the flusher so each pixel's inline bootstrap can drain its queue
// synchronously right after defining fbq/ttq/gtag (no React-timing dependency).
(function installFlush() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __edinioFlushQueue?: (v: Vendor) => void };
  if (!w.__edinioFlushQueue) w.__edinioFlushQueue = (v: Vendor) => flushQueue(v);
})();

// ── Safe trackers (fire now if ready, else queue) ─────────────────────────

/**
 * Evenimentele pe care browserul le trimite si serverului, pentru Conversions API.
 *
 * ⚠ `Purchase` NU e aici, dinadins: achizitia pleaca de pe server din comanda insasi (`meta-comanda.ts`),
 * cu datele omului si cu banii din baza. Primita de la browser, ar fi fost o achizitie pe care oricine o
 * poate inventa cu un `fetch`.
 */
const EVENIMENTE_PRIN_SERVER = new Set(["ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Search"]);

/** Un `eventID` nou. Browserele vechi fara `randomUUID` primesc unul din timp si intamplare. */
function idEvenimentNou(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Trimite evenimentul si catre server, cu ACELASI `eventID`, cand magazinul are Conversions API.
 *
 * ═══ ⚠ DE CE (17.09.2026) ═══
 *
 * Documentatia Meta numeste asta „redundant setup” si il recomanda pentru orice pixel: „The Conversions API
 * allows you to share website events that the Pixel may lose due to network connectivity issues or page
 * loading errors.” Deduplicarea se face pe `event_name` + `eventID`, deci cele doua drumuri numara o data.
 *
 * ⚠ SE CHEAMA DIN INTERIORUL `dispatch("fb")`, adica numai dupa ce pixelul s-a incarcat. Pixelul se
 * incarca doar cu acordul pentru marketing (sau cand magazinul n-are banner), deci serverul primeste
 * exact ce ar fi primit si pixelul, nimic in plus.
 *
 * ⚠ `sendBeacon`: un `InitiateCheckout` urmat imediat de navigare n-ar fi apucat sa plece cu `fetch`.
 */
function trimiteSiServerului(event: string, data: Record<string, unknown>, eventID: string): void {
  const w = window as unknown as { __edinioMeta?: { magazin?: string; capi?: boolean } };
  const meta = w.__edinioMeta;
  if (!meta?.capi || !meta.magazin || !EVENIMENTE_PRIN_SERVER.has(event)) return;
  const corp = JSON.stringify({
    magazin: meta.magazin, event_name: event, event_id: eventID,
    event_source_url: window.location.href, custom_data: data,
  });
  try {
    const trimis = typeof navigator.sendBeacon === "function"
      && navigator.sendBeacon("/api/meta/eveniment", new Blob([corp], { type: "application/json" }));
    if (!trimis) {
      void fetch("/api/meta/eveniment", { method: "POST", body: corp, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch { /* masurarea nu are voie sa strice pagina */ }
}

/**
 * Facebook Pixel: window.fbq. Fiecare eveniment poarta un `eventID`: cel dat de apelant (achizitia, cu
 * id-ul comenzii) sau unul nou, acelasi care pleaca si spre Conversions API.
 */
export function fbTrack(event: string, data?: Record<string, unknown>, opts?: { eventID?: string }) {
  const eventID = opts?.eventID ?? idEvenimentNou();
  dispatch("fb", () => {
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    if (typeof fbq !== "function") return;
    fbq("track", event, data ?? {}, { eventID });
    trimiteSiServerului(event, data ?? {}, eventID);
  });
}

/**
 * Trimite evenimentul si catre server, prin TikTok Events API, cu ACELASI `event_id`.
 *
 * ⚠ ACEEASI REGULA CA LA META, si acelasi motiv: „we recommend advertisers set up both TikTok Pixel SDK
 * and Events API to ensure maximum data coverage”. TikTok deduplica pe `event_source_id` + `event` +
 * `event_id`.
 *
 * ⚠ SE CHEAMA DIN INTERIORUL `dispatch("tt")`, deci numai dupa ce pixelul s-a incarcat, adica numai cu
 * acordul pentru marketing.
 */
function trimiteSiServeruluiTikTok(event: string, properties: Record<string, unknown>, eventId: string): void {
  const w = window as unknown as { __edinioTikTok?: { magazin?: string; capi?: boolean } };
  const tt = w.__edinioTikTok;
  if (!tt?.capi || !tt.magazin || !EVENIMENTE_PRIN_SERVER.has(event)) return;
  const corp = JSON.stringify({
    magazin: tt.magazin, event, event_id: eventId,
    url: window.location.href, referrer: document.referrer || undefined, properties,
  });
  try {
    const trimis = typeof navigator.sendBeacon === "function"
      && navigator.sendBeacon("/api/tiktok/eveniment", new Blob([corp], { type: "application/json" }));
    if (!trimis) {
      void fetch("/api/tiktok/eveniment", { method: "POST", body: corp, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch { /* masurarea nu are voie sa strice pagina */ }
}

/**
 * TikTok Pixel: window.ttq. Fiecare eveniment poarta un `event_id`: cel dat de apelant (achizitia, cu id-ul
 * comenzii) sau unul nou, acelasi care pleaca si spre Events API.
 */
export function ttqTrack(event: string, data?: Record<string, unknown>, opts?: { eventID?: string }) {
  const eventId = opts?.eventID ?? idEvenimentNou();
  dispatch("tt", () => {
    const ttq = (window as unknown as { ttq?: { track: (...a: unknown[]) => void } }).ttq;
    if (!ttq || typeof ttq.track !== "function") return;
    ttq.track(event, data ?? {}, { event_id: eventId });
    trimiteSiServeruluiTikTok(event, data ?? {}, eventId);
  });
}

/** Google Tag (gtag.js) — standard event. */
export function gtagEvent(event: string, data?: Record<string, unknown>) {
  dispatch("ga", () => {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof gtag === "function") gtag("event", event, data ?? {});
  });
}

/** Google Tag — raw passthrough (e.g. Google Ads `conversion` with send_to). */
export function gtagRaw(...args: unknown[]) {
  dispatch("ga", () => {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof gtag === "function") gtag(...args);
  });
}

// ── Advanced Matching ─────────────────────────────────────────────────────
/*
 * ⚠ META NU MAI ARE `fbAdvancedMatch` AICI (17.09.2026). Chema `fbq('init', pixel, datele omului)` a DOUA
 * oara, pe pagina de confirmare, dupa ce codul de baza initializase deja pixelul fara ele. Documentatia:
 * „Be sure to place advanced matching parameters in the pixel base code or the values will not be treated
 * as manual advanced matching values.” Acum datele (hash-uite pe server) intra chiar in `init`-ul din codul
 * de baza: vezi `FacebookPixel` si `potrivireaPentruPixel`.
 */

/*
 * ⚠ `ttqIdentify` A FOST SCOS (18.09.2026), din acelasi motiv ca `fbAdvancedMatch`: trimitea emailul si
 * telefonul in clar din browser, iar pentru asta trebuiau puse in clar in HTML-ul paginii de confirmare.
 * Acum se hash-uiesc pe server (`lib/tiktok/date-client.ts`) si intra in `ttq.identify` din codul de baza,
 * inaintea oricarui eveniment, prin `window.__edinioTTAM`. Vezi `TikTokPixel`.
 */
