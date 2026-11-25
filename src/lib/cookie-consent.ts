import type { MarketingConfig } from "@/lib/marketing-config";
import { parseIdConversieAds } from "@/lib/google-ads/conversie";

/**
 * Cookie consent system (GDPR / ePrivacy).
 *
 * Non-essential tracking (analytics + marketing pixels) must NOT load until the
 * visitor consents. The banner content auto-adapts to the store's active
 * integrations: only categories that actually have a tracker are shown.
 *
 * ⚠ O SINGURA EXCEPTIE, din 25.11.2026: eticheta Google ADS. La magazinele care au reclame Google si n-au
 * oprit optiunea (`google_ads_inainte_de_acord`), ea porneste la orice vizita, cu toate semnalele consent
 * mode pe „denied”: nu scrie si nu citeste cookie-uri, iar evenimentele asteapta tot acordul. Fara asta,
 * Google Ads nu gasea eticheta pe site. Analytics si pixelii raman dupa acord. Vezi `lib/eticheta-google/corp.ts`.
 *
 * - Consent is stored per-visitor in localStorage (not the DB), keyed by store
 *   slug so different stores on the same browser keep independent choices.
 * - The merchant only configures the banner's appearance (enabled + position)
 *   via Settings → Banner Cookies; the categories themselves are derived.
 */

/*
 * „functional” (22.11.2026): chatul de suport al magazinului (Tidio, tawk.to, Intercom, Zendesk). Nu e
 * masuratoare si nu e reclama, dar scriptul furnizorului pune cookie-uri si afla pagina vizitatorului,
 * deci nu porneste fara acord. Apare in banner numai la magazinele cu chat. Vezi `lib/suport/config.ts`.
 */
export type ConsentCategory = "analytics" | "marketing" | "functional";

export type ConsentState = {
  necessary: true; // always granted, shown read-only
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
};

export type CookieBannerPosition =
  | "bottom-bar" // subtle slim bar across the bottom (default)
  | "bottom-left" // compact card, bottom-left
  | "bottom-right" // compact card, bottom-right
  | "center"; // centered modal with backdrop (max compliance)

export type CookieBannerConfig = {
  enabled: boolean;
  position: CookieBannerPosition;
  /**
   * Eticheta Google ADS porneste la orice vizita, inainte de raspunsul la banner, cu toate semnalele consent
   * mode refuzate (fara cookie-uri, fara datele comenzilor). Fara ea, Google Ads nu gaseste eticheta pe site
   * pana cand un vizitator accepta cookie-urile. Are efect numai la magazinele cu ID de conversie Google Ads.
   * Vezi `lib/eticheta-google/corp.ts`.
   */
  google_ads_inainte_de_acord: boolean;
};

/**
 * ⚠ PORNITA DIN OFICIU, HOTARAREA PROPRIETARULUI (25.11.2026). Intrebat anume, cu cele doua variante si cu
 * riscul fiecareia (pornita la toti, sau oprita si pornita de comerciant cu un clic, cum fac Shopify si Wix),
 * a ales: „Pornită la toți”. Cine isi pune ID-ul Google Ads vrea sa-si poata porni campania, iar Google Ads ii
 * spunea ca eticheta lipseste. Comerciantul, care e operatorul datelor din magazinul lui, o poate opri din
 * Setari > Banner Cookies. Un magazin fara cheia asta in configuratie (toate cele de dinainte) primeste
 * valoarea de aici.
 *
 * ⚠ NU SE SCHIMBA FARA EL. Ce stia cand a ales: incarcarea etichetei inainte de acord e recomandarea Google si
 * nu are o hotarare de autoritate in UE; ANSPDCP amendeaza cookie-uri puse inainte de acord (aici nu se pune
 * niciunul), iar Legea 219/2026 inaspreste regulile bannerului. De aceea ce pleaca inainte de acord e tinut la
 * minimum: vezi `lib/eticheta-google/corp.ts`.
 */
export const GOOGLE_ADS_INAINTE_DE_ACORD_IMPLICIT = true;

export const DEFAULT_COOKIE_BANNER_CONFIG: CookieBannerConfig = {
  enabled: true,
  position: "bottom-bar",
  google_ads_inainte_de_acord: GOOGLE_ADS_INAINTE_DE_ACORD_IMPLICIT,
};

const VALID_POSITIONS: CookieBannerPosition[] = ["bottom-bar", "bottom-left", "bottom-right", "center"];

/** Parse/sanitize the merchant's stored banner config (jsonb) into a safe object. */
export function parseCookieBannerConfig(raw: unknown): CookieBannerConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COOKIE_BANNER_CONFIG };
  const r = raw as Record<string, unknown>;
  const position = VALID_POSITIONS.includes(r.position as CookieBannerPosition)
    ? (r.position as CookieBannerPosition)
    : DEFAULT_COOKIE_BANNER_CONFIG.position;
  return {
    enabled: r.enabled !== false, // default true
    position,
    /* Numai un `true` sau un `false` scris de comerciant conteaza; orice altceva e valoarea din oficiu. */
    google_ads_inainte_de_acord: typeof r.google_ads_inainte_de_acord === "boolean"
      ? r.google_ads_inainte_de_acord
      : GOOGLE_ADS_INAINTE_DE_ACORD_IMPLICIT,
  };
}

/**
 * Magazinul are un ID de conversie Google Ads? Campul lui, apoi tagul, daca e un `AW-`: aceeasi citire ca
 * `adsConversionId` din layoutul vitrinei.
 */
export function magazinulAreGoogleAds(mc: MarketingConfig | null | undefined): boolean {
  return parseIdConversieAds(mc?.google_ads_conversion_id) !== null || parseIdConversieAds(mc?.google_tag_id) !== null;
}

/** Which consent categories are relevant for this store, based on active trackers. */
export function detectConsentCategories(
  mc: MarketingConfig | null | undefined,
  gaMeasurementId?: string | null,
  /**
   * Alt instrument de marketing pornit in vitrina, in afara pixelilor (theMarketer). ⚠ Fara el, un magazin
   * cu theMarketer si fara pixeli n-ar fi aratat categoria „Marketing” in banner, deci nimeni n-ar fi putut
   * da acordul, iar scriptul n-ar fi pornit niciodata.
   */
  altMarketing = false,
  /** Magazinul are chatul de suport pornit: bannerul primeste categoria „Functionale”. */
  areChat = false,
): ConsentCategory[] {
  const cats: ConsentCategory[] = [];
  /*
   * ⚠ GOOGLE ADS E MARKETING, NU ANALIZA (25.11.2026). Pana atunci orice tag Google aprindea doar „Analiza”,
   * iar ID-ul de conversie (`google_ads_conversion_id`) nu aprindea nimic. Un magazin care avea numai Google
   * Ads nu arata categoria „Marketing”, deci vizitatorul nu avea unde sa dea acordul pentru reclame, iar
   * semnalele `ad_*` ramaneau refuzate la toti cei care isi alegeau preferintele.
   */
  const tag = mc?.google_tag_id?.trim() ?? "";
  /* Aceeasi citire ca in layoutul vitrinei (`adsConversionId`): campul lui, apoi tagul, daca e un `AW-`. */
  const tagDeReclame = parseIdConversieAds(tag) !== null;
  const areGoogleAds = magazinulAreGoogleAds(mc);
  if ((tag !== "" && !tagDeReclame) || gaMeasurementId) cats.push("analytics");
  if (mc?.facebook_pixel_id?.trim() || mc?.tiktok_pixel_id?.trim() || altMarketing || areGoogleAds) cats.push("marketing");
  if (areChat) cats.push("functional");
  return cats;
}

// ── Client-side consent storage ────────────────────────────────────────────
// Versioned so we can invalidate stored consent if the legal model changes.
export const CONSENT_VERSION = 1;
export const CONSENT_EVENT = "edinio-consent-change";
export const OPEN_SETTINGS_EVENT = "edinio-open-cookie-settings";

/*
 * `partial`: acordul a fost dat DOAR chatului, din cartonasul de la butonul de chat, de cineva care inca nu
 * a raspuns bannerului. Categoria „functionale” e pornita, dar bannerul ramane de raspuns: nu hotaram noi,
 * in locul omului, ca a refuzat analiza si marketingul.
 */
/*
 * `oferite` (25.11.2026): categoriile pe care bannerul le ARATA cand omul a raspuns. O categorie care nu era pe
 * lista n-a fost refuzata, n-a fost intrebata: vezi `bannerDecis`. Raspunsurile de dinainte nu au cheia.
 */
type StoredConsent = ConsentState & { v: number; ts: number; partial?: boolean; oferite?: ConsentCategory[] };

function storageKey(slug: string): string {
  return `edinio_cc_${slug}`;
}

/**
 * Se poate incarca un tracker care sta sub categoriile date?
 *
 * ⚠ ORICARE, nu toate (18.09.2026). Tagul Google poarta si masuratoarea GA4 (analiza), si conversiile Google
 * Ads (marketing); cerandu-le pe amandoua, cine accepta doar marketingul nu trimitea nicio conversie. Ce are
 * voie sa faca tagul dupa ce s-a incarcat hotarasc semnalele consent mode, fiecare din categoria lui.
 */
export function areAcordPentru(consent: ConsentState | null, categorii: readonly ConsentCategory[]): boolean {
  if (!consent || categorii.length === 0) return false;
  return categorii.some((c) => consent[c]);
}

function citesteStocat(slug: string): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (!parsed || parsed.v !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Read the visitor's saved consent for a store, or null if nothing is stored.
 *
 * ⚠ Un acord vechi, scris inainte sa existe categoria „functionale”, o are OPRITA: omul a acceptat ce i s-a
 * aratat atunci, iar chatul nu era pe lista. Il intreaba cartonasul de la butonul de chat, o singura data.
 */
export function readConsent(slug: string): ConsentState | null {
  const parsed = citesteStocat(slug);
  if (!parsed) return null;
  return { necessary: true, analytics: !!parsed.analytics, marketing: !!parsed.marketing, functional: !!parsed.functional };
}

/**
 * Vizitatorul a raspuns bannerului? Un acord dat doar chatului (`acordaFunctional`) NU e un raspuns la
 * banner: bannerul ramane deschis pentru celelalte categorii.
 */
export function bannerDecis(slug: string, acum?: CeArataBannerul): boolean {
  const parsed = citesteStocat(slug);
  if (parsed === null || parsed.partial === true) return false;
  return !acum || categoriiNeintrebate(parsed, acum).length === 0;
}

/** Ce arata bannerul magazinului ACUM, pentru intrebarea „a raspuns omul la tot ce i se arata?”. */
export interface CeArataBannerul {
  categorii: readonly ConsentCategory[];
  /**
   * Categoria „Marketing” exista in magazin NUMAI din cauza Google Ads (fara Facebook, TikTok, theMarketer).
   * Pana pe 25.11.2026 Google Ads nu aprindea nicio categorie, deci intr-un asemenea magazin „Marketing” n-a
   * fost aratata nimanui inainte de acea zi.
   */
  marketingDoarGoogleAds?: boolean;
}

/**
 * Categoriile aratate acum, pe care omul nu le are acordate si despre care N-A FOST INTREBAT cand a raspuns.
 *
 * ⚠ DE CE EXISTA (25.11.2026). Google Ads a devenit categoria „Marketing”. Un magazin care avea numai Google
 * Ads arata pana atunci bannerul fara alegeri, cu un singur buton, „Am inteles”, care scrie un refuz intreg;
 * unul cu Analytics si Google Ads arata numai „Analiza”. Vizitatorii lor au deci un `marketing: false` scris
 * fara sa fi fost intrebati vreodata de marketing, iar bannerul, socotindu-i raspunsi, nu i-ar mai fi intrebat
 * niciodata: nicio conversie cu acord de la clientii vechi ai magazinului. Un refuz e al omului numai pentru
 * ce i s-a aratat.
 *
 *   - raspuns NOU (are `oferite`): o categorie de analiza sau de marketing aratata acum, care nu era pe lista
 *     si nu e acordata, se intreaba o data;
 *   - raspuns VECHI (fara `oferite`): nu stim ce i s-a aratat, deci ramane raspuns, cu o singura exceptie
 *     sigura: „Marketing” intr-un magazin unde ea vine numai de la Google Ads.
 *
 * ⚠ Ce NU face: nu intreaba din nou pe cine a refuzat o categorie care i s-a aratat (ar fi pisalogeala), nu
 * atinge un acord dat, si nu priveste „Functionale”: pe aceea o cere cartonasul de la butonul de chat.
 */
function categoriiNeintrebate(parsed: StoredConsent, acum: CeArataBannerul): ConsentCategory[] {
  const oferite = Array.isArray(parsed.oferite) ? parsed.oferite : null;
  return acum.categorii.filter((c) => {
    if (c === "functional" || parsed[c] === true) return false;
    if (oferite) return !oferite.includes(c);
    return c === "marketing" && acum.marketingDoarGoogleAds === true;
  });
}

/**
 * Persist the visitor's consent and notify listeners (gates re-evaluate immediately).
 *
 * @param oferite Categoriile pe care bannerul le arata cand omul a raspuns. Vezi `bannerDecis`.
 */
export function writeConsent(slug: string, state: ConsentState, oferite?: readonly ConsentCategory[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredConsent = { ...state, necessary: true, v: CONSENT_VERSION, ts: Date.now() };
    if (oferite) payload.oferite = [...oferite];
    window.localStorage.setItem(storageKey(slug), JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { slug, state } }));
  } catch {
    /* storage blocked — banner stays, nothing tracked */
  }
}

/**
 * Acordul dat de la butonul de chat („Deschide chatul”): porneste categoria „functionale” si atat.
 *
 * Cine a raspuns deja bannerului isi pastreaza celelalte alegeri. Cine n-a raspuns primeste o insemnare
 * partiala: chatul are voie sa porneasca, iar bannerul il intreaba mai departe despre analiza si marketing.
 */
export function acordaFunctional(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    const vechi = citesteStocat(slug);
    const state: ConsentState = {
      necessary: true,
      analytics: !!vechi?.analytics,
      marketing: !!vechi?.marketing,
      functional: true,
    };
    const payload: StoredConsent = { ...state, v: CONSENT_VERSION, ts: Date.now() };
    if (!vechi || vechi.partial === true) payload.partial = true;
    /* Lista categoriilor aratate de banner merge mai departe: fara ea, raspunsul ar parea unul vechi. */
    if (Array.isArray(vechi?.oferite)) payload.oferite = vechi.oferite;
    window.localStorage.setItem(storageKey(slug), JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { slug, state } }));
  } catch {
    /* stocare blocata: chatul se deschide acum, iar intrebarea revine la pagina urmatoare */
  }
}

export const CONSENT_ALL: ConsentState = { necessary: true, analytics: true, marketing: true, functional: true };
export const CONSENT_NONE: ConsentState = { necessary: true, analytics: false, marketing: false, functional: false };
