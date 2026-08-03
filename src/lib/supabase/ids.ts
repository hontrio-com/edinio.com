/**
 * Id-urile pe care le poate primi o interogare.
 *
 * Coloanele de id sunt `uuid`, iar PostgREST refuza cu 400 un `.in()` care
 * contine o valoare neconvertibila (Postgres 22P02) — si refuza TOT raspunsul,
 * nu doar randul gresit. Iar `supabase-js` nu arunca: pune eroarea in `error` si
 * lasa `data` pe null, deci un `data ?? []` scris fara grija transforma refuzul
 * intr-o lista goala perfect linistita.
 *
 * Sta intr-un loc neutru fiindca nu descrie o regula de afaceri, ci o proprietate
 * a BAZEI: doua copii ar trebui sa ramana de acord cu parserul de uuid al lui
 * Postgres la nesfarsit. Aceeasi capcana a produs deja doua constatari in auditul
 * de preturi (9 si 13).
 */

const TIPAR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esteUuid(v: unknown): v is string {
  return typeof v === "string" && TIPAR_UUID.test(v);
}
