import { RESERVED_PAGE_SLUGS, SEGMENT_BRAND, SEGMENT_MAGAZIN } from "@/lib/pages/reserved-slugs";

/*
 * ═══ PERMALINK-URILE MAGAZINULUI (25.09.2026) ═══
 *
 * Comerciantul isi poate alege, din Setari > Permalink-uri, prefixul a trei feluri
 * de adrese: produsele (`/product/<slug>`), catalogul cu categoriile lui
 * (`/magazin`, `/magazin/<categorie>`) si brandurile (`/brand/<brand>`).
 *
 * ⚠ CE NU E EDITABIL, dinadins: cosul, finalizarea, contul, confirmarea, returul
 * si politicile. N-au valoare de cautare, iar adresele de intoarcere de la plata
 * (Stripe, Netopia, Klarna, iPay, Revolut) sunt legate de ele.
 *
 * ⚠ FARA SETARE, TOTUL E CA INAINTE. Valorile implicite sunt exact segmentele de
 * azi, iar orice valoare citita care nu trece regulile de mai jos cade pe implicit
 * (niciodata pe o adresa rupta).
 *
 * ⚠ ADRESELE VECHI NU MOR. Segmentul implicit si orice prefix folosit anterior de
 * magazin raman recunoscute si duc, prin redirectionare permanenta, la cel curent:
 * linkurile din Google, din feeduri, din emailurile deja trimise si din meniurile
 * salvate merg mai departe.
 *
 * Setarea sta in `page_content.permalinks`. Modulul e PUR (fara server), fiindca il
 * folosesc si componentele de client ale vitrinei.
 */

export type FelPermalink = "produs" | "magazin" | "brand";

export const FELURI_PERMALINK: readonly FelPermalink[] = ["produs", "magazin", "brand"];

export interface Permalinkuri {
  produs: string;
  magazin: string;
  brand: string;
}

/** Prefixele de azi. Adresele produse cu ele sunt identice cu cele de dinainte. */
export const PERMALINKURI_IMPLICITE: Readonly<Permalinkuri> = Object.freeze({
  produs: "product",
  magazin: SEGMENT_MAGAZIN,
  brand: SEGMENT_BRAND,
});

/** Cate prefixe vechi se tin minte pe fiecare fel (pentru redirectionari). */
export const ISTORIC_MAXIM = 10;

export interface SetarePermalinkuri extends Permalinkuri {
  /** Prefixele folosite inainte, ca adresele vechi sa redirectioneze. */
  anterioare: Record<FelPermalink, string[]>;
}

/** 1-40 caractere, litere mici, cifre si cratima, fara cratima la capete. */
const FORMA = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/*
 * Cuvintele rezervate pe care fiecare fel le poate totusi folosi: sunt ale LUI.
 * „product" e chiar ruta produsului, „magazin"/„shop" ale catalogului, iar
 * „brand"/„branduri"/„brands" ale brandurilor. Restul listei rezervate (cos,
 * checkout, cont, cautare, politici, api...) nu poate fi prefix: ruta statica ar
 * castiga, iar prefixul n-ar duce niciodata unde crede comerciantul.
 */
const REZERVATE_PERMISE: Record<FelPermalink, ReadonlySet<string>> = {
  produs: new Set(["product", "p"]),
  magazin: new Set(["magazin", "shop", "pagina", "pages"]),
  brand: new Set(["brand", "branduri", "brands"]),
};

const ETICHETE: Record<FelPermalink, string> = {
  produs: "produselor",
  magazin: "catalogului",
  brand: "brandurilor",
};

/** Motivul pentru care un prefix nu se poate folosi, sau null daca e bun. */
export function problemaPrefixului(fel: FelPermalink, valoare: string): string | null {
  if (!valoare) return `Prefixul ${ETICHETE[fel]} nu poate fi gol.`;
  if (valoare.length > 40) return `Prefixul ${ETICHETE[fel]} e prea lung (maxim 40 de caractere).`;
  if (!FORMA.test(valoare)) {
    return `Prefixul ${ETICHETE[fel]} poate avea doar litere mici fără diacritice, cifre și cratimă (nu la început sau la sfârșit).`;
  }
  if (RESERVED_PAGE_SLUGS.has(valoare) && !REZERVATE_PERMISE[fel].has(valoare)) {
    return `„${valoare}” este rezervat de platformă și nu poate fi prefixul ${ETICHETE[fel]}.`;
  }
  return null;
}

function textCurat(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/**
 * Setarea citita din `page_content`, TOLERANT: ce nu trece regulile cade pe
 * implicit. Doua feluri cu acelasi prefix (o setare stricata de mana) inseamna
 * toate trei pe implicit: o adresa ambigua e mai rea decat una veche.
 */
export function setareaPermalinkurilor(pageContent: unknown): SetarePermalinkuri {
  const brut = (pageContent && typeof pageContent === "object"
    ? (pageContent as { permalinks?: unknown }).permalinks
    : null) as Partial<Record<FelPermalink | "anterioare", unknown>> | null | undefined;

  const curente = { ...PERMALINKURI_IMPLICITE } as Permalinkuri;
  if (brut && typeof brut === "object") {
    for (const fel of FELURI_PERMALINK) {
      const v = textCurat(brut[fel]);
      if (v && !problemaPrefixului(fel, v)) curente[fel] = v;
    }
  }
  const valori = FELURI_PERMALINK.map((f) => curente[f]);
  const unice = new Set(valori).size === valori.length;
  const finale: Permalinkuri = unice ? curente : { ...PERMALINKURI_IMPLICITE };

  const anterioare = { produs: [], magazin: [], brand: [] } as Record<FelPermalink, string[]>;
  const brutAnterioare = brut && typeof brut === "object" ? brut.anterioare : null;
  if (brutAnterioare && typeof brutAnterioare === "object") {
    for (const fel of FELURI_PERMALINK) {
      const lista = (brutAnterioare as Record<string, unknown>)[fel];
      if (!Array.isArray(lista)) continue;
      for (const x of lista) {
        const v = textCurat(x);
        if (v && FORMA.test(v) && v !== finale[fel] && !anterioare[fel].includes(v)) anterioare[fel].push(v);
        if (anterioare[fel].length >= ISTORIC_MAXIM) break;
      }
    }
  }
  return { ...finale, anterioare };
}

/** Doar prefixele curente. */
export function permalinkuriDin(pageContent: unknown): Permalinkuri {
  const { produs, magazin, brand } = setareaPermalinkurilor(pageContent);
  return { produs, magazin, brand };
}

/** `true` cand magazinul foloseste exact prefixele de azi. */
export function suntImplicite(p: Permalinkuri): boolean {
  return FELURI_PERMALINK.every((f) => p[f] === PERMALINKURI_IMPLICITE[f]);
}

/**
 * Validarea unei setari noi, pe server. `paginiProprii` = slugurile paginilor
 * magazinului: o pagina `/<x>` si un catalog `/<x>` nu pot sta pe aceeasi adresa.
 */
export function valideazaPermalinkuri(
  cerute: Partial<Record<FelPermalink, unknown>>,
  paginiProprii: readonly string[],
  /**
   * Prefixele folosite inainte. Unul luat acum de ALT fel ar muta adresele vechi
   * ale felului lui pe noul proprietar: `/produse/x` (fost produs) n-ar mai
   * redirectiona, ci ar deveni o categorie inexistenta, adica 404.
   */
  anterioare?: Record<FelPermalink, readonly string[]>,
): { ok: true; valoare: Permalinkuri } | { ok: false; eroare: string } {
  const valoare = {} as Permalinkuri;
  for (const fel of FELURI_PERMALINK) {
    const v = textCurat(cerute[fel]);
    const problema = problemaPrefixului(fel, v);
    if (problema) return { ok: false, eroare: problema };
    valoare[fel] = v;
  }
  if (new Set(FELURI_PERMALINK.map((f) => valoare[f])).size !== FELURI_PERMALINK.length) {
    return { ok: false, eroare: "Cele trei prefixe trebuie să fie diferite între ele." };
  }
  if (anterioare) {
    for (const fel of FELURI_PERMALINK) {
      for (const altul of FELURI_PERMALINK) {
        if (altul !== fel && anterioare[altul].includes(valoare[fel])) {
          return {
            ok: false,
            eroare: `„${valoare[fel]}” a fost folosit înainte pentru ${ETICHETE[altul]}, iar adresele vechi de acolo duc încă la ele. Alege alt prefix pentru ${ETICHETE[fel]}.`,
          };
        }
      }
    }
  }
  const pagini = new Set(paginiProprii.map((s) => s.toLowerCase()));
  for (const fel of FELURI_PERMALINK) {
    if (pagini.has(valoare[fel])) {
      return {
        ok: false,
        eroare: `Ai deja o pagină cu linkul „${valoare[fel]}”. Alege alt prefix pentru ${ETICHETE[fel]} sau schimbă linkul paginii.`,
      };
    }
  }
  return { ok: true, valoare };
}

/**
 * Setarea de scris dupa o schimbare: prefixele vechi intra in istoric (ca
 * adresele lor sa redirectioneze), iar cel nou iese din istoric daca era acolo.
 * Segmentul implicit nu se tine in istoric: e recunoscut mereu.
 */
export function urmatoareaSetare(veche: SetarePermalinkuri, noua: Permalinkuri): SetarePermalinkuri {
  const anterioare = { produs: [], magazin: [], brand: [] } as Record<FelPermalink, string[]>;
  for (const fel of FELURI_PERMALINK) {
    const lista = [veche[fel], ...veche.anterioare[fel]];
    for (const v of lista) {
      if (v === noua[fel] || v === PERMALINKURI_IMPLICITE[fel] || anterioare[fel].includes(v)) continue;
      anterioare[fel].push(v);
      if (anterioare[fel].length >= ISTORIC_MAXIM) break;
    }
  }
  return { ...noua, anterioare };
}

/**
 * Ce fel de adresa e un prim segment dupa magazin.
 *   - `curent: true`  = prefixul de acum: se randeaza;
 *   - `curent: false` = implicitul sau un prefix vechi: se redirectioneaza.
 * Prefixele CURENTE se verifica primele, pe toate felurile: daca produsul a luat
 * vechiul prefix al brandurilor, adresa e a produsului.
 *
 * ⚠ EXACT, cu litere mari si mici. Rutele Next sunt sensibile la ele: `/Magazin`
 * si `/Product/x` dau azi 404 la orice magazin. Comparat fara diferenta, captura-tot
 * le-ar fi randat cu 200, adica o schimbare la TOATE magazinele, si cu setare, si fara.
 */
export function felulSegmentului(
  segment: string,
  s: SetarePermalinkuri,
): { fel: FelPermalink; curent: boolean } | null {
  const seg = segment;
  for (const fel of FELURI_PERMALINK) if (s[fel] === seg) return { fel, curent: true };
  for (const fel of FELURI_PERMALINK) {
    if (PERMALINKURI_IMPLICITE[fel] === seg || s.anterioare[fel].includes(seg)) return { fel, curent: false };
  }
  return null;
}

/* ─── Adresele ─────────────────────────────────────────────────────────── */

/** Adresa unui produs. `baza` = `basePath` (relativ) sau radacina absoluta. */
export function hrefProdus(baza: string, slugSauId: string, prefix: string = PERMALINKURI_IMPLICITE.produs): string {
  return `${baza}/${prefix}/${slugSauId}`;
}

/** Radacina catalogului, cand catalogul are pagina lui. */
export function hrefCatalogPropriu(baza: string, prefix: string = PERMALINKURI_IMPLICITE.magazin): string {
  return `${baza}/${prefix}`;
}

/** Adresa unui brand, din segmentul lui deja calculat. */
export function hrefBrandSegment(baza: string, segment: string, prefix: string = PERMALINKURI_IMPLICITE.brand): string {
  return `${baza}/${prefix}/${segment}`;
}
