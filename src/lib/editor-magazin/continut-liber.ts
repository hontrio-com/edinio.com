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

/**
 * `bloc` e SINGURUL bloc de pe primul nivel al containerului, deci containerul si blocul sunt, pentru om, acelasi lucru:
 * a-l sterge inseamna a sterge tot continutul (altfel ramane in pagina un loc gol, de negasit). Regula o folosesc si
 * panoul din arbore (etapa 13: containerul cu un singur bloc se deschide direct pe el, cu „Șterge” pe tot continutul),
 * si meniul de clic dreapta.
 *
 * ⚠ Un bloc dintr-o coloana NU e blocul unic, chiar daca Coloanele sunt singure pe primul nivel: coloanele isi marcheaza
 * si ele blocurile, deci un clic pe un text din ele il deschide pe el. Gasit la recitirea din 09.11: numarand doar
 * primul nivel, „Șterge” pe un astfel de text scotea toata sectiunea, cu tot ce era in coloane.
 */
export function esteBloculUnic(blocuri: readonly { id: string }[], bloc: string | null | undefined): boolean {
  return blocuri.length === 1 && blocuri[0].id === bloc;
}
