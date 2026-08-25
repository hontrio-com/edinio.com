// Derive a human-readable order origin from the captured attribution
// (order_source). Pure + defensive: any shape in, always a sensible label out,
// never throws. Older orders (no order_source) resolve to "Magazin online".

import type { OrderSource } from "@/lib/storefront/attribution";

export type OriginChannel =
  | "paid" | "search" | "social" | "email" | "referral" | "direct" | "store" | "unknown";

export interface OrderOrigin {
  label: string;         // e.g. "Facebook Ads", "Google (căutare)", "Direct"
  channel: OriginChannel;
  detail?: string;       // campaign / medium / referrer host
  device?: "Mobil" | "Tabletă" | "Desktop";
  /**
   * Cheia marketplace-ului (`trendyol`, `aboutyou`), cand comanda vine de acolo.
   *
   * `channel` ramane „store" si pentru magazinul propriu, si pentru marketplace —
   * corect ca notiune (nu e trafic platit, nici cautare), dar inutil cand vrei sa
   * DEOSEBESTI o comanda Trendyol de una din magazin. De aia cheia sta separat.
   */
  marketplace?: string;
}

/*
 * Cine sunt marketplace-urile si cum arata.
 *
 * Culorile sunt cele ale platformelor, ca eticheta sa se recunoasca dintr-o
 * privire pe un tabel plin: portocaliul Trendyol, negrul About You. Magazinul
 * propriu ramane neutru — el e cazul obisnuit, nu are de ce sa strige.
 */
export const MARKETPLACE_ORIGINI: Record<string, { label: string; badge: string }> = {
  trendyol: { label: "Trendyol", badge: "bg-orange-100 text-orange-700 border-orange-200" },
  aboutyou: { label: "About You", badge: "bg-neutral-900 text-white border-neutral-900" },
  /* Albastrul eMAG. ⚠ Fara randul asta, o comanda eMAG s-ar fi vazut in tabel cu
     eticheta implicita — adica exact ca una din magazin. Iar deosebirea e chiar ce
     hotaraste daca omul poate factura si expedia comanda cum e obisnuit, sau daca
     trebuie sa treaca prin panoul eMAG. */
  emag: { label: "eMAG", badge: "bg-blue-100 text-blue-800 border-blue-200" },
};

/*
 * ═══ ⚠ CINE TINE CICLUL DE VIATA AL COMENZII ═══
 *
 * La o comanda din magazin, adevarul despre stare e la noi. La una de marketplace, nu:
 * acolo furnizorul e cel care stie daca s-a livrat si daca s-au incasat banii, iar
 * reconcilierea ne aduce raspunsul lui la fiecare citire.
 *
 * ⚠ CE S-A INTAMPLAT FARA REGULA ASTA. Selectorul generic de status si cel de plata se
 * randau si pe comenzile eMAG, iar `updateOrder` le ducea pana la baza fara sa se uite la
 * origine. Trei feluri de pagube, toate tacute:
 *
 *   - „Platit" pus de mana pe o comanda cu ramburs golea rambursul AWB-ului. Banii nu se
 *     mai incasau la usa. (Inchis separat, in `stareaPlatiiPentruRamburs`.)
 *   - „Anulat" elibera stocul local, iar recitirea revendica marfa inapoi — daca intre
 *     timp se vanduse, stocul intra pe minus si ramanea doar un rand in jurnal.
 *   - Orice stare pusa de om era stearsa la prima recitire, fara nicio eroare pe ecran.
 *     Dar carligele pornite intre timp — factura, instiintarea — RAMANEAU pornite.
 *
 * ⚠ SI NU EXISTA DRUM INAPOI: `salveazaComenzi` (POST /order/save) e scrisa in client si
 * n-are niciun apelant. Deci nimic din ce se apasa aici nu ajunge vreodata la ei.
 *
 * ═══ ⚠ SI TRENDYOL, DE PE 26.08.2026 ═══
 *
 * A stat pe dinafara o zi, si nota de aici spunea de ce: „ar lua un buton pe care comerciantii
 * il folosesc azi". Argumentul era bun si a incetat sa fie, fiindca butonul are acum inlocuitor
 * adevarat — `nuPotFurniza`, care anuleaza INTAI la ei si abia apoi la noi.
 *
 * ⚠ SI ASTA E ORDINEA CARE CONTEAZA: intai calea oficiala, pe urma blocarea celei gresite.
 * Invers, comerciantul ar fi ramas fara nicio cale de a spune „nu pot furniza" — iar o comanda
 * pe care n-o poti nici onora, nici anula e mai rea decat una anulata stramb.
 *
 * ⚠ CE FACEA „ANULAT" DIN SELECTOR PE O COMANDA TRENDYOL: elibera stocul la noi, iar la ei
 * comanda ramanea activa si pleca la client. La prima recitire, reconcilierea o aducea inapoi
 * si revendica marfa — daca intre timp se vanduse, stocul intra pe minus si ramanea doar un
 * rand in jurnal.
 */
export const MARKETPLACE_CU_CICLU_PROPRIU = new Set(["emag", "trendyol"]);

/**
 * Cheia marketplace-ului care tine ciclul comenzii, sau `null` daca il tinem noi.
 *
 * ⚠ Se citeste din `order_source`, care e scris la ingest si nu se mai schimba. Nu din
 * `payment_method`: acolo o comanda eMAG scrie „emag", dar una Trendyol nu neaparat.
 */
export function marketplaceCareTineComanda(orderSource: unknown): string | null {
  const m = (orderSource as { marketplace?: string } | null)?.marketplace;
  return m && MARKETPLACE_CU_CICLU_PROPRIU.has(m) ? m : null;
}

/**
 * Ce i se spune omului cand incearca sa schimbe de aici o comanda tinuta de ei.
 *
 * ⚠ Mesajul SPUNE UNDE SE FACE, nu doar ca nu se poate. Un „nu se poate" fara urmatoarea
 * miscare l-a pus deja pe comerciant sa apese de 208 ori un buton care n-avea cum sa
 * meargă. Vezi `etichete.ts`.
 */
export function deCeNuDeAici(marketplace: string, ce: "starea" | "plata" | "stergerea"): string {
  const nume = MARKETPLACE_ORIGINI[marketplace]?.label ?? marketplace;
  /* ⚠ Text pe care il citeste comerciantul: cu diacritice, si fara linii de dialog. */
  if (ce === "stergerea") {
    return `Comanda vine din ${nume} și nu se poate șterge de aici: la ei rămâne. `
      + "Ștearsă la noi, s-ar rupe legătura cu factura și s-ar întoarce pe raft marfă "
      + "care a plecat deja la client. Ca s-o scoți din listele tale, folosește filtrele.";
  }
  const lucrul = ce === "plata" ? "Starea plății" : "Starea";
  return `${lucrul} unei comenzi ${nume} se schimbă în contul ${nume}, nu de aici — noi o `
    + "citim de la ei la fiecare trecere. Schimbată aici, ar fi ștearsă la prima "
    + "sincronizare, dar factura și înștiințările pornite între timp ar rămâne pornite.";
}

const BADGE_IMPLICIT = "bg-muted text-muted-foreground border-transparent";

/** Clasele etichetei de sursa pentru o comanda. */
export function claseSursa(origin: OrderOrigin): string {
  if (origin.marketplace) return MARKETPLACE_ORIGINI[origin.marketplace]?.badge ?? "bg-primary/10 text-primary border-primary/20";
  return BADGE_IMPLICIT;
}

/*
 * Moneda in care s-a incasat comanda.
 *
 * `orders.total` e citit peste tot ca lei, dar comenzile de pe About You vin in
 * euro: o comanda de 40 EUR se afisa „40 lei", adica sub jumatate din cat era.
 * Ingestul noteaza moneda in `order_source`, iar afisarea o foloseste. Lipsa ei
 * inseamna lei — asa sunt toate comenzile din magazin si toate cele vechi.
 */
export function monedaComenzii(raw: unknown): string | null {
  const src = asSource(raw) as ({ currency?: string } | null);
  const c = src?.currency;
  return typeof c === "string" && c.toUpperCase() !== "RON" ? c.toUpperCase() : null;
}

function asSource(raw: unknown): OrderSource | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as OrderSource;
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function deviceFromUA(ua?: string): OrderOrigin["device"] | undefined {
  if (!ua) return undefined;
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return "Tabletă";
  if (/mobile|android|iphone|ipod|windows phone/.test(s)) return "Mobil";
  return "Desktop";
}

const PAID_MEDIA = /^(cpc|ppc|paid|paidsocial|paid_social|cpm|display|retargeting)$/;

// utm_source token -> {label, channel}. Paid variants handled separately.
function fromUtmSource(source: string, paid: boolean): { label: string; channel: OriginChannel } {
  const s = source.toLowerCase();
  if (/(google)/.test(s)) return paid ? { label: "Google Ads", channel: "paid" } : { label: "Google", channel: "search" };
  if (/(facebook|fb|meta)/.test(s)) return paid ? { label: "Facebook Ads", channel: "paid" } : { label: "Facebook", channel: "social" };
  if (/(instagram|^ig$)/.test(s)) return paid ? { label: "Instagram Ads", channel: "paid" } : { label: "Instagram", channel: "social" };
  if (/tiktok/.test(s)) return paid ? { label: "TikTok Ads", channel: "paid" } : { label: "TikTok", channel: "social" };
  if (/youtube/.test(s)) return { label: "YouTube", channel: paid ? "paid" : "social" };
  if (/(pinterest)/.test(s)) return { label: "Pinterest", channel: "social" };
  if (/(twitter|^x$|t\.co)/.test(s)) return { label: "X (Twitter)", channel: "social" };
  if (/(email|newsletter|mailchimp|klaviyo|brevo|sendgrid|mail)/.test(s)) return { label: "Email", channel: "email" };
  if (/(bing)/.test(s)) return { label: "Bing", channel: "search" };
  return { label: titleCase(source), channel: paid ? "paid" : "referral" };
}

function fromReferrer(host: string): { label: string; channel: OriginChannel } {
  const h = host.toLowerCase();
  if (/google\./.test(h)) return { label: "Google (căutare)", channel: "search" };
  if (/bing\./.test(h)) return { label: "Bing", channel: "search" };
  if (/(yahoo)\./.test(h)) return { label: "Yahoo", channel: "search" };
  if (/duckduckgo/.test(h)) return { label: "DuckDuckGo", channel: "search" };
  if (/(facebook|fb)\.|l\.facebook|lm\.facebook/.test(h)) return { label: "Facebook", channel: "social" };
  if (/instagram/.test(h)) return { label: "Instagram", channel: "social" };
  if (/tiktok/.test(h)) return { label: "TikTok", channel: "social" };
  if (/youtube|youtu\.be/.test(h)) return { label: "YouTube", channel: "social" };
  if (/pinterest/.test(h)) return { label: "Pinterest", channel: "social" };
  if (/(twitter|t\.co|^x\.com)/.test(h)) return { label: "X (Twitter)", channel: "social" };
  return { label: host, channel: "referral" };
}

export function deriveOrigin(raw: unknown): OrderOrigin {
  const src = asSource(raw);
  const device = deviceFromUA(src?.user_agent);

  // No attribution at all (older orders): we only know it's from the store.
  if (!src || Object.keys(src).filter((k) => k !== "user_agent").length === 0) {
    return { label: "Magazin online", channel: "store", device };
  }

  // Marketplace orders (About You, Trendyol, ...) carry an explicit channel marker.
  const marketplace = (src as { marketplace?: string }).marketplace;
  if (marketplace) {
    return {
      label: MARKETPLACE_ORIGINI[marketplace]?.label ?? titleCase(marketplace),
      channel: "store",
      marketplace,
      device,
    };
  }

  const medium = (src.utm_medium ?? "").toLowerCase();
  const hasClickId = !!(src.gclid || src.fbclid || src.ttclid);
  const paid = hasClickId || PAID_MEDIA.test(medium);

  // Recovery campaigns (abandoned-cart emails/SMS).
  const campaign = (src.utm_campaign ?? "").toLowerCase();
  if (/recover|abandon|cos-abandonat|cart/.test(campaign) || (src.utm_source ?? "").toLowerCase() === "recovery") {
    return { label: "Coș recuperat", channel: "email", detail: src.utm_campaign, device };
  }

  if (src.utm_source) {
    const { label, channel } = fromUtmSource(src.utm_source, paid);
    const detail = src.utm_campaign || src.utm_medium || undefined;
    return { label, channel, detail, device };
  }

  // Click ids without an explicit utm_source.
  if (src.gclid) return { label: "Google Ads", channel: "paid", device };
  if (src.fbclid) return { label: "Facebook Ads", channel: "paid", device };
  if (src.ttclid) return { label: "TikTok Ads", channel: "paid", device };

  if (src.referrer) {
    const { label, channel } = fromReferrer(src.referrer);
    return { label, channel, detail: src.referrer, device };
  }

  // Explicit direct touch, or attribution with only landing/device info.
  return { label: "Direct", channel: "direct", device };
}
