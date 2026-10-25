"use client";

import type { ContinutMagazin } from "../useContinutMagazin";
import { Nota, RandComutator } from "./ui";

/**
 * Continutul paginii de produs, ca sectiune: ce tine de pagina intreaga.
 *
 * Bucatile ei (beneficiile, pasii, intrebarile, estimarea livrarii, efectul
 * butonului) au plecat in etapa 4 in panoul blocului lor (`ContinutBloc`), iar
 * comutatoarele lor de vizibilitate le-a inlocuit ochiul blocului. Aici ramane
 * doar ce nu e al niciunui bloc.
 */
export function ContinutProdus({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza } = continut;

  return (
    <div className="space-y-6">
      <Nota>
        Bucățile paginii (titlul, prețul, beneficiile, întrebările și celelalte) sunt în arbore, sub Pagina de produs:
        acolo le muți, le ascunzi și le completezi.
      </Nota>

      <RandComutator titlu="Zoom pe imagine" ajutor="Mărește imaginea produsului când treci cu mouse-ul, pe calculator."
        pornit={pc.image_zoom?.enabled !== false}
        onSchimba={(v) => seteaza("produs", (p) => ({ ...p, image_zoom: { enabled: v } }))} />

    </div>
  );
}
