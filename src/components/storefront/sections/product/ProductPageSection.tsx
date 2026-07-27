"use client";

import type { ComponentProps, ComponentType } from "react";
import dynamic from "next/dynamic";
import { ProductPageClassic } from "./ProductPageClassic";

const ProductPageDetailed = dynamic(
  () => import("./ProductPageDetailed").then((m) => m.ProductPageDetailed),
);

/**
 * Pagina de produs, in designul ales de comerciant.
 *
 * Dispecerul sta aici, nu in `SectionRenderer`: pagina de produs nu e o sectiune
 * asezata intr-o lista, ci intreaga pagina, si primeste noua props din ruta, nu
 * un `settings`. Cele doua rute care o randeaza (pagina de produs si magazinul
 * cu un singur produs) trec prin locul asta, deci o varianta noua inseamna un
 * fisier de componenta si o linie in lista de mai jos.
 *
 * Variantele care nu sunt „classic" se incarca cu `next/dynamic`, ca la
 * headere: altfel fiecare magazin ar descarca toate design-urile de pagina de
 * produs, nu doar pe al lui.
 *
 * `classic` trebuie sa ramana PRIMA cheie: parserul cade pe prima varianta
 * declarata cand cea salvata nu se recunoaste, iar o alta pe pozitia asta ar
 * muta magazinele pe un design nou fara ca nimeni sa fi cerut-o.
 */
const VARIANTE: Record<string, ComponentType<ComponentProps<typeof ProductPageClassic>>> = {
  classic: ProductPageClassic,
  detailed: ProductPageDetailed,
};

export function ProductPageSection({
  variant,
  ...props
}: { variant: string } & ComponentProps<typeof ProductPageClassic>) {
  const Varianta = VARIANTE[variant] ?? ProductPageClassic;
  return <Varianta {...props} />;
}
