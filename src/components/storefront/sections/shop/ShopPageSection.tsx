"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { ShopPageSidebar } from "./ShopPageSidebar";
import type { ShopPageProps } from "./shop-page.types";

/**
 * Dispecerul modelelor de pagina de catalog.
 *
 * Prima varianta se importa STATIC: o foloseste majoritatea magazinelor care
 * aleg pagina, deci un chunk separat n-ar economisi nimic si ar adauga un drum
 * la incarcare. Restul vin cu `next/dynamic`, randate tot pe server.
 *
 * Aici NU sta nicio stare si nicio interpretare de setari: datele de catalog si
 * reglajele deja normalizate vin din `StorefrontProvider`. Desfacute a doua oara
 * aici, ar fi existat doua seturi de implicite pentru acelasi camp lipsa.
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

export function ShopPageSection({ variant }: { variant: string; setari?: Record<string, unknown> }) {
  const { setariMagazin } = useStorefront();
  const Model = MODELE[variant] ?? ShopPageSidebar;

  return (
    <Model
      titlu={setariMagazin.titlu}
      coloane={setariMagazin.coloane}
      coloaneMobil={setariMagazin.coloaneMobil}
      arataTitlu={setariMagazin.arataTitlu}
      grupuriPornite={setariMagazin.grupuriFiltre}
    />
  );
}
