/*
  ═══════════════════════════════════════════════════════════════════════════════
  ADRESA CARE AJUNGE IN GA4 NU E ADRESA DIN BARA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE POATE STA IN ADRESELE NOASTRE. Site-ul are cai care poarta lucruri ce n-au
  ce cauta intr-un raport:

      /blog/confirma?token=…        jetonul de confirmare a abonarii
      /blog/dezabonare?token=…      jetonul de dezabonare
      orice callback de autentificare cu `code`

  ⚠ SI DE CE E MAI GRAV DECAT PARE. Un jeton ajuns in `page_location` nu e doar o
  scapare de confidentialitate: cine are acces la rapoartele GA4 poate CONFIRMA
  sau DEZABONA in numele omului, fiindca alea sunt chiar cheile. Iar din GA4 nu
  se sterge.

  ⚠ SI NU SE POATE REZOLVA CU O LISTA DE PARAMETRI OPRITI. Un parametru nou
  adaugat maine ar trece. De aceea regula e inversa: se pastreaza NUMAI ce e pe
  lista alba, si numai pe caile care n-au nimic sensibil.
*/

/**
 * Parametrii de achizitie care au voie sa ramana.
 *
 * ⚠ Doar cei care spun DE UNDE a venit omul. `fbclid` si `ttclid` sunt dinadins
 * absenti: sunt identificatori de clic ai unor terti, si n-au ce cauta intr-un
 * raport de analiza.
 *
 * ⚠ CE SCRIA AICI PANA PE 02.09.2026, si era fals: „Ei se pastreaza separat,
 * pentru potrivirea conversiilor." Nu se pastrau nicaieri. Un audit din afara a
 * cautat sistemul acela si n-a gasit nimic — pe buna dreptate, fiindca nu exista.
 *
 * ⚠ CE E ADEVARAT ACUM. Nu-i pastram NOI, dar pixelii furnizorilor ii scriu
 * singuri in cookie-urile lor (`_fbc` la Meta, `_ttp` la TikTok), si de acolo ii
 * citim si ii trimitem inapoi cu conversia — vezi `MARTORI` din
 * `consimtamant/cookie.ts`. Deci click id-ul Meta ajunge la potrivire, prin
 * cookie-ul lor, nu printr-un depozit de-al nostru.
 *
 * ⚠ SI CE INCA NU FACEM: `ttclid` nu ajunge nicaieri (TikTok nu-l pune intr-un
 * cookie pe care sa-l citim), si nu tinem minte prima atingere. Scris ca sa nu
 * para altfel.
 */
export const PARAMETRI_PASTRATI = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "gclid", "gbraid", "wbraid", "dclid",
] as const;

/**
 * Caile pe care NU se pastreaza NICIUN parametru.
 *
 * ⚠ Nici macar cei de pe lista alba: pe o cale cu jeton, un `?token=…&utm_source=x`
 * ar face lista alba sa para o paza, pastrand tocmai ce trebuia scos daca cineva
 * inverseaza vreodata ordinea. Aici se taie tot, fara exceptie.
 */
const CAI_FARA_PARAMETRI = [
  "/blog/confirma",
  "/blog/dezabonare",
  "/auth/",
  "/login",
  "/register",
] as const;

/**
 * Adresa curata, pentru `page_location`.
 *
 * ⚠ INTOARCE SIRUL GOL LA O INTRARE CARE NU E O ADRESA, si asta e o purtare
 * dinadins, probata (`magistrala.test.ts`). Antetul de aici a spus multa vreme
 * „intoarce MEREU o adresa absoluta" — fals, si periculos pentru cine se bizuie
 * pe el: `new URL(curataAdresa(x))` arunca pe sirul gol.
 *
 * Pe o adresa VALIDA dar cu cale sensibila, se intorc originea si calea, fara
 * niciun parametru. Aia e ramura pe care o descria antetul vechi.
 *
 * ⚠ SI NU ARUNCA NICIODATA: o adresa ciudata n-are voie sa opreasca masuratoarea.
 */
export function curataAdresa(brut: string): string {
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    return "";
  }

  const cale = u.pathname;
  const eSensibila = (CAI_FARA_PARAMETRI as readonly string[]).some(
    c => cale === c || cale.startsWith(c),
  );

  /* ⚠ Fragmentul se arunca intotdeauna: poate purta orice, si nu spune nimic. */
  u.hash = "";

  if (eSensibila) {
    u.search = "";
    return u.toString();
  }

  const pastrati = new URLSearchParams();
  for (const p of PARAMETRI_PASTRATI) {
    const v = u.searchParams.get(p);
    /* Lungimea taiata: un parametru de campanie de o mie de caractere e o unealta,
       nu o campanie. */
    if (v) pastrati.set(p, v.slice(0, 100));
  }
  u.search = pastrati.toString();
  return u.toString();
}

/**
 * Calea singura, fara nimic altceva. Pentru parametrii de eveniment care vor
 * doar „pe ce pagina s-a intamplat".
 */
export function doarCalea(brut: string): string {
  try {
    return new URL(brut).pathname;
  } catch {
    return "";
  }
}

/*
  ═══════════════════════════════════════════════════════════════════════════════
  UNDE DUCE O LEGATURA — FARA SA DUCA SI CE E IN EA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA. `cta_destination` si `destination_path` luau `href`-ul BRUT din
  marcaj. Azi toate legaturile marcate sunt nevinovate (`/register`, `/preturi`),
  deci n-am gasit nicio scurgere vie. Dar infrastructura ingaduia una: e destul ca
  maine cineva sa scrie

      <a href="/ceva?token=abc" data-analytics-cta="...">

  si jetonul pleaca in GA4 — daca nu seamana cu vreun tipar personal, paza nu-l
  vede. Aceeasi clasa de defect ca la `page_location`, unde am invatat-o deja: nu
  te bizui pe fiecare om ca tine minte regula, muta regula in cod.

  ⚠ SI `mailto:` E CAZUL CEL MAI URAT. Un buton de contact scris
  `mailto:cineva@edinio.com` ar fi dus o adresa de email intr-un cont de analiza —
  chiar lucrul pe care toata paza anti-PII il opreste in alta parte. De aceea din
  schemele care nu sunt web se pastreaza NUMAI schema.
*/
export function curataDestinatia(brut: string | null | undefined): string | undefined {
  const h = (brut ?? "").trim();
  if (!h) return undefined;

  /* O ancora pe aceeasi pagina: nu poate purta nimic despre om. */
  if (h.startsWith("#")) return h.slice(0, 60);

  /* `mailto:`, `tel:`, `sms:`, `whatsapp:` — ramane doar felul, niciodata cine. */
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(h)?.[1]?.toLowerCase();
  if (schema && schema !== "http" && schema !== "https") return `${schema}:`;

  let u: URL;
  try {
    /* Baza conteaza numai pentru legaturile relative; pentru cele absolute e ignorata. */
    u = new URL(h, typeof window === "undefined" ? "https://www.edinio.com" : window.location.href);
  } catch {
    return undefined;
  }

  const acasa = typeof window === "undefined" ? "www.edinio.com" : window.location.hostname;
  /*
    ⚠ NICIODATA SIRUL DE INTEROGARE, nici pe al nostru, nici pe al altora. Ce ne
    trebuie e „unde duce", nu „cu ce". Iar pe cele din afara se pastreaza si gazda,
    fiindca acolo intrebarea chiar e „catre cine ii trimitem".
  */
  return u.hostname === acasa ? u.pathname : `${u.hostname}${u.pathname}`;
}
