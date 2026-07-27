"use client";

import type { ComponentType } from "react";
import { CheckoutPageTwoCol } from "./CheckoutPageTwoCol";
import type { CheckoutOrderInput } from "./checkout-core";

/**
 * Finalizarea comenzii pe pagina, in modelul ales de comerciant.
 *
 * Deocamdata un singur model — cel pe care il au aproape toate magazinele.
 * Urmatoarele intra aici, incarcate cu `next/dynamic`, ca fiecare magazin sa
 * descarce doar modelul lui.
 */
const MODELE: Record<string, ComponentType<CheckoutOrderInput>> = {
  page_two_col: CheckoutPageTwoCol,
};

export function CheckoutPageSection({ variant, ...props }: { variant: string } & CheckoutOrderInput) {
  const Model = MODELE[variant] ?? CheckoutPageTwoCol;
  return <Model {...props} />;
}
