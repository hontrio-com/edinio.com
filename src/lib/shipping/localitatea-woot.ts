import { normalizeCountyName, sectorBucuresti, stripDiacritics } from "@/lib/utils/ro-address";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOCALITATEA COMENZII, POTRIVITA CU NOMENCLATORUL WOOT          (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ DE UNDE VINE. Un comerciant a reclamat ca la o comanda din Bucuresti fereastra de AWB
 * nu ii completeaza automat nimic. Reclamatia e adevarata, si nu era despre diacritice.
 *
 * ═══ CE SPUNE NOMENCLATORUL LOR, ADUS DE LA EI ═══
 *
 * `GET /general/counties?country_id=189` da 42 de judete cu nume simple, fara prefix si fara
 * diacritice; capitala e `{ id: 42, name: "Bucuresti" }`. Iar
 * `GET /general/cities?county_id=42` da EXACT sase localitati:
 *
 *     Sectorul 1 · Sectorul 2 · Sectorul 3 · Sectorul 4 · Sectorul 5 · Sectorul 6
 *
 * ⚠ NU EXISTA nicio localitate numita „Bucuresti". Woot e pe partea SAMEDAY a lumii, unde
 * sectoarele sunt localitati separate, nu pe partea Cargus/DPD/FAN, unde capitala e un
 * singur oras. Vezi `localitateSameday` din `ro-address.ts`, care poarta chiar lectia asta.
 *
 * ═══ CE SCRIU COMENZILE, MASURAT IN PRODUCTIE PE 15.09.2026 ═══
 *
 * | judetul din comanda    | cine il scrie     | comenzi | cu AWB Woot |
 * | ---------------------- | ----------------- | ------- | ----------- |
 * | `Municipiul Bucuresti` | checkoutul NOSTRU | 25      | **23**      |
 * | `Bucuresti`            | eMAG              | 45      | 0           |
 *
 * Iar localitatea: `Sector 5`, `Sector 1`, `Sec 5`, `bucuresti sector 3` de la checkoutul
 * nostru; `Sectorul N` de la eMAG; si `Bucuresti` simplu, unde sectorul nu e scris nicaieri.
 *
 * ⚠ Deci tocmai magazinul care EMITE AWB-uri Woot e cel care scrie „Municipiul Bucuresti".
 * Cele 23 de AWB-uri ale lui s-au facut cu judetul si orasul alese de mana, de fiecare data.
 *
 * ═══ ⚠ DE CE NU SE POTRIVEA NIMIC ═══
 *
 *  1. JUDETUL. Potrivirea veche cerea egalitate sau prefix pe textul fara diacritice, iar
 *     „municipiul bucuresti" nu e nici egal cu „bucuresti", nici prefix al lui, nici invers.
 *     Deci selectul de judet ramanea gol, iar lista de orase nici nu se cerea: fereastra
 *     ramanea intreaga goala. Exact reclamatia.
 *  2. LOCALITATEA. „Sector 5" nu e nici egal, nici prefix al lui „Sectorul 5": dupa „sector"
 *     la ei urmeaza „u", la noi spatiul. Deci nici macar cu judetul ales de mana orasul nu
 *     se completa singur.
 *
 * ⚠ Si a doua copie, pe drumul CUMPARATORULUI: `buildWootOptions` din `shipping.actions.ts`
 * potrivea judetul (avea o incluziune de subsir), dar cadea la fel pe „Sector 5". Adica
 * pentru toata capitala cotatia live Woot nu pornea niciodata, si se cadea tacut pe tariful
 * fix al zonei. De aceea regula sta aici, intr-un singur loc, si nu in fereastra.
 *
 * ═══ ⚠ CE NU FACE, DINADINS ═══
 *
 * NU ghiceste sectorul. „Bucuresti" simplu, fara niciun sector scris nici in localitate nici
 * in adresa, ramane fara potrivire: selectul ramane gol si alege omul. Un sector inventat ar
 * trimite coletul in alt capat al orasului, iar comerciantul ar vedea un camp completat si
 * n-ar mai verifica. Aceeasi hotarare o poarta scrisa si `sectorBucuresti`.
 */

type Numit = { name: string };

/**
 * Cheia de comparatie: fara diacritice, fara majuscule, fara punctuatie si fara spatii.
 *
 * ⚠ Doua treceri peste diacritice, fiindca sunt doua feluri de scriere: `stripDiacritics`
 * stie perechile romanesti cu doua codificari („ș" U+0219 si „ş" U+015F sunt caractere
 * DIFERITE), iar `NFD` + `\p{M}` curata orice alt semn ramas. Cratimele si spatiile cad si
 * ele, ca „Cluj-Napoca" si „Cluj Napoca" sa ajunga la aceeasi cheie.
 */
function cheie(nume: string | null | undefined): string {
  return stripDiacritics(nume ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const CHEIA_CAPITALEI = "bucuresti";

/**
 * Judetul comenzii → judetul din nomenclatorul lor.
 *
 * ⚠ INCLUZIUNEA DE SUBSIR E INGADUITA DOAR CAPITALEI, si asta e o lectie platita la eColet
 * (vezi `potrivesteJudetul` din `ecolet/localitati.ts`): dintre cele 42 de judete romanesti
 * exista EXACT o pereche in care unul e subsir in celalalt, `mures ⊂ maramures`. O regula
 * lata ar trimite un colet din Maramures la 300 de kilometri, fara sa se planga nimic.
 *
 * Restul formelor nu au nevoie de ea: `normalizeCountyName` taie „Judetul"/„Municipiul" si
 * diacriticele, deci „Municipiul Bucuresti", „Judetul Cluj", „Constanța" si „TIMIS" cad
 * toate pe potrivirea EXACTA.
 */
export function potrivesteJudetulWoot<T extends Numit>(judete: T[], scrisInComanda: string): T | undefined {
  const cautat = cheie(normalizeCountyName(scrisInComanda ?? ""));
  if (!cautat) return undefined;

  const candidati = judete.filter((j) => cheie(j.name));
  const exact = candidati.find((j) => cheie(normalizeCountyName(j.name)) === cautat);
  if (exact) return exact;

  /* „Bucuresti Sector 3" scris in campul de judet, si orice alta invelitoare a capitalei. */
  if (cautat.includes(CHEIA_CAPITALEI)) {
    return candidati.find((j) => cheie(j.name).includes(CHEIA_CAPITALEI));
  }
  return undefined;
}

/**
 * Localitatea comenzii → localitatea din nomenclatorul lor.
 *
 * @param scrisInComanda ce a scris cumparatorul in campul de oras.
 * @param siInAdresa linia de adresa, citita DOAR ca sa se afle sectorul cand orasul nu-l
 *        spune („Constantin Ghercu nr 1 sector 6" e o comanda adevarata). Optional: la
 *        cotarea din checkout nu exista, si atunci se lucreaza doar cu orasul.
 */
export function potrivesteLocalitateaWoot<T extends Numit>(
  orase: T[],
  scrisInComanda: string,
  siInAdresa?: string | null,
): T | undefined {
  const candidati = orase.filter((o) => cheie(o.name));

  /*
   * ⚠ SECTORUL INTAI, si numai citit, niciodata ghicit.
   *
   * `sectorBucuresti` stie toate formele venite din comenzi ADEVARATE: „Sector 5",
   * „Sectorul 3", „Sec 5", „bucuresti sector 3", „sector3", „Sect. 4". Aici se cauta
   * localitatea al carei nume duce la ACELASI numar, deci „Sector 5" gaseste „Sectorul 5"
   * fara sa stie nimeni cum isi scriu ei sectoarele.
   *
   * ⚠ Cand lista nu e a capitalei, `find` nu gaseste nimic si se trece mai departe: regula
   * nu se poate aplica gresit in alt judet.
   */
  const sector = sectorBucuresti(scrisInComanda) ?? sectorBucuresti(siInAdresa);
  if (sector !== null) {
    const peSector = candidati.find((o) => sectorBucuresti(o.name) === sector);
    if (peSector) return peSector;
  }

  const cautat = cheie(scrisInComanda);
  if (!cautat) return undefined;

  const exact = candidati.find((o) => cheie(o.name) === cautat);
  if (exact) return exact;

  /*
   * ⚠ PREFIXUL RAMANE, DAR IN DOUA TREPTE SI NUMAI CAND E NEINDOIELNIC.
   *
   * El acopera formele in care nomenclatorul lor pune comuna in paranteza: „Aghiresu-Fabrici"
   * trebuie sa gaseasca „Aghiresu-Fabrici (Aghiresu)".
   *
   * ⚠ SI TOCMAI ACOLO O SINGURA TREAPTA GRESESTE, verificat pe nomenclatorul lor adevarat: in
   * judetul Cluj stau si „Aghiresu" (66) si „Aghiresu-Fabrici (Aghiresu)" (67). Cautand
   * „Aghiresu-Fabrici" intr-o singura trecere, numele mai SCURT se potriveste si el, fiindca
   * el e prefixul cautarii. Forma veche lua prima gasita din lista, adica satul GRESIT, si o
   * scria in select fara sa spuna nimanui.
   *
   * Deci: intai localitatile care INCEP cu ce s-a scris (cautarea e partiala, numele e
   * intreg), si abia daca nu e niciuna, cele care sunt ele inceputul a ce s-a scris („Cluj
   * Napoca Centru" gaseste „Cluj-Napoca").
   *
   * ⚠ Si in amandoua treptele, mai multe potriviri inseamna NICIUNA: cele 510 localitati ale
   * unui judet fac dintr-un „Ocna" scurt inceputul mai multora deodata. Selectul ramane gol
   * si alege omul, ceea ce e mult mai bun decat un sat ales din primul loc al listei.
   */
  const incepCuCautarea = candidati.filter((o) => cheie(o.name).startsWith(cautat));
  if (incepCuCautarea.length === 1) return incepCuCautarea[0];
  if (incepCuCautarea.length > 1) return undefined;

  const suntInceputulCautarii = candidati.filter((o) => cautat.startsWith(cheie(o.name)));
  return suntInceputulCautarii.length === 1 ? suntInceputulCautarii[0] : undefined;
}
