"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * Numaratoare pana la sfarsitul unei oferte. `sfarsit` e `AAAA-LL-ZZTHH:MM`,
 * ora Romaniei (asa o scrie campul din editor).
 *
 * ⚠ Ora se socoteste in BROWSER, dupa montare: randata pe server, „mai sunt
 * 2 ore 14 minute” ar fi fost alt text decat cel din browser si o nepotrivire
 * la fiecare incarcare. Pana la montare nu se arata nimic.
 * ⚠ Dupa termen, numaratoarea DISPARE, nu ramane pe 00:00:00: o oferta
 * expirata care inca „se termina” e exact inselatoria pe care n-o vrem.
 */
export function Numaratoare({ sfarsit, text, culoare, className, style }: {
  sfarsit: string; text?: string; culoare: string;
  /** Pastila din jur: aici, nu la apelant, ca sa dispara odata cu numaratoarea (altfel ramanea o pastila goala). */
  className?: string; style?: React.CSSProperties;
}) {
  const [acum, setAcum] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setAcum(Date.now()), 1000);
    const prima = setTimeout(() => setAcum(Date.now()), 0);
    return () => { clearInterval(t); clearTimeout(prima); };
  }, []);

  const tinta = laOraRomaniei(sfarsit);
  if (acum === null || tinta === null || tinta <= acum) return null;
  const s = Math.floor((tinta - acum) / 1000);
  const zile = Math.floor(s / 86400);
  const ore = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const d2 = (n: number) => String(n).padStart(2, "0");

  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${className ?? ""}`} style={style}>
      <Clock className="h-4 w-4 shrink-0" style={{ color: culoare }} aria-hidden />
      <span className="text-muted-foreground">{text || "Oferta se încheie în"}</span>
      <span className="font-mono font-bold tabular-nums text-foreground" aria-live="off">
        {zile > 0 ? `${zile}z ` : ""}{d2(ore)}:{d2(min)}:{d2(sec)}
      </span>
    </div>
  );
}

/**
 * `AAAA-LL-ZZTHH:MM` citit ca ora ROMANIEI, oriunde ar fi vizitatorul.
 * Diferenta fata de UTC se afla din `Intl`, pentru ziua data (vara/iarna).
 */
function laOraRomaniei(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const [an, luna, zi, ora, minut] = m.slice(1).map(Number);
  const caUtc = Date.UTC(an, luna - 1, zi, ora, minut);
  const parti = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Bucharest", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(caUtc));
  const g = (t: string) => Number(parti.find((p) => p.type === t)?.value);
  const vazutLaBucuresti = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return caUtc - (vazutLaBucuresti - caUtc);
}
