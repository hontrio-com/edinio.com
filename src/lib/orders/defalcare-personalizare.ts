/**
 * Din ce se compune pretul unei linii de comanda personalizate.
 *
 * ═══ ⚠ SE CITESTE CE A SCRIS SERVERUL, NU SE RESOCOTESTE ═══
 *
 * Serverul scrie pe fiecare linie DOUA chei: `customization` — instantaneul valorilor alese de
 * client — si `personalizare` — din ce se compune pretul: aria, aria facturata, tariful lei/m² si
 * defalcarea rand cu rand. Forma e `PersonalizareComanda.detaliu` din `lib/customization/comanda.ts`,
 * scrisa de motorul din `lib/customization/pret.ts`.
 *
 * ⚠ AICI NU EXISTA NICIUN CALCUL DE PRET, si asta e chiar rostul modulului. Panoul arata numerele
 * puse de motorul care a INCASAT. O a doua socoteala facuta in panou s-ar fi departat de prima la
 * prima corectura — si atunci ecranul comerciantului ar fi contrazis factura emisa din aceleasi
 * date, fara ca nimeni sa poata spune care dintre ele minte.
 *
 * ⚠ SI NIMIC DE AICI NU ARUNCA. `orders.items` e jsonb vechi: comenzile de pana acum n-au deloc
 * cheia, iar liniile trecute prin editarea din panou pastreaza cheile necunoscute printr-un spread,
 * deci pot ajunge aici cu orice in ele. O exceptie ar fi albit pagina INTREAGA a comenzii — adica
 * i-ar fi luat comerciantului si adresa, si AWB-ul, si butonul de factura, pentru o defalcare pe
 * care oricum n-o avea.
 */

/**
 * Cate randuri se citesc dintr-o defalcare.
 *
 * ⚠ Plafonul e pentru datele SCRISE DE MANA, nu pentru cele scrise de motor: acolo randurile ies
 * din campurile produsului, iar `MAX_CAMPURI` din definitie le tine deja la 30. Un `items` editat
 * cu zece mii de randuri ar fi randat zece mii de noduri in pagina comenzii.
 */
const MAX_RANDURI = 40;

/** Cat se arata dintr-o eticheta sau dintr-un detaliu, ca un sir lung sa nu rupa randarea. */
const MAX_TEXT = 200;

export interface RandDefalcareCitit {
  eticheta: string;
  suma: number;
  /** „8,75 m² x 89 lei/m²", exact cum l-a scris serverul. */
  detaliu?: string;
}

export interface DefalcareCitita {
  randuri: RandDefalcareCitit[];
  /** Suprafata masurata din dimensiunile clientului, in m². */
  aria?: number;
  /** Cat s-a facturat din ea, dupa suprafata minima si rotunjirea comerciantului. */
  ariaFacturata?: number;
}

/**
 * Un numar scris de server.
 *
 * ⚠ STRICT: un sir nu se preface in numar. Pe restul proiectului `Number(x)` e purtarea obisnuita,
 * dar aici numerele vin dintr-un jsonb care poate fi si editat, iar un numar GHICIT intr-o
 * defalcare de bani e mai rau decat un rand lipsa: randul lipsa se vede, cel ghicit nu.
 */
function numar(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function textScurt(x: unknown): string {
  return typeof x === "string" ? x.slice(0, MAX_TEXT).trim() : "";
}

/**
 * S-a facturat alta suprafata decat cea masurata?
 *
 * ⚠ O SINGURA REGULA DE COMPARATIE, folosita si de `citesteDefalcarea` (ca sa stie daca are ce
 * arata) si de `suprafataDeAratat` (ca sa stie ce arata). Doua comparatii scrise separat s-ar fi
 * departat la prima corectura, si atunci blocul s-ar fi deschis pentru un rand care nu se randeaza.
 *
 * `false` cand una dintre ele lipseste: pe un produs care nu se vinde la metru patrat n-are ce sa
 * se compare.
 */
function ariiDiferite(aria: number | undefined, ariaFacturata: number | undefined): boolean {
  if (aria === undefined || ariaFacturata === undefined) return false;
  /* Comparatia se face la doi zecimali, adica exact la cati se si afiseaza. */
  return Math.round(aria * 100) !== Math.round(ariaFacturata * 100);
}

/**
 * Citeste cheia `personalizare` a unei linii de comanda.
 *
 * `null` inseamna „linia asta n-are ce arata" — comanda veche, cheie stearsa, sau continut pe care
 * nu-l intelegem. Panoul arata atunci exact ce arata azi.
 */
export function citesteDefalcarea(brut: unknown): DefalcareCitita | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const p = brut as Record<string, unknown>;

  const randuri: RandDefalcareCitit[] = [];
  for (const r of Array.isArray(p.defalcare) ? p.defalcare : []) {
    if (randuri.length >= MAX_RANDURI) break;
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const o = r as Record<string, unknown>;
    const suma = numar(o.suma);
    const eticheta = textScurt(o.eticheta);
    /*
     * ⚠ Randul fara eticheta sau fara suma se ARUNCA, nu se completeaza cu „—" si cu 0 lei. Un
     * „0,00 lei" pe ecran e o afirmatie despre bani, si e cea gresita: acolo nu se stie cat s-a
     * incasat pe randul ala, nu se stie ca n-a costat nimic.
     */
    if (!eticheta || suma === undefined) continue;
    const detaliu = textScurt(o.detaliu);
    randuri.push({ eticheta, suma, ...(detaliu ? { detaliu } : {}) });
  }

  const aria = numar(p.aria);
  const ariaFacturata = numar(p.ariaFacturata);
  /*
   * ⚠ „ARE CE ARATA" INSEAMNA RANDURI SAU O SUPRAFATA FACTURATA ALTFEL DECAT CEA MASURATA —
   * nu „exista cheia".
   *
   * Un produs care cere dimensiunile FARA sa le puna pret — modul „adaugat" cu un singur camp de
   * dimensiuni, adica familia personalizarilor care nu costa nimic — primeste si el `aria` si
   * `ariaFacturata` pe comanda, cu `defalcare` GOALA. Pe el, un „exista aria" ar fi deschis in panou
   * un titlu „Pretul personalizarii" fara niciun rand sub el: o vorba despre bani pe o alegere care
   * n-a costat nimic, exact pe produsele care mergeau ieri fara nimic in plus pe ecran.
   */
  if (!randuri.length && !ariiDiferite(aria, ariaFacturata)) return null;

  return {
    randuri,
    ...(aria !== undefined ? { aria } : {}),
    ...(ariaFacturata !== undefined ? { ariaFacturata } : {}),
  };
}

/**
 * Suprafata masurata si cea facturata, cand nu sunt aceeasi.
 *
 * ⚠ Se COMPARA doua numere salvate, nu se socoteste niciunul. Diferenta apare cand a intrat
 * suprafata minima facturabila sau rotunjirea in sus — si tocmai atunci comerciantul trebuie sa
 * poata spune clientului de ce plateste 8,75 m² pentru un fototapet de 8,40.
 *
 * `null` cand sunt egale, sau cand una dintre ele lipseste — aceeasi regula pe care o foloseste
 * si `citesteDefalcarea` ca sa hotarasca daca blocul are ce arata.
 */
export function suprafataDeAratat(d: DefalcareCitita): { masurat: number; facturat: number } | null {
  const { aria, ariaFacturata } = d;
  if (aria === undefined || ariaFacturata === undefined) return null;
  if (!ariiDiferite(aria, ariaFacturata)) return null;
  return { masurat: aria, facturat: ariaFacturata };
}

/**
 * Suprafata scrisa asa cum o citeste omul: „8,75 m²".
 *
 * ⚠ Aceeasi forma ca pe pagina de produs si ca in detaliul salvat pe comanda (`caM2` din
 * `lib/customization/pret.ts`, care e privat acolo). E o FORMATARE, nu o socoteala: doi zecimali
 * si virgula, ca sa nu apara „8.75 m²" langa „8,75 m² x 89 lei/m²" pe acelasi ecran.
 */
export function caM2(n: number): string {
  return `${(Math.round(n * 100) / 100).toFixed(2).replace(".", ",")} m²`;
}
