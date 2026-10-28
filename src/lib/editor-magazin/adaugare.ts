import { BLOCK_META, type Block } from "@/lib/pages/blocks.types";
import { columnBlocks, isFlexibleColumns } from "@/lib/pages/block-tree";
import { adaugaContinut, esteContinut, schemaBlocurilor, type SchemaBlocuri } from "@/lib/storefront/design/blocuri";
import { shopOnPage } from "@/lib/storefront/design/commerce";
import { blocuriDinSetari } from "@/lib/storefront/design/continut-liber";
import { addSection, schimbaBlocurile, toateSectiunile, updateSection, type CaleContinut, type LocNou } from "@/lib/storefront/design/edit";
import { despartireId, idBloc, type MargineAdaugare, type PunctAdaugare } from "@/lib/storefront/design/preview-protocol";
import { sectionMeta } from "@/lib/storefront/design/registry";
import { coloaneSubsol, coloaneVazute, etichetaColoanei } from "@/lib/storefront/design/subsol";
import { paginaSablonului } from "@/lib/storefront/design/sabloane-produs";
import type { SectionInstance, SectionKind, StoreDesign } from "@/lib/storefront/design/types";
import { rezumatBloc } from "./pagina-proprie";
import { estePaginaProprie, type CheiePagina, type MagazinPentruPagini } from "./pagini";

/**
 * „+” din previzualizare (etapa 10 din `docs/editor-magazin/PLAN.md`): unde se arata si ce deschide.
 *
 * Previzualizarea stie doar marcajele; ce se poate adauga langa un element, si ce anume, se hotaraste
 * aici, din design si pagina. Fara React: probele ruleaza functiile direct.
 */

/**
 * Unde intra urmatorul bloc: in lista, sau intr-o coloana a unui bloc de coloane. `dupa` / `inainte`
 * spun, in cuvinte, langa ce bloc (capul panoului „Adaugă un bloc”).
 */
export type TintaBloc =
  | { fel: "sus"; index: number; dupa?: string; inainte?: string }
  | { fel: "coloana"; idColoane: string; coloana: number; index: number; dupa?: string; inainte?: string };

export interface ContextAdaugare {
  pagina: CheiePagina;
  magazin: MagazinPentruPagini;
  /** Sablonul de produs editat (4b); `null` = Implicit. */
  sablon: string | null;
  /** Pagina principala e o pagina proprie: pe Acasa nu se vad sectiunile designului. */
  paginaAcasaProprie: boolean;
  /** Blocurile paginii proprii deschise (etapa 5), cand pagina aleasa e una proprie si s-a incarcat. */
  blocuriPagina: Block[] | null;
}

export type Adaugare =
  /** Pe Acasa: galeria „Adaugă” (sectiuni si blocuri), langa sectiunea `eticheta`. */
  | { fel: "sectiune"; loc: LocNou; eticheta: string; unde: MargineAdaugare }
  /** In pagina proprie deschisa: „Adaugă un bloc”, la tinta. */
  | { fel: "bloc-pagina"; tinta: TintaBloc }
  /** Intr-un „Conținut liber” care exista: „Adaugă un bloc”, la tinta. */
  | { fel: "bloc-liber"; cale: CaleContinut; tinta: TintaBloc }
  /** Un „Conținut liber” nou, cu blocul ales, intr-o zona a paginii de produs sau a Paginii Magazin. */
  | { fel: "continut-nou"; sectiune: string; tip: string; loc: LocNou; locText: string }
  /** O coloana noua in subsol (etapa 11), langa cea aleasa: lista „Adaugă coloană”. */
  | { fel: "coloana-subsol"; loc: LocNou; locText: string };

const etichetaBloc = (b: Block): string => {
  const nume = BLOCK_META[b.type]?.label ?? b.type;
  const rezumat = rezumatBloc(b);
  return rezumat ? `${nume}: ${rezumat}` : nume;
};

/** Primul din fiecare lista are si „deasupra”: altfel nu s-ar putea pune nimic in capul ei. */
const punct = (id: string, primul: boolean): PunctAdaugare => (primul ? { id, sus: true } : { id });

/** Blocurile unei liste (pagina proprie, „Conținut liber”), si din coloane: `<cheie>/<bloc>`. */
function puncteInLista(blocuri: readonly Block[], cheie: string): PunctAdaugare[] {
  const out: PunctAdaugare[] = [];
  blocuri.forEach((b, i) => {
    out.push(punct(idBloc(cheie, b.id), i === 0));
    if (b.type === "columns" && isFlexibleColumns(b)) {
      for (let ci = 0; ci < (b.items ?? []).length; ci++) {
        columnBlocks(b, ci).forEach((nb, ni) => out.push(punct(idBloc(cheie, nb.id), ni === 0)));
      }
    }
  });
  return out;
}

/** Tipul de „Conținut liber” al unei zone (sub produs: `continut_liber`; pe Magazin: `continut_sus` / `continut_jos`). */
function continutulZonei(schema: SchemaBlocuri, zona: string): string | null {
  return Object.keys(schema.tipuri).find((t) => schema.tipuri[t].repetabil && schema.tipuri[t].zona === zona) ?? null;
}

/**
 * Pagina de produs si Pagina Magazin: sectiunea, bucatile fixe din `zonaFixa` (sub produs), fiecare
 * „Conținut liber” si blocurile lui. Doar ce se vede: un bloc stins nu e in previzualizare.
 */
function puncteInPagina(s: SectionInstance, zonaFixa: string | null, susPeSectiune: boolean): PunctAdaugare[] {
  const schema = schemaBlocurilor(s.kind, s.variant);
  if (!schema) return [];
  const out: PunctAdaugare[] = [punct(s.id, susPeSectiune)];
  const zoneVazute = new Set<string>();
  for (const b of s.blocks ?? []) {
    const zona = schema.tipuri[b.type]?.zona;
    if (!b.enabled || !zona) continue;
    const continut = esteContinut(schema, b.type);
    if (!continut && zona !== zonaFixa) continue;
    out.push(punct(idBloc(s.id, b.id), !zoneVazute.has(zona)));
    zoneVazute.add(zona);
    if (continut) out.push(...puncteInLista(blocuriDinSetari(b.settings), idBloc(s.id, b.id)));
  }
  return out;
}

/** Sectiunea paginii de produs vazuta acum: sablonul editat, sau pagina principala la magazinul cu un produs. */
function paginaDeProdus(design: StoreDesign, ctx: ContextAdaugare): SectionInstance | null {
  if (ctx.pagina === "produs") return paginaSablonului(design.product, ctx.sablon);
  if (ctx.pagina === "acasa" && ctx.magazin.unSingurProdus) return design.product.page;
  return null;
}

/**
 * Coloanele subsolului (etapa 11), pe orice pagina: subsolul e pe toate. Fara nicio coloana vazuta, subsolul insusi,
 * ca prima coloana sa se poata pune tot de aici.
 */
function puncteInSubsol(design: StoreDesign): PunctAdaugare[] {
  const subsol = design.chrome.footer;
  const coloane = coloaneVazute(subsol);
  if (coloane.length === 0) return [punct(subsol.id, false)];
  return coloane.map((c, i) => punct(idBloc(subsol.id, c.id), i === 0));
}

/** Unde arata previzualizarea „+” pe pagina aleasa, plus coloanele subsolului. Antetul, cosul si comanda n-au. */
export function puncteDeAdaugare(design: StoreDesign, ctx: ContextAdaugare): PunctAdaugare[] {
  return [...puncteleProprii(design, ctx), ...puncteInSubsol(design)];
}

/** „+” din corpul paginii alese. */
function puncteleProprii(design: StoreDesign, ctx: ContextAdaugare): PunctAdaugare[] {
  if (estePaginaProprie(ctx.pagina)) return ctx.blocuriPagina ? puncteInLista(ctx.blocuriPagina, ctx.pagina) : [];
  const produs = paginaDeProdus(design, ctx);
  if (produs) return puncteInPagina(produs, "jos", false);
  if (ctx.pagina === "acasa") {
    if (ctx.paginaAcasaProprie) return [];
    const prima = design.home.findIndex((s) => s.enabled);
    return design.home.flatMap((s, i) => [
      punct(s.id, i === prima),
      ...(s.kind === "continut_liber" ? puncteInLista(blocuriDinSetari(s.settings), s.id) : []),
    ]);
  }
  if (ctx.pagina === "magazin") return shopOnPage(design) ? puncteInPagina(design.shop.page, null, true) : [];
  return [];
}

/** Tinta unui bloc nou langa blocul `id` dintr-o lista (sau din coloana lui); `null` cand nu e in lista. */
export function tintaLangaBloc(blocuri: readonly Block[], id: string, unde: MargineAdaugare): TintaBloc | null {
  const langa = (b: Block) => (unde === "jos" ? { dupa: etichetaBloc(b) } : { inainte: etichetaBloc(b) });
  const i = blocuri.findIndex((b) => b.id === id);
  if (i >= 0) return { fel: "sus", index: unde === "jos" ? i + 1 : i, ...langa(blocuri[i]) };
  for (const b of blocuri) {
    if (b.type !== "columns" || !isFlexibleColumns(b)) continue;
    for (let ci = 0; ci < (b.items ?? []).length; ci++) {
      const lista = columnBlocks(b, ci);
      const j = lista.findIndex((nb) => nb.id === id);
      if (j >= 0) return { fel: "coloana", idColoane: b.id, coloana: ci, index: unde === "jos" ? j + 1 : j, ...langa(lista[j]) };
    }
  }
  return null;
}

/**
 * Ce deschide „+”-ul de pe elementul `id`, la marginea `unde`. `null` cand elementul nu are „+” (sau nu
 * la marginea asta): mesajul vine din cadru, deci se verifica pe lista, nu se crede.
 */
export function ceAdaugaPlusul(design: StoreDesign, ctx: ContextAdaugare, id: string, unde: MargineAdaugare): Adaugare | null {
  const p = puncteDeAdaugare(design, ctx).find((x) => x.id === id);
  if (!p || (unde === "sus" && !p.sus)) return null;
  const { sectiune, bloc } = despartireId(id);

  // Subsolul (etapa 11): o coloana noua langa cea aleasa, sau prima, cand nu se vede niciuna.
  if (sectiune === design.chrome.footer.id) {
    const coloana = bloc ? coloaneSubsol(design.chrome.footer).find((c) => c.id === bloc) : undefined;
    if (!coloana) return { fel: "coloana-subsol", loc: {}, locText: "la capătul subsolului" };
    const nume = etichetaColoanei(coloana);
    return unde === "jos"
      ? { fel: "coloana-subsol", loc: { dupa: coloana.id }, locText: `după „${nume}”` }
      : { fel: "coloana-subsol", loc: { inainte: coloana.id }, locText: `înainte de „${nume}”` };
  }

  if (estePaginaProprie(ctx.pagina)) {
    const tinta = bloc && ctx.blocuriPagina ? tintaLangaBloc(ctx.blocuriPagina, bloc, unde) : null;
    return tinta ? { fel: "bloc-pagina", tinta } : null;
  }

  const dinAcasa = ctx.pagina === "acasa" ? design.home.find((s) => s.id === sectiune) : undefined;
  if (dinAcasa) {
    if (!bloc) {
      const eticheta = sectionMeta(dinAcasa.kind)?.label ?? dinAcasa.kind;
      return { fel: "sectiune", loc: unde === "jos" ? { dupa: dinAcasa.id } : { inainte: dinAcasa.id }, eticheta, unde };
    }
    const tinta = tintaLangaBloc(blocuriDinSetari(dinAcasa.settings), bloc, unde);
    return tinta ? { fel: "bloc-liber", cale: { sectiune: dinAcasa.id, bloc: null }, tinta } : null;
  }

  const pagina = paginaDeProdus(design, ctx) ?? (ctx.pagina === "magazin" ? design.shop.page : null);
  const schema = pagina && pagina.id === sectiune ? schemaBlocurilor(pagina.kind, pagina.variant) : null;
  if (!pagina || !schema) return null;

  // Marginea paginii: sub produs la capatul zonei; pe Magazin deasupra sau sub produse.
  if (!bloc) {
    const zona = pagina.kind === "shop_page" && unde === "sus" ? "sus" : "jos";
    const tip = continutulZonei(schema, zona);
    if (!tip) return null;
    const primulDinZona = (pagina.blocks ?? []).find((b) => schema.tipuri[b.type]?.zona === zona);
    const numeZona = schema.zone.find((z) => z.id === zona)?.label ?? "";
    return zona === "sus"
      ? { fel: "continut-nou", sectiune: pagina.id, tip, loc: primulDinZona ? { inainte: primulDinZona.id } : {}, locText: `la începutul zonei „${numeZona}”` }
      : { fel: "continut-nou", sectiune: pagina.id, tip, loc: {}, locText: `la sfârșitul zonei „${numeZona}”` };
  }

  const i = bloc.indexOf("/");
  const idStructural = i < 0 ? bloc : bloc.slice(0, i);
  const structural = (pagina.blocks ?? []).find((b) => b.id === idStructural);
  if (!structural) return null;
  const meta = schema.tipuri[structural.type];
  if (!meta) return null;

  if (esteContinut(schema, structural.type)) {
    const blocuri = blocuriDinSetari(structural.settings);
    const cale = { sectiune: pagina.id, bloc: structural.id };
    // Pe continutul insusi (gol, de obicei): in el, la capat sau, de sus, inaintea primului bloc.
    if (i < 0) {
      const tinta: TintaBloc = unde === "jos" || blocuri.length === 0
        ? { fel: "sus", index: unde === "jos" ? blocuri.length : 0 }
        : { fel: "sus", index: 0, inainte: etichetaBloc(blocuri[0]) };
      return { fel: "bloc-liber", cale, tinta };
    }
    const tinta = tintaLangaBloc(blocuri, bloc.slice(i + 1), unde);
    return tinta ? { fel: "bloc-liber", cale, tinta } : null;
  }

  // O bucata fixa de sub produs: un continut nou, chiar langa ea.
  const tip = continutulZonei(schema, meta.zona);
  if (!tip || i >= 0) return null;
  return unde === "jos"
    ? { fel: "continut-nou", sectiune: pagina.id, tip, loc: { dupa: structural.id }, locText: `sub „${meta.label}”` }
    : { fel: "continut-nou", sectiune: pagina.id, tip, loc: { inainte: structural.id }, locText: `deasupra „${meta.label}”` };
}

/**
 * O sectiune noua pe pagina principala, la locul ales; „Conținut liber” poate primi direct blocul
 * ales din galerie (etapa 10: „Secțiuni și blocuri”). `null` cand nu s-a putut adauga (un singleton
 * care exista deja, un tip care nu se adauga din design).
 */
export function sectiuneNoua(
  design: StoreDesign,
  kind: SectionKind,
  loc: LocNou | undefined,
  bloc?: Block,
): { design: StoreDesign; id: string } | null {
  const inainte = new Set(design.home.map((s) => s.id));
  let urmator = addSection(design, kind, loc);
  const noua = urmator.home.find((s) => !inainte.has(s.id));
  if (!noua) return null;
  if (bloc && kind === "continut_liber") urmator = updateSection(urmator, noua.id, { settings: { ...noua.settings, blocuri: [bloc] } });
  return { design: urmator, id: noua.id };
}

/** Un „Conținut liber” nou, cu primul bloc, intr-o zona; `null` peste plafon (10 pe pagina). */
export function continutNou(
  design: StoreDesign,
  a: Extract<Adaugare, { fel: "continut-nou" }>,
  bloc: Block,
): { design: StoreDesign; id: string } | null {
  const sectiune = (s: StoreDesign) => toateSectiunile(s).find((x) => x.id === a.sectiune);
  const inainte = new Set((sectiune(design)?.blocks ?? []).map((b) => b.id));
  const urmator = schimbaBlocurile(design, a.sectiune, (l, sch) => adaugaContinut(l, sch, a.tip, a.loc, [bloc]));
  if (urmator === design) return null;
  const nou = sectiune(urmator)?.blocks?.find((b) => !inainte.has(b.id));
  return nou ? { design: urmator, id: nou.id } : null;
}
