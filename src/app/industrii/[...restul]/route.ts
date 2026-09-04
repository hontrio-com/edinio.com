/**
 * Tot ce e SUB `/industrii` răspunde la fel: 410.
 *
 * Fără fișierul ăsta, `/industrii/haine` ar cădea în 404-ul de vitrină — adică
 * ar întreba baza la fiecare cerere dacă „industrii" e un magazin, și ar desena
 * bannerul de cookie-uri al unui magazin inexistent. Exact ce se întâmpla până
 * azi cu `/industrii/bijuterii`, adresa moartă din 13.08.
 *
 * `[...restul]` prinde și `/industrii/haine`, și orice adâncime sub el: cele
 * șapte adrese vechi erau de un singur segment, dar un crawler care a inventat
 * `/industrii/haine/preturi` primește același răspuns cinstit.
 *
 * ⚠ Răspunsul vine din `../route.ts`, nu e scris a doua oară. Două corpuri de
 * 410 s-ar despărți la prima modificare, iar cel de sub el n-ar mai fi probat.
 */

import { raspunsRetras } from "../route";

export const dynamic = "force-dynamic";

export async function GET() {
  return raspunsRetras();
}
