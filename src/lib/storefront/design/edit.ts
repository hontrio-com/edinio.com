import { newSectionId, section } from "./defaults";
import { firstVariant, SECTION_REGISTRY, sectionMeta, variantMeta } from "./registry";
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
  /*
   * Semnul se pune DOAR daca s-a schimbat ordinea randurilor de produse intre
   * ele.
   *
   * ⚠ Pus la orice mutare, o singura tragere de „Beneficii" cu o pozitie mai sus
   * omora pentru totdeauna sagetile din „Editeaza magazinul": ele scriau mai
   * departe in `page_content.product_sections`, aratau „Salvat", si magazinul
   * pastra ordinea veche. Doua controale fara nicio legatura intre ele, unul
   * dezactivandu-l tacut pe celalalt.
   */
  if (ordineaRandurilor(design.home) !== ordineaRandurilor(next.home)) next.ordineAtinsa = true;
  return next;
}

/** Secventa de randuri de produse, ca sir: din ea se vede daca s-au reasezat intre ele. */
function ordineaRandurilor(home: SectionInstance[]): string {
  return home.filter((s) => s.kind === "product_row").map((s) => s.id).join("|");
}

/**
 * Toate sectiunile designului, intr-o singura lista.
 *
 * Scrisa de mana, si asta e important: o sectiune noua adaugata in `types.ts`
 * exista in date si se salveaza, dar nu apare nicaieri in editor pana nu intra
 * si aici. Pare ca deployul n-a prins.
 *
 * Bara de anunt poate lipsi (`null`), deci se adauga conditionat.
 */
export function toateSectiunile(design: StoreDesign): SectionInstance[] {
  return [
    ...(design.chrome.announcement ? [design.chrome.announcement] : []),
    design.chrome.header,
    ...design.home,
    design.chrome.footer,
    design.product.page,
    design.shop.page,
    design.commerce.productCard,
    design.commerce.cartDrawer,
    design.commerce.checkout,
  ];
}

/**
 * Cauta o sectiune oriunde ar fi in design.
 *
 * Cauta si in pagina de produs si in zona de comert, nu doar in pagina
 * principala si in partea fixa: catalogul de design-uri le arata pe toate, iar o
 * cautare partiala ar fi insemnat ca alegerea unui design de pagina de produs se
 * pierde in tacere, fara nicio eroare.
 */
function findSection(design: StoreDesign, id: string): SectionInstance | undefined {
  if (design.chrome.announcement?.id === id) return design.chrome.announcement;
  if (design.chrome.header.id === id) return design.chrome.header;
  if (design.chrome.footer.id === id) return design.chrome.footer;
  const dinHome = design.home.find((s) => s.id === id);
  if (dinHome) return dinHome;

  if (design.product.page.id === id) return design.product.page;
  if (design.shop.page.id === id) return design.shop.page;

  return [design.commerce.productCard, design.commerce.cartDrawer, design.commerce.checkout]
    .find((s) => s.id === id);
}

/** Aplica o modificare unei sectiuni, oriunde s-ar afla. */
export function updateSection(
  design: StoreDesign,
  id: string,
  patch: Partial<Pick<SectionInstance, "variant" | "enabled" | "enabledOverride" | "settings">>,
): StoreDesign {
  const next = clone(design);
  const tinta = findSection(next, id);
  if (!tinta) return design;
  Object.assign(tinta, patch);

  /*
   * O varianta aleasa de om se si tine minte ca fiind aleasa de om.
   *
   * Fara semnul asta, parserul re-deriva varianta hero-ului din comutatorul
   * „Afiseaza continutul peste banner" si stergea alegerea din galerie la prima
   * citire — doua din design-urile de hero nu puteau fi alese deloc.
   */
  if (patch.variant !== undefined) tinta.variantOverride = patch.variant;

  /*
   * La schimbarea variantei, reglajele pornesc de la valorile implicite ALE EI.
   *
   * Fara asta, sectiunea pastra reglajele variantei vechi, iar campurile noi
   * ramaneau nedefinite: comutatorul aparea STINS in editor, in timp ce
   * componenta il citeste ca „diferit de false", adica aprins in magazin. Un
   * comutator care minte e mai rau decat unul care lipseste. Valorile pe care
   * varianta noua le declara si comerciantul le avea deja setate se pastreaza.
   */
  if (patch.variant !== undefined && patch.settings === undefined) {
    const implicite = variantMeta(tinta.kind, tinta.variant)?.defaults ?? {};
    const vechi = tinta.settings ?? {};
    const rezultat: Record<string, unknown> = { ...implicite };
    for (const cheie of Object.keys(implicite)) {
      if (cheie in vechi) rezultat[cheie] = vechi[cheie];
    }
    tinta.settings = rezultat;
  }
  return next;
}

/**
 * Aprinde sau stinge o sectiune din editorul de design.
 *
 * ⚠ Scrie SI `enabledOverride`, nu doar `enabled`. Sectiunile derivate isi iau
 * starea din `page_content` la fiecare citire, deci fara semnul explicit
 * alegerea de aici traia exact pana la prima reincarcare: sectiunea disparea din
 * previzualizare, comerciantul apasa Publica — si revenea. Vezi `parse.ts`.
 */
export function toggleSection(design: StoreDesign, id: string): StoreDesign {
  const curenta = findSection(design, id);
  if (!curenta) return design;
  const nou = !curenta.enabled;
  return updateSection(design, id, { enabled: nou, enabledOverride: nou });
}

/**
 * Sterge o sectiune. Cele marcate ca ne-eliminabile (header, footer, catalogul)
 * nu pot fi scoase — fara ele magazinul n-ar mai fi un magazin.
 */
export function removeSection(design: StoreDesign, id: string): StoreDesign {
  const tinta = findSection(design, id);
  if (!tinta || sectionMeta(tinta.kind)?.removable === false) return design;
  // Sterse de aici, ar reaparea la prima citire — parserul le readuce din
  // continut — si stergerea ar parea ca nu face nimic.
  if (CONTINUT_DIN_PAGE_CONTENT.includes(tinta.kind)) return design;
  // Se pot scoate doar sectiunile paginii principale si bara de anunt. Cele ale
  // paginii de produs si ale cosului fac parte din structura, nu din aranjament.
  if (design.chrome.announcement?.id !== id && !design.home.some((s) => s.id === id)) return design;
  const next = clone(design);
  /*
   * Id-ul intra in lista de sterse, altfel stergerea se anuleaza singura.
   *
   * Parserul readuce din designul „classic" sectiunile aprinse care lipsesc —
   * regula exista pentru designurile salvate de versiuni mai vechi. Fara semnul
   * asta, ea nu poate deosebi o sectiune stearsa anume de una care n-a existat
   * niciodata, deci o readucea la prima citire: sectiunea disparea din
   * previzualizare, comerciantul apasa Publica, si ea era inapoi.
   */
  next.sterse = [...new Set([...(next.sterse ?? []), id])];
  if (next.chrome.announcement?.id === id) {
    next.chrome.announcement = null;
    return next;
  }
  next.home = next.home.filter((s) => s.id !== id);
  return next;
}

/**
 * Se poate duplica sectiunea?
 *
 * Doua conditii, nu una. Sa poata exista de mai multe ori — si sa nu-si ia
 * continutul din `page_content`: o copie a unui rand de produse ar primi un id
 * fara pereche acolo, deci ar ramane pentru totdeauna un rand gol in magazin.
 *
 * Exportata ca lista de sectiuni sa afiseze butonul dupa aceeasi regula dupa
 * care il si executa. Butoanele care nu pot face nimic sunt exact felul de
 * defect pe care nimeni nu-l raporteaza.
 */
export function poateFiDuplicata(kind: SectionKind): boolean {
  return sectionMeta(kind)?.singleton === false && !CONTINUT_DIN_PAGE_CONTENT.includes(kind);
}

/** Duplica o sectiune, imediat sub original. Doar cele care pot exista de mai multe ori. */
export function duplicateSection(design: StoreDesign, id: string): StoreDesign {
  const index = design.home.findIndex((s) => s.id === id);
  if (index < 0) return design;
  const original = design.home[index];
  if (!poateFiDuplicata(original.kind)) return design;
  const next = clone(design);
  next.home.splice(index + 1, 0, { ...structuredClone(original), id: newSectionId() });
  return next;
}

/**
 * Sectiuni al caror continut traieste in `page_content`, nu in design.
 *
 * Un rand de produse adaugat din editorul de design ar primi un id fara pereche
 * in `page_content.product_sections`, deci `CustomProductRow` n-ar gasi nimic si
 * randul n-ar aparea niciodata in magazin; nici de configurat n-ar fi ce, randul
 * n-are inca design-uri proprii. Randurile se fac din editorul magazinului si
 * intra singure in lista, derivate.
 */
const CONTINUT_DIN_PAGE_CONTENT: SectionKind[] = ["product_row"];

/** Adauga o sectiune la finalul paginii, inaintea catalogului daca acesta exista. */
export function addSection(design: StoreDesign, kind: SectionKind): StoreDesign {
  const meta = sectionMeta(kind);
  const variant = firstVariant(kind);
  if (!meta || !variant) return design;
  // Aceeasi regula ca in `addableKinds`: altfel se poate ajunge, prin cod, la
  // starea pe care lista de mai sus o declara imposibila.
  if (CONTINUT_DIN_PAGE_CONTENT.includes(kind)) return design;
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
    if (CONTINUT_DIN_PAGE_CONTENT.includes(kind)) return false;
    if (!meta.singleton) return true;
    return !design.home.some((s) => s.kind === kind);
  });
}
