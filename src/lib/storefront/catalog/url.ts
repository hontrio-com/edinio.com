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

/** Separatorul dintre valorile aceleiasi fatete: `tag=Textile|Bumbac`. */
const SEPARATOR_VALORI = "|";

const MAX_VALORI_PER_CHEIE = 20;
const MAX_TEXT = 100;

/** Sortarile pe care le stie catalogul. „relevance" nu se salveaza: exista doar cat timp e o cautare activa. */
const SORTARI = ["newest", "price_asc", "price_desc", "popular", "name_asc"];

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

function numarPozitiv(v: string): string {
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
    const valori = primul(brut)
      .split(SEPARATOR_VALORI)
      .map((v) => v.trim())
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

  // Cate filtre in plus fata de cele canonice poarta adresa. Unul singur ramane
  // indexabil — e o pagina cu inteles, „bocanci ARDON" — dar de la doua incolo
  // incep combinatiile, si acelea nu trebuie crawlate.
  const inPlus = Object.entries(sp).filter(([k, v]) => !REZERVATI.has(k) && primul(v)).length
    + (primul(sp.q) ? 1 : 0)
    + (primul(sp.stoc) === "1" ? 1 : 0)
    + (primul(sp.pmin) || primul(sp.pmax) ? 1 : 0);

  return { url: sir ? `${radacina}?${sir}` : radacina, indexabila: inPlus < 2 };
}
