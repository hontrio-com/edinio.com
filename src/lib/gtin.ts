/**
 * Codul de bare al produsului: validare si normalizare, intr-un singur loc.
 *
 * Comerciantul il scrie in formularul de produs (Organizare > GTIN / EAN / UPC)
 * si ajunge in `page_sections.google.gtin`. De acolo il citesc feedul Google
 * Merchant, feedul Facebook si datele structurate ale paginii publice. Toate
 * trei au aceeasi obligatie: un cod gresit e mai rau decat niciun cod, fiindca
 * duce la respingerea produsului, nu la ignorarea campului.
 *
 * Functia era scrisa de doua ori, litera cu litera, in `google-merchant/mapping`
 * si in `facebook/catalog-feed`. Datele structurate ar fi fost a treia copie.
 */

/**
 * Un GTIN are 8, 12, 13 sau 14 cifre, iar ultima e o cifra de control calculata
 * din celelalte (mod 10). Verificarea asta prinde tastarea gresita a unei cifre,
 * ceea ce simpla numarare a lor nu face.
 */
export function isValidGtin(raw: string | null | undefined): boolean {
  const s = normalizeGtin(raw);
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(s)) return false;
  const d = s.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Codul fara spatii, forma in care se trimite mai departe. */
export function normalizeGtin(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s/g, "");
}
