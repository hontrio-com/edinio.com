"use client";

/** Trepte de viteza, de la cea mai lenta la cea mai rapida (secunde pe ciclu). */
export const MARQUEE_SPEEDS = [80, 50, 30, 18, 10];

/** Cate secunde dureaza un ciclu, pentru treapta aleasa de comerciant (1-5). */
export function marqueeDuration(speed: number | undefined): number {
  return MARQUEE_SPEEDS[(speed ?? 3) - 1] ?? MARQUEE_SPEEDS[2];
}

/**
 * Banda cu text derulant.
 *
 * Continutul se repeta de mai multe ori ca banda sa para continua indiferent cat
 * de scurt e mesajul — cu o singura copie s-ar vedea golul dintre cicluri.
 *
 * Marcajul e cel dinainte, cand deruralea era scrisa direct in bara de anunt:
 * variantele de bara si header-ele care isi gazduiesc propria banda o folosesc
 * pe aceasta, in loc sa copieze animatia.
 */
export function Marquee({
  durata,
  repetari = 8,
  className,
  children,
}: {
  durata: number;
  repetari?: number;
  /** Clasa unei repetari — marimea si culoarea textului le da cine o foloseste. */
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex whitespace-nowrap">
      {Array.from({ length: repetari }, (_, i) => (
        <span key={i} className={className} style={{ animation: `marquee ${durata}s linear infinite` }}>
          {children}
        </span>
      ))}
    </div>
  );
}
