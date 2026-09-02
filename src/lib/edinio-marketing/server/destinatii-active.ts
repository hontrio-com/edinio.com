import { logError } from "@/lib/error-logger";
import type { Destinatie } from "./coada-conversii";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CATRE CINE SE PUNE LA COADA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SE PUNE DOAR CATRE CINE E LEGAT. Un furnizor fara token ar aduna randuri care
  se incearca de sase ori si se abandoneaza — deci conversii pierdute, cu jurnalul
  plin de acelasi motiv. Iar in clipa in care tokenul ar fi pus, n-ar mai fi
  nimic de trimis: cele vechi sunt deja abandonate.

  ⚠ SI DE CE SE STRIGA CAND LIPSESTE. Un furnizor cazut tacut arata exact ca unul
  fara conversii. Aceeasi orbire ca la pixelul Meta, care fara variabila nu se
  aprindea deloc si nu spunea nimic.
*/

const TOKENURI: Record<Destinatie, string> = {
  tiktok: "TIKTOK_EVENTS_TOKEN",
  meta: "META_CAPI_TOKEN",
};

/** Ca sa nu se scrie in jurnal la fiecare inscriere. */
const stigate = new Set<string>();

export function destinatiiActive(): Destinatie[] {
  const active: Destinatie[] = [];
  const lipsa: string[] = [];

  for (const [dest, variabila] of Object.entries(TOKENURI) as [Destinatie, string][]) {
    if (process.env[variabila]?.trim()) active.push(dest);
    else lipsa.push(`${dest} (${variabila})`);
  }

  if (lipsa.length > 0) {
    const cheie = lipsa.join(",");
    if (!stigate.has(cheie)) {
      stigate.add(cheie);
      void logError({
        action: "conversii.destinatieNelegata",
        message: `nu se pune la coada catre: ${lipsa.join(", ")}`,
        severity: "warning",
      });
    }
  }
  return active;
}
