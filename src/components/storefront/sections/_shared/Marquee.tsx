"use client";

/** Trepte de viteza, de la cea mai lenta la cea mai rapida (secunde pe ciclu). */
// Secunde pentru o trecere completa. Randul poarta DOUA garnituri identice si se
// translateaza cu -50%, adica exact o garnitura: valorile raman cele dinainte,
// cand animatia statea pe fiecare copie in parte.
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
 * Marcajul NU mai e cel dinainte: animatia s-a mutat de pe fiecare copie pe rand,
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
  /** Cate copii are un grup; randul contine doua grupuri identice. */
  repetari?: number;
  /** Clasa unei repetari — marimea si culoarea textului le da cine o foloseste. */
  className: string;
  children: React.ReactNode;
}) {
  return (
    // Animatia sta pe rand, nu pe fiecare copie: `translateX` in procente se
    // masoara pe latimea proprie a elementului, deci copiile s-ar deplasa fiecare
    // cu jumatate din ele insele si textul ar sari la reluarea ciclului. Pe rand,
    // `-50%` inseamna exact primul grup, iar al doilea e identic cu el, deci
    // reluarea nu se vede. `w-max` tine randul la latimea continutului, ca
    // procentul sa insemne grupuri si nu latimea gazdei.
    // `marquee-banda` exista doar ca sa poata fi oprita din CSS la
    // `prefers-reduced-motion`: durata e dinamica, deci animatia trebuie sa stea
    // intr-un stil inline, iar un stil inline nu poate fi anulat de o clasa.
    // `durata` e timpul in care trece O copie, cum era cand animatia statea pe
    // fiecare copie in parte. Randul insa parcurge intr-un ciclu `repetari`
    // copii (jumatate din cele doua garnituri), deci ciclul lui dureaza de
    // `repetari` ori mai mult. Fara inmultirea asta banda mergea de opt ori mai
    // repede decat inainte si textul nu se putea citi.
    <div className="flex w-max whitespace-nowrap marquee-banda" style={{ animation: `marquee ${durata * repetari}s linear infinite` }}>
      {Array.from({ length: repetari * 2 }, (_, i) => (
        <span key={i} className={className}>
          {children}
        </span>
      ))}
    </div>
  );
}
