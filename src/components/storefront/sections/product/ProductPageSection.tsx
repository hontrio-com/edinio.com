"use client";

import type { ComponentProps } from "react";
import { ProductPageClassic } from "./ProductPageClassic";

/**
 * Pagina de produs, in designul ales de comerciant.
 *
 * Dispecerul sta aici, nu in `SectionRenderer`: pagina de produs nu e o sectiune
 * asezata intr-o lista, ci intreaga pagina, si primeste noua props din ruta, nu
 * un `settings`. Cele doua rute care o randeaza (pagina de produs si magazinul
 * cu un singur produs) trec prin locul asta, deci o varianta noua inseamna un
 * fisier de componenta si o linie in lista de mai jos.
 *
 * Variantele care nu sunt „classic" se vor incarca cu `next/dynamic`, ca la
 * headere: altfel fiecare magazin ar descarca toate design-urile de pagina de
 * produs, nu doar pe al lui.
 */
const VARIANTE: Record<string, typeof ProductPageClassic> = {
  classic: ProductPageClassic,
};

export function ProductPageSection({
  variant,
  ...props
}: { variant: string } & ComponentProps<typeof ProductPageClassic>) {
  const Varianta = VARIANTE[variant] ?? ProductPageClassic;
  return <Varianta {...props} />;
}
