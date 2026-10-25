import type { Block, PageSeo } from "@/lib/pages/blocks.types";

/**
 * O pagina proprie deschisa in editorul unic (etapa 5 din `docs/editor-magazin/PLAN.md`).
 *
 * Pagina e CONTINUT, nu design: se salveaza explicit, direct in magazin, ca in editorul de pagini de
 * pana acum (`updatePage`, cu garda de versiune). Aici sta tot ce se salveaza, intr-un singur obiect,
 * ca „nesalvat” sa se judece pe tot randul, nu camp cu camp.
 */
export interface StarePagina {
  titlu: string;
  slug: string;
  publicata: boolean;
  blocks: Block[];
  css: string;
  seo: PageSeo;
}

/** Are ecranul ceva nesalvat fata de ce s-a incarcat sau s-a salvat ultima oara? */
export function paginaModificata(salvata: StarePagina, curenta: StarePagina): boolean {
  return salvata !== curenta && JSON.stringify(salvata) !== JSON.stringify(curenta);
}

/**
 * Ce pleaca la `updatePage`: tot randul, cu versiunea (`updated_at`) la care l-a incarcat ecranul.
 * Fara versiune, doua file deschise pe aceeasi pagina s-ar fi suprascris tacut.
 */
export function deSalvat(s: StarePagina, versiune: string) {
  return {
    title: s.titlu,
    slug: s.slug,
    blocks: s.blocks,
    page_css: s.css,
    seo: s.seo,
    is_published: s.publicata,
    versiune,
  };
}
