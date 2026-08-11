import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import type { EcoletConfig } from "./client";
import { alegeLocalitatea, CACHE_LOCALITATI, type LocalitateEcolet } from "./localitati";

/**
 * Cautarea localitatii la eColet — partea care atinge reteaua.
 *
 * ⚠ Sta separat de `localitati.ts` dinadins: acolo e alegerea, pura si probata;
 * aici e drumul pana la ei, care nu se poate proba fara token. Amestecate,
 * regulile de potrivire n-ar mai fi fost verificabile.
 *
 * ═══ ⚠ DE CE E NEVOIE DE CACHE ═══
 *
 * Cotarea sta in calea CUMPARATORULUI: fiecare vizitator care isi scrie orasul ar
 * arde un apel in plus la eColet, pe langa cotarea propriu-zisa. Adica plafoanele
 * de cotatie ale magazinului (60/IP, 600/magazin la 10 minute) s-ar consuma de
 * doua ori mai repede, iar cand se epuizeaza TOTI curierii magazinului trec pe
 * tarif fix — deci o cautare necachata ar strica si cotatiile celorlalti.
 */

const BAZA = "https://panel.ecolet.ro/api/v1";
const ASTEPTARE_MS = 12_000;

/**
 * ⚠ Lungimea minima a cautarii: TREI caractere, nu doua.
 *
 * Specificatia lor declara `minLength: 3` pe `searchQuery`. Cu pragul la doi, o
 * interogare de exact doua caractere pleca si lua 422 — adica o EXCEPTIE in loc
 * de `null`-ul documentat, iar in panou exceptia scapa ca eroare de sistem in loc
 * de „localitatea nu e recunoscuta".
 */
const MIN_CAUTARE = 3;

/**
 * ⚠ Cheia de cache se face din CHIAR TEXTUL TRIMIS.
 *
 * Prima forma o compunea din textul NORMALIZAT (fara diacritice, spatii,
 * punctuatie), dar trimitea textul BRUT. Doua lucruri stricate deodata:
 * „Sf. Gheorghe" si „Sf Gheorghe" — care pot da raspunsuri diferite la ei,
 * fiindca cautarea e pe fragment — impartaseau o singura intrare; iar un raspuns
 * gol al unei forme se servea tuturor celorlalte, pentru toate magazinele de pe
 * instanta, timp de o jumatate de ora.
 */
function cheia(tara: string, q: string): string {
  return `${tara.toLowerCase()}::${q.trim().toLowerCase()}`;
}

/** Un raspuns gol se tine putin: poate fi doar o cautare prea ingusta. */
const TTL_GOL_MS = 60_000;

/**
 * Localitatile care se potrivesc cu un text.
 *
 * ⚠ `Accept: application/json` aici la fel ca peste tot: fara el, un token expirat
 * vine ca redirect 302 cu HTML in loc de 401, si `JSON.parse` ar crapa cu un
 * mesaj despre altceva decat cauza reala.
 */
export async function cautaLocalitati(
  config: Pick<EcoletConfig, "api_token">,
  cautare: string,
  tara = "ro",
): Promise<LocalitateEcolet[]> {
  const q = cautare.trim();
  if (q.length < MIN_CAUTARE) return [];

  /* ⚠ Rezultatul GOL se tine un minut, nu treizeci: vezi `TTL_GOL_MS`. */
  return CACHE_LOCALITATI.iaSau(
    cheia(tara, q),
    () => ceruteDeLaEcolet(config, q, tara),
    (v) => v.length === 0,
    TTL_GOL_MS,
  );
}

async function ceruteDeLaEcolet(
  config: Pick<EcoletConfig, "api_token">,
  q: string,
  tara: string,
): Promise<LocalitateEcolet[]> {
  let res: Response;
  try {
    res = await fetch(`${BAZA}/locations/${encodeURIComponent(tara)}/localities/${encodeURIComponent(q)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.api_token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(ASTEPTARE_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw eroareNesigura(`eColet cautare localitate: ${(e as Error).message}`);
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw eroareRefuz("eColet: token respins la cautarea localitatii.");
    }
    throw eroareCuStatus(`eColet cautare localitate: ${res.status}`, res.status);
  }

  /*
   * ⚠ Un 2xx cu corp necitibil NU inseamna „zero localitati".
   *
   * Prima forma facea `res.json().catch(() => null)` si cadea pe lista goala —
   * adica „orasul asta nu exista la eColet", scris apoi si in cache. Iar cazul nu
   * e ipotetic: termenul de asteptare acopera si corpul, deci un raspuns cu
   * antetele venite repede si corpul rupt iese din `try`-ul de mai sus si pica
   * exact in acel `catch`. Acum se arunca, iar `iaSau` nu mai scrie nimic.
   */
  const text = await res.text();
  let date: { localities?: unknown } | null = null;
  try {
    date = text.trim() ? JSON.parse(text) as { localities?: unknown } : null;
  } catch {
    throw eroareNesigura(`eColet cautare localitate: raspuns necitibil — ${text.slice(0, 200)}`);
  }
  if (text.trim() && !date) {
    throw eroareNesigura("eColet cautare localitate: raspuns necitibil");
  }

  const lista = Array.isArray(date?.localities) ? date.localities : [];
  return lista
    .map((l) => l as LocalitateEcolet)
    .filter((l) => l && Number.isInteger(Number(l.id)) && typeof l.name === "string");
}

/**
 * Localitatea potrivita pentru un oras si un judet, sau `null`.
 *
 * ⚠ `null` NU e o eroare: inseamna „eColet nu recunoaste locul asta", iar
 * apelantul din checkout cade atunci pe tariful fix din `shipping_zones`. Aceeasi
 * regula ca la Woot — o nepotrivire nu are voie sa lase cumparatorul fara nicio
 * optiune de livrare.
 *
 * ⚠ Esecul de RETEA e altceva si se propaga ca exceptie: acolo chiar nu stim, si
 * apelantul are propria lui cadere pe tarif fix, cu log.
 */
export async function rezolvaLocalitatea(
  config: Pick<EcoletConfig, "api_token">,
  oras: string,
  judet?: string | null,
  tara = "ro",
): Promise<LocalitateEcolet | null> {
  const q = (oras ?? "").trim();
  if (!q) return null;

  const gasite = await cautaLocalitati(config, q, tara);
  const aleasa = alegeLocalitatea(gasite, q, judet);
  if (aleasa) return aleasa;

  /*
   * ⚠ A doua incercare, pe PRIMUL CUVANT.
   *
   * Cautarea lor e pe fragment, iar orasele romanesti compuse se scriu in mai
   * multe feluri („Cluj-Napoca", „Cluj Napoca"). Daca fraza intreaga n-a intors
   * nimic, primul cuvant aproape sigur intoarce — si `alegeLocalitatea` face
   * oricum potrivirea EXACTA pe numele intreg, deci largirea cautarii nu poate
   * strecura o localitate gresita.
   */
  const primulCuvant = q.split(/[\s-]+/)[0];
  if (primulCuvant.length >= MIN_CAUTARE && primulCuvant.toLowerCase() !== q.toLowerCase()) {
    return alegeLocalitatea(await cautaLocalitati(config, primulCuvant, tara), q, judet);
  }

  return null;
}
