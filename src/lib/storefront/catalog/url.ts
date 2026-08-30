import type { Fateta, SelectieFatete } from "./facets";

/**
 * Filtrele catalogului, dus-intors intre adresa si stare.
 *
 * Pagina principala tine filtrele doar in memorie, si acolo e in regula: grila
 * e o parte a unei pagini de prezentare, iar nimeni nu trimite mai departe
 * „pagina 3 filtrata dupa doua atribute". Pe o pagina care se numeste Magazin si
 * isi face reclama cu filtrare, un link care nu poarta filtrele e un bug
 * raportat in prima zi.
 *
 * Modulul e pur ca sa poata fi testat: citirea ruleaza pe server (ca stare
 * initiala), scrierea pe client (ca `replaceState`), si cele doua trebuie sa
 * inteleaga acelasi lucru.
 */

/** Parametrii care NU sunt fatete si au fiecare intelesul lor. */
const REZERVATI = new Set(["cat", "q", "page", "sort", "pmin", "pmax", "sale", "stoc", "preview", "cos", "recover", "code"]);

const MAX_VALORI_PER_CHEIE = 20;
const MAX_TEXT = 100;

/**
 * Sortarile pe care le POARTA adresa.
 *
 * „relevance" nu se salveaza: exista doar cat timp e o cautare activa.
 *
 * ⚠ Nici asezarile magazinului („random", „manual") nu intra aici, si nu din
 * scapare: ele nu sunt sortari cerute de vizitator, ci ordinea IMPLICITA a
 * paginii, care se ia oricum din `page_content`. Scrise in adresa, ar fi fost
 * citite inapoi ca „nimic" si pagina ar fi navigat inca o data ca sa curete
 * parametrul — un dus-intors in plus si o intrare de istoric care face butonul
 * „Inapoi" sa sara imediat inainte.
 *
 * De aia lista e EXPORTATA: cine scrie adresa trebuie sa scrie numai ce poate
 * fi citit inapoi, altfel scrierea si citirea nu mai au acelasi punct fix.
 * Vezi `compuneInterogare` din `MiniStoreRenderer`.
 */
export const SORTARI_IN_ADRESA = ["newest", "price_asc", "price_desc", "popular", "name_asc"];
const SORTARI = SORTARI_IN_ADRESA;

export interface FiltreCitite {
  categorie: string;
  cautare: string;
  pagina: number;
  /** Sortarea ceruta explicit in adresa. Gol = ramane cea implicita a magazinului. */
  sortare: string;
  reduceri: boolean;
  stoc: boolean;
  pretMin: string;
  pretMax: string;
  fatete: SelectieFatete;
}

function primul(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/**
 * Un numar pozitiv din adresa, sau nimic.
 *
 * Verificarea pe sirul GOL e prima si nu poate lipsi: `Number("")` e zero, finit
 * si pozitiv, deci fara ea o adresa fara `pmin` producea un filtru „de la 0 pana
 * la 0" — adica un catalog gol, la fiecare incarcare a paginii, pentru toata
 * lumea. Exact felul de defect care trece de tipuri, de teste care verifica doar
 * valorile invalide, si de build.
 */
function numarPozitiv(v: string): string {
  if (!v.trim()) return "";
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : "";
}

/**
 * Citeste filtrele din adresa, pastrand doar ce exista cu adevarat in catalog.
 *
 * Cheile necunoscute cad, iar valorile care nu mai exista in fatete cad si ele:
 * un link partajat acum o luna, dupa ce comerciantul a redenumit un atribut, nu
 * are voie sa intoarca zero produse fara nicio explicatie. Cade filtrul, nu
 * catalogul.
 */
export function citesteFiltreDinAdresa(
  sp: Record<string, string | string[] | undefined>,
  fatete: Fateta[],
): FiltreCitite {
  const permise = new Map(fatete.map((f) => [f.cheie, new Set(f.valori.map((v) => v.valoare))]));

  const selectie: SelectieFatete = {};
  for (const [cheie, brut] of Object.entries(sp)) {
    if (REZERVATI.has(cheie)) continue;
    const set = permise.get(cheie);
    if (!set) continue;
    /*
     * Valori REPETATE, nu unite cu un separator: `?tag=A&tag=B`.
     *
     * Un separator ar fi cerut un caracter care nu poate aparea intr-o valoare,
     * si nu exista unul: etichetele si specificatiile sunt text scris de
     * comerciant sau venit din CSV, iar adresa e decodificata inainte sa ajunga
     * aici, deci o eticheta care contine chiar separatorul s-ar fi rupt in doua
     * filtre inexistente.
     */
    const valori = (Array.isArray(brut) ? brut : [brut])
      .map((v) => (v ?? "").trim())
      .filter((v) => v && set.has(v))
      .slice(0, MAX_VALORI_PER_CHEIE);
    if (valori.length) selectie[cheie] = valori;
  }

  const paginaBruta = parseInt(primul(sp.page), 10);

  return {
    categorie: primul(sp.cat).slice(0, MAX_TEXT),
    cautare: primul(sp.q).slice(0, MAX_TEXT),
    pagina: Number.isFinite(paginaBruta) && paginaBruta > 0 ? paginaBruta : 1,
    sortare: SORTARI.includes(primul(sp.sort)) ? primul(sp.sort) : "",
    reduceri: primul(sp.sale) === "1",
    stoc: primul(sp.stoc) === "1",
    pretMin: numarPozitiv(primul(sp.pmin)),
    pretMax: numarPozitiv(primul(sp.pmax)),
    fatete: selectie,
  };
}

/**
 * Canonicalul paginii de catalog, si daca versiunea asta merita indexata.
 *
 * Aceeasi regula ca pe pagina principala pentru ce urmeaza canonicalul —
 * categoria, reducerile si numarul paginii schimba continutul, deci sunt adrese
 * de sine statatoare. Cautarea libera si fatetele nu: sunt combinatoriu de
 * multe, iar fiecare bifa in plus ar deschide inca un rand de adrese identice ca
 * valoare pentru un motor de cautare.
 *
 * Codificarea e cea din linkuri (`encodeURIComponent`), nu cea din
 * `URLSearchParams`: aceea scrie spatiile cu `+`, deci canonicalul ar arata
 * catre alta adresa decat cea crawlata.
 */
export function canonicalCatalog(
  radacina: string,
  sp: Record<string, string | string[] | undefined>,
  fatete: Fateta[] = [],
): { url: string; indexabila: boolean } {
  const cat = primul(sp.cat);
  const sale = primul(sp.sale) === "1";
  const paginaBruta = parseInt(primul(sp.page), 10);
  const pagina = Number.isFinite(paginaBruta) && paginaBruta > 1 ? paginaBruta : 1;

  const bucati: string[] = [];
  if (cat) bucati.push(`cat=${encodeURIComponent(cat.slice(0, MAX_TEXT))}`);
  if (sale) bucati.push("sale=1");
  if (pagina > 1) bucati.push(`page=${pagina}`);
  const sir = bucati.join("&");

  /*
   * Cate filtre in plus fata de cele canonice poarta adresa.
   *
   * Se numara DOAR cheile care sunt cu adevarat fatete ale catalogului, nu orice
   * parametru necunoscut. Altfel `utm_source` + `utm_campaign` — adica aterizarea
   * din orice reclama, exact traficul pe care comerciantul plateste — ar fi facut
   * pagina `noindex` fara sa existe niciun filtru bifat.
   *
   * Unul singur ramane indexabil: e o pagina cu inteles, „bocanci ARDON". De la
   * doua incolo incep combinatiile, si acelea n-au ce cauta in index.
   */
  const cheiDeFateta = new Set(fatete.map((f) => f.cheie));
  const inPlus = Object.entries(sp).filter(([k, v]) => cheiDeFateta.has(k) && primul(v)).length
    + (primul(sp.q) ? 1 : 0)
    + (primul(sp.stoc) === "1" ? 1 : 0)
    + (primul(sp.pmin) || primul(sp.pmax) ? 1 : 0);

  return { url: sir ? `${radacina}?${sir}` : radacina, indexabila: inPlus < 2 };
}

/**
 * Interogarea catalogului, compusa din starea curenta a filtrelor.
 *
 * Sursa UNICA pentru doi consumatori care trebuie sa spuna acelasi lucru:
 * linkurile de paginare, care se randeaza si pe server, si sincronizarea adresei
 * de pe client. Scrisa in doua locuri, prima nepotrivire ar fi fost o pagina 2
 * care pierde filtrele.
 *
 * Codificarea e `encodeURIComponent`, nu `URLSearchParams`: aceea scrie spatiile
 * cu `+`, deci ar fi produs alta adresa decat canonicalul si decat linkurile de
 * categorie, pentru exact acelasi continut.
 */
export function scrieFiltre(f: {
  categorie?: string;
  cautare?: string;
  sortare?: string;
  reduceri?: boolean;
  stoc?: boolean;
  pretMin?: string;
  pretMax?: string;
  fatete?: SelectieFatete;
  pagina?: number;
  /** Parametri care nu sunt ai catalogului si trebuie sa supravietuiasca. */
  pastrate?: [string, string][];
}): string {
  const p: string[] = [];
  const pune = (k: string, v: string) => p.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);

  if (f.categorie && f.categorie !== "toate") pune("cat", f.categorie);
  if (f.cautare?.trim()) pune("q", f.cautare.trim());
  for (const [cheie, valori] of Object.entries(f.fatete ?? {})) {
    for (const v of valori) pune(cheie, v);
  }
  if (f.pretMin?.trim()) pune("pmin", f.pretMin.trim());
  if (f.pretMax?.trim()) pune("pmax", f.pretMax.trim());
  if (f.reduceri) pune("sale", "1");
  if (f.stoc) pune("stoc", "1");
  if (f.sortare) pune("sort", f.sortare);
  if (f.pagina && f.pagina > 1) pune("page", String(f.pagina));
  for (const [k, v] of f.pastrate ?? []) pune(k, v);

  return p.join("&");
}
