import { SEGMENT_MAGAZIN, SEGMENT_CAUTARE } from "@/lib/pages/reserved-slugs";
import { radacinaMagazin } from "@/lib/storefront/category-href";
import { variantMeta } from "./registry";
import type { SectionInstance, SectionKind, StoreDesign } from "./types";

/**
 * Cosul si finalizarea comenzii: panou sau pagina de sine statatoare?
 *
 * Raspunsul se da AICI, intr-un singur loc, si niciodata ghicind dupa id-ul
 * variantei. Il citesc rutele publice, `buildChromeData` (deci toate header-ele),
 * `MiniStoreRenderer` si invelisul paginilor fara catalog. Daca fiecare l-ar
 * deduce singur, s-ar ajunge la starea cea mai proasta cu putinta: magazinul cu
 * pagina de cos publicata si butonul din header care deschide in continuare un
 * sertar care nu mai exista.
 *
 * Alegerea e EXCLUSIVA, prin design: cine alege pagina nu mai are sertar, si
 * invers. Doua drumuri catre acelasi lucru ar insemna doua fluxuri de urmarit si
 * doua suprafete de intretinut.
 */

/** Segmentele rutelor de comert. Rezervate deja in `lib/pages/reserved-slugs.ts`. */
export const SEGMENT_COS = "cos";
export const SEGMENT_CHECKOUT = "checkout";
// Definit langa lista de sluguri rezervate, ca ecranele de dashboard sa il poata
// citi fara sa traga registry-ul de sectiuni in bundle-ul lor de client.
export { SEGMENT_MAGAZIN, SEGMENT_CAUTARE };

/** `true` cand designul publicat pune cosul pe o pagina proprie. */
export function cartOnPage(design: StoreDesign): boolean {
  return variantMeta("cart_drawer", design.commerce.cartDrawer.variant)?.surface === "page";
}

/** `true` cand designul publicat pune finalizarea comenzii pe o pagina proprie. */
export function checkoutOnPage(design: StoreDesign): boolean {
  return variantMeta("checkout", design.commerce.checkout.variant)?.surface === "page";
}

export function cartHref(basePath: string): string {
  return `${basePath}/${SEGMENT_COS}`;
}

export function checkoutHref(basePath: string): string {
  return `${basePath}/${SEGMENT_CHECKOUT}`;
}

/**
 * `true` cand designul publicat scoate catalogul pe o pagina proprie.
 *
 * Spre deosebire de cos si de finalizare, aici se verifica SI `enabled`.
 * Alegerea nu are alternativa de tip panou: orice varianta in afara de „produsele
 * stau pe pagina principala" e o pagina, deci fara verificarea asta, o sectiune
 * stinsa ar fi lasat ruta deschisa mai departe.
 */
export function shopOnPage(design: StoreDesign): boolean {
  return (
    design.shop.page.enabled === true
    && variantMeta("shop_page", design.shop.page.variant)?.surface === "page"
  );
}

/**
 * Adresa paginii de rezultate ale cautarii.
 *
 * ═══ ⚠ NU DEPINDE DE DESIGN, SPRE DEOSEBIRE DE `shopHref` ═══
 *
 * Catalogul are pagina lui doar la magazinele care si-au ales-o. Rezultatele cautarii
 * exista MEREU: bara e in toate cele sapte headere, iar daca destinatia ar depinde de
 * o alegere de design, aceeasi apasare ar duce la o pagina adevarata la unii si inapoi
 * pe pagina principala — peste erou, peste randurile de produse — la altii.
 *
 * Chiar ce a raportat eSAFE: „sunt tot pe pagina principala".
 */
export function hrefCautare(basePath: string, interogare?: string): string {
  const cale = `${basePath}/${SEGMENT_CAUTARE}`;
  return interogare ? `${cale}?${interogare}` : cale;
}

export function shopHref(basePath: string): string {
  return `${basePath}/${SEGMENT_MAGAZIN}`;
}

/**
 * Unde traieste catalogul: pagina lui sau radacina magazinului.
 *
 * Raspunsul se da AICI, intr-un singur loc, din acelasi motiv ca la cos. Il
 * citesc `buildChromeData` (deci toate cele opt headere, cele doua footere,
 * meniul, hero-ul cu categorii si firimiturile paginilor de produs), pagina
 * principala si ruta noua. Dedus separat in fiecare, ar fi ajuns garantat ca
 * unul dintre cele douasprezece locuri sa trimita clientul in alta parte decat
 * celelalte unsprezece.
 */
export function radacinaCatalog(basePath: string, design: StoreDesign): string {
  return shopOnPage(design) ? shopHref(basePath) : radacinaMagazin(basePath);
}

/**
 * Sectiunile care pot pleca pe pagina de catalog.
 *
 * Grila si bara de cautare: singurele doua care ar fi in doua locuri deodata.
 * Categoriile RAMAN mereu pe pagina principala — acolo sunt navigare catre
 * catalog, nu filtrare in el — la fel randurile de produse si restul.
 */
const MUTATE_PE_PAGINA_DE_CATALOG: readonly SectionKind[] = ["product_grid", "catalog_toolbar"];

/**
 * Grila de produse ramane si pe pagina principala, langa pagina de catalog?
 *
 * Implicit DA: cele doua suprafete sunt lucruri diferite pentru vizitator —
 * pagina principala e vitrina, cu hero, randuri alese si o grila de rasfoit,
 * iar pagina de catalog e locul unde se cauta serios, cu toate filtrele. Un
 * magazin poate sa le vrea pe amandoua.
 *
 * Comutatorul exista pentru cine vrea despartirea curata. Costul lui „amandoua"
 * e real si merita stiut: `/?cat=X` si `/magazin?cat=X` listeaza aceleasi
 * produse, iar catalogul intreg se descarca o data pentru fiecare pagina
 * vizitata. Primul e rezolvat prin canonical (paginile filtrate de pe acasa
 * arata catre pagina de catalog); al doilea ramane.
 */
export function grilaRamaneAcasa(design: StoreDesign): boolean {
  return design.shop.page.settings?.pastreazaGrilaAcasa !== false;
}

/**
 * Sectiunile paginii principale.
 *
 * Se taie la RANDARE, nu in parser: sectiunile raman in configuratia salvata,
 * deci comerciantul care se razgandeste isi gaseste pagina principala exact cum
 * a lasat-o, iar editorul continua sa le arate.
 */
export function sectiuniAcasa(design: StoreDesign): SectionInstance[] {
  if (!shopOnPage(design) || grilaRamaneAcasa(design)) return design.home;
  return design.home.filter((s) => !MUTATE_PE_PAGINA_DE_CATALOG.includes(s.kind));
}
