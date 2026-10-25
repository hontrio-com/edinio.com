import { cartHref, cartOnPage, checkoutHref, checkoutOnPage, shopOnPage } from "@/lib/storefront/design/commerce";
import { PREVIEW_QUERY, SABLON_PARAM } from "@/lib/storefront/design/preview-protocol";
import { paginaSablonului } from "@/lib/storefront/design/sabloane-produs";
import { hrefCatalogPropriu, hrefProdus } from "@/lib/storefront/permalinkuri";
import type { SectionInstance, StoreDesign } from "@/lib/storefront/design/types";

/**
 * Paginile pe care le poate edita editorul unic, cu adresa previzualizarii si
 * sectiunile fiecareia.
 *
 * O singura lista, citita de bara de sus (alegerea paginii), de arbore (ce
 * sectiuni arata) si de previzualizare (unde se duce). Tinute separat, cele trei
 * ar fi ajuns sa nu mai fie de acord: un buton „Cos” care deschide pagina
 * principala, sau un arbore care arata cosul cand in dreapta e produsul.
 */

/**
 * `scurt` e numele din lista „Editezi” pe telefon: langa „Ieși” (4.7) lista are vreo 70 px de
 * text, iar trei pagini incepeau cu acelasi „Pagina”, deci aratau la fel.
 */
export const PAGINI_EDITOR = [
  { cheie: "acasa", eticheta: "Pagina principală", scurt: "Acasă" },
  { cheie: "produs", eticheta: "Pagina de produs", scurt: "Produs" },
  { cheie: "magazin", eticheta: "Pagina Magazin", scurt: "Magazin" },
  { cheie: "cos", eticheta: "Coșul", scurt: "Coșul" },
  { cheie: "comanda", eticheta: "Finalizarea comenzii", scurt: "Comanda" },
] as const;

export type CheiePagina = (typeof PAGINI_EDITOR)[number]["cheie"];

export function estePagina(v: unknown): v is CheiePagina {
  return PAGINI_EDITOR.some((p) => p.cheie === v);
}

/** Ce stie editorul despre magazin, cat ii trebuie ca sa aleaga pagina si adresa. */
export interface MagazinPentruPagini {
  slug: string;
  /** Un produs activ, pentru previzualizarea paginii de produs; `null` cand n-are niciunul. */
  produsSlug: string | null;
  /** Prefixele din Setari > Permalink-uri. */
  prefixProdus?: string;
  prefixMagazin?: string;
  /** Magazinul vinde un singur produs: pagina principala ESTE pagina lui. */
  unSingurProdus: boolean;
}

/**
 * Sectiunile paginii, in ordinea in care apar pe ea.
 *
 * Antetul si subsolul sunt comune tuturor paginilor; in arbore apar separat, ca
 * in Shopify. Pagina de produs, Magazinul, cosul si comanda sunt o singura
 * sectiune fiecare: galeria, varianta aleasa si pretul impart aceeasi stare,
 * deci se taie in blocuri abia in etapa 4.
 */
export function sectiunilePaginii(
  design: StoreDesign,
  pagina: CheiePagina,
  m: MagazinPentruPagini,
  /** Sablonul de produs editat (etapa 4b); `null` = Implicit. */
  sablon: string | null = null,
): SectionInstance[] {
  switch (pagina) {
    case "acasa":
      return m.unSingurProdus ? [design.product.page] : design.home;
    case "produs":
      return [paginaSablonului(design.product, sablon)];
    case "magazin":
      return [design.shop.page];
    case "cos":
      return [design.commerce.cartDrawer];
    case "comanda":
      return [design.commerce.checkout];
  }
}

/**
 * Pe ce pagina din editor sta o sectiune, pentru un clic dat in previzualizare.
 *
 * Intai pagina aleasa: antetul, subsolul si bara de anunt sunt pe toate, deci
 * raman acolo. Apoi celelalte, in ordinea din lista. Cazul pentru care exista:
 * pe „Coșul” cu cos in sertar previzualizarea arata prima pagina, iar un clic pe
 * banner nu avea niciun nod de deschis, deci nu facea nimic. `null` cand
 * sectiunea nu e pe nicio pagina (de exemplu una stinsa intre timp).
 */
export function paginaSectiunii(
  design: StoreDesign,
  id: string,
  curenta: CheiePagina,
  m: MagazinPentruPagini,
): CheiePagina | null {
  const comune = [design.chrome.announcement, design.chrome.header, design.chrome.footer];
  if (comune.some((s) => s?.id === id)) return curenta;
  // Pagina oricarui sablon de produs (4b) e tot „Pagina de produs”, oricare e sablonul editat acum.
  if (!m.unSingurProdus && (design.product.sabloane ?? []).some((s) => s.page.id === id)) return "produs";
  const ordinea = [curenta, ...PAGINI_EDITOR.map((p) => p.cheie).filter((p) => p !== curenta)];
  return ordinea.find((p) => sectiunilePaginii(design, p, m).some((s) => s.id === id)) ?? null;
}

/**
 * Adresa previzualizarii pentru pagina aleasa, in modul editor.
 *
 * Cand pagina nu exista ca pagina (cos in sertar, comanda in fereastra, produse
 * pe pagina principala), previzualizarea arata pagina principala, iar
 * `notaPaginii` spune de ce. O adresa catre o pagina inexistenta ar redirecta si
 * ar pierde semnele de editor pe drum.
 */
export function adresaPrevizualizarii(
  pagina: CheiePagina,
  design: StoreDesign,
  m: MagazinPentruPagini,
  /**
   * Pagina de produs cand designul are sabloane (etapa 4b): sablonul editat (`null` = Implicit) si,
   * daca s-a gasit, un produs care chiar il foloseste.
   */
  produs: { sablon?: string | null; slug?: string | null } = {},
): string {
  const radacina = `/${m.slug}`;
  const produsSlug = produs.slug ?? m.produsSlug;
  const cale = (() => {
    switch (pagina) {
      case "acasa":
        return radacina;
      case "produs":
        return !m.unSingurProdus && produsSlug ? hrefProdus(radacina, produsSlug, m.prefixProdus) : radacina;
      case "magazin":
        return shopOnPage(design) ? hrefCatalogPropriu(radacina, m.prefixMagazin) : radacina;
      case "cos":
        return cartOnPage(design) ? cartHref(radacina) : radacina;
      case "comanda":
        return checkoutOnPage(design) ? checkoutHref(radacina) : radacina;
    }
  })();
  /*
   * Cu sabloane, pagina de produs IMPUNE sablonul editat: altfel produsul din previzualizare ar fi
   * aratat sablonul LUI, nu pe cel din arbore. Fara sabloane, adresa ramane cea de dinainte.
   */
  const cuSabloane = pagina === "produs" && !m.unSingurProdus && (design.product.sabloane?.length ?? 0) > 0;
  const sablon = cuSabloane ? `&${SABLON_PARAM}=${encodeURIComponent(paginaSablonului(design.product, produs.sablon ?? null).id)}` : "";
  return `${cale}?${PREVIEW_QUERY}${sablon}`;
}

/**
 * De ce previzualizarea nu arata chiar pagina aleasa, daca e cazul.
 *
 * Textele trimit la locul din ACEST editor de unde se schimba lucrul, nu la un
 * ecran vechi: „Design sectiuni” nu mai exista.
 */
export function notaPaginii(pagina: CheiePagina, design: StoreDesign, m: MagazinPentruPagini): string | null {
  switch (pagina) {
    case "acasa":
      return m.unSingurProdus
        ? "Magazinul vinde un singur produs, deci pagina principală este chiar pagina lui."
        : null;
    case "produs":
      if (m.unSingurProdus) return "Magazinul vinde un singur produs: pagina lui este pagina principală.";
      return m.produsSlug ? null : "Adaugă un produs ca să vezi pagina de produs. Designul se poate alege și acum.";
    case "magazin":
      return shopOnPage(design)
        ? null
        : "Produsele stau acum pe pagina principală. Alege un design pentru Pagina Magazin ca produsele să aibă pagina lor.";
    case "cos":
      return cartOnPage(design)
        ? null
        : "Coșul se deschide ca sertar, peste pagina pe care e clientul. Alege un design de tip pagină ca să aibă pagina lui.";
    case "comanda":
      return checkoutOnPage(design)
        ? null
        : "Comanda se completează într-o fereastră, peste magazin. Alege un design de tip pagină ca să aibă pagina ei.";
  }
}
