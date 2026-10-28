import { BLOCK_META, EXCLUSE_DIN_COLOANE, type Block, type BlockType } from "@/lib/pages/blocks.types";
import { cloneBlockWithNewIds } from "@/lib/pages/block-tree";

/**
 * „Conținut liber” (etapa 9 din `docs/editor-magazin/PLAN.md`): blocurile paginilor proprii puse in
 * magazin. Stau in DESIGN, deci trec prin ciorna si ajung la clienti la „Publică”, ca restul editorului:
 *  - pe pagina principala, o sectiune `continut_liber` (`settings.blocuri`), de cate ori e nevoie;
 *  - sub produs, un bloc repetabil al paginii de produs, deci pe fiecare sablon (`blocuri.ts`);
 *  - pe Pagina Magazin, deasupra si sub produse, tot ca blocuri repetabile.
 *
 * Aici sta doar FORMA: ce tipuri au voie, coloanele cu un singur nivel, cate blocuri, id-uri unice.
 * Continutul (textul bogat, codul personalizat, culorile, adresele) se curata la randare, de
 * `prepareBlocksForPublic`, si la incarcarea in editor, de `curataHtmlPentruEditor`, ca la paginile
 * proprii. Fara React si fara biblioteci de server: modulul il citesc si parserul, si editorul.
 */

/** Numele continutului in arbore si pe conturul din previzualizare (ca la paginile proprii, etapa 5). */
export const ETICHETA_CONTINUT_LIBER = "Conținut liber";

/**
 * Blocurile care se pot pune: ale paginilor proprii, fara „Din pagina principală”. Acela aduce o
 * sectiune a magazinului pe o pagina proprie; pus chiar in magazin, ar dubla o sectiune care exista.
 */
export const TIPURI_CONTINUT_LIBER: readonly BlockType[] = (Object.keys(BLOCK_META) as BlockType[]).filter((t) => t !== "acasa");

/** Cate blocuri poate avea un „Conținut liber”, cu tot cu cele din coloane. */
export const MAX_BLOCURI_CONTINUT = 80;

/** Cate coloane poate avea un bloc de coloane (editorul ofera cel mult sase pe rand). */
const MAX_CELULE = 12;

const ID_BLOC = /^[A-Za-z0-9_-]{1,64}$/;

const esteObiect = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Blocurile unui „Conținut liber”, curatate la citire: tipurile permise, coloanele cu blocuri doar pe un
 * nivel (cum le face si editorul de pagini), cel mult `MAX_BLOCURI_CONTINUT`, id-uri valide si unice in
 * tot continutul (operatiile din `block-tree.ts` cauta dupa id in tot arborele).
 *
 * ⚠ Idempotenta si STABILA: un id lipsa sau stricat primeste unul dupa pozitie, nu unul nou la fiecare
 * citire. Altfel blocul ar fi avut alt id la fiecare randare, iar un formular trimis de pe magazin nu
 * si-ar mai fi gasit blocul pe server.
 */
export function parseBlocuriLibere(raw: unknown): Block[] {
  return parseLista(raw, false, { ramase: MAX_BLOCURI_CONTINUT, vazute: new Set() }, "");
}

function parseLista(raw: unknown, inColoana: boolean, loc: { ramase: number; vazute: Set<string> }, cale: string): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  raw.forEach((element, i) => {
    if (loc.ramase <= 0 || !esteObiect(element)) return;
    const tip = element.type;
    if (typeof tip !== "string" || !TIPURI_CONTINUT_LIBER.includes(tip as BlockType)) return;
    if (inColoana && EXCLUSE_DIN_COLOANE.includes(tip as BlockType)) return;
    let id = typeof element.id === "string" && ID_BLOC.test(element.id) ? element.id : `bl_${cale}${i}`;
    if (loc.vazute.has(id)) {
      let n = 2;
      while (loc.vazute.has(`${id}_${n}`)) n += 1;
      id = `${id}_${n}`;
    }
    loc.vazute.add(id);
    loc.ramase -= 1;
    const bloc: Record<string, unknown> = { ...element, id, type: tip };
    if (tip === "html") {
      /*
       * ⚠ Semnul `raw` (HTML lasat neatins, „aprobat de admin”) nu intra in design deloc. Randarea nu-l
       * mai foloseste (`prepareBlocksForPublic`), iar la paginile proprii doar o poarta de la salvare il
       * mai pazea; aici parserul e chiar poarta de la salvare, deci il scoate, fara alta verificare.
       */
      delete bloc.raw;
      delete bloc.rawApprovedBy;
    }
    if (tip === "columns") {
      const celule = Array.isArray(element.items) ? element.items.slice(0, MAX_CELULE) : [];
      bloc.items = celule.map((celula, ci) => {
        if (!esteObiect(celula)) return {};
        return Array.isArray(celula.blocks)
          ? { ...celula, blocks: parseLista(celula.blocks, true, loc, `${cale}${i}c${ci}_`) }
          : { ...celula };
      });
    }
    out.push(bloc as unknown as Block);
  });
  return out;
}

/** Blocurile din reglajele unui container (sectiunea de pe pagina principala sau blocul repetabil). */
export function blocuriDinSetari(setari: Record<string, unknown> | undefined): Block[] {
  return Array.isArray(setari?.blocuri) ? (setari.blocuri as Block[]) : [];
}

/**
 * Numele unui container dupa blocurile lui: „Buton”, „Buton, Text”, „Buton, Text și încă 2”; gol,
 * „Conținut liber”.
 *
 * ⚠ Cerut de el (28.10.2026, etapa 13): un buton pus cu „+” pe prima pagina aparea in arbore drept
 * „Conținut liber”, adica numele cutiei, nu al lucrului din ea. Cu trei-patru asemenea cutii, nu stiai
 * care e care fara sa le deschizi pe rand.
 */
/**
 * Singurul bloc al unui container, sau `null` cand are zero ori mai multe. Cu un singur bloc, clicul pe
 * container il deschide direct pe el (etapa 13): lista unui singur rand era un pas in plus.
 */
export function blocUnic(setari: Record<string, unknown> | undefined): Block | null {
  const blocuri = blocuriDinSetari(setari);
  return blocuri.length === 1 ? blocuri[0] : null;
}

export function numeleContinutului(blocuri: readonly Block[]): string {
  const nume = blocuri.map((b) => BLOCK_META[b.type]?.label ?? b.type);
  if (nume.length === 0) return ETICHETA_CONTINUT_LIBER;
  if (nume.length <= 2) return nume.join(", ");
  return `${nume.slice(0, 2).join(", ")} și încă ${nume.length - 2}`;
}

/**
 * Aceleasi blocuri, cu id-uri NOI (si cele din coloane): la duplicarea unui continut. Doua copii cu
 * aceleasi id-uri ar fi raspuns impreuna la Anuleaza, la clicul din previzualizare si la formulare.
 */
export function reidentificaBlocuri(blocuri: readonly Block[]): Block[] {
  return blocuri.map(cloneBlockWithNewIds);
}
