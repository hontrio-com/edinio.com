"use client";

import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatPrice } from "@/lib/utils/format";
import {
  etichetaLunga, randuriGrafic,
  type DateVanzari, type Granulatie, type Masura, type RandGrafic,
} from "@/lib/vanzari";

/*
  Desenul graficului. Nu stie nimic despre perioade, canale sau butoane: primeste
  cifrele gata alese si le pune pe hartie. Starea e in `PanouVanzari`.
*/

/**
 * Capatul de sus al axei: o cifra rotunda, putin peste cel mai mare punct.
 *
 * ⚠ `maxim * 1.2` aducea in varful axei chiar cifra masurata, inmultita: „5.744"
 * scris deasupra unor trepte de 1.500 in 1.500. Treptele se citesc dintr-o
 * privire doar daca toate sunt rotunde, deci si capatul trebuie sa fie.
 */
function plafon(maxim: number): number {
  const brut = maxim * 1.15;
  const ordin = 10 ** Math.floor(Math.log10(brut));
  for (const pas of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) {
    if (ordin * pas >= brut) return ordin * pas;
  }
  return ordin * 10;
}

function scrie(v: number, bani: boolean): string {
  return bani ? formatPrice(v) : new Intl.NumberFormat("ro-RO").format(v);
}

function Varf({
  active, payload, bani, granulatie,
}: {
  active?: boolean;
  payload?: { payload: RandGrafic }[];
  bani: boolean;
  granulatie: Granulatie;
}) {
  const rand = payload?.[0]?.payload;
  if (!active || !rand) return null;

  return (
    <div className="rounded-xl bg-popover px-3.5 py-2.5 shadow-lg ring-1 ring-foreground/10">
      {rand.isoAcum && (
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          {etichetaLunga(rand.isoAcum, granulatie)}
        </p>
      )}
      <p className="text-sm font-bold text-foreground">
        {rand.acum === null ? "-" : scrie(rand.acum, bani)}
      </p>
      {rand.inainte !== null && (
        <p className="mt-1 text-xs text-muted-foreground">
          {scrie(rand.inainte, bani)}
          {rand.isoInainte && ` · ${etichetaLunga(rand.isoInainte, granulatie)}`}
        </p>
      )}
    </div>
  );
}

export function GraficVanzari({
  date, masura, comparatie,
}: {
  date: DateVanzari;
  masura: Masura;
  comparatie: boolean;
}) {
  const bani = masura !== "comenzi";
  const puncte = randuriGrafic(date, masura, comparatie);

  const maxim = Math.max(
    1,
    ...puncte.map((r) => Math.max(r.acum ?? 0, r.inainte ?? 0)),
  );

  const sus = plafon(maxim);
  const scurt = sus >= 10000;

  /* Cam sapte etichete pe axa, oricate bucati ar fi: la 90 de zile, scrise toate,
     s-ar suprapune intr-o dunga neagra. */
  const saritura = Math.max(0, Math.ceil(puncte.length / 7) - 1);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={puncte} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="umbraVanzari" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary, #008215)" stopOpacity={0.18} />
              <stop offset="95%" stopColor="var(--color-primary, #008215)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" vertical={false} />
          <XAxis
            dataKey="eticheta"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground, #6b7280)" }}
            axisLine={false}
            tickLine={false}
            interval={saritura}
            dy={6}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground, #6b7280)" }}
            axisLine={false}
            tickLine={false}
            width={44}
            domain={[0, sus]}
            /* ⚠ Scurtarea in „k" se hotaraste O SINGURA DATA, din cel mai mare
               punct, nu de la o treapta la alta: judecata pe fiecare valoare,
               aceeasi axa scria „800", „1k", „2k" — trei feluri de a scrie
               acelasi lucru, una sub alta. */
            tickFormatter={(v: number) =>
              v === 0 ? "0" : scurt ? `${Math.round(v / 1000)}k` : new Intl.NumberFormat("ro-RO").format(Math.round(v))
            }
          />
          <Tooltip
            content={<Varf bani={bani} granulatie={date.granulatie} />}
            cursor={{ stroke: "var(--color-border, #e5e7eb)", strokeWidth: 1 }}
          />
          {/* Perioada precedenta se deseneaza PRIMA, ca sa ramana in spate. */}
          {comparatie && (
            <Line
              type="monotone"
              dataKey="inainte"
              stroke="var(--color-muted-foreground, #9ca3af)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              /* Fara asta, o bucata lipsa ar taia linia in doua. */
              connectNulls
              isAnimationActive={false}
            />
          )}
          <Area
            type="monotone"
            dataKey="acum"
            stroke="var(--color-primary, #008215)"
            strokeWidth={2}
            fill="url(#umbraVanzari)"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
