/*
  ═══════════════════════════════════════════════════════════════════════════════
  DE UNDE A VENIT VIZITATORUL UNUI MAGAZIN
  ═══════════════════════════════════════════════════════════════════════════════

  ═══ ⚠ CE ERA INAINTE, SI DE CE E MAI RAU DECAT O LIPSA ═══

  Coloana `site_analytics.source` nu se scria NICIODATA: 0 randuri completate din
  15.306, masurat pe 02.09.2026. Dar panoul comerciantului are o sectiune „Surse
  de trafic", iar acolo lipsa era transformata in afirmatie:

      const k = e.source ?? "direct";

  Deci fiecare comerciant vedea „Direct 100%", iar fluxul lui live spunea „Vizita
  via direct" la fiecare om. Nu era o cifra lipsa, era o cifra FALSA — si una pe
  care se iau hotarari: cine crede ca reclamele lui nu aduc pe nimeni le opreste.

  ⚠ SI `country` ERA SCRIS IN COD: `country: "RO"` pentru orice vizitator din
  lume. Acum se citeste din antetul pus de Vercel, iar daca lipseste ramane GOL.
  O necunoscuta scrisa ca fapt e chiar defectul pe care il reparam aici; n-are
  rost sa-l inlocuim cu altul.

  ⚠ REGULA CASEI, si singura care conteaza: absenta ramane absenta. Ce nu se
  masoara nu se completeaza cu presupuneri.
*/

export type SursaVizita = "direct" | "google" | "facebook" | "instagram" | "tiktok" | "other";

/*
  ⚠ `utm_source` BATE REFERRERUL, si nu invers. Cand comerciantul si-a etichetat
  singur linkul, el stie de unde vine mai bine decat browserul — iar browserul
  minte des: retelele trec prin redirectari care sterg sau inlocuiesc referrerul.
*/
const DUPA_UTM: Record<string, SursaVizita> = {
  google: "google", "google-ads": "google", adwords: "google", gads: "google",
  facebook: "facebook", fb: "facebook", meta: "facebook",
  instagram: "instagram", ig: "instagram",
  tiktok: "tiktok", "tiktok-ads": "tiktok",
};

/*
  ⚠ POTRIVIREA E PE GAZDA, NU PE SIRUL INTREG. Prima forma cauta „facebook"
  oriunde in referrer — si atunci `exemplu.ro/blog/despre-facebook` devenea trafic
  de pe Facebook. Domeniile se compara pe segmente.
*/
const DUPA_GAZDA: ReadonlyArray<readonly [RegExp, SursaVizita]> = [
  [/(^|\.)google\.[a-z.]+$/i, "google"],
  [/(^|\.)googleadservices\.com$/i, "google"],
  [/(^|\.)youtube\.com$/i, "google"],
  [/(^|\.)(facebook|fb)\.(com|me)$/i, "facebook"],
  [/(^|\.)messenger\.com$/i, "facebook"],
  [/(^|\.)instagram\.com$/i, "instagram"],
  [/(^|\.)tiktok\.com$/i, "tiktok"],
];

/** `www.` nu deosebeste doua gazde. */
function gazdaCurata(x: string): string {
  return x.toLowerCase().replace(/^www\./, "");
}

function gazdaDin(adresa: string): string | null {
  try {
    return gazdaCurata(new URL(adresa).hostname);
  } catch {
    return null;
  }
}

export type IntrareSursa = {
  /** `utm_source` din adresa paginii, daca exista. */
  utmSource?: string | null;
  /** Antetul `referer` al cererii. */
  referrer?: string | null;
  /** Gazda pe care sta magazinul ACUM (poate fi domeniul lui propriu). */
  gazdaProprie?: string | null;
  /** `gclid` / `fbclid` din adresa: semnale de reclama care supravietuiesc redirectarilor. */
  gclid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
};

/**
 * De unde a venit omul. Intoarce INTOTDEAUNA o valoare cunoscuta.
 *
 * ⚠ `direct` DE AICI E MASURAT, nu presupus — si asta e toata deosebirea fata de
 * ce era inainte. Un rand vechi are `source` NULL fiindca nimeni n-a intrebat; un
 * rand nou are `direct` fiindca s-a intrebat si nu era nimeni in spate.
 */
export function clasificaSursa(intrare: IntrareSursa): SursaVizita {
  const utm = intrare.utmSource?.trim().toLowerCase();
  if (utm) return DUPA_UTM[utm] ?? "other";

  /*
    ⚠ JETOANELE DE CLIC, INAINTEA REFERRERULUI. Un clic pe o reclama Google sau
    Meta ajunge des fara referrer (redirectari, politici de referrer stranse), dar
    cu `gclid`/`fbclid` in adresa. Fara randurile astea, exact traficul PLATIT —
    cel pentru care comerciantul da bani — ar fi fost numarat drept „direct".
  */
  if (intrare.gclid) return "google";
  if (intrare.fbclid) return "facebook";
  if (intrare.ttclid) return "tiktok";

  const ref = intrare.referrer?.trim();
  if (!ref) return "direct";

  const gazda = gazdaDin(ref);
  if (!gazda) return "direct";

  /*
    ⚠ NAVIGAREA PRIN PROPRIUL MAGAZIN NU E O TRIMITERE. Fara randul asta, fiecare
    pas dintr-o pagina in alta ar fi aratat ca trafic „de pe" propriul domeniu, si
    ar fi inecat sursele adevarate. E aceeasi greseala pe care am reparat-o azi in
    `attribution.ts`, unde referrerul intern era socotit extern.
  */
  const proprie = intrare.gazdaProprie ? gazdaCurata(intrare.gazdaProprie) : null;
  if (proprie && gazda === proprie) return "direct";

  for (const [tipar, sursa] of DUPA_GAZDA) if (tipar.test(gazda)) return sursa;
  return "other";
}

/**
 * Tara vizitatorului, din antetul pus de Vercel.
 *
 * ⚠ `null` CAND LIPSESTE, niciodata o valoare de rezerva. Randul de dinainte
 * scria `"RO"` pentru toata lumea — o presupunere care arata exact ca o
 * masuratoare, si care ar fi ramas asa si dupa ce magazinele ar fi inceput sa
 * vanda in afara.
 */
export function taraDinAnteturi(anteturi: { get(nume: string): string | null }): string | null {
  const t = anteturi.get("x-vercel-ip-country")?.trim().toUpperCase();
  return t && /^[A-Z]{2}$/.test(t) ? t : null;
}

/** Referrerul, pastrat scurt: coloana e pentru diagnostic, nu pentru arhiva. */
export function referrerScurt(referrer: string | null | undefined): string | null {
  const r = referrer?.trim();
  if (!r) return null;
  return r.slice(0, 500);
}

/**
 * Prima valoare a unui parametru de adresa.
 *
 * ⚠ Un parametru poate veni de mai multe ori (`?utm_source=a&utm_source=b`), si
 * atunci Next il da ca tablou. Folosit direct, `String(v)` ar fi produs `"a,b"` —
 * o sursa care nu exista si care ar fi aterizat linistit in `other`.
 */
export function primaValoare(v: string | string[] | undefined | null): string | null {
  if (Array.isArray(v)) return v[0]?.trim() || null;
  return v?.trim() || null;
}
