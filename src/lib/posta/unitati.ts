import type { UnitateLivrare } from "./client";

/**
 * Nomenclatorul de unitati de livrare (`GET /api/unitati-livrare`) → punctele pe
 * care le vede cumparatorul in checkout.
 *
 * ═══ CE E ASTA, DE FAPT ═══
 *
 * Sunt OFICIILE POSTALE in care se poate livra „post-restant": coletul asteapta
 * acolo, iar destinatarul il ridica. Pentru platforma noastra e echivalentul unui
 * punct de ridicare, deci intra pe acelasi drum ca lockerele Sameday sau
 * ParcelShop-urile GLS: `deliveryType: "locker"`, iar id-ul ales de cumparator
 * ajunge in `idOficiuPR` la emiterea AWB-ului.
 *
 * ═══ ⚠ DIN TOT RANDUL, DOCUMENTATIA NUMESTE UN SINGUR CAMP ═══
 *
 * Cuvant cu cuvant: „Din acest nomenclator, din câmpul id, se va lua informația
 * necesară pentru completarea câmpului din AWB, idOficiuPR". Atat. Nu stim cum se
 * cheama denumirea oficiului, adresa, localitatea sau judetul — si nu exista cont
 * pe care sa probam.
 *
 * De aceea fiecare camp se cauta prin mai multe nume cu putinta, in loc sa se
 * bizuie pe unul singur. Un nume nepotrivit ar fi dat o lista de puncte fara
 * denumire si fara adresa — adica un selector din care cumparatorul nu poate
 * alege, si nimic in log care sa spuna de ce.
 *
 * ⚠ Cand se vede pe fir forma adevarata, listele de mai jos se scurteaza la cate
 * un nume. Pana atunci, `unitatiIncomplete` numara cate randuri au ramas fara
 * denumire — iar pagina de configurare o arata, ca defectul sa se vada singur.
 */

/** Un punct de ridicare, in forma pe care o asteapta checkout-ul. */
export type PunctPosta = {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  postCode?: string;
  lat: number;
  lng: number;
};

/** Prima valoare de tip text negoala, dintre cheile date. Nu se coboara in obiecte. */
function textDin(rand: UnitateLivrare, chei: readonly string[]): string {
  for (const cheie of chei) {
    const v = rand[cheie];
    if (typeof v === "string" && v.trim()) return v.trim().replace(/\s+/g, " ");
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function numarDin(rand: UnitateLivrare, chei: readonly string[]): number {
  for (const cheie of chei) {
    const v = rand[cheie];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

/*
 * Numele cu putinta, in ordinea in care le-am incerca daca ne-am uita cu ochii pe
 * un raspuns necunoscut: intai romaneste (documentatia si exemplele lor sunt in
 * romana), apoi englezeste.
 */
const CHEI_ID = ["id", "idOficiu", "idOficiuPR", "codOficiu", "cod"] as const;
const CHEI_NUME = [
  "denumire", "denumireUnitate", "numeUnitate", "nume", "unitate", "unitatePostala",
  "oficiu", "denumireOficiu", "name", "officeName", "title",
] as const;
const CHEI_ADRESA = ["adresa", "adresaUnitate", "strada", "address", "street"] as const;
const CHEI_LOCALITATE = ["localitate", "oras", "city", "locality", "town"] as const;
const CHEI_JUDET = ["judet", "county", "district", "region"] as const;
const CHEI_COD_POSTAL = ["codPostal", "cod_postal", "codpostal", "postalCode", "postCode", "zip"] as const;
const CHEI_LAT = ["lat", "latitudine", "latitude", "gpsLat"] as const;
const CHEI_LNG = ["lng", "lon", "longitudine", "longitude", "gpsLng", "gpsLon"] as const;

/**
 * Un rand din nomenclator → un punct de ridicare.
 *
 * ⚠ `null` cand nu are id: fara el, alegerea cumparatorului n-ar avea ce sa scrie
 * in `idOficiuPR`, iar AWB-ul ar pleca post-restant fara oficiu — refuzat de ei,
 * dupa ce omul a apucat sa comande.
 */
export function unitateLaPunct(rand: UnitateLivrare): PunctPosta | null {
  const id = textDin(rand, CHEI_ID);
  if (!id) return null;

  const nume = textDin(rand, CHEI_NUME);
  const localitate = textDin(rand, CHEI_LOCALITATE);

  return {
    id,
    /* Fara denumire, macar localitatea si id-ul: un rand gol in lista e mai rau. */
    name: nume || (localitate ? `Oficiu postal ${localitate}` : `Oficiu postal ${id}`),
    address: textDin(rand, CHEI_ADRESA),
    city: localitate,
    county: textDin(rand, CHEI_JUDET),
    postCode: textDin(rand, CHEI_COD_POSTAL) || undefined,
    /*
     * ⚠ ZERO cand nu le gasim, si asta e in regula ASTAZI fiindca selectorul de
     * puncte e o lista, nu o harta — nimic nu citeste coordonatele. Daca vreodata
     * se pune o harta, ea trebuie sa sara peste punctele cu 0/0, altfel aduna toate
     * oficiile Romaniei in golful Guineei.
     */
    lat: numarDin(rand, CHEI_LAT),
    lng: numarDin(rand, CHEI_LNG),
  };
}

/** Nomenclatorul intreg → puncte. Randurile fara id se scot. */
export function normalizeazaUnitati(brute: UnitateLivrare[]): PunctPosta[] {
  const puncte: PunctPosta[] = [];
  const vazute = new Set<string>();
  for (const rand of brute) {
    const p = unitateLaPunct(rand);
    /* Acelasi oficiu de doua ori ar aparea de doua ori in selector. */
    if (!p || vazute.has(p.id)) continue;
    vazute.add(p.id);
    puncte.push(p);
  }
  return puncte;
}

/**
 * Cate randuri au ramas fara denumire adevarata.
 *
 * ⚠ E chiar sonda pentru „am ghicit gresit numele campurilor". Cu zero puncte
 * numite din cateva mii, lista e inutilizabila — iar fara masuratoarea asta,
 * singurul semn ar fi fost un cumparator care nu intelege ce alege.
 */
export function unitatiIncomplete(brute: UnitateLivrare[]): number {
  let fara = 0;
  for (const rand of brute) {
    if (!textDin(rand, CHEI_ID)) continue;
    if (!textDin(rand, CHEI_NUME)) fara++;
  }
  return fara;
}

/**
 * Toate cheile intalnite in nomenclator, cu cate un exemplu.
 *
 * Nu se cheama in fluxul normal. Exista pentru pagina de configurare si pentru
 * prima proba pe fir: cand cineva chiar are cont, aici se vede DINTR-O PRIVIRE cum
 * se cheama campurile in realitate, si listele de mai sus se pot scurta la
 * adevarul masurat in loc sa ramana o colectie de presupuneri.
 */
export function cheileNomenclatorului(brute: UnitateLivrare[]): { cheie: string; exemplu: string }[] {
  const exemple = new Map<string, string>();
  for (const rand of brute.slice(0, 50)) {
    for (const [cheie, v] of Object.entries(rand)) {
      if (exemple.has(cheie)) continue;
      if (v === null || v === undefined || typeof v === "object") continue;
      exemple.set(cheie, String(v).slice(0, 60));
    }
  }
  return [...exemple.entries()]
    .map(([cheie, exemplu]) => ({ cheie, exemplu }))
    .sort((a, b) => a.cheie.localeCompare(b.cheie));
}
