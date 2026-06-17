/**
 * Storefront navigation menu. Single source of truth lives in
 * `store_settings.page_content.menu` (reuses the existing editor + save path).
 * The header is empty (no menu, no hamburger) when this list is empty — so
 * existing stores are untouched until the merchant adds something.
 */

import { resolveHref } from "./href";

export type MenuItemType = "home" | "page" | "category" | "link";

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

/** Resolve the href for a menu item, honouring custom-domain vs /slug basePath. */
export function menuItemHref(item: MenuItem, basePath: string): string {
  switch (item.type) {
    case "home":
      return `${basePath}/`;
    case "page":
      return `${basePath}/${item.target ?? ""}`;
    case "category":
      // Categories are filtered on the store home via ?cat=
      return `${basePath}/?cat=${encodeURIComponent(item.target ?? "")}`;
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
