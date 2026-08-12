/**
 * Categorii stinse: cine nu se vede in magazin, si ce nume poarta.
 *
 * O categorie stinsa (`is_active = false`) isi ia cu ea TOT subarborele, chiar
 * daca randurile de sub ea au ramas aprinse. Altfel stingerea unui raion i-ar fi
 * lasat rafturile la vedere, iar comerciantul ar fi trebuit sa stinga fiecare
 * subcategorie de mana ca sa obtina ce a cerut o data.
 *
 * Perechea din baza e `public.categorii_ascunse(p_business)`, care raspunde la
 * exact aceeasi intrebare pentru palierul server si pentru cautare. Cele doua
 * TREBUIE sa dea acelasi raspuns, REGULA DE NUME INCLUSA: un produs care dispare
 * din grila dar ramane in cautare (sau invers) e felul de nepotrivire pe care
 * n-o vede nimeni din numaratori.
 *
 * Numele, nu id-urile, fiindca produsele isi poarta categoria ca TEXT
 * (`products.category`): legatura se face prin nume peste tot in proiect, deci si
 * taierea se face tot acolo.
 *
 * Toate parcurgerile sunt iterative, ca in `tree.ts`: arborii vin din importuri,
 * iar o adancime patologica n-are voie sa doboare randarea.
 */

import { buildCategoryForest, type CategoryTreeNode } from "@/lib/categories/tree";

export interface NodVizibilitate extends CategoryTreeNode {
  name: string;
  /** Lipsa sau `null` inseamna aprinsa: randurile vechi n-au coloana. */
  is_active?: boolean | null;
}

/** Id-urile categoriilor stinse, ele si tot ce atarna sub ele. */
export function idCategoriiAscunse<T extends NodVizibilitate>(list: T[]): Set<string> {
  const ascunse = new Set<string>();
  if (list.length === 0) return ascunse;

  // Prin padure, nu prin lista: nodurile orfane sau prinse intr-un ciclu sunt
  // promovate la radacina acolo, deci coborarea de aici le vede pe toate exact o
  // data si nu se poate invarti.
  const { roots, childrenOf } = buildCategoryForest(list);
  const copii = (id: string): T[] => (childrenOf.get(id) ?? []) as T[];

  // Un singur parcurs, cu un steag care spune daca stramosul cel mai apropiat era
  // stins. O data stins, tot ce urmeaza sub el e stins.
  const stiva: { nod: T; subStins: boolean }[] = [];
  for (const r of roots) stiva.push({ nod: r as T, subStins: false });
  while (stiva.length) {
    const { nod, subStins } = stiva.pop()!;
    const stins = subStins || nod.is_active === false;
    if (stins) ascunse.add(nod.id);
    for (const copil of copii(nod.id)) stiva.push({ nod: copil, subStins: stins });
  }
  return ascunse;
}

/**
 * Numele care nu au voie sa apara in magazin.
 *
 * Doua categorii pot purta acelasi nume in locuri diferite din arbore (regula de
 * unicitate e pe frati, nu pe magazin), iar produsele nu stiu decat numele. Deci
 * un nume iese din magazin doar cand TOATE categoriile care il poarta sunt
 * stinse: altfel stingerea unui „Insecticide" ar fi golit si celalalt.
 */
export function numeCategoriiAscunse<T extends NodVizibilitate>(list: T[]): Set<string> {
  const ascunseId = idCategoriiAscunse(list);
  if (ascunseId.size === 0) return new Set<string>();

  const aprinseDupaNume = new Set<string>();
  for (const c of list) if (!ascunseId.has(c.id)) aprinseDupaNume.add(c.name);

  const out = new Set<string>();
  for (const c of list) {
    if (ascunseId.has(c.id) && !aprinseDupaNume.has(c.name)) out.add(c.name);
  }
  return out;
}

/** Lista fara subarborii stinsi, in aceeasi ordine ca cea primita. */
export function categoriiVizibile<T extends NodVizibilitate>(list: T[]): T[] {
  const ascunse = idCategoriiAscunse(list);
  return ascunse.size === 0 ? list : list.filter((c) => !ascunse.has(c.id));
}
