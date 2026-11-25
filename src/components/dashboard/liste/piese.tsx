/*
  Piesele mici ale listelor din panou (Comenzi, Retururi, Decontări): banii si datele scrise la
  fel peste tot, sigla mica de langa un numar, poza unui produs si teancul de poze.

  Au pornit in prototipul paginii de Comenzi (24.11.2026) si au fost mutate aici cand listele au
  intrat in paginile adevarate (25.11.2026). Fara „use client”: nimic de aici nu tine stare.
*/

import Image from "next/image";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatPriceValue } from "@/lib/utils/format";
import type { Sigla } from "@/lib/integrari/sigle";

/** Sigla mica, nebuton: langa un numar de AWB sau de factura. */
export function SiglaMica({ sigla, className }: { sigla: Sigla; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sigla.logo}
      alt={sigla.nume}
      title={sigla.nume}
      loading="lazy"
      decoding="async"
      className={cn("h-4 w-auto max-w-[52px] flex-shrink-0 object-contain", className)}
      style={sigla.inversat ? { filter: "invert(1)" } : undefined}
    />
  );
}

/* ── Bani si date ─────────────────────────────────────────────────────────── */

/** „163,98 lei”, sau in moneda marketplace-ului. */
export function suma(valoare: number, moneda = "lei"): string {
  return `${formatPriceValue(Math.round(valoare * 100) / 100)} ${moneda}`;
}

const ORA_RO = { timeZone: "Europe/Bucharest" } as const;
const F_SCURT = new Intl.DateTimeFormat("ro-RO", { ...ORA_RO, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const F_ORA = new Intl.DateTimeFormat("ro-RO", { ...ORA_RO, hour: "2-digit", minute: "2-digit" });
const F_ZI = new Intl.DateTimeFormat("ro-RO", { ...ORA_RO, weekday: "long", day: "numeric", month: "long" });
const F_CHEIE_ZI = new Intl.DateTimeFormat("en-CA", { ...ORA_RO, year: "numeric", month: "2-digit", day: "2-digit" });
const F_LUNG = new Intl.DateTimeFormat("ro-RO", { ...ORA_RO, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * ⚠ `Intl.DateTimeFormat.format` ARUNCA pe o data care nu e data („Invalid time value”). O clipa
 * lipsa sau stricata pe un singur rand ar darama toata lista; aici ea se scrie goala.
 */
const scrie = (f: Intl.DateTimeFormat) => (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : f.format(d);
};

/** „18 sept., 11:52”, la ora Romaniei: aceeasi pe server si in browser. */
export const dataScurta = scrie(F_SCURT);
export const ora = scrie(F_ORA);
export const ziuaLunga = scrie(F_ZI);
export const cheiaZilei = scrie(F_CHEIE_ZI);
export const dataLunga = scrie(F_LUNG);

/* ── Pozele produselor ────────────────────────────────────────────────────── */

export function PozaProdus({ poza, nume, marime = 36, className }: { poza: string | null; nume: string; marime?: number; className?: string }) {
  return (
    <span
      className={cn("grid flex-shrink-0 place-items-center overflow-hidden rounded-md bg-muted ring-1 ring-black/5", className)}
      style={{ width: marime, height: marime }}
      title={nume}
    >
      {poza
        ? <Image src={poza} alt="" width={64} height={64} className="h-full w-full object-cover" />
        : <Package className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />}
    </span>
  );
}

/** Primele poze, una peste alta, si cate produse mai sunt. */
export function TeancPoze({ produse, marime = 36, cate = 3 }: {
  /** Produsele unei comenzi sau ale unei cereri de retur: doar numele si poza. */
  produse: { nume: string; poza: string | null }[];
  marime?: number;
  cate?: number;
}) {
  const aratate = produse.slice(0, cate);
  const rest = produse.length - aratate.length;
  return (
    <span className="flex items-center">
      {aratate.map((p, i) => (
        <PozaProdus
          key={i}
          poza={p.poza}
          nume={p.nume}
          marime={marime}
          className={cn("ring-2 ring-white", i > 0 && "-ml-2")}
        />
      ))}
      {rest > 0 && <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">+{rest}</span>}
    </span>
  );
}
