export interface RandCategorie {
  id: string;
  name: string;
  parent_id: string | null;
}

/**
 * Cate categorii de nivel intai vede efectiv vizitatorul.
 *
 * Aceeasi regula ca in magazin (MiniStoreRenderer): categoriile radacina al
 * caror subarbore are macar un produs, plus numele de categorie ramase pe
 * produse fara rand in tabel. Pragul din registry e degeaba daca cele doua parti
 * numara populatii diferite: comerciantul ar alege o varianta care la el nu se
 * randeaza. Parcurgerea e iterativa si cu multime de vizitate, ca un ciclu de
 * parinti sa nu blocheze pagina.
 */
export function numaraCategoriiVizibile(categorii: RandCategorie[], numeDePeProduse: Set<string>): number {
  const copiiiLui = new Map<string, RandCategorie[]>();
  for (const c of categorii) {
    if (!c.parent_id) continue;
    const arr = copiiiLui.get(c.parent_id);
    if (arr) arr.push(c);
    else copiiiLui.set(c.parent_id, [c]);
  }

  const areProduse = (radacina: RandCategorie): boolean => {
    const vazute = new Set<string>();
    const stiva: RandCategorie[] = [radacina];
    while (stiva.length) {
      const nod = stiva.pop()!;
      if (vazute.has(nod.id)) continue;
      vazute.add(nod.id);
      if (numeDePeProduse.has(nod.name)) return true;
      for (const copil of copiiiLui.get(nod.id) ?? []) stiva.push(copil);
    }
    return false;
  };

  const radacini = categorii.filter((c) => !c.parent_id && areProduse(c)).length;
  const numeInTabel = new Set(categorii.map((c) => c.name));
  let orfane = 0;
  for (const nume of numeDePeProduse) if (!numeInTabel.has(nume)) orfane++;
  return radacini + orfane;
}
