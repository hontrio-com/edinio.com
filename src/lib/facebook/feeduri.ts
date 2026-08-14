/**
 * Feeduri Meta (Facebook) SEGMENTATE: catalog pe categorie, pe o selectie de
 * produse, sau pe conditii.
 *
 * ═══ DE CE EXISTA, SI CE NU REZOLVA ═══
 *
 * ⚠ Cea mai frecventa cerere — „vreau catalog doar pe categoria X, ca sa fac
 * reclama la ea" — NU are nevoie de fisierul asta. Pentru reclame, Meta are
 * Product Sets: submultimi definite prin filtre INTR-UN catalog, care se
 * actualizeaza singure. Feedul nostru trimite deja `product_type` (categoria),
 * `brand` si `custom_label_0..4`, iar 92,8% din produsele active au categoria
 * completata — deci filtrele alea chiar au pe ce lucra, azi.
 *
 * Un feed separat e necesar cand chiar ai nevoie de un CATALOG separat:
 *   - alt partener sau agentie, cu acces doar la o parte din sortiment;
 *   - alta unitate de business sau alt brand, cu cont propriu;
 *   - o selectie curata (campania de Craciun) care nu e o categorie;
 *   - produse scoase din reclame fara sa fie dezactivate in magazin.
 *
 * ═══ ⚠ UN FEED = UN CATALOG ═══
 *
 * `id`-ul unui articol e `product.id`, dinadins, ca sa se potriveasca cu
 * `content_ids` din Pixel — pe alinierea asta se sprijina reclamele dinamice.
 * Consecinta: doua feeduri care au produse comune NU se pun ca surse in ACELASI
 * catalog, fiindca acelasi `id` ar veni din doua parti si Meta intra in conflict.
 * Fie un feed per catalog, fie feeduri care nu se suprapun.
 */

import type { StoreCategoryNode } from "@/lib/storefront/store-content.types";

/** Ce se poate cere unui feed. Totul optional: un feed fara reguli = tot catalogul. */
export interface RegulaFeed {
  /** Cheia din adresa: `?feed=<cheie>`. Stabila, aleasa de noi la creare. */
  cheie: string;
  /** Numele vazut de comerciant. Nu intra in feed. */
  nume: string;
  /**
   * ⚠ ID-uri de categorii, nu NUME.
   *
   * Un feed trebuie sa supravietuiasca redenumirii unei categorii — altfel
   * comerciantul redenumeste „Scule" in „Scule electrice" si catalogul lui de la
   * Meta se goleste tacut, la urmatoarea citire. Numele se rezolva la generare,
   * din arbore.
   */
  categorii?: string[];
  /** Produse alese unul cate unul. Se ADUNA cu cele venite din categorii. */
  produse?: string[];
  /** Produse scoase, oricum ar fi intrat. Exceptia bate regula. */
  excluse?: string[];
  doarInStoc?: boolean;
  pretMin?: number | null;
  pretMax?: number | null;
}

/** Forma minima de produs pe care o cere filtrarea. */
export interface ProdusDeFiltrat {
  id: string;
  category: string | null;
  price: number;
  track_inventory: boolean;
  stock_quantity: number | null;
  is_bundle?: boolean;
  /** Verdictul componentelor, cand e pachet. Calculat de apelant. */
  pachetDisponibil?: boolean;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function listaDeSiruri(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.map(text).filter(Boolean))] : [];
}
function numarSauNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Feedurile salvate in `store_settings`, citite defensiv.
 *
 * Vin dintr-un `jsonb` scris de panou: orice camp poate lipsi sau veni de alt
 * tip. Un feed fara cheie se arunca — fara ea n-ar putea fi cerut niciodata.
 */
export function parseFeeduri(raw: unknown): RegulaFeed[] {
  if (!Array.isArray(raw)) return [];
  const vazute = new Set<string>();
  const iesire: RegulaFeed[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const cheie = text(o.cheie).toLowerCase();
    /* Cheile duplicate ar face `?feed=x` sa depinda de ordine. Prima castiga. */
    if (!cheie || vazute.has(cheie)) continue;
    vazute.add(cheie);
    iesire.push({
      cheie,
      nume: text(o.nume) || cheie,
      categorii: listaDeSiruri(o.categorii),
      produse: listaDeSiruri(o.produse),
      excluse: listaDeSiruri(o.excluse),
      doarInStoc: o.doarInStoc === true,
      pretMin: numarSauNull(o.pretMin),
      pretMax: numarSauNull(o.pretMax),
    });
  }
  return iesire;
}

/**
 * Numele categoriilor cerute, IMPREUNA CU TOTI DESCENDENTII.
 *
 * ⚠ Fara descendenti, un feed pe „Scule electrice" ar iesi aproape gol: masurat
 * pe productie, 104 din cele 110 categorii ale unui magazin sunt subcategorii, iar
 * produsele stau pe frunze. Comerciantul care alege o categorie-parinte se
 * asteapta la tot ce e sub ea — asa arata si catalogul lui.
 *
 * Se intorc NUME, fiindca `products.category` pastreaza numele, nu id-ul.
 */
export function numeCuDescendenti(arbore: StoreCategoryNode[], idCerute: string[]): Set<string> {
  const cerute = new Set(idCerute);
  if (cerute.size === 0) return new Set();

  const copii = new Map<string | null, StoreCategoryNode[]>();
  for (const c of arbore) {
    const lista = copii.get(c.parent_id ?? null) ?? [];
    lista.push(c);
    copii.set(c.parent_id ?? null, lista);
  }

  const nume = new Set<string>();
  const deParcurs = arbore.filter((c) => cerute.has(c.id));
  /* ⚠ Cu `vizitate`: un arbore cu o bucla (parinte pus din greseala sub propriul
     copil) ar fi invartit la nesfarsit generarea feedului. */
  const vizitate = new Set<string>();
  while (deParcurs.length > 0) {
    const c = deParcurs.pop()!;
    if (vizitate.has(c.id)) continue;
    vizitate.add(c.id);
    const n = text(c.name);
    if (n) nume.add(n);
    for (const copil of copii.get(c.id) ?? []) deParcurs.push(copil);
  }
  return nume;
}

/** Are produsul stoc, dupa aceleasi reguli ca feedul intreg? */
function inStoc(p: ProdusDeFiltrat): boolean {
  if (p.is_bundle) return p.pachetDisponibil !== false;
  return !p.track_inventory || (p.stock_quantity ?? 0) > 0;
}

/**
 * Produsele care intra intr-un feed.
 *
 * Ordinea regulilor, si fiecare conteaza:
 *   1. `excluse` bate tot — e singurul mod de a scoate un produs anume dintr-un
 *      catalog fara sa-l dezactivezi in magazin;
 *   2. daca s-a cerut macar o categorie SAU un produs, se pastreaza doar ce se
 *      potriveste (reuniune, nu intersectie: „categoria X plus produsele astea trei");
 *   3. conditiile (stoc, pret) se aplica peste ce a ramas.
 *
 * ⚠ Un feed FARA nicio regula intoarce tot catalogul, nu zero. Asa „Toate
 * produsele" e chiar feedul implicit, si un feed golit din greseala nu trimite un
 * catalog vid catre Meta — care ar dezactiva reclamele in tacere.
 */
export function produseDinFeed<T extends ProdusDeFiltrat>(
  regula: RegulaFeed,
  produse: T[],
  numeCategorii: Set<string>,
): T[] {
  const excluse = new Set(regula.excluse ?? []);
  const alese = new Set(regula.produse ?? []);
  const areSelectie = numeCategorii.size > 0 || alese.size > 0;

  return produse.filter((p) => {
    if (excluse.has(p.id)) return false;

    if (areSelectie) {
      const dinCategorie = numeCategorii.size > 0 && numeCategorii.has(text(p.category));
      if (!dinCategorie && !alese.has(p.id)) return false;
    }

    if (regula.doarInStoc && !inStoc(p)) return false;

    const pret = Number(p.price) || 0;
    if (regula.pretMin != null && pret < regula.pretMin) return false;
    if (regula.pretMax != null && pret > regula.pretMax) return false;

    return true;
  });
}

/**
 * Cheia unui feed nou, din numele lui.
 *
 * Intra intr-o adresa pe care comerciantul o lipeste in Commerce Manager, deci
 * ramane scurta si fara diacritice. Unicitatea se asigura cu un sufix, nu cu o
 * eroare: comerciantul care isi numeste doua feeduri la fel n-a gresit cu nimic.
 */
export function cheieDinNume(nume: string, existente: string[]): string {
  const baza = text(nume)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "feed";
  const luate = new Set(existente);
  if (!luate.has(baza)) return baza;
  for (let i = 2; i < 1000; i++) {
    const cu = `${baza}-${i}`;
    if (!luate.has(cu)) return cu;
  }
  return `${baza}-${Date.now()}`;
}
