"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { resolveActions } from "@/lib/storefront/design/actions";
import { GRUPURI_FILTRE, variantMeta } from "@/lib/storefront/design/registry";
import { ShopPageSidebar } from "./ShopPageSidebar";
import type { ShopPageProps } from "./shop-page.types";

/**
 * Dispecerul modelelor de pagina de catalog.
 *
 * Prima varianta se importa STATIC: o foloseste majoritatea magazinelor care
 * aleg pagina, deci un chunk separat n-ar economisi nimic si ar adauga un drum
 * la incarcare. Restul vin cu `next/dynamic`, randate tot pe server.
 *
 * Aici NU sta nicio stare: datele de catalog vin din `StorefrontProvider`, la
 * fel ca la grila paginii principale. Acelasi tipar ca `CartPageSection`.
 */
const ShopPageToolbar = dynamic(
  () => import("./ShopPageToolbar").then((m) => m.ShopPageToolbar),
  { ssr: true },
);
const ShopPageCompact = dynamic(
  () => import("./ShopPageCompact").then((m) => m.ShopPageCompact),
  { ssr: true },
);

const MODELE: Record<string, ComponentType<ShopPageProps>> = {
  sidebar: ShopPageSidebar,
  toolbar: ShopPageToolbar,
  compact: ShopPageCompact,
};

export function ShopPageSection({ variant, setari }: { variant: string; setari: Record<string, unknown> }) {
  const Model = MODELE[variant] ?? ShopPageSidebar;
  const implicite = variantMeta("shop_page", variant)?.defaults ?? {};
  const citeste = (cheie: string) => (cheie in setari ? setari[cheie] : implicite[cheie]);

  const titluBrut = citeste("titlu");
  const coloaneBrut = Number(citeste("coloane"));

  return (
    <Model
      titlu={typeof titluBrut === "string" && titluBrut.trim() ? titluBrut : "Toate produsele"}
      coloane={Number.isFinite(coloaneBrut) && coloaneBrut > 0 ? coloaneBrut : 4}
      arataTitlu={citeste("arataTitlu") !== false}
      // Aceeasi rezolvare ca la iconitele din header: ordinea salvata de
      // comerciant intersectata cu grupurile pe care le stim, ca un grup nou
      // adaugat mai tarziu sa apara pornit la coada in loc sa lipseasca.
      grupuriPornite={resolveActions(
        citeste("filtre"),
        GRUPURI_FILTRE.map((g) => g.value),
        GRUPURI_FILTRE.map((g) => g.value),
      )}
    />
  );
}
