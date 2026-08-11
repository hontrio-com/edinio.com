/**
 * Taierea unei liste de id-uri in bucati care incap intr-un filtru `.in(...)`.
 *
 * ═══ DE CE E NEVOIE ═══
 *
 * `.in("id", ids)` NU pleaca in corpul cererii, ci in ADRESA:
 * `PATCH /rest/v1/products?business_id=eq.X&id=in.(uuid,uuid,...)`. Fiecare
 * UUID adauga 37 de semne, deci lista creste adresa liniar, iar marginea o
 * respinge cand devine prea lunga. Nu e o limita a bazei si nu apare in
 * documentatie — o vezi doar cand cade.
 *
 * ═══ NUMERELE SUNT MASURATE, NU GHICITE (2026-08-11) ═══
 *
 * Sonda: `GET /rest/v1/products?select=id&id=in.(N uuid-uri)` pe proiectul
 * real, cu cheia publica, pe id-uri inventate — deci fara sa atinga vreun rand.
 *
 *     N=100  → 3,8 kB  → 200
 *     N=200  → 7,5 kB  → 200
 *     N=300  → 11,2 kB → 200
 *     N=500  → 18,6 kB → 200
 *     N=600  → 22,3 kB → 200
 *     N=700  → 26,0 kB → 400 „Bad Request"
 *     N=800  → 29,7 kB → 400 „Bad Request"
 *
 * Pragul e intre 600 si 700. Raspunsul de 400 vine ca TEXT SIMPLU, nu ca eroarea
 * JSON a lui PostgREST — deci cererea e respinsa la margine, inainte sa ajunga
 * la baza. Asta si explica de ce esecul nu spune nimic despre id-uri.
 *
 * ⚠ De aici a venit defectul reparat: `bulkProductAction` avea plafonul la 1000,
 * adica PESTE pragul la care platforma cedeaza. Chiar si o selectie de exact
 * 1000 de produse ar fi picat, iar utilizatorul primea „Eroare la actiunea in
 * masa. Incearca din nou." — un mesaj care il trimitea sa reincerce exact ce nu
 * avea cum sa mearga.
 *
 * ═══ DE CE 200 SI NU 600 ═══
 *
 * 200 lasa de trei ori loc pana la prag. Adresa nu contine doar id-urile:
 * filtrele in plus (`business_id`, `select`, ordonare) intra tot acolo, iar
 * un apel cu mai multe conditii ajunge la prag cu mai putine id-uri. Si e
 * numarul deja folosit in `trendyol.actions.ts` pentru acelasi motiv — un al
 * doilea numar ar fi insemnat doua reguli pentru aceeasi limita.
 */
export const ID_PER_CERERE = 200;

/**
 * Lista taiata in bucati de cel mult `marime`. Lista goala da zero bucati, nu
 * una goala — apelantul nu trebuie sa se pazeasca de o cerere fara id-uri.
 */
export function bucatiDeIduri<T>(ids: T[], marime: number = ID_PER_CERERE): T[][] {
  if (marime < 1) throw new Error("[id-chunks] marimea bucatii trebuie sa fie cel putin 1");
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += marime) out.push(ids.slice(i, i + marime));
  return out;
}
