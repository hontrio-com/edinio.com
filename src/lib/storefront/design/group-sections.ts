import { variantMeta } from "./registry";
import type { SectionInstance } from "./types";

/**
 * Impartirea sectiunilor in blocuri de randare.
 *
 * O pagina amesteca sectiuni pe toata latimea (hero, banda de incredere) cu
 * sectiuni care au nevoie de containerul de continut (catalog, recenzii). Cand
 * ordinea e libera, containerul nu poate fi nici pe fiecare sectiune, nici o
 * singura data in jurul tuturor. Aici se calculeaza unde incepe si unde se
 * termina fiecare container.
 *
 * Logica sta separat de componenta ca sa poata fi testata direct: pe magazinele
 * reale toate sectiunile sunt in aceeasi ordine, deci comparatia cu productia
 * nu ar acoperi niciodata ordinile pe care le poate produce editorul.
 */

export type SectionBlock =
  | { tip: "full"; section: SectionInstance }
  | { tip: "grup"; sections: SectionInstance[]; esteMain: boolean };

/** `full` se intinde pe toata latimea; `contained` primeste containerul paginii. */
export function sectionLayout(section: SectionInstance): "contained" | "full" {
  return variantMeta(section.kind, section.variant)?.layout ?? "contained";
}

export function groupSections(sections: SectionInstance[]): SectionBlock[] {
  const out: SectionBlock[] = [];
  let serie: SectionInstance[] = [];
  let mainFolosit = false;

  const inchide = () => {
    if (serie.length === 0) return;
    out.push({ tip: "grup", sections: serie, esteMain: !mainFolosit });
    mainFolosit = true;
    serie = [];
  };

  for (const s of sections) {
    if (!s.enabled) continue;
    if (sectionLayout(s) === "contained") {
      serie.push(s);
      continue;
    }
    inchide();
    out.push({ tip: "full", section: s });
  }
  inchide();

  return out;
}
