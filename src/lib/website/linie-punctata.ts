import type { CSSProperties } from "react";

/**
 * Liniile punctate din grila secțiunii „SEO".
 *
 * ═══ DE CE NU SUNT BORDURI ═══
 *
 * `border-style: dotted` și `dashed` NU LASĂ LUNGIMEA LINIUȚEI SĂ FIE ALEASĂ:
 * browserul o socotește singur din grosime — punctul iese cât grosimea, liniuța
 * cam de trei ori cât ea. Deci singurul fel de a face liniile mai vizibile cu o
 * bordură e să le ÎNGROȘI, iar clientul a cerut limpede altceva: „nu mai groase,
 * fă liniile mai lungi".
 *
 * Aici liniile sunt desenate ca fundal, cu `repeating-linear-gradient`: un
 * gradient care ține culoarea pe `linie` pixeli, apoi nimic pe `gol` pixeli.
 * Așa lungimea liniuței și golul dintre ele se aleg fiecare aparte, iar grosimea
 * rămâne mică.
 *
 * ⚠ FUNDALUL NU OCUPĂ LOC ÎN AȘEZARE, cum ocupa bordura. Cine schimbă asta
 * înapoi pe borduri trebuie să știe că grila se lățește cu grosimea lor.
 */

export const PUNCTAT = {
  /**
   * Același gri ca liniile punctate de pe pagina de start (`DASH_ON_WHITE`,
   * #DCDCE3), dus puțin mai închis. Motivul e la fel ca acolo: o linie întreruptă
   * are jumătate din lungime goală, deci la aceeași culoare cântărește vizibil
   * mai puțin decât una continuă și se pierde pe alb.
   */
  culoare: "#C6C6D2",
  /** Grosimea, în pixeli. Rămâne mică — clientul a cerut lungi, nu groase. */
  grosime: 2,
  /** Cât ține o liniuță. */
  linie: 14,
  /**
   * Cât ține golul dintre două liniuțe.
   *
   * Mai mic decât liniuța, dinadins: la gol egal cu liniuța, șirul se apropie de
   * o linie continuă pe jumătate stinsă. Cu liniuța mai lungă decât golul se
   * vede că sunt bucăți, dar linia se citește tot ca linie.
   */
  gol: 9,
} as const;

export type Latura = "sus" | "jos" | "stanga" | "dreapta";

/**
 * O linie punctată singură, care umple elementul pe care stă.
 *
 * Pentru despărțiturile dintre celule, unde linia e un element al ei, nu o
 * latură a altuia. Motivul e că despărțitura verticală apare doar de la `md` în
 * sus, iar asta se spune curat printr-un `hidden md:block` pe element; ca fundal
 * ar fi cerut citirea lățimii ferestrei în JS, adică un component de client pe o
 * secțiune care altfel se desenează întreagă pe server.
 */
export function liniePunctata(directie: "orizontala" | "verticala"): CSSProperties {
  const { culoare, linie } = PUNCTAT;
  const capat = linie + PUNCTAT.gol;
  const catre = directie === "orizontala" ? "to right" : "to bottom";

  return {
    backgroundImage: `repeating-linear-gradient(${catre}, ${culoare} 0 ${linie}px, transparent ${linie}px ${capat}px)`,
  };
}

/** Cât ține un tipar întreg: o liniuță plus golul de după ea. */
export function pas(): number {
  return PUNCTAT.linie + PUNCTAT.gol;
}

/**
 * Stilul care desenează liniile punctate pe laturile cerute.
 *
 * Se dă unui element pe care laturile alea au rost: rama întreagă pe grilă,
 * despărțiturile pe celule.
 *
 * ⚠ ORDINEA celor patru liste (`image`, `size`, `position`) trebuie să fie
 * ACEEAȘI, altfel o linie de sus capătă mărimea uneia laterale și dispare —
 * de asta se construiesc împreună, dintr-o singură buclă, nu din patru șiruri
 * scrise de mână.
 */
export function liniiPunctate(laturi: readonly Latura[]): CSSProperties {
  const { culoare, grosime, linie } = PUNCTAT;
  const capat = linie + PUNCTAT.gol;

  /* Pe orizontală liniuțele merg la dreapta, pe verticală în jos. */
  const orizontala = `repeating-linear-gradient(to right, ${culoare} 0 ${linie}px, transparent ${linie}px ${capat}px)`;
  const verticala = `repeating-linear-gradient(to bottom, ${culoare} 0 ${linie}px, transparent ${linie}px ${capat}px)`;

  const desen: Record<Latura, { imagine: string; marime: string; loc: string }> = {
    sus: { imagine: orizontala, marime: `100% ${grosime}px`, loc: "0 0" },
    jos: { imagine: orizontala, marime: `100% ${grosime}px`, loc: "0 100%" },
    stanga: { imagine: verticala, marime: `${grosime}px 100%`, loc: "0 0" },
    dreapta: { imagine: verticala, marime: `${grosime}px 100%`, loc: "100% 0" },
  };

  const alese = laturi.map((l) => desen[l]);

  return {
    backgroundImage: alese.map((d) => d.imagine).join(", "),
    backgroundSize: alese.map((d) => d.marime).join(", "),
    backgroundPosition: alese.map((d) => d.loc).join(", "),
    backgroundRepeat: "no-repeat",
  };
}
