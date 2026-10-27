import { toateSectiunile } from "@/lib/storefront/design/edit";
import type { StoreDesign } from "@/lib/storefront/design/types";

/**
 * Ce deschide un clic din previzualizare (etapa 9 din `docs/editor-magazin/PLAN.md`). Protocolul trimite
 * `<sectiune>/<rest>` (`despartireId`); un bloc dintr-un „Conținut liber” vine:
 *  - pe pagina principala, ca `<sectiune continut_liber>/<bloc>`;
 *  - sub produs si pe Pagina Magazin, ca `<pagina>/<continut>/<bloc>`.
 *
 * Intoarce blocul paginii de deschis (structural, ca pana acum, sau containerul) si, cand e cazul, blocul
 * din continut cu cheia containerului lui (`caleInText`). Fara React: o proba il ruleaza direct.
 */
export function alegereDinClic(
  design: StoreDesign,
  idSectiune: string,
  bloc: string | null,
): { blocStructural: string | null; interior: { cheie: string; bloc: string } | null } {
  if (!bloc) return { blocStructural: null, interior: null };
  const sectiune = toateSectiunile(design).find((s) => s.id === idSectiune);
  if (sectiune?.kind === "continut_liber") return { blocStructural: null, interior: { cheie: idSectiune, bloc } };
  const i = bloc.indexOf("/");
  if (i < 0) return { blocStructural: bloc, interior: null };
  const continut = bloc.slice(0, i);
  return { blocStructural: continut, interior: { cheie: `${idSectiune}/${continut}`, bloc: bloc.slice(i + 1) } };
}
