"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { ZiRecuperare } from "@/lib/abandoned-cart";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ABANDONATE SI RECUPERATE, ZI CU ZI
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ BARE ALATURATE, NU SUPRAPUSE SI NU LINII.

  Suprapuse, ochiul le aduna - iar cele doua NU se aduna: un cos recuperat azi
  a fost abandonat saptamana trecuta, deci aceeasi zi numara lucruri venite din
  zile diferite.

  ⚠ Si nu linii: prima scriere desena doua linii, si pe date adevarate (unu-doua
  cosuri pe zi, cu goluri intre ele) iesea o linie lipita de zero, din care nu
  se vedea nimic. Numaratorile rare se citesc ca bare, nu ca o curba - o curba
  intre doua zile goale inventeaza o panta care n-a existat.

  ⚠ „Recuperate" e aici tot cea DOVEDITA (linkul deschis, apoi comanda in
  fereastra), ca pe cardul de deasupra. Doua intelesuri pe aceeasi pagina ar
  fi fost mai rau decat o cifra lipsa.
*/

/** Capatul de sus al axei: o cifra rotunda, putin peste cel mai mare punct. */
function plafon(maxim: number): number {
  const brut = Math.max(1, maxim) * 1.15;
  const ordin = 10 ** Math.floor(Math.log10(brut));
  for (const pas of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) {
    if (ordin * pas >= brut) return ordin * pas;
  }
  return ordin * 10;
}

function ziua(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

export function GraficRecuperare({ zile }: { zile: ZiRecuperare[] }) {
  if (zile.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nimic de arătat încă.</p>;
  }

  const maxim = Math.max(...zile.map((z) => Math.max(z.abandonate, z.recuperate)));
  /*
    ⚠ Pe ferestre lungi nu incap toate zilele pe axa. Se sar din N in N, dar
    ultima ramane mereu scrisa: fara ea, graficul pare ca se termina inainte
    de ziua de azi.
  */
  const pas = Math.max(1, Math.ceil(zile.length / 8));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={zile} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="ziua"
            tickFormatter={ziua}
            interval={pas - 1}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, plafon(maxim)]}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(v) => ziua(String(v))}
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="abandonate" name="Abandonate" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="recuperate" name="Recuperate (dovedit)" fill="var(--color-brand-dark)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
