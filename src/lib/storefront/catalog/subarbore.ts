/**
 * Numele unei categorii, impreuna cu ale tuturor descendentelor ei.
 *
 * Filtrarea pe categorie nu inseamna „produsele care poarta exact numele asta":
 * inseamna „si ale subcategoriilor". Regula traia doar in `MiniStoreRenderer`,
 * unde `subtreeByName` se construia din arborele incarcat in browser.
 *
 * De cand felierea se poate face in baza, aceeasi intrebare trebuie pusa si pe
 * SERVER — `catalog_pagina` primeste lista de nume si filtreaza pe ea. Scrisa a
 * doua oara acolo, ar fi fost a doua definitie a aceleiasi reguli, si ar fi
 * divergat exact ca celelalte pe care le-am unificat.
 */

export interface CategorieArbore {
  id: string;
  name: string;
  parent_id: string | null;
}

/**
 * `numeCategorie` e numele cerut; intoarce numele lui plus ale descendentelor.
 *
 * Cauta pe NUME, nu pe id, fiindca produsele isi poarta categoria ca text — la
 * fel cum face si filtrul din browser. Un nume care nu se regaseste in tabel nu
 * e o eroare: importurile lasa des categorii „orfane", purtate doar de produse,
 * iar acelea au pagini adevarate in magazin. Pentru ele raspunsul corect e chiar
 * numele singur.
 */
export function numeSubarbore(categorii: CategorieArbore[], numeCategorie: string): string[] {
  const cautat = numeCategorie.trim();
  if (!cautat) return [];

  const copiiAi = new Map<string, CategorieArbore[]>();
  for (const c of categorii) {
    if (!c.parent_id) continue;
    const arr = copiiAi.get(c.parent_id) ?? [];
    arr.push(c);
    copiiAi.set(c.parent_id, arr);
  }

  const radacina = categorii.find((c) => c.name === cautat);
  if (!radacina) return [cautat];

  // Iterativ, cu un set de vizitate: o categorie al carei parinte arata inapoi
  // catre ea (se poate scrie asa in baza, nimic n-o interzice) ar fi facut
  // recursia sa nu se mai opreasca.
  const out: string[] = [];
  const vazute = new Set<string>();
  const stiva: CategorieArbore[] = [radacina];
  while (stiva.length) {
    const c = stiva.pop() as CategorieArbore;
    if (vazute.has(c.id)) continue;
    vazute.add(c.id);
    out.push(c.name);
    for (const ch of copiiAi.get(c.id) ?? []) stiva.push(ch);
  }
  return out;
}
