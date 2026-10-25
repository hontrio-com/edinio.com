import type { Block, PageSeo } from "@/lib/pages/blocks.types";
import type { DateEditorPagina } from "@/lib/pages/date-editor-pagina";
import { anuleaza, istoricGol, noteaza, reface, type Istoric } from "./istoric";

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
 * Cateva cuvinte din bloc, ca randul lui din arbore sa se recunoasca intre zece blocuri de acelasi
 * fel: titlul bannerului, textul titlului, eticheta butonului. `null` cand blocul n-are text.
 */
export function rezumatBloc(b: Block): string | null {
  const text = (() => {
    switch (b.type) {
      case "hero":
      case "faq":
      case "products":
        return b.title;
      case "heading":
        return b.text;
      case "button":
        return b.label;
      case "image":
        return b.alt || b.caption;
      case "text":
        return b.html?.replace(/<[^>]*>/g, " ");
      default:
        return undefined;
    }
  })();
  const curat = text?.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!curat) return null;
  return curat.length > 40 ? `${curat.slice(0, 39).trimEnd()}…` : curat;
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

/** Pagina deschisa: datele de la server, ce e in baza, ce e pe ecran, istoricul si versiunea. */
export type Deschisa = {
  id: string;
  date: DateEditorPagina;
  /** Ce e in baza: la incarcare, apoi dupa fiecare salvare reusita. */
  salvata: StarePagina;
  curenta: StarePagina;
  istoric: Istoric<StarePagina>;
  versiune: string;
};

export type StarePaginiiDeschise = { deschisa: Deschisa | null; lipsa: string | null };

export type ActiunePagina =
  | { tip: "incarcata"; id: string; date: DateEditorPagina }
  | { tip: "lipsa"; id: string }
  | { tip: "inchisa" }
  | { tip: "aplica"; fn: (s: StarePagina) => StarePagina; cheie: string | null; acum: number }
  | { tip: "anuleaza" }
  | { tip: "reface" }
  | { tip: "salvata"; id: string; trimisa: StarePagina; slug: string; versiune: string };

function dinDate(d: DateEditorPagina): StarePagina {
  const p = d.pagina;
  return { titlu: p.titlu, slug: p.slug, publicata: p.publicata, blocks: p.blocks, css: p.css, seo: p.seo };
}

/**
 * Starea paginii deschise in `usePaginaProprie`, fara React (aici ca s-o probeze `editor-magazin.test.ts`).
 */
export function reductorPagina(stare: StarePaginiiDeschise, a: ActiunePagina): StarePaginiiDeschise {
  const d = stare.deschisa;
  switch (a.tip) {
    case "incarcata": {
      const s = dinDate(a.date);
      return { deschisa: { id: a.id, date: a.date, salvata: s, curenta: s, istoric: istoricGol(), versiune: a.date.pagina.versiune }, lipsa: null };
    }
    case "lipsa":
      return { deschisa: null, lipsa: a.id };
    case "inchisa":
      // Editorul a trecut pe alta pagina: ce era pe ecran se uita, iar la intoarcere pagina se citeste din nou.
      return d || stare.lipsa ? { deschisa: null, lipsa: null } : stare;
    case "aplica": {
      if (!d) return stare;
      const urmatoarea = a.fn(d.curenta);
      if (urmatoarea === d.curenta) return stare;
      return { ...stare, deschisa: { ...d, curenta: urmatoarea, istoric: noteaza(d.istoric, d.curenta, { cheie: a.cheie, acum: a.acum }) } };
    }
    case "anuleaza": {
      const pas = d ? anuleaza(d.istoric, d.curenta) : null;
      return pas && d ? { ...stare, deschisa: { ...d, curenta: pas.stare, istoric: pas.istoric } } : stare;
    }
    case "reface": {
      const pas = d ? reface(d.istoric, d.curenta) : null;
      return pas && d ? { ...stare, deschisa: { ...d, curenta: pas.stare, istoric: pas.istoric } } : stare;
    }
    case "salvata": {
      if (!d || d.id !== a.id) return stare;
      // Serverul poate scrie adresa altfel (curatata); ecranul o ia pe a lui, daca n-a schimbat-o intre timp.
      const salvata = { ...a.trimisa, slug: a.slug };
      const curenta = d.curenta.slug === a.trimisa.slug ? { ...d.curenta, slug: a.slug } : d.curenta;
      return { ...stare, deschisa: { ...d, salvata, curenta, versiune: a.versiune } };
    }
  }
}
