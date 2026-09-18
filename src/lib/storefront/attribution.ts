import { CONSENT_VERSION } from "@/lib/cookie-consent";

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
  /**
   * Mailchimp: `mc_cid` e campania din care a venit clickul, `mc_tc` codul lor de urmarire. Fara
   * `mc_cid` pe comanda, Mailchimp nu stie carei campanii sa-i atribuie venitul.
   */
  mc_cid?: string;
  mc_tc?: string;
  referrer?: string; // external referrer host only (never the store's own host)
  landing?: string;  // first landing path on this touch
  direct?: boolean;  // true when the visit had no source signal at all
  captured_at?: string;
  user_agent?: string; // filled server-side at order creation
  ga_client_id?: string; // GA4 client id from the _ga cookie, for server-side Measurement Protocol
  /** Cookie-urile de sesiune `_ga_<ID>`, ca `ID=valoare;…`. Serverul il alege pe al fluxului magazinului. */
  ga_sesiuni?: string;
  /** „da” cand acordul de mai jos a fost CITIT pentru magazinul acesta (lipseste la comenzile vechi). */
  consimtamant_citit?: string;
  consimtamant_analiza?: string;
  consimtamant_marketing?: string;
  /**
   * Cookie-urile pixelului Meta (`_fbp`, `_fbc`), fotografiate la checkout pentru Conversions API. Documentatia:
   * „We recommend that you always send `_fbc` and `_fbp` browser cookie values in the `fbc` and `fbp` event
   * parameters”. Se iau doar de la cine n-a refuzat marketingul.
   */
  fbp?: string;
  fbc?: string;
  /**
   * Cookie-ul pixelului TikTok (`_ttp`), fotografiat la checkout pentru Events API: „Pixel SDK automatically
   * saves a unique identifier in the `_ttp` cookie ... You can extract the value of `_ttp` and attach the
   * value here.” `ttclid` vine din adresa sau, cand pixelul l-a pus in cookie, de acolo.
   */
  ttp?: string;
  /** IP-ul clientului, scris DOAR de server la creare si doar cand vizita are un semn de pixel. Vezi `buildOrderSource`. */
  client_ip?: string;
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
      mc_cid: get("mc_cid"),
      mc_tc: get("mc_tc"),
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

/** Un cookie simplu, dupa nume. Intoarce valoarea decodata sau `undefined`. */
function cookieSimplu(nume: string): string | undefined {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${nume}=([^;]+)`));
    const v = m ? decodeURIComponent(m[1]) : undefined;
    return v && /^[\w.~-]{6,1000}$/.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Un cookie al pixelului Meta (`_fbp` / `_fbc`), numai daca are forma lor: `fb.<index>.<ms>.<valoare>`. */
function cookieMeta(nume: "_fbp" | "_fbc"): string | undefined {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${nume}=([^;]+)`));
    const v = m ? decodeURIComponent(m[1]) : undefined;
    return v && /^fb\.\d\.\d{10,13}\..{1,400}$/.test(v) ? v : undefined;
  } catch {
    return undefined;
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

/**
 * Cookie-urile de sesiune GA4 (`_ga_<ID>`), ca `ID=valoare;ID2=valoare`.
 *
 * ⚠ TOATE, nu doar al magazinului: aici nu se stie ID-ul fluxului, iar pe adresa comuna poate sta
 * alaturi si cel al platformei. Serverul il alege pe cel potrivit (`sesiuneaPentru`). Valoarea se ia
 * INTREAGA, fiindca asa o accepta documentatia ca `session_id`.
 */
function sesiunileGa(): string | undefined {
  try {
    const perechi: string[] = [];
    let lungime = 0;
    for (const bucata of document.cookie.split(/;\s*/)) {
      const i = bucata.indexOf("=");
      if (i <= 0) continue;
      const nume = bucata.slice(0, i);
      const valoare = bucata.slice(i + 1);
      if (!/^_ga_[A-Za-z0-9]+$/.test(nume) || !/^GS\d\.\d\./.test(valoare)) continue;
      const pereche = `${nume.slice(4)}=${valoare}`;
      /* ⚠ Lista alba taie la 500; o pereche taiata la jumatate ar fi o sesiune falsa, deci se opreste inainte. */
      if (lungime + pereche.length + 1 > 500) break;
      perechi.push(pereche);
      lungime += pereche.length + 1;
    }
    return perechi.length ? perechi.join(";") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ce a ales cumparatorul in bannerul de cookie-uri AL ACESTUI MAGAZIN.
 *
 * ═══ ⚠⚠ DE CE SE FOTOGRAFIAZA (17.09.2026) ═══
 *
 * Serverul trimite achizitia in GA4 si dupa ce omul a plecat din pagina. Pana acum nu stia ce a ales
 * omul, iar un `_ga` prezent nu dovedea nimic: pe adresa comuna `edinio.com/<magazin>` cookie-ul sta pe
 * domeniul `edinio.com`, unde il scrie si tag-ul platformei. Regula care foloseste asta e
 * `verdictTrimitere`.
 *
 * ⚠ CARE MAGAZIN: pe adresa comuna `basePath` e chiar `/<slug>`. Pe domeniul propriu e gol, dar acolo
 * originea are un singur magazin, deci cheia `edinio_cc_*` de pe origine e a lui; daca ar fi mai multe
 * (un magazin redenumit), se ia decizia cea mai noua.
 *
 * ⚠ Nicio decizie salvata = niciun acord. Daca magazinul n-are banner, serverul stie asta singur si
 * trimite oricum; nu se ghiceste aici.
 */
function acordulMagazinului(basePath: string): { analiza: boolean; marketing: boolean; decis: boolean } | null {
  try {
    const citeste = (cheie: string) => {
      const raw = localStorage.getItem(cheie);
      if (!raw) return null;
      const p = JSON.parse(raw) as { v?: number; ts?: number; analytics?: unknown; marketing?: unknown };
      if (p?.v !== CONSENT_VERSION) return null;
      return { analiza: p.analytics === true, marketing: p.marketing === true, ts: Number(p.ts) || 0 };
    };
    if (basePath) {
      const d = citeste(`edinio_cc_${basePath.replace(/^\/+/, "")}`);
      return d ? { analiza: d.analiza, marketing: d.marketing, decis: true } : { analiza: false, marketing: false, decis: false };
    }
    let cea: { analiza: boolean; marketing: boolean; ts: number } | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const cheie = localStorage.key(i);
      if (!cheie?.startsWith("edinio_cc_")) continue;
      const d = citeste(cheie);
      if (d && (!cea || d.ts > cea.ts)) cea = d;
    }
    return cea ? { analiza: cea.analiza, marketing: cea.marketing, decis: true } : { analiza: false, marketing: false, decis: false };
  } catch {
    /* Fara localStorage nu se poate citi nimic: comanda pleaca fara fotografie, ca una veche. */
    return null;
  }
}

/** Read the stored attribution (+ the live GA client id) to attach to an order at checkout. */
export function getAttribution(basePath: string): OrderSource | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cheiaMagazinului(basePath));
    const parsed = raw ? (JSON.parse(raw) as OrderSource) : null;
    const src: OrderSource = parsed && typeof parsed === "object" ? { ...parsed } : {};

    const acord = acordulMagazinului(basePath);
    if (acord) {
      src.consimtamant_citit = "da";
      src.consimtamant_analiza = acord.analiza ? "da" : "nu";
      src.consimtamant_marketing = acord.marketing ? "da" : "nu";
    }
    /*
     * ⚠ Cookie-urile GA nu se iau de la cine a REFUZAT analiza pentru magazinul acesta: cel de pe adresa
     * comuna poate fi al platformei, iar n-avem ce face cu el. Fara decizie salvata se iau, fiindca
     * magazinul poate sa n-aiba banner deloc; serverul hotaraste.
     */
    /* ⚠ Cookie-urile Meta, cu aceeasi regula ca cele GA, dar pe MARKETING: pixelul Meta sta sub acordul
       pentru marketing, nu sub cel pentru analiza. */
    const refuzatMarketing = acord !== null && acord.decis && !acord.marketing;
    if (!refuzatMarketing) {
      const fbp = cookieMeta("_fbp");
      if (fbp) src.fbp = fbp;
      const fbc = cookieMeta("_fbc");
      if (fbc) src.fbc = fbc;
      /* ⚠ TikTok: `_ttp` il pune pixelul lor, iar `ttclid` il pune tot el in cookie cand omul vine din
         reclama. Cookie-ul castiga in fata adresei: tine cat tine sesiunea, nu doar prima pagina. */
      const ttp = cookieSimplu("_ttp");
      if (ttp) src.ttp = ttp;
      const ttclid = cookieSimplu("ttclid");
      if (ttclid) src.ttclid = ttclid;
    }
    const refuzat = acord !== null && acord.decis && !acord.analiza;
    if (!refuzat) {
      const gaClientId = readGaClientId();
      if (gaClientId) src.ga_client_id = gaClientId;
      const sesiuni = sesiunileGa();
      if (sesiuni) src.ga_sesiuni = sesiuni;
    }
    return Object.keys(src).length > 0 ? src : null;
  } catch {
    return null;
  }
}
