/**
 * Rezolvarea localitatii: numele scris de cumparator → `locality_id` la eColet.
 *
 * ═══ DE CE E NEVOIE ═══
 *
 * Corpul expedierii cere `locality_id`, un INTREG din nomenclatorul lor. Numele
 * orasului nu e primit nicaieri ca inlocuitor. Deci intre „Cluj-Napoca" scris de
 * client si expedierea trimisa la eColet trebuie sa treaca o cautare.
 *
 * Aceeasi problema pe care o rezolva Woot cu `fetchCounties`/`fetchCities`, si pe
 * care Colete NU o are (acolo se trimite numele ca text). De aici si aceeasi
 * regula: **nepotrivire = nicio oferta**, adica cumparatorul primeste tariful fix
 * din `shipping_zones`, nu o eroare si nu un pret gresit.
 *
 * ═══ ⚠ DIACRITICELE ROMANESTI AU DOUA CODIFICARI ═══
 *
 * Aceeasi lectie ca la Woot (vezi `potrivesteLocalitate` din `WootAwbModal`):
 * „ș" se scrie si U+0219 (virgula dedesubt, corect) si U+015F (sedila, mostenit
 * din Latin-2). Aceeasi litera pe ecran, doua caractere diferite in memorie. Un
 * `===` intre „Timișoara" scris de client si „Timişoara" din nomenclator e FALS,
 * iar cumparatorul ramane fara oferte fara ca cineva sa afle de ce.
 *
 * De aceea potrivirea se face pe o cheie fara diacritice, calculata la fel pe
 * amandoua partile.
 */

import { CacheScurt } from "@/lib/utils/cache-scurt";

export type LocalitateEcolet = {
  id: number;
  name: string;
  municipality?: string | null;
  postal_code?: string | null;
  county?: { id?: number; name?: string } | null;
};

/**
 * Cheia de comparatie: fara diacritice, fara majuscule, fara punctuatie.
 *
 * ⚠ Se scot DOAR semnele diacritice (`\p{M}`), nu si literele — o clasa mai lata
 * ar manca „ș" cu totul in loc sa o faca „s". Cratimele si spatiile cad si ele,
 * ca „Cluj-Napoca" si „Cluj Napoca" sa ajunga la aceeasi cheie.
 */
export function cheieLocalitate(nume: string | null | undefined): string {
  return (nume ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Alege localitatea potrivita dintre cele intoarse de cautare.
 *
 * ═══ ⚠ DE CE NU „PRIMA DIN LISTA" ═══
 *
 * Cautarea lor e pe fragment: „Sector" intoarce sase sectoare, „Ocna" intoarce
 * zece sate. Luata prima, comanda ar pleca intr-un cu totul alt judet — si
 * greseala nu s-ar vedea nicaieri pana la livrare.
 *
 * Deci: potrivire EXACTA pe nume, iar cand judetul e cunoscut, si pe judet. Daca
 * raman mai multe la fel, se ia prima DOAR cand toate sunt din acelasi judet;
 * altfel `null`, si cumparatorul primeste tariful fix.
 *
 * ⚠ Judetul se compara tot pe cheie: nomenclatoarele scriu „Bucuresti", noi
 * scriem „Municipiul Bucuresti".
 */
export function alegeLocalitatea(
  gasite: LocalitateEcolet[],
  oras: string,
  judet?: string | null,
): LocalitateEcolet | null {
  const kOras = cheieLocalitate(oras);
  if (!kOras) return null;

  const exacte = gasite.filter((l) => cheieLocalitate(l.name) === kOras);
  if (exacte.length === 0) return null;

  const kJudet = cheieLocalitate(judet);
  if (kJudet) {
    const peJudet = exacte.filter((l) => potrivesteJudetul(cheieLocalitate(l.county?.name), kJudet));
    /* Mai multe potriviri IN ACELASI judet inseamna sate omonime din aceeasi
       zona: acolo prima e o alegere rezonabila, si oricum curierul livreaza dupa
       adresa completa, nu dupa id. Ambiguitatea periculoasa e cea INTRE judete,
       si pe aia o inchide filtrul de mai sus. */
    if (peJudet.length > 0) return peJudet[0];
    /*
     * ⚠ Judetul dat, dar niciuna nu se potriveste: NU se cade pe lista fara
     * judet. Ar insemna sa trimitem marfa intr-un oras cu acelasi nume din alt
     * colt de tara — exista zeci de omonime in Romania.
     */
    return null;
  }

  /* Fara judet, o singura potrivire e sigura; mai multe, nu. */
  return exacte.length === 1 ? exacte[0] : null;
}

/**
 * ⚠ POTRIVIREA DE JUDET NU SE FACE PE INCLUZIUNE DE SUBSIR.
 *
 * Prima forma accepta orice judet care se cuprinde in celalalt, ca sa acopere
 * „Municipiul Bucuresti" fata de „Bucuresti". Dar dintre cele 42 de judete
 * romanesti exista EXACT o pereche in care unul e subsir in celalalt:
 *
 *     mures  ⊂  maramures
 *
 * Deci un „Dumbrava, Maramures" trecea drept „Dumbrava, Mures" — si comanda
 * pleca la 300 de kilometri distanta, fara ca nimic sa se planga.
 *
 * Acum incluziunea e ingaduita DOAR pentru capitala, care e chiar cazul pentru
 * care fusese scrisa.
 */
const CHEIE_CAPITALA = "bucuresti";

function potrivesteJudetul(dinNomenclator: string, alNostru: string): boolean {
  if (!dinNomenclator) return false;
  if (dinNomenclator === alNostru) return true;
  /* „Municipiul Bucuresti" ↔ „Bucuresti", si nimic altceva. */
  return dinNomenclator.includes(CHEIE_CAPITALA) && alNostru.includes(CHEIE_CAPITALA);
}

/**
 * Cache-ul cautarilor.
 *
 * ⚠ Cotarea sta in calea CUMPARATORULUI: fara cache, fiecare vizitator care isi
 * scrie orasul ar arde un apel in plus la eColet, pe langa cotarea propriu-zisa,
 * si ar consuma de doua ori mai repede plafoanele de cotatie ale magazinului.
 *
 * Per instanta, ca orice `CacheScurt` (vezi cel de lockere din
 * `shipping.actions.ts`): cel mai rau caz e ca doua instante fac aceeasi cautare.
 * Nomenclatorul de localitati nu se schimba de la o ora la alta.
 */
const CACHE = new CacheScurt<LocalitateEcolet[]>(30 * 60_000, 300);

export { CACHE as CACHE_LOCALITATI };
