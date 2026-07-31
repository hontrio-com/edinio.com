/**
 * Lista de judete a formularelor de comanda si potrivirea unui nume venit din
 * afara peste ea.
 *
 * Lista traia in doua copii identice, in `CheckoutForm.tsx` si in
 * `OrderModal.tsx`. Mutata aici pentru ca ANAF intoarce judetul in alta forma
 * decat o scriem noi — MAJUSCULE si cu diacritice („BISTRIŢA-NĂSĂUD") — iar
 * potrivirea trebuie sa dea acelasi raspuns oriunde e chemata: la
 * autocompletarea din formular, la constructia facturii si in teste.
 */

export const JUDETE = [
  "Municipiul Bucuresti","Alba","Arad","Arges","Bacau","Bihor","Bistrita-Nasaud","Botosani",
  // „Caras-Severin" lipsea din amandoua listele copiate in formulare, de la
  // inceput. Un client din Resita nu il putea alege, iar judetul e obligatoriu:
  // ori abandona comanda, ori bifa alt judet — si atunci cotatia de transport si
  // AWB-ul plecau in alta parte, iar la Woot cotarea pica de tot.
  "Braila","Brasov","Buzau","Calarasi","Caras-Severin","Cluj","Constanta","Covasna","Dambovita","Dolj",
  "Galati","Giurgiu","Gorj","Harghita","Hunedoara","Ialomita","Iasi","Ilfov","Maramures",
  "Mehedinti","Mures","Neamt","Olt","Prahova","Salaj","Satu Mare","Sibiu","Suceava",
  "Teleorman","Timis","Tulcea","Vaslui","Valcea","Vrancea",
] as const;

/**
 * Cheia de comparatie: fara diacritice, fara majuscule, fara punctuatie.
 *
 * Se scot DOAR semnele diacritice (`\p{M}`), nu si literele: o clasa mai lata ar
 * manca „ș" cu totul in loc sa o faca „s". Cratima si spatiile cad si ele, ca
 * „Bistrita Nasaud" si „BISTRIŢA-NĂSĂUD" sa ajunga la aceeasi cheie.
 */
function cheie(nume: string): string {
  return (nume ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const DUPA_CHEIE = new Map<string, string>(JUDETE.map((j) => [cheie(j), j]));

/**
 * Sinonime pentru capitala. ANAF scrie judetul „BUCUREŞTI", iar sediul social
 * apare adesea cu sectorul in loc de judet; lista noastra are o singura intrare,
 * „Municipiul Bucuresti". Fara maparea asta, autocompletarea ar lasa campul gol
 * exact pentru cel mai frecvent judet din tara.
 */
const SINONIME: Record<string, string> = {
  bucuresti: "Municipiul Bucuresti",
  municipiulbucuresti: "Municipiul Bucuresti",
  bucurestisector1: "Municipiul Bucuresti",
  sector1: "Municipiul Bucuresti",
  sector2: "Municipiul Bucuresti",
  sector3: "Municipiul Bucuresti",
  sector4: "Municipiul Bucuresti",
  sector5: "Municipiul Bucuresti",
  sector6: "Municipiul Bucuresti",
};

/**
 * Numele nostru de judet pentru un text oarecare, sau `null` daca nu seamana cu
 * niciunul. `null`, nu o ghicire: un judet gresit pe factura sau pe AWB e mai
 * scump decat un camp pe care clientul il alege singur.
 */
export function potrivesteJudet(input: string | null | undefined): string | null {
  const k = cheie(input ?? "");
  if (!k) return null;
  return DUPA_CHEIE.get(k) ?? SINONIME[k] ?? null;
}
