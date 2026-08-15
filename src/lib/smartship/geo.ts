import { CacheScurt } from "@/lib/utils/cache-scurt";
import { judete, localitati, type JudetSmartship, type LocalitateSmartship, type SmartshipConfig } from "./client";
import { alegeJudetul, alegeLocalitatea, cheieNume, localitateSmartship, sectorSmartship } from "./localitati";

/**
 * Drumul pana la nomenclatorul SmartShip.
 *
 * ⚠ Sta separat de `localitati.ts` dinadins: acolo e ALEGEREA, pura si probata;
 * aici e reteaua, care nu se poate proba fara cheie. Amestecate, regulile de
 * potrivire — partea in care se greseste — n-ar mai fi fost verificabile.
 *
 * ═══ ⚠ DE CE E NEVOIE DE CACHE ═══
 *
 * Rezolvarea localitatii sta in calea CUMPARATORULUI si costa DOUA cereri
 * (judete, apoi localitatile judetului) inainte de cotarea propriu-zisa. Fara
 * cache, fiecare vizitator care isi scrie orasul ar arde trei apeluri in loc de
 * unul, iar plafoanele de cotatie ale magazinului (60/IP, 600/magazin la 10
 * minute) s-ar consuma de trei ori mai repede — si cand se epuizeaza, TOTI
 * curierii magazinului trec pe tarif fix. Adica o cautare necachata ar strica si
 * cotatiile celorlalti.
 *
 * Documentatia lor o cere chiar ea: „sincronizeaza lista o data pe zi, nu la
 * fiecare cerere".
 *
 * ═══ ⚠ CACHE-UL E COMUN TUTUROR MAGAZINELOR, SI ASTA E CORECT ═══
 *
 * Judetele si localitatile Romaniei nu depind de cont: e acelasi nomenclator
 * public pentru orice cheie de API. Deci cheia de cache NU cuprinde nici
 * magazinul, nici cheia de API — o cheie de cache care ar contine o credentiala
 * ar fi si o scapare in plus, si o risipa de memorie.
 */

/** Nomenclatorul nu se schimba de la o ora la alta. */
const TTL_MS = 6 * 60 * 60_000;
/** Un raspuns gol se tine putin: poate fi o cadere de moment, nu adevarul. */
const TTL_GOL_MS = 60_000;

const CACHE_JUDETE = new CacheScurt<JudetSmartship[]>(TTL_MS, 8);
const CACHE_LOCALITATI = new CacheScurt<LocalitateSmartship[]>(TTL_MS, 120);
/** Cautarile pe care potrivirea NOASTRA nu le-a rezolvat. Vezi `rezolvaLocalitatea`. */
const CACHE_LOC_SEL = new CacheScurt<number | null>(TTL_MS, 300);

export function golesteCacheGeo(): void {
  CACHE_JUDETE.goleste();
  CACHE_LOCALITATI.goleste();
  CACHE_LOC_SEL.goleste();
}

export async function judeteleTarii(config: SmartshipConfig, tara = "RO"): Promise<JudetSmartship[]> {
  return CACHE_JUDETE.iaSau(
    tara.toLowerCase(),
    () => judete(config, tara),
    (v) => v.length === 0,
    TTL_GOL_MS,
  );
}

/**
 * Localitatile unui judet.
 *
 * ⚠ Se cere FARA `loc_sel`: parametrul acela schimba raspunsul (adauga
 * `city_selected`), iar o lista cachata sub o cheie care nu-l cuprinde ar servi
 * altui cumparator raspunsul cautarii altcuiva. Lista intreaga a judetului e
 * stabila si se poate imparti intre toti.
 */
export async function localitatileJudetului(config: SmartshipConfig, judetId: number): Promise<LocalitateSmartship[]> {
  return CACHE_LOCALITATI.iaSau(
    String(judetId),
    async () => (await localitati(config, judetId)).localitati,
    (v) => v.length === 0,
    TTL_GOL_MS,
  );
}

export type LocalitateRezolvata = {
  /** Id-ul din nomenclatorul lor, pentru campul `city`. */
  cityId: number;
  /** Numele exact din nomenclator (pentru mesaje si diagnostic). */
  nume: string;
  judetId: number;
  judetNume: string;
  /** 0 in afara Bucurestiului, 1-6 in Bucuresti, `null` cand nu se poate sti. */
  sector: number | null;
};

/**
 * Judetul si localitatea scrise de client → id-urile SmartShip.
 *
 * ⚠ `null` NU e o eroare: inseamna „SmartShip nu recunoaste locul asta", iar
 * apelantul din checkout cade atunci pe tariful fix din `shipping_zones`.
 * Aceeasi regula ca la Woot si eColet — o nepotrivire n-are voie sa lase
 * cumparatorul fara nicio optiune de livrare.
 *
 * ⚠ Esecul de RETEA e altceva si se propaga ca exceptie: acolo chiar nu stim, iar
 * apelantul are propria lui cadere pe tarif fix, cu log.
 */
export async function rezolvaLocalitatea(
  config: SmartshipConfig,
  oras: string,
  judet?: string | null,
  tara = "RO",
): Promise<LocalitateRezolvata | null> {
  const numeOras = localitateSmartship(oras, judet);
  if (!numeOras) return null;

  const listaJudete = await judeteleTarii(config, tara);
  const judetGasit = alegeJudetul(listaJudete, judet);
  /*
   * ⚠ Fara judet nu se cauta „prin toate": ar insemna 42 de cereri pentru fiecare
   * cumparator, si tot cu riscul de a alege un omonim din alt colt de tara.
   * Checkout-ul cere judetul, deci lipsa lui e o comanda incompleta, nu un caz.
   */
  if (!judetGasit) return null;

  const localitatiJudet = await localitatileJudetului(config, judetGasit.id);
  const aleasa = alegeLocalitatea(localitatiJudet, oras, judet);

  let cityId = aleasa?.id ?? null;
  let nume = aleasa?.city ?? numeOras;

  /*
   * ⚠ A doua incercare, cu potrivirea LOR.
   *
   * `loc_sel` intoarce `city_selected` cand ei recunosc numele. Ei stiu cum isi
   * scriu propriile localitati („Sfantu Gheorghe" / „Sf. Gheorghe" / „Sfîntu
   * Gheorghe"), deci merita intrebati acolo unde potrivirea noastra exacta a dat
   * gres. Se cheama DOAR atunci, si rezultatul se tine separat: e o cautare
   * anume, nu o lista de judet.
   */
  if (cityId === null) {
    const cheie = `${judetGasit.id}::${cheieNume(numeOras)}`;
    cityId = await CACHE_LOC_SEL.iaSau(
      cheie,
      async () => (await localitati(config, judetGasit.id, numeOras)).aleasa,
      (v) => v === null,
      TTL_GOL_MS,
    );
    if (cityId !== null) {
      nume = localitatiJudet.find((l) => l.id === cityId)?.city ?? numeOras;
    }
  }

  if (cityId === null) return null;

  return {
    cityId,
    nume,
    judetId: judetGasit.id,
    judetNume: judetGasit.county,
    sector: sectorSmartship(oras, judet),
  };
}
