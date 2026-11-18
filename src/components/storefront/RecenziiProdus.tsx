import { Star } from "lucide-react";
import type { RecenziiProdus as Date } from "@/lib/themarketer/recenzii-server";

/**
 * Recenziile produsului, aduse din theMarketer (modulul Feedback). Componenta de server: nimic din ea nu
 * ruleaza in browser. Text de vitrina, deci fara diacritice; culorile si fonturile sunt ale temei.
 *
 * ⚠ Imaginile clientilor se arata cu `<img>` simplu: sunt pe CDN-ul theMarketer, iar redimensionatorul
 * nostru lucreaza numai pe depozitul propriu.
 */

function Stele({ valoare, marime = "h-4 w-4" }: { valoare: number; marime?: string }) {
  const pline = Math.round(valoare);
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${marime} ${i <= pline ? "fill-current text-[var(--st-text)]" : "text-[var(--st-border)]"}`} strokeWidth={1.5} />
      ))}
    </span>
  );
}

function zecimala(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function dataScurta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Bucharest" });
}

export function RecenziiProdus({ date }: { date: Date }) {
  const titlu = date.numar === 1 ? "1 recenzie" : `${date.numar} de recenzii`;
  return (
    <section aria-labelledby="recenzii-titlu" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--st-border)] pb-4">
        <div>
          <h2 id="recenzii-titlu" className="text-xl font-semibold text-[var(--st-text)]" style={{ fontFamily: "var(--st-font-heading)" }}>
            Recenzii
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-[var(--st-muted)]">
            <Stele valoare={date.medie} />
            <span>
              <span className="font-semibold text-[var(--st-text)]">{zecimala(date.medie)}</span> din 5, {titlu}
            </span>
          </p>
        </div>
      </div>
      <ul className="divide-y divide-[var(--st-border)]">
        {date.lista.map((r, i) => (
          <li key={i} className="py-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stele valoare={r.stele} marime="h-3.5 w-3.5" />
              <span className="sr-only">{zecimala(r.stele)} din 5</span>
              <span className="text-sm font-medium text-[var(--st-text)]">{r.autor}</span>
              {dataScurta(r.data) && <span className="text-xs text-[var(--st-muted)]">{dataScurta(r.data)}</span>}
            </div>
            {r.text && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--st-text)]">{r.text}</p>}
            {r.media.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.media.map((m, j) => m.tip === "image" ? (
                  <a key={j} href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={`Poza de la ${r.autor}`} loading="lazy" decoding="async"
                      className="h-20 w-20 rounded-[var(--st-radius-sm)] border border-[var(--st-border)] object-cover" />
                  </a>
                ) : (
                  <a key={j} href={m.url} target="_blank" rel="noopener noreferrer nofollow"
                    className="inline-flex h-20 items-center rounded-[var(--st-radius-sm)] border border-[var(--st-border)] px-3 text-xs font-medium text-[var(--st-text)] underline-offset-4 hover:underline">
                    Vezi video
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
