/**
 * Istoricul pentru „Anuleaza / Refa” din editorul unic.
 *
 * Tine stari INTREGI ale designului, nu diferente: designul e un obiect mic
 * (zeci de sectiuni), iar o stare intreaga nu poate fi aplicata gresit, pe cand
 * o diferenta aplicata peste altceva decat starea din care s-a nascut poate.
 *
 * Functii pure: editorul le cheama, testele le verifica fara React.
 */

export interface Istoric<T> {
  /** Starile de dinaintea fiecarei modificari, cea mai noua la coada. */
  trecut: T[];
  /** Starile anulate, cea mai recent anulata la coada. */
  viitor: T[];
  /** Ce fel de modificare a fost ultima, ca sa se poata lipi de urmatoarea. */
  ultimaCheie: string | null;
  /** Cand s-a notat ultima modificare, in milisecunde. */
  ultimaLa: number;
}

/** Cate stari se tin. Peste, cele mai vechi se uita. */
export const MAX_ISTORIC = 60;

/**
 * Cat timp doua modificari cu aceeasi cheie se socotesc una singura.
 *
 * Fara lipire, un titlu scris litera cu litera ar cere zece apasari pe Anuleaza;
 * omul asteapta ca Anuleaza sa scoata tot cuvantul, ca in orice editor de text.
 */
export const FEREASTRA_LIPIRE_MS = 900;

export function istoricGol<T>(): Istoric<T> {
  return { trecut: [], viitor: [], ultimaCheie: null, ultimaLa: 0 };
}

/**
 * Noteaza starea DE DINAINTEA unei modificari.
 *
 * `cheie` spune ce s-a modificat (de exemplu `setari:hero:titlu`). Doua
 * modificari cu aceeasi cheie, una dupa alta in `FEREASTRA_LIPIRE_MS`, devin un
 * singur pas: se pastreaza starea dinaintea PRIMEI, nu se mai noteaza nimic.
 * O modificare noua sterge mereu ce se putea reface.
 */
export function noteaza<T>(
  ist: Istoric<T>,
  inainte: T,
  { cheie = null, acum }: { cheie?: string | null; acum: number },
): Istoric<T> {
  const lipita = cheie !== null && cheie === ist.ultimaCheie && acum - ist.ultimaLa < FEREASTRA_LIPIRE_MS;
  if (lipita) return { ...ist, viitor: [], ultimaLa: acum };
  const trecut = [...ist.trecut, inainte];
  if (trecut.length > MAX_ISTORIC) trecut.splice(0, trecut.length - MAX_ISTORIC);
  return { trecut, viitor: [], ultimaCheie: cheie, ultimaLa: acum };
}

/** Pasul inapoi: starea de aplicat si istoricul nou, sau `null` cand n-are unde. */
export function anuleaza<T>(ist: Istoric<T>, curenta: T): { stare: T; istoric: Istoric<T> } | null {
  if (ist.trecut.length === 0) return null;
  const trecut = ist.trecut.slice(0, -1);
  const stare = ist.trecut[ist.trecut.length - 1];
  // Dupa un pas inapoi, urmatoarea modificare nu se mai lipeste de cea anulata.
  return { stare, istoric: { trecut, viitor: [...ist.viitor, curenta], ultimaCheie: null, ultimaLa: 0 } };
}

/** Pasul inainte, dupa un Anuleaza. `null` cand nu e nimic de refacut. */
export function reface<T>(ist: Istoric<T>, curenta: T): { stare: T; istoric: Istoric<T> } | null {
  if (ist.viitor.length === 0) return null;
  const viitor = ist.viitor.slice(0, -1);
  const stare = ist.viitor[ist.viitor.length - 1];
  return { stare, istoric: { trecut: [...ist.trecut, curenta], viitor, ultimaCheie: null, ultimaLa: 0 } };
}
