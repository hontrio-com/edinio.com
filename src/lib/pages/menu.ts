/**
 * Storefront navigation menu. Single source of truth lives in
 * `store_settings.page_content.menu` (reuses the existing editor + save path).
 * The header is empty (no menu, no hamburger) when this list is empty — so
 * existing stores are untouched until the merchant adds something.
 */

import { hrefCategorie, radacinaMagazin } from "@/lib/storefront/category-href";
import { resolveHref } from "./href";

/*
 * Numele tipurilor sunt istorice si nu se pot schimba: sunt salvate ca atare in
 * `page_content.menu` la fiecare magazin. `home` inseamna PRODUSE (eticheta lui
 * e „Magazin" si duce la pagina de catalog cand exista), iar prima pagina a
 * magazinului e `acasa`. Redenumite, meniurile deja salvate ar fi ramas cu
 * intrari de un tip pe care codul nu-l mai stie, adica cu linkuri moarte.
 */
export type MenuItemType = "home" | "acasa" | "page" | "category" | "link";

export interface MenuItem {
  id: string;
  type: MenuItemType;
  label: string;
  /** page slug | category id | absolute/relative URL. Unused for "home". */
  target?: string;
}

let mcounter = 0;
export function newMenuItemId(): string {
  mcounter += 1;
  return `m_${Date.now().toString(36)}_${mcounter.toString(36)}`;
}

/**
 * Resolve the href for a menu item, honouring custom-domain vs /slug basePath.
 *
 * `paginaCatalog` e pagina care gazduieste produsele: pagina de Magazin daca
 * magazinul si-a activat-o, altfel chiar radacina magazinului. Il folosesc si
 * categoriile, si intrarea „Magazin" — in editor scrie „link catre produsele
 * magazinului", iar de cand catalogul poate avea pagina lui, produsele nu mai
 * sunt neaparat pe prima pagina. Magazinele fara pagina de catalog nu simt
 * nimic: acolo cele doua adrese coincid.
 */
export function menuItemHref(
  item: MenuItem,
  basePath: string,
  paginaCatalog: string = basePath,
): string {
  switch (item.type) {
    case "home":
      // Not `${basePath}/`: with a slug that trailing slash costs a 308 on
      // every click, and Search Console files each one as a redirect.
      return radacinaMagazin(paginaCatalog);
    case "acasa":
      // Prima pagina, mereu — chiar si cand produsele s-au mutat pe pagina lor.
      return radacinaMagazin(basePath);
    case "page":
      return `${basePath}/${item.target ?? ""}`;
    case "category":
      // Categories are filtered on the catalog page via ?cat=
      return hrefCategorie(paginaCatalog, item.target ?? "");
    case "link":
      // Reuse the href resolver so javascript:/data: schemes are rejected.
      return resolveHref(item.target, basePath);
    default:
      return "#";
  }
}

export function isExternalLink(item: MenuItem): boolean {
  return item.type === "link" && /^https?:\/\//i.test(item.target ?? "");
}

/** Id-ul intrarii implicite. Fix, ca sa fie recunoscuta si dupa ce e salvata. */
export const ID_ACASA = "sys_acasa";

/**
 * Meniul asa cum il vede vizitatorul: cu „Acasa" in fata.
 *
 * Orice magazin are o prima pagina, deci orice meniu are un drum inapoi la ea.
 * Pana acum nu-l avea decat daca si-l adauga comerciantul de mana, iar cine intra
 * pe o pagina de produs sau pe Contact ramanea fara nicio cale de intoarcere in
 * afara logo-ului — pe care nu toata lumea il incearca.
 *
 * Intrarea e IMPLICITA, nu scrisa in baza: altfel ar fi cerut o migrare peste
 * toate magazinele si tot ar fi lipsit de la cele create dupa ea. Se
 * materializeaza singura la prima salvare din editor, iar stearga cine nu o vrea
 * — atunci ramane `menu_fara_acasa`, si functia asta n-o mai adauga.
 */
export function meniuCuAcasa(menu: MenuItem[], faraAcasa?: boolean): MenuItem[] {
  if (faraAcasa || menu.some((m) => m.type === "acasa")) return menu;
  return [{ id: ID_ACASA, type: "acasa", label: "Acasa" }, ...menu];
}

/**
 * Intrarea din meniu arata pagina pe care suntem.
 *
 * Scrisa intr-un singur loc fiindca o citesc sase headere si meniul clasic, iar
 * pana acum fiecare avea propria conditie — toate uitand de „Acasa", singura
 * intrare care nu se recunoaste dupa slug.
 */
export function esteActiv(
  item: MenuItem,
  { currentPageSlug, isHome }: { currentPageSlug?: string | null; isHome?: boolean },
): boolean {
  if (item.type === "acasa") return isHome === true;
  return item.type === "page" && !!currentPageSlug && item.target === currentPageSlug;
}
