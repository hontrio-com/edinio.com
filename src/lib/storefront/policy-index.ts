import { parseStoreSeo } from "@/lib/seo";

/**
 * Care pagini de politici pot intra in Google.
 *
 * Erau toate sase pe `noindex`, dintr-un reflex bun in general — sunt pagini de
 * text asemanator de la un magazin la altul — dar gresit aici: Google Merchant
 * Center CERE politica de retur si termenii indexabili ca sa valideze contul, iar
 * fara ele contul nu trece, deci magazinul nu poate face reclama la produse. O
 * regula de igiena SEO bloca vanzarea.
 *
 * Acum sunt indexabile implicit, cu doua conditii si o supapa:
 *  - pagina trebuie sa AIBA text (stinsa din editor sau fara continut si fara
 *    sablon, arata un rand de „nu e disponibila", care n-are ce cauta in index);
 *  - `noindex`-ul de magazin, din Setari > SEO, le acopera si pe ele: cine ascunde
 *    magazinul din Google nu se astepta sa-i ramana politicile indexate;
 *  - comerciantul poate scoate oricare dintre ele, una cate una, din Setari > SEO.
 *
 * Modulul e pur: il citesc si paginile (pentru `robots`) si cele doua sitemapuri,
 * iar raspunsul trebuie sa fie acelasi in toate trei. Scris de doua ori, s-ar fi
 * ajuns la o pagina `noindex` listata in sitemap — exact semnalul contradictoriu
 * pe care Search Console il raporteaza ca eroare.
 */

/** Segmentul din adresa → cheia din `store_policies`. Ordinea e cea din subsol. */
export const TIPURI_POLITICI: { tip: string; cheie: string; eticheta: string }[] = [
  { tip: "termeni", cheie: "terms", eticheta: "Termeni si conditii" },
  { tip: "livrare", cheie: "delivery", eticheta: "Politica de livrare" },
  { tip: "retur", cheie: "return", eticheta: "Politica de retur" },
  { tip: "confidentialitate", cheie: "privacy", eticheta: "Politica de confidentialitate" },
  { tip: "gdpr", cheie: "gdpr", eticheta: "GDPR" },
  { tip: "anulare", cheie: "cancellation", eticheta: "Politica de anulare a comenzii" },
];

/**
 * Politica are text de aratat?
 *
 * `store_policies[cheie]` e ori un sir (continutul), ori `{ content, enabled }`.
 * Lipsa continutului NU inseamna pagina goala: acolo intra sablonul generat
 * automat, si exista sablon pentru toate sase. Doar `enabled: false` goleste
 * pagina cu adevarat.
 */
export function politicaAreText(politici: unknown, cheie: string): boolean {
  const val = (politici as Record<string, unknown> | null)?.[cheie];
  if (val && typeof val === "object") return (val as { enabled?: unknown }).enabled !== false;
  // Sir gol sau cheie absenta: sablonul generat umple pagina.
  return true;
}

/** Politica asta intra in Google? */
export function politicaIndexabila(
  pageContent: unknown,
  politici: unknown,
  tip: string,
): boolean {
  const seo = parseStoreSeo(pageContent);
  if (seo.noindex) return false;
  if (seo.politiciNoindex?.includes(tip)) return false;
  const cheie = TIPURI_POLITICI.find((p) => p.tip === tip)?.cheie;
  if (!cheie) return false;
  return politicaAreText(politici, cheie);
}

/** Toate paginile de politici indexabile, pentru sitemap. */
export function politiciIndexabile(pageContent: unknown, politici: unknown): string[] {
  return TIPURI_POLITICI
    .map((p) => p.tip)
    .filter((tip) => politicaIndexabila(pageContent, politici, tip));
}
