import { newSectionId } from "./defaults";
import type { SablonProdus, SectionInstance, StoreDesign } from "./types";

/**
 * Sabloanele paginii de produs (etapa 4b din `docs/editor-magazin/PLAN.md`).
 *
 * Decizia proprietarului (25.10.2026): sablonul se alege DIN EDITOR, pe categorii; produsele anume
 * intra ca exceptii. Totul sta in design, deci trece prin ciorna si Publica, fara migratii.
 * `product.page` ramane sablonul „Implicit”.
 */

/** Plafoanele: designul se citeste la fiecare pagina, iar produsele sunt pentru exceptii. */
export const MAX_SABLOANE = 10;
export const MAX_CATEGORII_PE_SABLON = 300;
export const MAX_PRODUSE_PE_SABLON = 500;
export const MAX_NUME_SABLON = 60;

/** Un id de categorie sau de produs (uuid-urile din baza). */
export const ID_DE_ATRIBUIT = /^[0-9a-zA-Z-]{1,64}$/;

const sabloanele = (d: Pick<StoreDesign, "product">): readonly SablonProdus[] => d.product.sabloane ?? [];

/**
 * Pagina de produs pentru un produs: exceptia lui, apoi categoria lui sau cel mai apropiat parinte
 * care are un sablon, apoi Implicit.
 *
 * `lantCategorii` e categoria produsului urmata de parintii ei, in sus (`lantulCategoriei`). O
 * categorie acopera astfel si subcategoriile ei, inclusiv pe cele facute dupa atribuire.
 */
export function sablonulProdusului(
  product: StoreDesign["product"],
  produsId: string | null | undefined,
  lantCategorii: readonly string[] = [],
): SectionInstance {
  const sabloane = product.sabloane ?? [];
  if (sabloane.length === 0) return product.page;
  if (produsId) {
    const exceptie = sabloane.find((s) => s.produse.includes(produsId));
    if (exceptie) return exceptie.page;
  }
  for (const categorie of lantCategorii) {
    const dupaCategorie = sabloane.find((s) => s.categorii.includes(categorie));
    if (dupaCategorie) return dupaCategorie.page;
  }
  return product.page;
}

/** Pagina unui sablon dupa id, sau Implicit cand id-ul nu e al niciunuia (impunerea din editor). */
export function paginaSablonului(product: StoreDesign["product"], id: string | null | undefined): SectionInstance {
  if (!id) return product.page;
  return (product.sabloane ?? []).find((s) => s.page.id === id)?.page ?? product.page;
}

/** Are designul vreun sablon atribuit pe categorii? Doar atunci ruta citeste lantul de categorii. */
export function areSabloanePeCategorii(product: StoreDesign["product"]): boolean {
  return (product.sabloane ?? []).some((s) => s.categorii.length > 0);
}

/**
 * Categoria si parintii ei, in sus, din lista `{ id, parent_id }` a magazinului.
 *
 * Plafonat la 20 de trepte si oprit la prima repetare: un ciclu scris gresit in baza n-are voie sa
 * blocheze pagina produsului.
 */
export function lantulCategoriei(
  categorii: readonly { id: string; parent_id: string | null }[],
  categorieId: string | null | undefined,
): string[] {
  if (!categorieId) return [];
  const parinte = new Map(categorii.map((c) => [c.id, c.parent_id]));
  const lant: string[] = [];
  let curenta: string | null | undefined = categorieId;
  while (curenta && !lant.includes(curenta) && lant.length < 20) {
    lant.push(curenta);
    curenta = parinte.get(curenta) ?? null;
  }
  return lant;
}

// ---------------------------------------------------------------------------
// Operatiile din editor. Fiecare intoarce ACELASI obiect cand n-are ce face,
// ca istoricul editorului sa nu noteze un pas gol (vezi `edit.ts`).
// ---------------------------------------------------------------------------

/** Lista goala nu se scrie deloc, ca la parser: un design fara sabloane ramane identic. */
const cuSabloane = (design: StoreDesign, sabloane: SablonProdus[]): StoreDesign => ({
  ...design,
  product: sabloane.length ? { page: design.product.page, sabloane } : { page: design.product.page },
});

const numeCurat = (nume: string) => nume.trim().slice(0, MAX_NUME_SABLON);

/**
 * Un sablon nou, pornit de la pagina Implicit (aceeasi varianta, reglaje si blocuri), fara nicio
 * categorie: nu schimba nimic in magazin pana nu i se atribuie ceva. `null` peste plafon.
 */
export function adaugaSablon(design: StoreDesign, nume: string): { design: StoreDesign; id: string } | null {
  const sabloane = sabloanele(design);
  if (sabloane.length >= MAX_SABLOANE) return null;
  const id = newSectionId();
  const nou: SablonProdus = {
    nume: numeCurat(nume) || `Șablon ${sabloane.length + 1}`,
    page: { ...structuredClone(design.product.page), id },
    categorii: [],
    produse: [],
  };
  return { design: cuSabloane(design, [...sabloane, nou]), id };
}

export function redenumesteSablon(design: StoreDesign, id: string, nume: string): StoreDesign {
  const curat = numeCurat(nume);
  const sabloane = sabloanele(design);
  const tinta = sabloane.find((s) => s.page.id === id);
  if (!tinta || !curat || tinta.nume === curat) return design;
  return cuSabloane(design, sabloane.map((s) => (s === tinta ? { ...s, nume: curat } : s)));
}

/** Produsele lui trec inapoi pe Implicit (sau pe sablonul altei categorii a lor). */
export function stergeSablon(design: StoreDesign, id: string): StoreDesign {
  const sabloane = sabloanele(design);
  if (!sabloane.some((s) => s.page.id === id)) return design;
  return cuSabloane(design, sabloane.filter((s) => s.page.id !== id));
}

/**
 * Bifeaza sau debifeaza o categorie (`camp: "categorii"`) ori un produs (`camp: "produse"`) la un
 * sablon. Bifata, trece la el de la orice alt sablon: o categorie are un singur sablon.
 */
export function atribuieLaSablon(
  design: StoreDesign,
  id: string,
  camp: "categorii" | "produse",
  valoare: string,
  bifat: boolean,
): StoreDesign {
  const sabloane = sabloanele(design);
  const tinta = sabloane.find((s) => s.page.id === id);
  if (!tinta || !ID_DE_ATRIBUIT.test(valoare)) return design;
  const are = tinta[camp].includes(valoare);
  if (bifat === are) return design;
  const plafon = camp === "categorii" ? MAX_CATEGORII_PE_SABLON : MAX_PRODUSE_PE_SABLON;
  if (bifat && tinta[camp].length >= plafon) return design;
  return cuSabloane(design, sabloane.map((s) => {
    if (s === tinta) {
      return { ...s, [camp]: bifat ? [...s[camp], valoare] : s[camp].filter((v) => v !== valoare) };
    }
    return bifat && s[camp].includes(valoare) ? { ...s, [camp]: s[camp].filter((v) => v !== valoare) } : s;
  }));
}
