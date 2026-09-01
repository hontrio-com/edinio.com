// First-party order attribution captured in the storefront (client-side) and
// attached to the order at checkout, so the merchant sees where each order came
// from. Stored in localStorage; no third-party cookies, no cross-site tracking.
//
// Model: LAST MEANINGFUL TOUCH. Every full page load that carries a real signal
// (utm_*, an external referrer, or an ad click id) overwrites the stored value;
// visits with no signal keep the previous touch (internal navigation must not
// downgrade a real source to "direct"). External traffic always arrives as a
// full page load, so capturing on mount catches every meaningful touch.

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ⚠ CHEIA E LEGATA DE MAGAZIN, NU DE ORIGINE
  ═══════════════════════════════════════════════════════════════════════════════

  Randul de dinainte era `const KEY = "edinio_attribution"` — o singura cheie. Iar
  `localStorage` e per ORIGINE, nu per magazin. Masurat pe 01.09.2026: 58 din 71 de
  magazine publicate se servesc de pe `www.edinio.com/{slug}`, deci toate 58
  scriau si citeau ACEEASI cheie.

  ⚠ CE INSEMNA ASTA: cine intra pe magazinul A dintr-o reclama si cumpara apoi de
  pe magazinul B, ducea `utm_campaign`-ul lui A in comanda lui B. Doi comercianti
  care nu se cunosc, unul vedea sursa celuilalt. Nu e o nepotrivire de raport, e
  date ale unui client ajunse la altul.

  ⚠ DE CE `basePath` SI NU `slug`: pe domeniul propriu al comerciantului magazinul
  sta la radacina si `basePath` e gol — acolo o singura cheie E corecta, fiindca pe
  originea aia exista un singur magazin. Cosul se scopa deja asa (`getCartSessionId`);
  atributia ramasese in urma.

  ⚠ VALOAREA VECHE NU SE MUTA, SE ARUNCA. Pe originea comuna ea poate veni de la
  oricare din cele 58 — deci nu se stie a cui e. Se pierde atributia celor aflati
  in mijlocul unei vizite, o singura data. Am ales pierderea in locul amestecului.
*/
function cheiaMagazinului(basePath: string): string {
  return basePath ? `edinio_attribution${basePath}` : "edinio_attribution";
}

/**
 * Cheia unica de dinainte, ramasa in localStorage pe originea comuna. Se sterge o
 * data, la prima captare, ca sa nu ramana acolo o valoare de proveninta necunoscuta.
 */
function aruncaCheiaVeche(basePath: string): void {
  if (!basePath) return; // pe domeniu propriu cheia veche E cheia buna
  try { localStorage.removeItem("edinio_attribution"); } catch { /* fara localStorage */ }
}

export interface OrderSource {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;   // Google Ads click id
  fbclid?: string;  // Meta (Facebook/Instagram) click id
  ttclid?: string;  // TikTok click id
  referrer?: string; // external referrer host only (never the store's own host)
  landing?: string;  // first landing path on this touch
  direct?: boolean;  // true when the visit had no source signal at all
  captured_at?: string;
  user_agent?: string; // filled server-side at order creation
  ga_client_id?: string; // GA4 client id from the _ga cookie, for server-side Measurement Protocol
}

/*
  ⚠ „ACELASI HOST" NU INSEAMNA „ACELASI MAGAZIN".

  Randul de dinainte intorcea `undefined` pentru orice referer de pe aceeasi gazda,
  socotindu-l navigare interna. Pe originea comuna asta insemna ca drumul
  `edinio.com/preturi` → `edinio.com/magazinul-x` era socotit intern: vizita venea
  fara niciun semnal, deci comanda aparea „direct".

  Pentru comerciant, un om venit de pe site-ul NOSTRU de prezentare e trafic din
  afara magazinului lui — si chiar e sursa care l-a adus. Acum se socoteste asa.

  Intern = aceeasi gazda SI calea refererului sub `basePath`-ul magazinului. Pe
  domeniu propriu (`basePath` gol) orice cale de pe gazda e a magazinului, deci
  purtarea ramane exact cea de dinainte.
*/
function externalReferrerHost(basePath: string): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const r = new URL(document.referrer);
    if (r.host === window.location.host) {
      if (!basePath) return undefined; // domeniu propriu: tot ce e pe gazda e al lui
      const inMagazin = r.pathname === basePath || r.pathname.startsWith(`${basePath}/`);
      if (inMagazin) return undefined; // chiar navigare interna
      // Aceeasi gazda, alt loc: site-ul nostru de prezentare, blogul, sau alt magazin.
    }
    return r.host.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function prune(src: OrderSource): OrderSource {
  return Object.fromEntries(Object.entries(src).filter(([, v]) => v !== undefined && v !== "")) as OrderSource;
}

/** Capture the current touch (call once per full page load, e.g. from a mounted client component). */
export function captureAttribution(basePath: string): void {
  if (typeof window === "undefined") return;
  try {
    aruncaCheiaVeche(basePath);
    const KEY = cheiaMagazinului(basePath);
    const url = new URL(window.location.href);
    const p = url.searchParams;
    const get = (k: string) => p.get(k)?.slice(0, 200) || undefined;

    const referrer = externalReferrerHost(basePath);
    const signal = {
      utm_source: get("utm_source"),
      utm_medium: get("utm_medium"),
      utm_campaign: get("utm_campaign"),
      utm_content: get("utm_content"),
      utm_term: get("utm_term"),
      gclid: get("gclid"),
      fbclid: get("fbclid"),
      ttclid: get("ttclid"),
      referrer,
    };
    const hasSignal = Object.values(signal).some(Boolean);

    if (hasSignal) {
      localStorage.setItem(KEY, JSON.stringify(prune({
        ...signal,
        landing: url.pathname.slice(0, 200),
        captured_at: new Date().toISOString(),
      })));
      return;
    }
    // No signal on this visit: only record a "direct" touch if we have nothing yet.
    if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, JSON.stringify(prune({
        direct: true,
        landing: url.pathname.slice(0, 200),
        captured_at: new Date().toISOString(),
      })));
    }
  } catch {
    // localStorage unavailable (private mode / disabled) — attribution is best-effort
  }
}

/** GA4 client id from the _ga cookie ("GA1.1.<clientId>"), for server-side MP. */
function readGaClientId(): string | undefined {
  try {
    const m = document.cookie.match(/(?:^|;\s*)_ga=GA\d\.\d\.([\d.]+)/);
    return m ? m[1] : undefined;
  } catch {
    return undefined;
  }
}

/** Read the stored attribution (+ the live GA client id) to attach to an order at checkout. */
export function getAttribution(basePath: string): OrderSource | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cheiaMagazinului(basePath));
    const parsed = raw ? (JSON.parse(raw) as OrderSource) : null;
    const src: OrderSource = parsed && typeof parsed === "object" ? { ...parsed } : {};
    const gaClientId = readGaClientId();
    if (gaClientId) src.ga_client_id = gaClientId;
    return Object.keys(src).length > 0 ? src : null;
  } catch {
    return null;
  }
}
