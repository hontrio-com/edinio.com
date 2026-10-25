import { cartHref, cartOnPage, checkoutHref, checkoutOnPage, shopOnPage } from "@/lib/storefront/design/commerce";
import { PREVIEW_QUERY } from "@/lib/storefront/design/preview-protocol";
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

export const PAGINI_EDITOR = [
  { cheie: "acasa", eticheta: "Pagina principală" },
  { cheie: "produs", eticheta: "Pagina de produs" },
  { cheie: "magazin", eticheta: "Pagina Magazin" },
  { cheie: "cos", eticheta: "Coșul" },
  { cheie: "comanda", eticheta: "Finalizarea comenzii" },
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
export function sectiunilePaginii(design: StoreDesign, pagina: CheiePagina, m: MagazinPentruPagini): SectionInstance[] {
  switch (pagina) {
    case "acasa":
      return m.unSingurProdus ? [design.product.page] : design.home;
    case "produs":
      return [design.product.page];
    case "magazin":
      return [design.shop.page];
    case "cos":
      return [design.commerce.cartDrawer];
    case "comanda":
      return [design.commerce.checkout];
  }
}

/**
 * Adresa previzualizarii pentru pagina aleasa, in modul editor.
 *
 * Cand pagina nu exista ca pagina (cos in sertar, comanda in fereastra, produse
 * pe pagina principala), previzualizarea arata pagina principala, iar
 * `notaPaginii` spune de ce. O adresa catre o pagina inexistenta ar redirecta si
 * ar pierde semnele de editor pe drum.
 */
export function adresaPrevizualizarii(pagina: CheiePagina, design: StoreDesign, m: MagazinPentruPagini): string {
  const radacina = `/${m.slug}`;
  const cale = (() => {
    switch (pagina) {
      case "acasa":
        return radacina;
      case "produs":
        return !m.unSingurProdus && m.produsSlug ? hrefProdus(radacina, m.produsSlug, m.prefixProdus) : radacina;
      case "magazin":
        return shopOnPage(design) ? hrefCatalogPropriu(radacina, m.prefixMagazin) : radacina;
      case "cos":
        return cartOnPage(design) ? cartHref(radacina) : radacina;
      case "comanda":
        return checkoutOnPage(design) ? checkoutHref(radacina) : radacina;
    }
  })();
  return `${cale}?${PREVIEW_QUERY}`;
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
