"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { CartPageSplit } from "./CartPageSplit";
import type { CartPageProps } from "./cart-page.types";

/**
 * Pagina de cos, in modelul ales de comerciant.
 *
 * Primul model se importa direct — il foloseste majoritatea, si un chunk separat
 * pentru el n-ar economisi nimic. Restul se incarca la cerere: fiecare magazin
 * descarca doar modelul lui, nu toata galeria.
 */
const CartPageWide = dynamic(() => import("./CartPageWide").then((m) => m.CartPageWide), { ssr: true });
const CartPageCompact = dynamic(() => import("./CartPageCompact").then((m) => m.CartPageCompact), { ssr: true });

const MODELE: Record<string, ComponentType<CartPageProps>> = {
  page_split: CartPageSplit,
  page_wide: CartPageWide as ComponentType<CartPageProps>,
  page_compact: CartPageCompact as ComponentType<CartPageProps>,
};

export function CartPageSection({ variant, ...props }: { variant: string } & CartPageProps) {
  const Model = MODELE[variant] ?? CartPageSplit;
  return <Model {...props} />;
}
