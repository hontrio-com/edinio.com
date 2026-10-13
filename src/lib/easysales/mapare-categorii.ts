import { CATEGORIA_DE_REZERVA, CHEIE_CATEGORIE_DE_REZERVA, SEPARATOR_CATEGORII } from "./constante";

/**
 * Categoriile magazinului, aduse la ce pleaca la easySales (planul, §5.4.3, D23).
 *
 * ═══ CALEA LA CATEGORIE, NUMAI FRUNZA LA PRODUS ═══
 *
 * Fiecare categorie pleaca cu numele caii („Femei > Rochii"), ca doua „Pantofi" din ramuri diferite
 * sa nu se confunde in lista lor. Produsul primeste numai frunza; strabunii nu, fiindca un produs
 * pus in „Femei" si in „Femei > Rochii" ar aparea de doua ori in aceeasi ramura cand comerciantul isi
 * mapeaza categoriile pe marketplace.
 *
 * ═══ ⚠ POTRIVIREA DUPA NUME E UNICA SAU NU E ═══
 *
 * `products.category` tine NUMELE categoriei, nu id-ul ei. Pe produsele active din productie:
 * 6.754 de potriviri unice, 16 ambigue (doua categorii cu acelasi nume), 6 orfane (numele nu mai
 * exista) si 560 fara categorie [C: 13.10.2026]. Numai potrivirea unica se foloseste; celelalte pleaca
 * in categoria de rezerva, cu motivul spus omului. O ghicire intre doua „Accesorii" ar pune produsul
 * in ramura gresita fara ca nimeni sa afle.
 *
 * Documentatia se contrazice: dosarul Categories cere o categorie pe fiecare produs, tabelul
 * produsului o marcheaza optionala [A]. Nu ne bazam pe „optional" (M-PROD-3).
 */

export interface CategorieEdinio {
  id: string;
  name: string;
  parent_id: string | null;
}

/** Numele maxim pe care il trimitem; lungimea lor nu e documentata, iar 191 e plafonul altor campuri ale lor. */
export const NUME_CATEGORIE_MAXIM = 191;

/** O categorie de trimis: cheia (id-ul Edinio sau rezerva), numele propriu si calea. */
export interface CategorieDeTrimis {
  cheie: string;
  categoryId: string | null;
  numeEdinio: string;
  nume: string;
}

export type RezolvareCategorie =
  | { fel: "gasita"; cheie: string }
  | { fel: "rezerva"; motiv: "lipsa" | "ambigua" | "orfana" };

function curat(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Taie de la stanga, ca frunza sa ramana intreaga. */
function incape(nume: string): string {
  if (nume.length <= NUME_CATEGORIE_MAXIM) return nume;
  return `...${nume.slice(nume.length - (NUME_CATEGORIE_MAXIM - 3))}`;
}

/**
 * Calea fiecarei categorii, de la radacina la ea.
 *
 * ⚠ Un parinte lipsa sau un ciclu (A parinte lui B, B parinte lui A) nu blocheaza: calea se opreste
 * la primul stramos care nu mai duce nicaieri. Altfel un singur rand stricat ar opri tot arborele.
 */
export function caileCategoriilor(categorii: ReadonlyArray<CategorieEdinio>): Map<string, string> {
  const dupaId = new Map(categorii.map((c) => [c.id, c]));
  const cai = new Map<string, string>();
  for (const c of categorii) {
    const segmente: string[] = [];
    const vazute = new Set<string>();
    let x: CategorieEdinio | undefined = c;
    while (x && !vazute.has(x.id)) {
      vazute.add(x.id);
      const n = curat(x.name);
      if (n) segmente.unshift(n);
      x = x.parent_id ? dupaId.get(x.parent_id) : undefined;
    }
    cai.set(c.id, incape(segmente.join(SEPARATOR_CATEGORII) || curat(c.name)));
  }
  return cai;
}

/** Tot ce pleaca la ei: fiecare categorie cu calea ei, plus categoria de rezerva. */
export function categoriileDeTrimis(categorii: ReadonlyArray<CategorieEdinio>): CategorieDeTrimis[] {
  const cai = caileCategoriilor(categorii);
  const out: CategorieDeTrimis[] = categorii
    .filter((c) => curat(c.name) !== "")
    .map((c) => ({ cheie: c.id, categoryId: c.id, numeEdinio: curat(c.name), nume: cai.get(c.id) ?? curat(c.name) }));
  out.push({ cheie: CHEIE_CATEGORIE_DE_REZERVA, categoryId: null, numeEdinio: CATEGORIA_DE_REZERVA, nume: CATEGORIA_DE_REZERVA });
  return out;
}

/** Rezolvarea dupa nume, pregatita o data pentru tot magazinul. */
export function rezolvitorDeCategorii(categorii: ReadonlyArray<CategorieEdinio>): (nume: string | null) => RezolvareCategorie {
  const dupaNume = new Map<string, string[]>();
  for (const c of categorii) {
    const n = curat(c.name);
    if (!n) continue;
    dupaNume.set(n, [...(dupaNume.get(n) ?? []), c.id]);
  }
  return (nume) => {
    const n = curat(nume);
    if (!n) return { fel: "rezerva", motiv: "lipsa" };
    const ids = dupaNume.get(n) ?? [];
    if (ids.length === 1) return { fel: "gasita", cheie: ids[0] };
    return { fel: "rezerva", motiv: ids.length === 0 ? "orfana" : "ambigua" };
  };
}

/** De ce a ajuns un produs in categoria de rezerva, pentru om. */
export function motivulRezervei(motiv: "lipsa" | "ambigua" | "orfana", nume: string | null): string {
  switch (motiv) {
    case "lipsa": return `Produsul nu are categorie. Pleacă în „${CATEGORIA_DE_REZERVA}”.`;
    case "ambigua": return `Există mai multe categorii numite „${curat(nume)}”. Produsul pleacă în „${CATEGORIA_DE_REZERVA}” până le redenumești.`;
    case "orfana": return `Categoria „${curat(nume)}” nu mai există în magazin. Produsul pleacă în „${CATEGORIA_DE_REZERVA}”.`;
  }
}
