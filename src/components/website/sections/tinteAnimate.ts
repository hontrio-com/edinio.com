import type { CSSProperties } from "react";
import type { Pista } from "@/lib/website/animatie-bucla";

/**
 * Ce au comun machetele animate din „Soluția” in componenta lor (`IntegrariAnimat`,
 * `AutomatizariAnimat`, `VanzariAnimat`, `TehnicAnimat`): tintele pistelor, cu stilul lor de start,
 * si imaginile decodate inainte de pornire. O singura copie, ca doua machete sa nu poata ajunge sa faca acelasi lucru diferit.
 */

type Tinta = { [atribut: `data-${string}`]: string; style: CSSProperties };

/**
 * `data-<atribut>` si stilul de start al unui element animat. Valorile de start se scriu chiar din
 * pista lui, la clipa din HTML (`pornireS`), ca HTML-ul sa nu se poata departa de ce deseneaza
 * animatia in prima ei clipa.
 */
export function facatorDeTinte(atribut: string, piste: readonly Pista[], pornireS: number) {
  const initial = new Map(piste.map((p) => [p.tinta, p.scrie(p.valori(pornireS))]));
  const cheie = `data-${atribut}` as const;
  return (nume: string, stilFix?: CSSProperties): Tinta => {
    const k = initial.get(nume);
    const t: Tinta = {
      style: {
        ...stilFix,
        ...(typeof k?.transform === "string" ? { transform: k.transform } : {}),
        ...(k?.opacity !== undefined && k.opacity !== null ? { opacity: Number(k.opacity) } : {}),
      },
    };
    t[cheie] = nume;
    return t;
  };
}

/** Imaginile machetei, descarcate si decodate inainte de pornire. Sunt mici si aproape toate deja in cache. */
export function decodeazaImaginile(radacina: HTMLElement): Promise<unknown> {
  const imagini = Array.from(radacina.querySelectorAll<HTMLImageElement>("img"));
  for (const img of imagini) img.loading = "eager";
  return Promise.all(imagini.map((img) => img.decode().catch(() => undefined)));
}
