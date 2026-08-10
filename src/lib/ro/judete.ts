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
 * Codurile auto ale judetelor → numele din `JUDETE`.
 *
 * Exista fiindca unele surse din afara lipesc codul la sfarsitul localitatii:
 * GLS scrie orasele punctelor de ridicare ca „Brasov BV" sau „Bucuresti B", si
 * nicaieri altundeva in fisierul lor nu apare judetul. Fara tabelul asta,
 * cumparatorul ar alege un punct de ridicare fara judet, iar comanda ar pleca
 * mai departe cu campul gol.
 *
 * „B" e Municipiul Bucuresti, si e singurul cod de o litera — de aia potrivirea
 * de mai jos accepta si unul, si doua caractere.
 */
const COD_AUTO: Record<string, string> = {
  B: "Municipiul Bucuresti",
  AB: "Alba", AR: "Arad", AG: "Arges", BC: "Bacau", BH: "Bihor", BN: "Bistrita-Nasaud",
  BT: "Botosani", BV: "Brasov", BR: "Braila", BZ: "Buzau", CS: "Caras-Severin",
  CL: "Calarasi", CJ: "Cluj", CT: "Constanta", CV: "Covasna", DB: "Dambovita",
  DJ: "Dolj", GL: "Galati", GR: "Giurgiu", GJ: "Gorj", HR: "Harghita", HD: "Hunedoara",
  IL: "Ialomita", IS: "Iasi", IF: "Ilfov", MM: "Maramures", MH: "Mehedinti",
  MS: "Mures", NT: "Neamt", OT: "Olt", PH: "Prahova", SM: "Satu Mare", SJ: "Salaj",
  SB: "Sibiu", SV: "Suceava", TR: "Teleorman", TM: "Timis", TL: "Tulcea",
  VS: "Vaslui", VL: "Valcea", VN: "Vrancea",
};

/** Judetul dupa codul auto („BV" → „Brasov"), sau `null` daca nu e unul. */
export function judetDupaCodAuto(cod: string | null | undefined): string | null {
  const c = (cod ?? "").trim().toUpperCase();
  return COD_AUTO[c] ?? null;
}

/**
 * Desparte „Brasov BV" in localitate si judet.
 *
 * ⚠ Codul se ia in seama DOAR daca e chiar un cod de judet cunoscut. Altfel
 * „Satu Mare" ar deveni localitatea „Satu" din judetul „Mare", iar „Baia Mare"
 * la fel — si punctul de ridicare ar ajunge in comanda cu un judet inventat.
 */
export function despartaLocalitateaDeCod(
  valoare: string | null | undefined,
): { localitate: string; judet: string } {
  const text = (valoare ?? "").trim().replace(/\s+/g, " ");
  const ultim = text.lastIndexOf(" ");

  if (ultim > 0) {
    const bucata = text.slice(ultim + 1);
    const judet = judetDupaCodAuto(bucata);
    /* Codul trebuie sa fie SCRIS cu majuscule; „Baia Mare" nu e „Baia" din „MS". */
    if (judet && bucata === bucata.toUpperCase()) {
      return { localitate: text.slice(0, ultim), judet };
    }
  }

  /*
   * ⚠ Bucurestiul nu respecta regula codului: GLS scrie „Bucuresti Sector 3", nu
   * „Bucuresti B". Sunt 186 din cele 2833 de puncte din tara — masurat pe fisierul
   * real, si chiar in piata cea mai mare.
   *
   * Sectorul RAMANE in numele localitatii, dinadins: la fel il tine si Sameday,
   * iar potrivirea dupa oras din checkout stie deja sa lege „Sector X" de
   * „Bucuresti". Se completeaza doar judetul, care altfel ar fi plecat gol pe
   * comanda.
   */
  if (cheie(text).startsWith("bucuresti")) {
    return { localitate: text, judet: "Municipiul Bucuresti" };
  }

  return { localitate: text, judet: "" };
}

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
