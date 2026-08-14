import type { PunctFix } from "./client";

/**
 * `GET /api/Location/FixedLocations` → punctele pe care le vede cumparatorul.
 *
 * ═══ ⚠ SINGURUL CONTRACT NEDOCUMENTAT DIN TOT API-UL ═══
 *
 * Specificatia declara raspunsul lui `FixedLocations` ca `200` fara `content` —
 * adica fara nicio schema. FILTRELE sunt documentate, si sunt bogate (inclusiv
 * `Latitude`/`Longitude`/`Radius`, pe care niciun alt curier nu ni le da), dar
 * forma RANDULUI nu.
 *
 * Deosebirea fata de Posta Romana, unde am avut aceeasi problema: acolo nu exista
 * cont pe care sa probam, deci presupunerile ramaneau presupuneri. Aici exista
 * credentiale de test — deci lista de nume de mai jos e o punte pana la prima
 * cheie, nu o solutie permanenta. `cheileRaspunsului` o scurteaza la adevar.
 *
 * ⚠ Documentatia lor mai spune ceva care se aplica direct aici: „Response data
 * structures may be changed in the future adding additional fields. Therefore,
 * client applications should be able to accept unknown fields." Deci se citeste
 * tolerant si nu se cade pe campuri in plus.
 */

/** Un punct de ridicare, in forma pe care o asteapta checkout-ul. */
export type PunctInnoship = {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  postCode?: string;
  lat: number;
  lng: number;
};

function textDin(rand: PunctFix, chei: readonly string[]): string {
  for (const cheie of chei) {
    const v = rand[cheie];
    if (typeof v === "string" && v.trim()) return v.trim().replace(/\s+/g, " ");
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function numarDin(rand: PunctFix, chei: readonly string[]): number {
  for (const cheie of chei) {
    const v = rand[cheie];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

/*
 * Numele cu putinta. Ordinea urmeaza conventia din restul API-ului lor, care e
 * englezeasca si in `camelCase` — spre deosebire de Posta, unde documentatia si
 * exemplele sunt in romana.
 *
 * `fixedLocationId` sta primul dinadins: el e chiar numele campului pe care
 * `OrderRequest.addressTo` il asteapta inapoi, deci daca exista in raspuns e
 * sigur cel corect.
 */
const CHEI_ID = ["fixedLocationId", "id", "locationId", "externalLocationId", "courierFixedLocationId"] as const;
const CHEI_NUME = ["name", "fixedLocationName", "locationName", "displayName", "title", "denumire"] as const;
const CHEI_ADRESA = ["address", "addressText", "streetName", "street", "adresa"] as const;
const CHEI_LOCALITATE = ["localityName", "locality", "city", "town", "localitate"] as const;
const CHEI_JUDET = ["countyName", "county", "district", "region", "judet"] as const;
const CHEI_COD_POSTAL = ["postalCode", "postCode", "zipCode", "zip", "codPostal"] as const;
const CHEI_LAT = ["latitude", "lat", "gpsLat"] as const;
const CHEI_LNG = ["longitude", "lng", "lon", "gpsLng"] as const;

/**
 * Un rand din nomenclator → un punct de ridicare.
 *
 * ⚠ `null` cand nu are id: fara el, alegerea cumparatorului n-ar avea ce scrie in
 * `addressTo.fixedLocationId`, iar expedierea ar pleca la locker fara locker —
 * refuzata de ei dupa ce omul a apucat sa comande.
 */
export function randLaPunct(rand: PunctFix): PunctInnoship | null {
  const id = textDin(rand, CHEI_ID);
  if (!id) return null;

  const nume = textDin(rand, CHEI_NUME);
  const localitate = textDin(rand, CHEI_LOCALITATE);

  return {
    id,
    /* Fara denumire, macar localitatea si id-ul: un rand gol in lista e mai rau. */
    name: nume || (localitate ? `Punct de ridicare ${localitate}` : `Punct de ridicare ${id}`),
    address: textDin(rand, CHEI_ADRESA),
    city: localitate,
    county: textDin(rand, CHEI_JUDET),
    postCode: textDin(rand, CHEI_COD_POSTAL) || undefined,
    /*
     * ⚠ Zero cand nu le gasim. E in regula cat timp selectorul de puncte e o
     * LISTA, nu o harta — nimic nu citeste coordonatele azi. Daca se pune vreodata
     * o harta, ea trebuie sa sara peste punctele cu 0/0, altfel aduna toate
     * lockerele in golful Guineei.
     *
     * (Innoship chiar da coordonate si stie sa filtreze pe raza — deci harta e
     * singura dintre integrarile noastre care ar avea de unde.)
     */
    lat: numarDin(rand, CHEI_LAT),
    lng: numarDin(rand, CHEI_LNG),
  };
}

/** Nomenclatorul intreg → puncte. Randurile fara id se scot, dublurile la fel. */
export function normalizeazaPuncte(brute: PunctFix[]): PunctInnoship[] {
  const puncte: PunctInnoship[] = [];
  const vazute = new Set<string>();
  for (const rand of brute ?? []) {
    const p = randLaPunct(rand);
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
export function puncteIncomplete(brute: PunctFix[]): number {
  let fara = 0;
  for (const rand of brute ?? []) {
    if (!textDin(rand, CHEI_ID)) continue;
    if (!textDin(rand, CHEI_NUME)) fara++;
  }
  return fara;
}

/**
 * Toate cheile intalnite, cu cate un exemplu.
 *
 * Nu se cheama in fluxul normal. Exista pentru pagina de configurare si pentru
 * prima proba pe fir: cand exista o cheie de test, aici se vede DINTR-O PRIVIRE
 * cum se cheama campurile in realitate, iar listele de mai sus se scurteaza la
 * adevarul masurat in loc sa ramana o colectie de presupuneri.
 */
export function cheileRaspunsului(brute: PunctFix[]): { cheie: string; exemplu: string }[] {
  const exemple = new Map<string, string>();
  for (const rand of (brute ?? []).slice(0, 50)) {
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
