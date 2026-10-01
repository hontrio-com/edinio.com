import type { SectiuneAcasa } from "./blocks.types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  O PAGINA DIN „PAGINI" CA PAGINA PRINCIPALA                      (01.10.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Comerciantul alege o pagina construita din blocuri si ea se deschide la adresa
  magazinului, in locul paginii principale cu sectiuni fixe. Alegerea se tine in
  `page_content.pagina_acasa` (id-ul paginii). Fara ea, nimic nu se schimba.

  ⚠ RANDAREA TRECE TOT PRIN `MiniStoreRenderer`, nu prin ruta paginilor.
  Blocurile „Din pagina principala" (bannere, categorii, catalog, randuri de
  produse...) sunt chiar sectiunile magazinului, cu toate datele lor: catalogul
  pe palierul server, cosul, filtrele. Le-ar fi trebuit rescrise pe toate ca
  blocuri; asa, pagina se transforma intr-o lista de sectiuni (`sectiuniDinBlocuri`),
  iar blocurile obisnuite dintre ele intra ca o sectiune `rich_blocks`, randata
  pe server si trimisa gata facuta.

  Aici stau doar cheia si etichetele (le citeste si editorul, in browser).
  Transformarea in sectiuni sta in `lib/storefront/design/pagina-acasa.ts`.

  ⚠ CATALOGUL SE MUTA PE PAGINA LUI (`aplicaPaginaAcasa`). Linkurile de
  categorie de pe tot magazinul duc la radacina catalogului; cu o pagina de
  prezentare in locul grilei, `/?cat=X` n-ar mai fi aratat nimic.
*/

/** Cheia din `page_content`. Scrisa NUMAI de `seteazaPaginaAcasa`. */
export const CHEIE_PAGINA_ACASA = "pagina_acasa";

/** Id-ul paginii alese ca pagina principala, sau null. */
export function citestePaginaAcasa(pageContent: unknown): string | null {
  if (!pageContent || typeof pageContent !== "object") return null;
  const v = (pageContent as Record<string, unknown>)[CHEIE_PAGINA_ACASA];
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

/** Ce vede comerciantul in paleta si in setarile blocului. */
export const SECTIUNI_ACASA: { cheie: SectiuneAcasa; eticheta: string; descriere: string }[] = [
  { cheie: "hero", eticheta: "Bannere", descriere: "Bannerele magazinului, cu designul ales." },
  { cheie: "usp_strip", eticheta: "Beneficii pe scurt", descriere: "Banda cu garantiile magazinului." },
  { cheie: "category_nav", eticheta: "Categorii", descriere: "Categoriile, cu imagini, catre catalog." },
  { cheie: "shipping_progress", eticheta: "Prag transport gratuit", descriere: "Cat mai are clientul pana la transport gratuit." },
  { cheie: "product_row", eticheta: "Rand de produse", descriere: "Recomandate sau un rand facut in Editeaza magazinul." },
  { cheie: "catalog", eticheta: "Catalog produse", descriere: "Toate produsele, cu cautare, filtre si paginare." },
  { cheie: "benefits", eticheta: "Beneficii", descriere: "Sectiunea de beneficii a magazinului." },
  { cheie: "reviews", eticheta: "Recenzii", descriere: "Recenziile adaugate in Editeaza magazinul." },
  { cheie: "gallery", eticheta: "Galerie foto", descriere: "Galeria magazinului." },
  { cheie: "about", eticheta: "Despre noi", descriere: "Descrierea magazinului." },
  { cheie: "contact", eticheta: "Contact", descriere: "Datele de contact ale magazinului." },
];

export function etichetaSectiunii(cheie: SectiuneAcasa): string {
  return SECTIUNI_ACASA.find((s) => s.cheie === cheie)?.eticheta ?? "Sectiune";
}

/** Variantele de bannere; aceleasi trei ca in editorul de design. */
export const VARIANTE_HERO: { valoare: string; eticheta: string }[] = [
  { valoare: "banners", eticheta: "Doar imagini" },
  { valoare: "overlay", eticheta: "Imagine cu text peste" },
  { valoare: "categories", eticheta: "Categorii la stanga, bannere la dreapta" },
];
