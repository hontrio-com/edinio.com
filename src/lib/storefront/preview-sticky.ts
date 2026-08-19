import { EDITOR_PARAM } from "./design/preview-protocol";

/**
 * Semnele care trebuie sa supravietuiasca oricarei navigari din previzualizare.
 *
 * `preview` e cel care conteaza: `proxy.ts` sare peste redirectarea catre `www`
 * si peste cea catre domeniul propriu doar cand il vede. `editor` merge cu el ca
 * modul de design sa nu se piarda la un pas.
 */
export const SEMNE_LIPICIOASE = ["preview", EDITOR_PARAM] as const;

/**
 * Aceeasi adresa, dar purtand mai departe semnele de previzualizare.
 *
 * ⚠ FARA ASTA, PRIMUL CLICK DIN PREVIZUALIZARE O FACE ALBA.
 *
 * Toti constructorii de adrese ai magazinului — `hrefCategorie`, `hrefCatalog`,
 * `cartHref`, `checkoutHref` — scriu adrese curate, ceea ce e corect pentru un
 * vizitator si gresit pentru iframe-ul editorului. O adresa fara `preview=1`
 * cade in redirectarile din `proxy.ts`, iar acelea sunt cross-origin: raspunsul
 * pleaca spre `www.edinio.com` sau spre domeniul propriu al magazinului, iar
 * `X-Frame-Options: SAMEORIGIN` il refuza. Comerciantul apasa o categorie si
 * ramane cu un dreptunghi gol si „refused to connect" in consola.
 *
 * Se lucreaza pe SIR, nu pe `URL`: adresele catalogului codifica spatiile cu
 * `%20` peste tot — canonicale, linkuri de categorie, redirectari — iar o
 * plimbare prin `URLSearchParams` le-ar rescrie cu `+` si ar produce o A DOUA
 * adresa pentru exact acelasi continut.
 *
 * Adresele care nu sunt cai interne (`https://`, `//alt-domeniu`, `tel:`,
 * `mailto:`, o ancora) se intorc neatinse: acolo semnele n-ar avea ce cauta, iar
 * pe `//` lipirea lor ar insemna sa trimitem starea editorului pe alt domeniu.
 */
export function cuSemnePastrate(href: string, cautareCurenta: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;

  const curente = new URLSearchParams(cautareCurenta);
  const [faraAncora, ancora] = taie(href, "#");
  const [cale, interogare] = taie(faraAncora, "?");

  const deAdaugat = SEMNE_LIPICIOASE.filter((cheie) => {
    const valoare = curente.get(cheie);
    if (valoare === null) return false;
    return !new URLSearchParams(interogare).has(cheie);
  }).map((cheie) => `${cheie}=${encodeURIComponent(curente.get(cheie) as string)}`);

  if (deAdaugat.length === 0) return href;

  const interogareNoua = [interogare, ...deAdaugat].filter(Boolean).join("&");
  return `${cale}?${interogareNoua}${ancora ? `#${ancora}` : ""}`;
}

/**
 * Sirul de interogare al unei cereri de server, din `searchParams`.
 *
 * `cuSemnePastrate` lucreaza pe sir fiindca in browser exista `location.search`;
 * pe server exista un obiect. Aici e puntea, ca redirectarile de pe server sa
 * poata pastra aceleasi semne — o redirectare care le arunca scoate iframe-ul
 * editorului din previzualizare, si pe domeniu propriu il lasa alb de tot.
 */
export function sirDinSp(sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const cheie of SEMNE_LIPICIOASE) {
    const valoare = sp[cheie];
    const prima = Array.isArray(valoare) ? valoare[0] : valoare;
    if (prima) q.set(cheie, prima);
  }
  const sir = q.toString();
  return sir ? `?${sir}` : "";
}

/** Taie sirul la prima aparitie a separatorului. Restul poate lipsi. */
function taie(s: string, separator: string): [string, string] {
  const i = s.indexOf(separator);
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}
