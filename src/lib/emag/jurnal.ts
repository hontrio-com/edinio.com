import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Jurnalul cererilor catre eMAG (§65) si firul care le leaga (§66).
 *
 * ═══ ⚠ CE INTREBARE RASPUNDE ═══
 *
 * „Pretul ala chiar a plecat? Cand? Si ce-au zis ei?"
 *
 * E singura intrebare care se pune cu adevarat despre o integrare de marketplace,
 * si pana acum n-avea niciun raspuns: `logError` scrie doar ce a CAZUT, iar o
 * cerere care reuseste si nu face nimic (chiar tiparul Trendyol) nu lasa nicio urma.
 *
 * ═══ ⚠ NU SE JURNALIZEAZA TOT, SI E O HOTARARE, NU O SCAPARE ═══
 *
 * Cronul bate din minut in minut: reconciliere, comenzi, retururi. Jurnalizate
 * toate, ar fi insemnat zeci de mii de randuri pe zi din care NICIUNUL nu spune
 * nimic — aceleasi citiri idempotente, repetate la nesfarsit. Un jurnal in care nu
 * se poate cauta nu e un jurnal, e o factura de stocare.
 *
 * Se scriu:
 *   - TOATE scrierile (au efecte, si efectele trebuie sa aiba urma)
 *   - ORICE cerere care n-a reusit (citire sau scriere)
 *
 * Nu se scriu citirile reusite. Ele nu schimba nimic, si se repeta oricum peste
 * un minut.
 *
 * ═══ ⚠ CE NU INTRA IN JURNAL, NICIODATA ═══
 *
 *   - antetul `Authorization` si parola, in nicio forma
 *   - CORPUL cererii si al raspunsului
 *
 * Al doilea e cel care se sare usor. `awb/save` duce numele, adresa si telefonul
 * cumparatorului; `order/read` intoarce comenzi intregi. Scrise aici, jurnalul ar
 * fi devenit o A DOUA copie a datelor clientilor — cu alta pastrare, alte drepturi
 * de citire si niciun motiv sa existe.
 *
 * Se scriu in schimb: ruta, verdictul, codul, durata, ce oferte au fost atinse si
 * MESAJELE lor. Mesajele eMAG vorbesc despre campuri („characteristic 38 is
 * required"), nu despre oameni — si sunt exact partea folositoare.
 */

/** Cat se pastreaza un rand. Cerinta din audit: 30 de zile. */
export const ZILE_PASTRARE = 30;

export type MetodaJurnal = "GET" | "POST" | "PATCH";

/**
 * Firul care leaga cererile unei singure lucrari (§66).
 *
 * ⚠ `AsyncLocalStorage`, nu un parametru dus prin patruzeci de functii. Purtat cu
 * mana, ar fi fost uitat exact pe drumurile rare — reincercarile, ramurile de
 * eroare — adica tocmai acolo unde firul se caut cel mai des.
 */
const firul = new AsyncLocalStorage<string>();

/**
 * Ruleaza o lucrare cu un fir al ei.
 *
 * Toate cererile catre eMAG facute inauntru primesc acelasi `corelatie`, si atunci
 * o cadere se poate urmari din capat in capat: „elementul asta de coada a facut
 * trei cereri, a doua a picat cu 429, a treia a reusit".
 */
export function cuFir<T>(corelatie: string, lucrare: () => Promise<T>): Promise<T> {
  return firul.run(corelatie, lucrare);
}

/** Firul lucrarii de acum, sau `null` cand nu e niciunul. */
export function firulCurent(): string | null {
  return firul.getStore() ?? null;
}

/**
 * Un fir nou.
 *
 * ⚠ Fara `Math.random()` singur: doua cereri pornite in aceeasi milisecunda ar fi
 * putut primi acelasi fir, iar cine urmareste o cadere ar fi vazut amestecate doua
 * lucrari fara nicio legatura. `randomUUID` nu are problema asta.
 */
export function firNou(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Se scrie cererea asta in jurnal?
 *
 * Functie curata, ca sa se poata proba fara retea si fara baza de date.
 *
 * ⚠ Regula se uita la METODA, nu la cale. O lista de rute „importante" ar fi ramas
 * in urma la prima ruta noua — si ruta noua e tocmai cea despre care nimeni nu stie
 * inca nimic, adica cea mai importanta de jurnalizat.
 */
export function deJurnalizat(metoda: MetodaJurnal, verdict: string): boolean {
  if (verdict !== "reusit") return true;
  return metoda !== "GET";
}

/**
 * Id-urile de oferta atinse de o cerere, ca sa se poata cauta dupa ele.
 *
 * ⚠ SE CITESC DIN INCARCATURA, dar NU se pastreaza incarcatura. Diferenta e chiar
 * ce desparte un jurnal de o a doua copie a bazei de date: „ce oferte am atins" e
 * o intrebare de depanare; „ce scria in ele" nu e.
 *
 * ⚠ Cel mult `MAXIM_IDURI`. Un lot de cincizeci de oferte n-are nevoie sa fie
 * numarat in jurnal de doua ori; iar la o cerere gresita care ar duce mii de id-uri,
 * randul de jurnal n-are voie sa fie mai mare decat cererea.
 */
export const MAXIM_IDURI = 50;

export function idurileAtinse(corp: unknown): number[] {
  const gasite: number[] = [];

  const dinObiect = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    const id = (o as { id?: unknown }).id;
    if (typeof id === "number" && Number.isFinite(id)) gasite.push(id);
  };

  if (Array.isArray(corp)) {
    for (const x of corp) dinObiect(x);
  } else if (corp && typeof corp === "object") {
    /* Scrierile vin impachetate in `{ data: … }`; citirile, nu. */
    const date = (corp as { data?: unknown }).data;
    if (Array.isArray(date)) for (const x of date) dinObiect(x);
    else if (date && typeof date === "object") dinObiect(date);
    else dinObiect(corp);
  }

  return [...new Set(gasite)].slice(0, MAXIM_IDURI);
}

/**
 * Mesajele lor, taiate la o lungime cu care se poate trai.
 *
 * ⚠ NU se rezuma si NU se traduc. `doc_errors` si mesajele de validare sunt
 * SINGURUL loc din care afla cineva ce e de reparat; un rezumat scris de noi ar fi
 * pierdut exact campul si valoarea. Se taie doar lungimea, si numai cand chiar e
 * absurda — un raspuns de zeci de mii de caractere nu ajuta pe nimeni.
 */
export const MAXIM_MESAJE = 20;
export const MAXIM_CARACTERE = 500;

export function mesajeDeScris(mesaje: string[] | undefined): string[] {
  if (!Array.isArray(mesaje) || mesaje.length === 0) return [];
  return mesaje
    .filter((m): m is string => typeof m === "string" && m.length > 0)
    .slice(0, MAXIM_MESAJE)
    .map((m) => (m.length > MAXIM_CARACTERE ? `${m.slice(0, MAXIM_CARACTERE)}…` : m));
}
