/**
 * Asezarea produselor pe pagina principala: in ce ordine se vad.
 *
 * ═══ DE CE E UN FISIER SEPARAT ═══
 *
 * Ordinea catalogului se calculeaza in DOUA locuri care trebuie sa spuna acelasi
 * lucru: `sortare.ts` (palierul client, care are catalogul intreg in memorie) si
 * `ORDER BY`-ul din `catalog_pagina` (palierul server, care feliaza in SQL).
 *
 * Cand cele doua nu spun acelasi lucru iese defectul care a lovit deja de trei
 * ori pe suprafetele astea: acelasi NUMAR de produse, ALTE produse. Nu se vede
 * din contoare si nu-l raporteaza nimeni.
 *
 * Deci tot ce e NOU aici — samanta amestecului si cheia unui produs — se scrie o
 * singura data, in TypeScript, si pleaca spre SQL ca PARAMETRU. SQL nu recalculeaza
 * nimic: primeste samanta gata amestecata si face un singur XOR. Asa nu exista
 * doua implementari care se pot desincroniza.
 */

/** Cate produse pot fi puse la rand de mana. Peste atat, `getProductsByIds` taie oricum la 100. */
export const MAX_ORDINE_MANUALA = 100;

/**
 * Felul in care se aseaza produsele.
 *
 * Sirul gol inseamna „nu s-a ales nimic" si pastreaza purtarea de dinainte:
 * pagina cade pe `sort_options.default_sort`, apoi pe „newest". Un magazin care
 * nu deschide panoul nu trebuie sa vada nicio schimbare.
 */
export type ModAsezare =
  | ""
  | "newest"
  | "price_asc"
  | "price_desc"
  | "name_asc"
  | "popular"
  | "random"
  | "manual";

/** Ordinea restului la „manual". Nu poate fi tot „manual" — s-ar invarti in gol. */
export type ModRest = Exclude<ModAsezare, "manual" | "">;

export interface Asezare {
  mod: ModAsezare;
  /** Doar la `manual`: id-urile puse in fata, in ordinea aleasa de comerciant. */
  ids: string[];
  /** Doar la `manual`: dupa ce regula vine restul catalogului. */
  rest: ModRest;
}

const MODURI: ReadonlySet<string> = new Set<ModAsezare>([
  "newest", "price_asc", "price_desc", "name_asc", "popular", "random", "manual",
]);

const MODURI_REST: ReadonlySet<string> = new Set<ModRest>([
  "newest", "price_asc", "price_desc", "name_asc", "popular", "random",
]);

export const ASEZARE_IMPLICITA: Asezare = { mod: "", ids: [], rest: "newest" };

/**
 * Citeste asezarea din `page_content`, cu tot ce e invalid cazut pe implicit.
 *
 * `page_content` e un JSON scris de editor, deci poate contine orice a ramas de
 * la o versiune veche sau de la un import. Un mod necunoscut nu are voie sa
 * goleasca grila: cade pe sirul gol, adica pe purtarea dinainte.
 */
export function citesteAsezare(pageContent: Record<string, unknown> | null | undefined): Asezare {
  const brut = (pageContent?.home_order ?? null) as Record<string, unknown> | null;
  if (!brut || typeof brut !== "object") return ASEZARE_IMPLICITA;

  const mod = typeof brut.mod === "string" && MODURI.has(brut.mod) ? (brut.mod as ModAsezare) : "";
  const rest = typeof brut.rest === "string" && MODURI_REST.has(brut.rest) ? (brut.rest as ModRest) : "newest";

  /*
   * Id-urile se curata AICI, nu la folosire, fiindca lista pleaca in DOUA locuri
   * care trebuie sa inteleaga acelasi lucru: comparatorul din browser si harta
   * trimisa lui `catalog_pagina`.
   *
   * ⚠ Se scot si DUBLURILE, si nu din curatenie: un id repetat inseamna doua
   * pozitii pentru acelasi produs, iar cele doua parti ar fi ales-o pe alta —
   * `Map` din TS pastreaza ULTIMA aparitie, iar o cautare de pozitie o da pe
   * PRIMA. Adica exact clasa „acelasi numar de produse, alta ordine", care nu se
   * vede din contoare. Fara dublicate, intrebarea nici nu se pune.
   */
  const vazute = new Set<string>();
  const ids: string[] = [];
  if (Array.isArray(brut.ids)) {
    for (const x of brut.ids as unknown[]) {
      if (typeof x !== "string" || !x || vazute.has(x)) continue;
      vazute.add(x);
      ids.push(x);
      if (ids.length >= MAX_ORDINE_MANUALA) break;
    }
  }

  return { mod, ids, rest };
}

/**
 * Lista manuala, in forma pe care o citeste SQL: `{ id: pozitie }`.
 *
 * ⚠ Obiect, nu tablou, si asta e o alegere MASURATA. Pe cel mai mare magazin
 * (3351 de produse), `array_position` peste o lista de 100 costa **13,5 ms** —
 * se plimba prin tot tabloul pentru FIECARE rand. Cautarea intr-un obiect jsonb
 * e binara pe chei sortate: **1,7 ms**, de opt ori mai ieftin, si fara niciun
 * join in plus care ar fi trebuit scos apoi din randurile intoarse.
 *
 * Al doilea castig, tacut: cheile unui obiect sunt siruri prin constructie, deci
 * dispare si capcana `array_position` pe un tablou care contine NULL — aceea
 * intoarce NULL pentru TOATE randurile, adica ordinea manuala ar fi disparut
 * fara nicio eroare.
 */
export function hartaOrdine(ids: string[]): Record<string, number> {
  const harta: Record<string, number> = {};
  ids.forEach((id, i) => { harta[id] = i; });
  return harta;
}

/**
 * Sortarea EFECTIVA a paginii principale, din asezare si din vechea setare.
 *
 * `sort_options.default_sort` ramane citita cand asezarea nu spune nimic — atat
 * pentru magazinele care o aveau scrisa, cat si fiindca `/magazin` o citeste pe
 * ACEEASI cheie (vezi `pagina-magazin.tsx`). De aia asezarea e o cheie NOUA si nu
 * o rescriere a celei vechi: altfel un comerciant care schimba ordinea paginii
 * principale ar fi schimbat-o, fara sa stie, si pe pagina de catalog.
 */
export function sortareaAsezarii(
  asezare: Asezare,
  defaultSort: string | undefined | null,
): string {
  return asezare.mod || defaultSort || "newest";
}

/* ── Amestecul ────────────────────────────────────────────────────────────── */

/**
 * Amestecarea unui intreg pe 32 de biti (finalizatorul din murmur3).
 *
 * `Math.imul` inmulteste pe 32 de biti exact — `a * b` obisnuit ar fi trecut de
 * 2^53 si ar fi pierdut biti de jos, adica exact bitii care conteaza aici.
 */
export function amestecaBiti(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Ziua din calendarul magazinului, ca numar (20260903).
 *
 * Fusul e fixat pe Bucuresti, nu luat din mediu: pe Vercel serverul e pe UTC, si
 * intre miezul noptii romanesc si cel UTC ziua ar fi fost alta — deci alta
 * ordine — timp de doua sau trei ore in fiecare noapte.
 */
export function ziuaMagazinului(acum: Date): number {
  const [an, luna, zi] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(acum).split("-");
  return Number(an) * 10000 + Number(luna) * 100 + Number(zi);
}

/**
 * Samanta amestecului de azi.
 *
 * ⚠ SE CALCULEAZA PE SERVER si se trimite mai departe ca prop. Doua motive, si
 * fiecare in parte ar fi de ajuns:
 *
 * 1. **Hidratarea.** Calculata in timpul randarii din browser, ar fi citit ceasul
 *    vizitatorului. HTML-ul venit de la server si prima randare din browser ar fi
 *    iesit diferite exact la miezul noptii si pe orice ceas nepotrivit — iar React
 *    raporteaza asta ca eroare de hidratare si rearanjeaza toata grila.
 * 2. **Paginarea.** Pe palierul server paginile sunt cereri HTTP separate. Cu o
 *    samanta care se schimba de la o cerere la alta, `LIMIT/OFFSET` ar aseza altfel
 *    aceleasi randuri: un produs ar aparea pe doua pagini si altul pe niciuna.
 *
 * De aia se schimba o data pe zi si nu la fiecare vizita: o ordine „noua la
 * fiecare apasare" nu poate fi paginata fara sa poarte samanta prin adresa, iar
 * asta ar fi spart canonicalele si cache-ul pentru un castig pe care nu-l vede
 * nimeni.
 */
export function samantaAmestec(acum: Date): number {
  return amestecaBiti(ziuaMagazinului(acum));
}

/**
 * Cheia dupa care se aseaza un produs cand ordinea e „amestecat".
 *
 * Primii 32 de biti ai id-ului, XOR cu samanta. Id-ul e un UUID, deci bitii aia
 * sunt DEJA uniformi — nu mai are rost sa fie amestecati inca o data, si asa
 * partea din SQL ramane un singur XOR, fara inmultiri care ar fi depasit
 * `bigint`.
 *
 * ⚠ SAMANTA TREBUIE SA VINA DIN `samantaAmestec`, niciodata bruta.
 *
 * Aici nu se mai amesteca nimic — tocmai ca partea din SQL sa ramana un singur
 * XOR. Pretul e ca TOATA imprastierea sta in samanta: doua numere mici (20260903
 * si 20260904) difera doar in bitii de jos, iar bitii de jos aproape nu conteaza
 * intr-o sortare, deci ordinea ar iesi IDENTICA de la o zi la alta. Adica
 * „amestecat" care nu amesteca — un defect care arata perfect si nu da nicio
 * eroare. Contractul e pazit de o proba anume in `sortare.test.ts`.
 *
 * Cu o samanta bine amestecata, XOR-ul reaseaza lista intreaga: la fiecare bit,
 * cele doua jumatati ale ordinii se pot inversa independent. Doua zile la rand
 * dau samante fara nicio legatura intre ele, deci si ordini fara nicio legatura.
 *
 * ⚠ Coliziunile sunt posibile (32 de biti, cateva mii de produse) si sunt in
 * regula: departajarea finala pe id, din `sortare.ts`, pastreaza ordinea TOTALA.
 */
export function cheieAmestec(id: string, samanta: number): number {
  const u = parseInt(id.slice(0, 8), 16);
  return ((Number.isNaN(u) ? 0 : u) ^ samanta) >>> 0;
}
