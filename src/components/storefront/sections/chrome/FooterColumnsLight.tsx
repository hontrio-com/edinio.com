"use client";

import type { SectionInstance } from "@/lib/storefront/design/types";
import { FooterColumns } from "./FooterColumns";

/** Varianta „columns": aceeasi structura, pe fundalul deschis al paginii. */
export function FooterColumnsLight({ sectiune }: { sectiune: SectionInstance }) {
  return <FooterColumns ton="deschis" sectiune={sectiune} />;
}
