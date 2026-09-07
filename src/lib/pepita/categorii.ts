/**
 * Calea categoriei unui produs, de la parinte la copil.
 *
 * ⚠ CE CERE DOCUMENTATIA LOR: „Milyen kategóriákhoz tartozik a termék, a
 * legfelsőbb kategóriától a legalsóbbig" (de la cea mai de sus la cea mai de
 * jos), cu exemplul „Könyvek > Babanapló". Deci ordinea nu e cosmetica: trimisa
 * invers, produsul ar ajunge la ei intr-un arbore intors pe dos.
 *
 * ⚠ `<Id>` E AL NOSTRU, si asa scrie si la ei: „Kategória egyedi azonosítója
 * saját áruházának nyilvántartásában", identificatorul din evidenta PROPRIULUI
 * magazin. Nu exista un API de categorii Pepita si nu exista o taxonomie a lor
 * pe care sa o potrivim, deci nu se inventeaza niciun cod „Pepita".
 *
 * ⚠ DE CE SE CAUTA DUPA NUME: `products.category` tine NUMELE categoriei, nu
 * id-ul ei. Asa e modelul, si nu-l schimbam aici. Cand doua ramuri au categorii
 * cu acelasi nume, castiga prima din lista ordonata, ca peste tot in proiect.
 */

export interface RandCategorie {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface CategoriePepita { id?: string; nume: string }

/**
 * Face o functie care da calea unei categorii dupa nume.
 *
 * Se construieste o data pe magazin si se cheama pentru fiecare produs: un feed
 * de zece mii de produse ar face altfel zece mii de parcurgeri ale arborelui.
 */
export function caleaCategoriilor(randuri: readonly RandCategorie[]): (nume: string | null) => CategoriePepita[] {
  const dupaId = new Map<string, RandCategorie>();
  for (const c of randuri) dupaId.set(c.id, c);

  const dupaNume = new Map<string, RandCategorie>();
  for (const c of randuri) {
    const cheie = (c.name ?? "").trim();
    if (cheie && !dupaNume.has(cheie)) dupaNume.set(cheie, c);
  }

  const cache = new Map<string, CategoriePepita[]>();

  return (nume: string | null): CategoriePepita[] => {
    const cheie = (nume ?? "").trim();
    if (!cheie) return [];
    const gata = cache.get(cheie);
    if (gata) return gata;

    const nod = dupaNume.get(cheie);
    /*
     * ⚠ CATEGORIA NEGASITA NU E O CATEGORIE LIPSA. Un produs importat poate avea
     * un nume de categorie care nu mai exista in arbore. Pepita cere cel putin o
     * categorie, si numele acela chiar descrie produsul, deci se trimite ca atare,
     * fara `<Id>`. Intors gol, produsul ar fi picat pe „fara categorie" si ar fi
     * disparut din feed pentru o nepotrivire de evidenta interna.
     */
    if (!nod) {
      const singura = [{ nume: cheie }];
      cache.set(cheie, singura);
      return singura;
    }

    const cale: CategoriePepita[] = [];
    const vazute = new Set<string>();
    let curent: RandCategorie | undefined = nod;
    /*
     * ⚠ Urcarea are oprire pe cicluri. Arborele e o lista de adiacenta si nimic
     * din baza nu impiedica un parinte care se intoarce la copil; fara `vazute`,
     * feedul ar intra in bucla infinita si ar tine functia pana la timeout.
     */
    while (curent && !vazute.has(curent.id)) {
      vazute.add(curent.id);
      cale.unshift({ id: curent.id, nume: (curent.name ?? "").trim() });
      curent = curent.parent_id ? dupaId.get(curent.parent_id) : undefined;
    }
    const curata = cale.filter((c) => c.nume);
    cache.set(cheie, curata);
    return curata;
  };
}
