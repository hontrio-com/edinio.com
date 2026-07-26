import { newSectionId, section } from "./defaults";
import { firstVariant, SECTION_REGISTRY, sectionMeta } from "./registry";
import type { SectionInstance, SectionKind, StoreDesign } from "./types";

/**
 * Operatiile pe care le face editorul asupra unei configuratii de design.
 *
 * Functii pure, in afara componentelor: sunt logica pe care merita sa o testezi
 * direct si care nu are nevoie de React ca sa fie corecta. Fiecare intoarce un
 * design NOU; nimic nu se modifica pe loc.
 */

const clone = (d: StoreDesign): StoreDesign => structuredClone(d);

/** Muta o sectiune din pagina principala pe alta pozitie. */
export function moveSection(design: StoreDesign, from: number, to: number): StoreDesign {
  if (from === to || from < 0 || to < 0 || from >= design.home.length || to >= design.home.length) return design;
  const next = clone(design);
  const [mutata] = next.home.splice(from, 1);
  next.home.splice(to, 0, mutata);
  return next;
}

/** Cauta o sectiune oriunde ar fi: in pagina principala sau in partea fixa. */
function findSection(design: StoreDesign, id: string): SectionInstance | undefined {
  if (design.chrome.announcement?.id === id) return design.chrome.announcement;
  if (design.chrome.header.id === id) return design.chrome.header;
  if (design.chrome.footer.id === id) return design.chrome.footer;
  return design.home.find((s) => s.id === id);
}

/** Aplica o modificare unei sectiuni, oriunde s-ar afla. */
export function updateSection(
  design: StoreDesign,
  id: string,
  patch: Partial<Pick<SectionInstance, "variant" | "enabled" | "settings">>,
): StoreDesign {
  const next = clone(design);
  const tinta = findSection(next, id);
  if (!tinta) return design;
  Object.assign(tinta, patch);
  return next;
}

export function toggleSection(design: StoreDesign, id: string): StoreDesign {
  const curenta = findSection(design, id);
  if (!curenta) return design;
  return updateSection(design, id, { enabled: !curenta.enabled });
}

/**
 * Sterge o sectiune. Cele marcate ca ne-eliminabile (header, footer, catalogul)
 * nu pot fi scoase — fara ele magazinul n-ar mai fi un magazin.
 */
export function removeSection(design: StoreDesign, id: string): StoreDesign {
  const tinta = findSection(design, id);
  if (!tinta || sectionMeta(tinta.kind)?.removable === false) return design;
  const next = clone(design);
  if (next.chrome.announcement?.id === id) {
    next.chrome.announcement = null;
    return next;
  }
  next.home = next.home.filter((s) => s.id !== id);
  return next;
}

/** Duplica o sectiune, imediat sub original. Doar cele care pot exista de mai multe ori. */
export function duplicateSection(design: StoreDesign, id: string): StoreDesign {
  const index = design.home.findIndex((s) => s.id === id);
  if (index < 0) return design;
  const original = design.home[index];
  if (sectionMeta(original.kind)?.singleton !== false) return design;
  const next = clone(design);
  next.home.splice(index + 1, 0, { ...structuredClone(original), id: newSectionId() });
  return next;
}

/** Adauga o sectiune la finalul paginii, inaintea catalogului daca acesta exista. */
export function addSection(design: StoreDesign, kind: SectionKind): StoreDesign {
  const meta = sectionMeta(kind);
  const variant = firstVariant(kind);
  if (!meta || !variant) return design;
  // Un singleton deja prezent nu se mai adauga a doua oara.
  if (meta.singleton && design.home.some((s) => s.kind === kind)) return design;

  const next = clone(design);
  const noua = section(newSectionId(), kind, variant, true, meta.variants[variant].defaults ?? {});
  const catalog = next.home.findIndex((s) => s.kind === "product_grid");
  if (catalog >= 0) next.home.splice(catalog, 0, noua);
  else next.home.push(noua);
  return next;
}

/**
 * Sectiunile pe care comerciantul le mai poate adauga: cele din catalog care nu
 * sunt deja prezente ca singleton.
 */
export function addableKinds(design: StoreDesign): SectionKind[] {
  return (Object.keys(SECTION_REGISTRY) as SectionKind[]).filter((kind) => {
    const meta = SECTION_REGISTRY[kind];
    if (!meta || meta.scope !== "home") return false;
    if (!meta.singleton) return true;
    return !design.home.some((s) => s.kind === kind);
  });
}
