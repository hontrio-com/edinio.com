/**
 * Insignele proprii din subsolul magazinului: autorizatii, certificari, sigle de
 * autoritate.
 *
 * Exista fiindca unele magazine trebuie sa arate public o insigna care nu vine
 * de la platforma: un magazin veterinar arata insigna ANSVSA, altul un ISO, o
 * autorizatie de farmacie sau sigla unui producator. ANPC si Netopia sunt cablate
 * in `FooterLegal` fiindca sunt aceleasi pentru toata lumea; astea nu sunt.
 *
 * REGULILE STAU AICI, NU IN RANDARE. Continutul vine din `page_content`, adica
 * dintr-o coloana jsonb pe care o poate scrie orice cerere autentificata a
 * comerciantului — deci forma nu e garantata de nimic. Randarea primeste doar
 * lista deja curatata, si nu mai are de pus nicio intrebare.
 */

/** O insigna, asa cum e salvata in `page_content.footer_badges`. */
export interface InsignaFooterStocata {
  /** Cheie stabila pentru randare si pentru reordonare in editor. */
  id?: string;
  /** Adresa imaginii, incarcata in R2 prin editor. */
  image?: string;
  /** Unde duce apasarea. Optionala: unele insigne sunt doar informative. */
  href?: string;
  /** Textul citit de cititoarele de ecran. */
  alt?: string;
  /** Inaltimea la care se randeaza, in pixeli. Latimea se ia din proportie. */
  height?: number;
}

/** O insigna care a trecut de verificari si chiar se poate randa. */
export interface InsignaFooter {
  id: string;
  image: string;
  /** `null` inseamna „se arata, dar nu se apasa". */
  href: string | null;
  alt: string;
  /** Inaltimea de randare, deja incadrata intre limite. */
  height: number;
  /**
   * Cat de lata are voie sa iasa. Insignele au proportii foarte diferite — cea
   * de la ANSVSA e aproape patrata, cele de la ANPC sunt de doua ori si jumatate
   * mai late decat inalte. Fara plafon, una panoramica ar impinge singura restul
   * subsolului pe randul urmator.
   */
  maxWidth: number;
}

export interface InsigneFooter {
  insigne: InsignaFooter[];
  /** Titlul coloanei, sau `null` cand comerciantul l-a stins ori l-a golit. */
  titlu: string | null;
}

/**
 * Cate insigne incap. Subsolul are deja cinci blocuri pe un rand; peste asta
 * incepe sa impinga datele firmei pe randul urmator la orice ecran de laptop.
 */
export const MAX_INSIGNE_FOOTER = 6;

/** Ce scrie deasupra lor cand comerciantul n-a ales altceva. */
export const TITLU_INSIGNE_IMPLICIT = "Autorizatii";

/** Cel mai lung titlu acceptat. Peste, ar rupe coloana in loc sa o titreze. */
const MAX_TITLU = 40;
const MAX_ALT = 120;

/**
 * Inaltimea insignei, in pixeli: implicit si limite.
 *
 * Implicitul e la nivelul insignelor ANPC de alaturi (40px), ca o insigna noua sa
 * intre in rand fara nicio reglare. Minimul opreste o insigna ilizibila, iar
 * maximul opreste un subsol cat un ecran — amandoua sunt intervale de bun-simt,
 * nu praguri tehnice.
 */
export const INALTIME_INSIGNA_IMPLICITA = 44;
export const INALTIME_INSIGNA_MIN = 24;
export const INALTIME_INSIGNA_MAX = 160;

/** Cat de lata poate iesi o insigna fata de inaltimea ei, si plafonul absolut. */
const RAPORT_MAX_LATIME = 4;
const LATIME_MAX_ABSOLUTA = 320;

function inaltime(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return INALTIME_INSIGNA_IMPLICITA;
  return Math.min(Math.max(Math.round(n), INALTIME_INSIGNA_MIN), INALTIME_INSIGNA_MAX);
}

/**
 * O adresa pe care o putem pune intr-un `href` sau intr-un `src`.
 *
 * Doar `http`/`https`. `javascript:` si `data:` sunt exact motivul pentru care
 * verificarea asta exista: valoarea vine din baza, iar de acolo pana intr-un
 * atribut de link nu mai e nimic intre. Adresele relative cad si ele — o insigna
 * de autoritate duce prin definitie in afara magazinului, iar acceptarea lor ar
 * cere o baza pe care functia asta n-o are.
 */
function adresaSigura(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Citeste insignele si titlul lor din `page_content`.
 *
 * O insinga fara imagine valida NU se randeaza: fara ea n-ar mai fi o insigna, ci
 * un link gol. Una cu imagine buna si link stricat se randeaza fara link, ca
 * autorizatia sa se vada oricum — si fiindca a arunca continutul comerciantului
 * din cauza unui camp secundar ar fi mai rau decat a-l arata nefunctional.
 */
export function citesteInsigneFooter(pageContent: {
  footer_badges?: unknown;
  footer_badges_title?: unknown;
  footer_badges_title_enabled?: unknown;
} | null | undefined): InsigneFooter {
  const brut = Array.isArray(pageContent?.footer_badges) ? pageContent.footer_badges : [];

  const insigne: InsignaFooter[] = [];
  for (const [i, x] of brut.entries()) {
    if (insigne.length >= MAX_INSIGNE_FOOTER) break;
    if (!x || typeof x !== "object") continue;
    const b = x as InsignaFooterStocata;
    const image = adresaSigura(b.image);
    if (!image) continue;
    const h = inaltime(b.height);
    insigne.push({
      id: text(b.id, 64) || `insigna-${i}`,
      image,
      href: adresaSigura(b.href),
      // Fara text alternativ, o imagine care e singurul continut al unui link
      // ramane fara nume accesibil: cititorul de ecran anunta adresa. Rezerva nu
      // e frumoasa, dar e mai buna decat nimic.
      alt: text(b.alt, MAX_ALT) || TITLU_INSIGNE_IMPLICIT,
      height: h,
      maxWidth: Math.min(h * RAPORT_MAX_LATIME, LATIME_MAX_ABSOLUTA),
    });
  }

  // Titlul e pornit din oficiu (magazinele care aveau deja insigne nu-l pierd la
  // o schimbare de cod), dar golit din editor inseamna „fara titlu" — asta e
  // cererea celor care vor doar imaginea, fara niciun cuvant deasupra.
  const pornit = pageContent?.footer_badges_title_enabled !== false;
  const scris = pageContent?.footer_badges_title === undefined
    ? TITLU_INSIGNE_IMPLICIT
    : text(pageContent.footer_badges_title, MAX_TITLU);

  return { insigne, titlu: pornit && scris ? scris : null };
}
