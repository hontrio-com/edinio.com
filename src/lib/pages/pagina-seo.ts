import { TIPURI_PAGINA_PROPRIE, type Block, type PageSeo, type TipPaginaProprie } from "./blocks.types";
import { flattenBlocks } from "./block-tree";

/**
 * Ce se poate afla despre o pagina proprie, pentru datele ei structurate.
 *
 * Modulul e PUR: nu atinge baza si nu importa nimic de server, ca sa poata fi
 * chemat si de ruta publica, si de teste. Tot ce iese de aici vine ori din randul
 * `custom_pages`, ori din blocurile pe care le-a asezat comerciantul — niciodata
 * dintr-o deducere.
 *
 * ⚠ `custom_pages.seo` e o coloana `Json`. `PageSeo` spune ce ne ASTEPTAM sa
 * gasim acolo, nu ce se afla cu adevarat: randurile vechi n-au campurile noi, iar
 * o valoare stricata la mana ar trece nefiltrata pana in `<script>`-ul paginii
 * publice. De aia orice citire trece pe aici, prin liste albe si taieri de
 * lungime, si niciodata direct din obiect in JSON-LD.
 */

const MAX_AUTOR = 80;

const VALORI_TIP = new Set<string>(TIPURI_PAGINA_PROPRIE.map((t) => t.valoare));

/** Tipul declarat de comerciant, trecut prin lista alba. Necunoscut = „pagina". */
export function tipPagina(seo: PageSeo | null | undefined): TipPaginaProprie {
  const brut = (seo as { tip?: unknown } | null)?.tip;
  return typeof brut === "string" && VALORI_TIP.has(brut) ? (brut as TipPaginaProprie) : "pagina";
}

/** Autorul declarat, taiat la o lungime rezonabila. Gol = semneaza magazinul. */
export function autorPagina(seo: PageSeo | null | undefined): string {
  const brut = (seo as { autor?: unknown } | null)?.autor;
  return typeof brut === "string" ? brut.trim().slice(0, MAX_AUTOR) : "";
}

/**
 * Data publicarii: cea declarata de comerciant, altfel data crearii paginii.
 *
 * Regula e scrisa AICI, o singura data. Doua campuri care raspund la aceeasi
 * intrebare produc doua adevaruri — iar cel gresit ar ajunge tocmai in
 * `datePublished`, campul dupa care se sorteaza rezultatele de stiri.
 */
export function dataPublicarii(seo: PageSeo | null | undefined, createdAt: string | null | undefined): string {
  const brut = (seo as { dataPublicarii?: unknown } | null)?.dataPublicarii;
  const declarata = typeof brut === "string" ? brut.trim() : "";
  if (declarata && !Number.isNaN(new Date(declarata).getTime())) return declarata;
  return (createdAt ?? "").trim();
}

/**
 * Imaginea reprezentativa a paginii.
 *
 * Ordinea urmareste cat de EXPLICITA e alegerea: intai imaginea pe care omul a
 * incarcat-o anume pentru distribuire (`seo.ogImage`), apoi prima imagine mare
 * pusa pe pagina. Toate sunt fisiere incarcate de el, deci nu se ghiceste nimic;
 * daca nu exista niciuna, articolul ramane fara `image`, ceea ce e corect.
 *
 * ⚠ `flattenBlocks` coboara doar in coloanele „flexibile" (`items[].blocks`).
 * Imaginea unei coloane CLASICE sta in `items[].image` si NU e vizitata de el —
 * paginile vechi sunt tocmai cele construite asa, deci ar fi fost sarite tacut.
 * De aia coloanele se cerceteaza separat, mai jos.
 */
export function imaginePagina(seo: PageSeo | null | undefined, blocks: Block[]): string {
  const declarata = (seo?.ogImage ?? "").trim();
  if (declarata) return declarata;

  for (const b of flattenBlocks(blocks)) {
    switch (b.type) {
      case "hero":
        if (b.bgImage?.trim()) return b.bgImage.trim();
        break;
      case "image":
        if (b.src?.trim()) return b.src.trim();
        break;
      case "gallery": {
        const dinItems = (b.items ?? []).find((it) => it.src?.trim())?.src;
        if (dinItems?.trim()) return dinItems.trim();
        const vechi = (b.images ?? []).find((s) => s?.trim());
        if (vechi?.trim()) return vechi.trim();
        break;
      }
      case "video":
        // `poster` e imaginea; `src` e fisierul video si n-are ce cauta la `image`.
        if (b.poster?.trim()) return b.poster.trim();
        break;
      case "columns":
        for (const it of b.items ?? []) {
          if (it.image?.trim()) return it.image.trim();
        }
        break;
    }
  }
  return "";
}

/** Perechile intrebare/raspuns chiar scrise pe pagina, din blocurile `faq`. */
export function intrebariPagina(blocks: Block[]): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  for (const b of flattenBlocks(blocks)) {
    if (b.type !== "faq") continue;
    for (const it of b.items ?? []) {
      if (it?.q?.trim() && it?.a?.trim()) out.push({ q: it.q, a: it.a });
    }
  }
  return out;
}

/**
 * Curata obiectul `seo` inainte de scrierea in baza.
 *
 * Aceeasi lista alba ca la citire, aplicata la SALVARE: campul `tip` ajunge in
 * coloana doar cu una dintre valorile cunoscute, iar `autor` si `dataPublicarii`
 * doar pe paginile marcate ca articol. Fara asta, o pagina schimbata din
 * „Articol" inapoi in „Pagina obisnuita" ar fi pastrat in coloana un autor si o
 * data care nu mai descriu nimic — si care ar fi reaparut la prima duplicare.
 */
export function curataSeoPagina(seo: PageSeo | null | undefined): PageSeo {
  if (!seo || typeof seo !== "object") return {};
  const tip = tipPagina(seo);
  const out: PageSeo = { ...seo };
  delete out.tip;
  delete out.autor;
  delete out.dataPublicarii;
  if (tip !== "pagina") out.tip = tip;
  if (tip === "articol") {
    const autor = autorPagina(seo);
    if (autor) out.autor = autor;
    const brut = (seo as { dataPublicarii?: unknown }).dataPublicarii;
    const data = typeof brut === "string" ? brut.trim() : "";
    if (data && !Number.isNaN(new Date(data).getTime())) out.dataPublicarii = data;
  }
  return out;
}
