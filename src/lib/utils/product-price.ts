import { combinatiiActiveUnice, comboUnitPrice, parseVariants } from "@/lib/storefront/variants";
import { normalizeazaDefinitia } from "@/lib/customization/definitie";
import { podeaPersonalizarii, pretulDepindeDeAlegeri } from "@/lib/customization/pret";

export interface PriceRange {
  min: number;
  max: number;
  /** true cand produsul are variante cu preturi diferite (min != max) */
  hasRange: boolean;
  /**
   * Produsul are variante, dar NICIUNA nu se poate cumpara.
   *
   * `min` si `max` raman pe pretul de baza, ca sa nu scrie „0 lei" — dar acel
   * pret nu e o oferta, si cine il afiseaza trebuie sa spuna „Stoc epuizat".
   * Camp obligatoriu, nu optional: un steag optional se uita exact acolo unde
   * conteaza.
   */
  faraOferta: boolean;
  /**
   * Numarul afisat e cel mai MIC pret posibil, nu pretul exact.
   *
   * ⚠ Cine il ignora scrie „89 lei" pe un fototapet care nu se poate cumpara sub 603 — vezi
   * nota lunga de la `getProductPriceRange`. Optional, ca sa nu strice cei trei apelanti care
   * construiesc `PriceRange` de mana; lipsa inseamna „nu, e pretul exact".
   */
  dePornire?: boolean;
}

/**
 * Intervalul de pret al unui produs, calculat din EXACT combinatiile pe care
 * clientul chiar le poate cumpara.
 *
 * Regula asta era scrisa de doua ori si nu spunea acelasi lucru. Ce se poate
 * cumpara (`combinatiiActiveUnice`, `enabledComboPriceMap`, si de acolo comanda)
 * cerea `c.enabled` adevarat si tinea doar PRIMA combinatie per titlu; ce se
 * afisa sarea doar cand `enabled === false` si numara toate randurile, inclusiv
 * titlurile duplicate — 129 de perechi in productie. Deci intervalul putea porni
 * de la un pret care nu era de vanzare, iar cardul promitea „de la 203" pentru un
 * produs care se vinde cu 231.
 *
 * Trei diferente mai marunte, toate aliniate acum la regula vandabila:
 *   - un rand `null` in `combinations` arunca (`c.enabled` pe null), si arunca pe
 *     SERVER, in `slimCatalogProduct`, adica pe toata lista de produse;
 *   - un pret „0" sau nenumeric stergea randul din interval, in loc sa cada pe
 *     pretul de baza cum face `comboUnitPrice` — asa un dus-intors export-import
 *     ridica minimul afisat peste ce se incaseaza;
 *   - `variants.enabled` fara `options` producea un interval, desi peste tot
 *     altundeva un asemenea produs e SIMPLU.
 *
 * ═══ ⚠ SI PODEAUA PERSONALIZARII (adaugata 06.09.2026) ═══
 *
 * `products.price` a incetat sa fie pretul produsului in ziua in care personalizarea a capatat
 * pret. La un fototapet cu `includePretulProdusului` STINS — configurarea pe care chiar panoul o
 * recomanda — cei 89 de lei din catalog nu se incaseaza NICIODATA: nu-s nici pret de vanzare, nici
 * pret de pornire, nu-s nimic. Si tocmai ei plecau de aici pe card, in sortare, in filtrul de pret,
 * in insigna de reducere, in JSON-LD, la Google Merchant si in catalogul Meta.
 *
 * Masurat: card „89,00 lei", pagina „603,75 lei". De 6,8 ori mai mult, intre doua ecrane, fara ca
 * omul sa fi atins nimic. Iar fara implicite pe laturi pagina scria chiar „0,00 lei", deci cei 89
 * nu erau pret de pornire in NICIO configuratie.
 *
 * ⚠ SE REPARA AICI, si nu in card, fiindca aici trec TOATE suprafetele: cardul, sortarea
 * (`sortare.ts`), filtrul de pret si cel de reduceri (SQL, prin `catalog_produs.price_min`),
 * insigna de discount si datele structurate. Reparat in card, celelalte sase ar fi ramas pe numarul
 * vechi si s-ar fi contrazis intre ele.
 *
 * ⚠ PODEAUA SE APLICA PE FIECARE PRET, nu doar pe minim: un produs cu variante SI personalizare
 * are alta podea pe fiecare combinatie, fiindca ea porneste de la pretul combinatiei.
 *
 * ⚠ `catalog_produs.price_min` e MATERIALIZAT. Dupa livrare, randurile cu personalizare
 * trebuie repuse in `catalog_murdar`, altfel cardurile raman pe numarul vechi desi codul e nou.
 */
export function getProductPriceRange(basePrice: number, pageSections: unknown): PriceRange {
  const base = Number(basePrice) || 0;

  /*
   * ⚠ DOUA INTRARI, si amandoua trebuie sa dea acelasi raspuns.
   *
   * Pe datele INTREGI (pagina de produs, blocul din paginile proprii, proiectorul) definitia se
   * poate citi si podeaua se socoteste. Pe datele SLIMUITE — ce ajunge in browser pe suprafetele
   * de catalog — campurile nu mai exista dinadins, si atunci se citeste steagul lasat in loc de
   * `slimPageSections`. Fara a doua ramura, cardul din grila ar fi ramas singurul ecran care nu
   * stie ca pretul lui e o podea.
   */
  const ps = (pageSections ?? null) as { customization?: unknown } | null;
  const definitie = normalizeazaDefinitia(ps?.customization);
  const steagSlim =
    (ps?.customization as { dePornire?: unknown } | undefined)?.dePornire === true;

  const podea = (pret: number): number =>
    definitie ? podeaPersonalizarii(definitie, pret) ?? pret : pret;
  const dePornire = definitie ? pretulDepindeDeAlegeri(definitie, base) : steagSlim;
  const cuSteag = (r: PriceRange): PriceRange => (dePornire ? { ...r, dePornire: true } : r);

  const variants = parseVariants(pageSections);
  if (!variants) {
    const p = podea(base);
    return cuSteag({ min: p, max: p, hasRange: false, faraOferta: false });
  }

  const preturi = combinatiiActiveUnice(variants)
    .map((c) => comboUnitPrice(c, base))
    .filter((p) => Number.isFinite(p) && p > 0)
    .map(podea);

  if (preturi.length === 0) {
    const p = podea(base);
    return cuSteag({ min: p, max: p, hasRange: false, faraOferta: true });
  }

  const min = Math.min(...preturi);
  const max = Math.max(...preturi);
  return cuSteag({ min, max, hasRange: max > min, faraOferta: false });
}
