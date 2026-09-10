import { formatPrice, pluralRo } from "@/lib/utils/format";
import { textCurat } from "@/lib/storefront/date-structurate";
import { curataTextSeo, SEO_DESCRIERE_CATEGORIE_MAX, SEO_DESCRIPTION_MAX } from "@/lib/seo";
import type { CategorieArbore } from "@/lib/storefront/catalog/subarbore";

/**
 * Descrierea de cautare a paginii de catalog si a fiecarei categorii, generata din
 * datele paginii.
 *
 * ═══ DE CE EXISTA ═══
 *
 * Catalogul si toate categoriile purtau descrierea PAGINII PRINCIPALE (Setari >
 * SEO). Deci Google vedea acelasi text sub fiecare adresa a magazinului, iar un text
 * identic peste tot e exact ce spune Google ca „nu ajuta": atunci isi construieste
 * singur fragmentul din pagina, si comerciantul nu mai controleaza ce apare sub
 * link. Reclamat de caian-textile.ro (10.09.2026), si avea dreptate.
 *
 * ═══ CE SPUNE TEXTUL, SI CE NU SPUNE NICIODATA ═══
 *
 * Numai lucruri adevarate PE PAGINA: numele, categoria-parinte, cate produse arata
 * grila (de la 10 in sus), cel mai mic pret la care se poate CUMPARA, subcategoriile
 * care chiar au produse, sau primele produse din grila, in ordinea grilei.
 *
 * ⚠ Cand datele n-au putut fi citite, textul ramane doar cu deschiderea. Niciodata
 * „0 produse" la o eroare: un catalog gol arata a magazin fara marfa, nu a defect,
 * deci nu-l raporteaza nimeni (aceeasi lectie ca la RPC-ul din `pagina-magazin.tsx`).
 *
 * ⚠ O categorie fara produse primeste tot doar deschiderea. Textul nu-si anunta
 * golul in rezultatele de cautare.
 *
 * Modulul e PUR (nicio interogare), deci se poate proba si se poate folosi si in
 * browser: editorul din etapa 2 arata acelasi text ca placeholder.
 */

/** Ce arata grila paginii. Vine din `catalog_pagina`, vezi `context-descriere.ts`. */
export interface ContinutPagina {
  /** Cate produse arata grila (`total` din apelul A): exact numarul de pe pagina. */
  numar: number;
  /** Cel mai mic pret la care se poate cumpara (apelul B: in stoc, cu oferta). `null` = nu-l stim. */
  pretMinim: number | null;
  /** Produsul cel mai ieftin are mai multe preturi (variante): se scrie „de la". */
  interval: boolean;
  /** Numele primelor produse, in ordinea grilei. */
  produse: string[];
}

export interface ContextDescriere {
  /** Categoria-parinte, doar cand e UNICA si diferita de nume. */
  parinte: string | null;
  /** Subcategoriile cu produse, in ordinea din panou. Pe catalog: categoriile de sus cu produse, plus cele orfane. */
  subcategorii: string[];
  /** `null` = n-am putut citi grila. Nu inseamna „zero produse". */
  continut: ContinutPagina | null;
  /** Preturile sunt fara TVA (TVA-ul se adauga la plata): se scrie „fără TVA". */
  faraTva: boolean;
  /** Pagina de reduceri (`?sale=1`). */
  reduceri: boolean;
}

/**
 * Latimea pana la care textul intra intreg in rezultatele Google.
 *
 * Google taie dupa latimea in PIXELI, nu dupa numarul de caractere, iar majusculele
 * sunt mai late. Nu publica o limita in pixeli, deci nu o modelam exact: 155 de
 * „caractere medii", cu majuscula la 1,3. Plasa finala ramane `textCurat(text, 160)`.
 */
export const LATIME_MAXIMA = 155;

/** Numarul de la care descrierea spune cate produse sunt. Sub el, cifra nu ajuta pe nimeni. */
const PRAG_NUMAR = 10;

const SI = "și";

/** Latimea in zecimi, pe intregi: suma de 1,3 in virgula mobila da 155,00000000000003 si ar fi respins un text care incape. */
function zecimi(text: string): number {
  let z = 0;
  for (const ch of text) z += ch !== ch.toLowerCase() && ch === ch.toUpperCase() ? 13 : 10;
  return z;
}

/** Latimea estimata a textului: o majuscula cantareste 1,3, orice alt caracter 1. */
export function latimeEstimata(text: string): number {
  return zecimi(text) / 10;
}

const incape = (text: string) => zecimi(text) <= LATIME_MAXIMA * 10;

/** Spatiile comprimate: numele vin din importuri, cu spatii duble si la capete. */
const curat = (s: string) => s.replace(/\s+/g, " ").trim();

/** Un nume dintr-o lista: fara punctul de la coada, altfel „X.." la sfarsitul frazei. */
const numeDeLista = (s: string) => curat(s).replace(/[.\s]+$/u, "");

function unice(lista: string[]): string[] {
  const vazute = new Set<string>();
  const out: string[] = [];
  for (const x of lista) {
    if (!x || vazute.has(x)) continue;
    vazute.add(x);
    out.push(x);
  }
  return out;
}

/** „A", „A și B", „A, B și C". */
function enumera(nume: string[]): string {
  if (nume.length <= 1) return nume.join("");
  return `${nume.slice(0, -1).join(", ")} ${SI} ${nume[nume.length - 1]}`;
}

/** Prima varianta care incape; daca niciuna, cea mai scurta (ultima). */
function primaCareIncape(variante: string[]): string {
  return variante.find(incape) ?? variante[variante.length - 1];
}

/*
 * Forma juridica de la coada numelui: „ULTIMUL MAGAZIN S.R.L." devine „ULTIMUL
 * MAGAZIN". Doua reguli, fiindca literele mici conteaza diferit: „srl" scris mic e tot
 * o forma juridica, dar „sa" scris mic e un cuvant.
 */
const FORME_JURIDICE = [
  /[\s,]+(?:S\.\s?R\.\s?L\.?|SRL|P\.\s?F\.\s?A\.?|PFA)$/iu,
  /[\s,]+(?:S\.\s?A\.?|SA|I\.\s?I\.?|[IÎ]\.\s?F\.?)$/u,
];

/** Separatorul dintre nume si slogan: „BricoSmart - Solutii smart...". */
const SEPARATOR_SLOGAN = /\s(?:-|–|\|)\s/u;

/**
 * Numele scurt al magazinului, pentru descriere.
 *
 * Partea dinaintea primului „ - ", „ – " sau „ | ", daca are macar 3 caractere
 * („BricoSmart - Solutii smart pentru casa si gradina" devine „BricoSmart"), fara
 * forma juridica de la coada. Magazinele fara `store_name` se afiseaza cu numele
 * firmei, deci fara taierea asta ar fi aparut „S.R.L." in Google.
 */
export function numeScurtMagazin(displayName: string): string {
  const intreg = curat(displayName);
  const cap = intreg.split(SEPARATOR_SLOGAN)[0].trim();
  const ales = cap.length >= 3 ? cap : intreg;
  let fara = ales;
  for (const forma of FORME_JURIDICE) fara = fara.replace(forma, "").trim();
  return fara.length >= 3 ? fara : ales;
}

/**
 * Preturile magazinului sunt FARA TVA, iar TVA-ul se adauga la plata.
 *
 * Aceeasi regula ca la server, unde se incaseaza: `null` pe `prices_include_vat`
 * inseamna implicitul coloanei, adica „cu TVA" (`order.actions.ts`, `?? true`).
 * Fara sufix, descrierea ar fi promis in Google un pret mai mic decat cel platit.
 */
export function preturiFaraTva(
  cfg: { vat_enabled?: boolean | null; prices_include_vat?: boolean | null } | null | undefined,
): boolean {
  return cfg?.vat_enabled === true && cfg.prices_include_vat === false;
}

function pretScris(c: ContinutPagina, faraTva: boolean): string | null {
  const p = c.pretMinim;
  if (p == null || !Number.isFinite(p) || p <= 0) return null;
  return `${formatPrice(p)}${faraTva ? " fără TVA" : ""}`;
}

/**
 * Numarul si pretul, cu punctul final.
 *
 * „de la" numai cand chiar sunt mai multe preturi: mai multe produse, sau un produs
 * cu variante. Un singur pret scris „de la" ar sugera ca exista si altele.
 */
function numarSiPret(c: ContinutPagina, faraTva: boolean): string {
  const pret = pretScris(c, faraTva);
  if (c.numar >= PRAG_NUMAR) return `: ${pluralRo(c.numar)}${pret ? `, de la ${pret}` : ""}.`;
  if (!pret) return ".";
  if (c.numar >= 2 || c.interval) return `, de la ${pret}.`;
  return `: ${pret}.`;
}

/** „Subcategorii: A, B și C.", sau „A, B și altele." cand nu incap toate. */
function continuareSubcategorii(baza: string, subcategorii: string[]): string {
  const nume = unice(subcategorii.map(numeDeLista));
  if (nume.length === 0) return "";
  if (nume.length === 1) {
    const t = `Subcategoria: ${nume[0]}.`;
    return incape(`${baza} ${t}`) ? t : "";
  }
  const toate = `Subcategorii: ${enumera(nume)}.`;
  if (incape(`${baza} ${toate}`)) return toate;
  for (let k = nume.length - 1; k >= 1; k--) {
    const t = `Subcategorii: ${nume.slice(0, k).join(", ")} ${SI} altele.`;
    if (incape(`${baza} ${t}`)) return t;
  }
  return "";
}

/**
 * Primele produse din grila, in ordinea ei.
 *
 * ⚠ Numele de produs NU se taie: un nume scurtat e alt produs. Daca unul nu incape,
 * lista se opreste inaintea lui.
 */
function continuareProduse(baza: string, c: ContinutPagina): string {
  const nume = unice(c.produse.map(numeDeLista));
  if (nume.length === 0) return "";
  if (c.numar === 1) {
    const t = `Produsul: ${nume[0]}.`;
    return incape(`${baza} ${t}`) ? t : "";
  }
  for (let k = nume.length; k >= 1; k--) {
    const t = `Printre produse: ${enumera(nume.slice(0, k))}.`;
    if (incape(`${baza} ${t}`)) return t;
  }
  return "";
}

/**
 * Descrierea unei pagini de categorie.
 *
 * `magazin` e numele afisat al magazinului; se scurteaza aici (`numeScurtMagazin`).
 *
 * Ordinea in care se renunta la ceva cand nu incape: intai continuarea
 * (subcategoriile sau produsele), apoi parintele, apoi numarul si pretul. Numele
 * categoriei ramane mereu, deci doua pagini diferite nu primesc acelasi text.
 */
export function descriereCategorie(a: { categorie: string; magazin: string } & ContextDescriere): string {
  const nume = curat(a.categorie);
  const magazin = numeScurtMagazin(a.magazin);
  const parinte = a.parinte ? curat(a.parinte) : "";
  const cuParinte = parinte && parinte !== nume ? ` (${parinte})` : "";
  const inceput = `${a.reduceri ? "Reduceri: " : ""}${nume}`;

  const c = a.continut;
  // Date necitite, sau categorie fara produse: doar deschiderea. Vezi nota modulului.
  if (!c || !(c.numar > 0)) {
    return primaCareIncape([`${inceput}${cuParinte} la ${magazin}.`, `${inceput} la ${magazin}.`]);
  }

  const coada = numarSiPret(c, a.faraTva);
  const baza = primaCareIncape([
    `${inceput}${cuParinte} la ${magazin}${coada}`,
    `${inceput} la ${magazin}${coada}`,
    `${inceput} la ${magazin}.`,
  ]);
  const continuare = a.subcategorii.length
    ? continuareSubcategorii(baza, a.subcategorii)
    : continuareProduse(baza, c);
  return continuare ? `${baza} ${continuare}` : baza;
}

/**
 * Descrierea paginii de catalog (`/magazin`).
 *
 * `radacini` = categoriile de sus care au produse, in ordinea din panou, plus numele
 * orfane cu produse (au pagini adevarate, deci se numara). Aici nu se pune pret: pe
 * tot catalogul, cel mai mic pret e de obicei un accesoriu, nu ce vinde magazinul.
 *
 * ⚠ Pe `?sale=1` categoriile NU se numesc: vin din rezumat, care nu stie de reduceri,
 * deci „6 produse în 5 categorii" ar fi afirmat ca reducerile acopera categorii in care
 * nu e niciuna.
 */
export function descriereCatalog(a: {
  magazin: string;
  radacini: string[];
  continut: ContinutPagina | null;
  reduceri: boolean;
}): string {
  const cap = `${a.reduceri ? "Reduceri: " : ""}Catalogul ${numeScurtMagazin(a.magazin)}`;
  const c = a.continut;
  if (!c || !(c.numar > 0)) return `${cap}.`;

  const numar = pluralRo(c.numar);
  const radacini = unice(a.radacini.map(numeDeLista));
  const scurt = `${cap}: ${numar}.`;
  if (a.reduceri || radacini.length === 0) return scurt;

  if (radacini.length === 1) {
    const t = `${cap}: ${numar}, în categoria ${radacini[0]}.`;
    return incape(t) ? t : scurt;
  }

  const k = pluralRo(radacini.length, "categorie", "categorii");
  const toate = `${cap}: ${numar} în ${k}: ${enumera(radacini)}.`;
  if (incape(toate)) return toate;
  for (let j = radacini.length - 1; j >= 1; j--) {
    const t = `${cap}: ${numar} în ${k}, printre care ${enumera(radacini.slice(0, j))}.`;
    if (incape(t)) return t;
  }
  return primaCareIncape([`${cap}: ${numar} în ${k}.`, scurt]);
}

/**
 * Descrierea FINALA a paginii de catalog sau de categorie: ce ajunge in `<head>`, in
 * og, in twitter si in `CollectionPage`.
 *
 * ═══ ORDINEA ═══
 *
 *   1. `descriereProprie`: textul scris de comerciant (etapa 2: descrierea categoriei;
 *      pe catalog, subtitlul paginii, vezi `descriereProprieCatalog`). Castiga cand nu
 *      e gol.
 *   2. Textul generat din date.
 *
 * NICIODATA `seo.description`: aceea e a paginii principale.
 *
 * ⚠ Pe `?sale=1` textul propriu NU se foloseste. Canonicalul paginii de reduceri
 * pastreaza `sale=1`, deci e alta adresa in index, iar textul propriu ar fi fost
 * aceeasi descriere ca pe pagina fara reduceri, adica exact dublura reparata aici.
 *
 * ⚠ Textul propriu trece prin `curataTextSeo`, cel generat prin `textCurat(…, 160)`. Iesirea
 * amandurora nu se mai schimba la a doua trecere, cea din JSON-LD (`textCurat`, limita 500),
 * deci meta = og = twitter = JSON-LD prin constructie, inclusiv pe numele cu spatii duble sau
 * cu `<` in ele.
 *
 * ⚠ LIMITA TEXTULUI PROPRIU: pe o CATEGORIE, 300 (`SEO_DESCRIERE_CATEGORIE_MAX`), exact cat
 * primeste salvarea din panou. Taiat aici la 160, comerciantul ar fi vazut in panou un text si
 * Google ar fi primit altul. Pe CATALOG, subtitlul paginii ramane la 160, ca in etapa 1.
 */
export function descrierePaginii(a: {
  /** `""` = catalogul intreg. */
  categorie: string;
  /** Numele afisat al magazinului. */
  magazin: string;
  context: ContextDescriere;
  descriereProprie?: string | null;
}): string {
  if (!a.context.reduceri) {
    const max = a.categorie.trim() ? SEO_DESCRIERE_CATEGORIE_MAX : SEO_DESCRIPTION_MAX;
    const proprie = curataTextSeo(a.descriereProprie, max);
    if (proprie) return proprie;
  }
  const generata = a.categorie.trim()
    ? descriereCategorie({ categorie: a.categorie, magazin: a.magazin, ...a.context })
    : descriereCatalog({
        magazin: a.magazin,
        radacini: a.context.subcategorii,
        continut: a.context.continut,
        reduceri: a.context.reduceri,
      });
  return textCurat(generata, SEO_DESCRIPTION_MAX);
}

/** Text comparat „dupa normalizare": fara etichete, spatii, diacritice, litere mari si punctul final. */
function deComparat(s: string | null | undefined): string {
  return textCurat(s, 100_000)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[\s.!?,;:]+$/u, "");
}

/**
 * Subtitlul paginii de catalog, cand merita sa fie descrierea ei (decizia 5).
 *
 * Il scrie comerciantul pentru ACEA pagina (Editeaza magazinul > Pagina Magazin), deci
 * e cel mai bun rezumat al ei. Dar daca a copiat acolo descrierea paginii principale,
 * folosit ar fi refacut chiar dublura reparata aici: atunci `null`, si ramane textul
 * generat.
 */
export function descriereProprieCatalog(
  subtitlu: string | null | undefined,
  descriereAcasa: string | null | undefined,
): string | null {
  const s = deComparat(subtitlu);
  if (!s || s === deComparat(descriereAcasa)) return null;
  return subtitlu ?? null;
}

/** Copiii fiecarei categorii, in ordinea listei primite (adica cea din panou). */
function copiiDupaParinte<T extends CategorieArbore>(cat: readonly T[]): Map<string, T[]> {
  const copii = new Map<string, T[]>();
  for (const c of cat) {
    if (!c.parent_id) continue;
    const arr = copii.get(c.parent_id);
    if (arr) arr.push(c);
    else copii.set(c.parent_id, [c]);
  }
  return copii;
}

/**
 * Subarborele REUNIT al tuturor categoriilor vizibile care poarta numele cerut.
 *
 * ═══ DE CE REUNIUNE ═══
 *
 * Doua categorii pot purta acelasi nume in locuri diferite (unicitatea e pe frati),
 * iar produsele isi poarta categoria ca TEXT: pagina numelui arata produsele tuturor.
 * Azi serverul ia prima categorie cu numele (`numeSubarbore`), iar grila din browser
 * pe ultima, deci descrierea nu se poate sprijini pe niciuna singura.
 *
 * Parintele ramane doar cand e UNIC si diferit de nume. La atelierul-larisei,
 * „Obiecte personalizate" e si radacina, si propriul ei copil: „(Obiecte
 * personalizate)" dupa „Obiecte personalizate" n-ar spune nimic.
 *
 * Un nume care nu e in tabel (categorie purtata doar de produse) da chiar numele
 * singur, fara parinte, ca `numeSubarbore`. Parcurgerea e iterativa, cu vizitate: un
 * ciclu scris in baza nu trebuie sa blocheze randarea.
 */
export function subarboreReunit(
  cat: readonly CategorieArbore[],
  nume: string,
): { nume: string[]; idsPagina: string[]; parinte: string | null } {
  const cautat = nume.trim();
  if (!cautat) return { nume: [], idsPagina: [], parinte: null };
  const aleNumelui = cat.filter((c) => c.name === cautat);
  if (aleNumelui.length === 0) return { nume: [cautat], idsPagina: [], parinte: null };

  const copii = copiiDupaParinte(cat);
  const vazute = new Set<string>();
  const numeGasite: string[] = [];
  const stiva = [...aleNumelui].reverse();
  while (stiva.length) {
    const c = stiva.pop() as CategorieArbore;
    if (vazute.has(c.id)) continue;
    vazute.add(c.id);
    numeGasite.push(c.name);
    const kids = copii.get(c.id) ?? [];
    for (let i = kids.length - 1; i >= 0; i--) stiva.push(kids[i]);
  }

  const dupaId = new Map(cat.map((c) => [c.id, c]));
  // `null` e si el o valoare: o categorie cu numele asta la radacina si alta sub „X"
  // nu au un parinte unic, deci nu se scrie niciunul.
  const parinti = new Set<string | null>();
  for (const c of aleNumelui) {
    const p = c.parent_id ? (dupaId.get(c.parent_id)?.name ?? null) : null;
    if (p !== null && p === cautat) continue;
    parinti.add(p);
  }
  const unic = parinti.size === 1 ? [...parinti][0] : null;

  return { nume: unice(numeGasite), idsPagina: aleNumelui.map((c) => c.id), parinte: unic };
}

/** Subarborele unei categorii (dupa id) are macar un nume purtat de produse vizibile. */
function areProduse(
  radacina: CategorieArbore,
  copii: Map<string, CategorieArbore[]>,
  cuProduse: ReadonlySet<string>,
): boolean {
  const vazute = new Set<string>();
  const stiva = [radacina];
  while (stiva.length) {
    const c = stiva.pop() as CategorieArbore;
    if (vazute.has(c.id)) continue;
    vazute.add(c.id);
    if (cuProduse.has(c.name)) return true;
    for (const k of copii.get(c.id) ?? []) stiva.push(k);
  }
  return false;
}

/**
 * Ramurile de sub pagina care duc la produse: copiii directi ai categoriilor
 * `idsPagina` (sau categoriile de sus, cand e `null`), in ordinea din panou.
 *
 * Numai cele al caror subarbore are produse, dupa `rezumat.categorii`: navigarea
 * magazinului le ascunde pe celelalte (`MiniStoreRenderer`, `trece`), deci descrierea
 * nu le numeste nici ea. Fara rezumat, `[]`: nu stim, deci nu afirmam.
 *
 * Categoriile de sus sunt cele fara `parent_id`, exact regula navigarii. Un copil care
 * e chiar una dintre categoriile paginii (numele care e si propriul copil) nu e o
 * subcategorie.
 */
export function ramuriCuProduse(
  cat: readonly CategorieArbore[],
  idsPagina: readonly string[] | null,
  cuProduse: ReadonlySet<string> | null,
): string[] {
  if (!cuProduse) return [];
  const copii = copiiDupaParinte(cat);
  const aiPaginii = new Set(idsPagina ?? []);
  const candidati = idsPagina === null
    ? cat.filter((c) => !c.parent_id)
    : cat.filter((c) => !!c.parent_id && aiPaginii.has(c.parent_id) && !aiPaginii.has(c.id));
  const out: string[] = [];
  const vazute = new Set<string>();
  for (const c of candidati) {
    if (vazute.has(c.name) || !areProduse(c, copii, cuProduse)) continue;
    vazute.add(c.name);
    out.push(c.name);
  }
  return out;
}

/**
 * Numele de categorie purtate DOAR de produse, cu produse vizibile.
 *
 * Importurile lasa des categorii care nu ajung in tabel; au pagini adevarate, deci
 * se numara printre categoriile catalogului. `toate` e tabelul INTREG (si randurile
 * stinse): un nume stins nu e orfan, e ascuns.
 */
export function orfaneCuProduse(
  toate: readonly { name: string }[],
  stinse: ReadonlySet<string>,
  cuProduse: ReadonlySet<string> | null,
): string[] {
  if (!cuProduse) return [];
  const dinTabel = new Set(toate.map((c) => c.name));
  return [...cuProduse].filter((n) => !dinTabel.has(n) && !stinse.has(n));
}

/**
 * Pagina categoriei `nume` are ce arata? REGULA UNICA a deciziei 6, pentru pagina
 * (`noindex, follow`) si pentru sitemap (intrarea iese).
 *
 *   - `true`: subarborele reunit are macar un nume in `rezumat.categorii`;
 *   - `false`: nu are niciunul, deci pagina nu arata niciun produs;
 *   - `null`: rezumatul lipseste (magazin nou, citire picata) sau numele e gol. Nu
 *     stim, deci pagina RAMANE indexabila si ramane in sitemap.
 *
 * ⚠ Scrisa o singura data, fiindca o pagina `noindex` anuntata in sitemap e exact
 * contradictia pe care Search Console o raporteaza ca eroare.
 *
 * `cat` = categoriile VIZIBILE, iar `cuProduse` = `rezumat.categorii` pentru
 * comutatoarele magazinului.
 */
export function subarboreAreProduse(
  cat: readonly CategorieArbore[],
  nume: string,
  cuProduse: ReadonlySet<string> | readonly string[] | null | undefined,
): boolean | null {
  if (!cuProduse || !nume.trim()) return null;
  const set: ReadonlySet<string> = cuProduse instanceof Set ? cuProduse : new Set(cuProduse as readonly string[]);
  return subarboreReunit(cat, nume).nume.some((n) => set.has(n));
}
