import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Walk a PostgREST query past the silent 1000-row cap by fetching .range()
 * windows until a short window signals the end.
 *
 * PostgREST caps EVERY response at 1000 rows (Supabase default max-rows) and
 * does not error past the cap — it silently truncates. Any read that needs the
 * complete result set (exports, syncs, sitemap, aggregation inputs) must walk
 * windows. NOTE: the order-scale surfaces (Comenzi, Clienti, dashboard sums)
 * do NOT use this — they paginate/aggregate in SQL; this helper is for the
 * moderate-volume tables where the full set is genuinely needed.
 *
 * The caller builds the query for each window and MUST give it a stable,
 * deterministic ORDER BY (e.g. created_at + id tiebreaker) so rows don't shift
 * between windows while we paginate. Keep windows at 1000 (= max-rows) so a
 * short window reliably means "done".
 *
 * ═══ DOUA FUNCTII, FIINDCA SUNT DOUA INTREBARI DIFERITE ═══
 *
 * Varianta blanda intoarce ce a apucat sa citeasca si scrie in consola. Se
 * apara singura in comentariu: „no worse than the silent truncation this
 * replaces". E adevarat ca INTR-O COMPARATIE si irelevant ca GARANTIE — pentru
 * un sitemap sau o dedublare, „mai bine decat inainte" tot inseamna gresit.
 *
 * Asta e chiar semnatura incidentului din august: sitemapul platformei a
 * raspuns 200, valid, si gol, doua saptamani. Nimeni n-a aflat, fiindca un
 * raspuns partial arata exact ca unul adevarat.
 *
 * Alege dupa ce se intampla cu jumatatea lipsa:
 *
 *   `fetchAllRowsStrict` — cand lipsa SCHIMBA rezultatul in tacere:
 *      sitemapuri (adrese care dispar din Google), fluxuri catre marketplace
 *      (produse delistate), dedublari (emailuri trimise a doua oara),
 *      importuri (potriviri gresite), harta de imagini in uz (utilizatorul
 *      sterge o imagine folosita, fiindca i s-a scris ca nu e).
 *
 *   `fetchAllRows` — cand lipsa doar SARACESTE un ecran: panourile de
 *      administrare, listele din tabloul de bord. Acolo o pagina incompleta e
 *      mai buna decat un ecran de eroare, si omul vede imediat ca lipseste.
 */
const WINDOW = 1000;

async function plimba<T>(
  label: string,
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  strict: boolean,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += WINDOW) {
    const { data, error } = await query(from, from + WINDOW - 1);
    if (error) {
      if (strict) {
        /*
         * Se ARUNCA, nu se intoarce ce s-a apucat.
         *
         * Apelantul nu poate deosebi „atatea sunt" de „atatea am apucat sa
         * citesc", deci singurul mod de a nu-l lasa sa creada ce nu e adevarat
         * e sa nu-i dam niciun raspuns. Ce face mai departe — 503, reincercare,
         * oprirea cronului — e alegerea lui, dar o face STIIND.
         */
        throw new Error(
          `[fetch-all] ${label}: fereastra de la ${from} a esuat (${error.message}). ` +
          `Citirea trebuie sa fie completa, deci nu se intoarce un rezultat partial.`,
        );
      }
      console.error(`[fetch-all] ${label}: window at ${from} failed:`, error.message);
      break;
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < WINDOW) break;
  }
  return all;
}

/** Citire completa sau NIMIC. Vezi nota de mai sus pentru cand se alege. */
export function fetchAllRowsStrict<T>(
  label: string,
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  return plimba(label, query, true);
}

/**
 * Citire cu ce s-a putut. NUMAI pentru ecrane unde o lista incompleta e mai buna
 * decat o eroare — si unde omul care se uita vede ca lipseste.
 */
export function fetchAllRows<T>(
  label: string,
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  return plimba(label, query, false);
}
