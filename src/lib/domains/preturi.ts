/**
 * Preturile de inregistrare a domeniilor, in lei pe an.
 *
 * SURSA UNICA DE ADEVAR, folosita si de interfata (ca sa afiseze), si de server
 * (ca sa incaseze). Inainte tabelul trai doar in componenta de dashboard, iar
 * `/api/stripe/domain-checkout` calcula `unit_amount` din `pricePerYear` primit
 * in corpul cererii — adica din browser. Cine intercepta cererea putea trimite
 * `pricePerYear: 1` si cumpara un domeniu .ro cu 1 leu in loc de 60.
 *
 * Actualizeaza valorile manual din panoul de reseller.
 */
export const PRETURI_TLD: Record<string, number> = {
  ".ro": 60,
  ".com": 99,
};

/** Perioada de inregistrare permisa, in ani. */
export const PERIOADA_MIN = 1;
export const PERIOADA_MAX = 10;

export type OptiuneTld = { tld: string; price: number; label: string };

/** Lista pentru interfata, derivata din aceeasi sursa. */
export const OPTIUNI_TLD: OptiuneTld[] = Object.entries(PRETURI_TLD).map(([tld, price]) => ({
  tld,
  price,
  label: tld,
}));

/** Pretul pe an, sau `null` daca extensia nu e una pe care o vindem. */
export function pretPeAn(tld: string): number | null {
  return PRETURI_TLD[(tld ?? "").trim().toLowerCase()] ?? null;
}

/**
 * Recalculeaza total server-side. Returneaza `null` daca extensia sau perioada
 * nu sunt valide — apelantul trebuie sa refuze cererea, nu sa continue cu o
 * valoare de rezerva.
 */
export function calculeazaTotal(tld: string, ani: unknown): { peAn: number; ani: number; total: number } | null {
  const peAn = pretPeAn(tld);
  if (peAn === null) return null;

  const n = Number(ani);
  if (!Number.isInteger(n) || n < PERIOADA_MIN || n > PERIOADA_MAX) return null;

  return { peAn, ani: n, total: peAn * n };
}
