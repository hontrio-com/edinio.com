import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import type { Block } from "@/lib/pages/blocks.types";
import { blocUnic, ETICHETA_CONTINUT_LIBER, numeleContinutului } from "@/lib/storefront/design/continut-liber";
import { esteBloculUnic } from "./continut-liber";

/*
 * Etapa 13 (mentiunile lui din 28.10, seara): blocul pus cu „+” se numeste si se deschide ca el insusi,
 * animatiile pornesc si in editor, „Șterge” sta langa „Ascunde”, iar linkul bannerului are sugestii.
 */

const bloc = (id: string, type: string) => ({ id, type }) as unknown as Block;

test("numele unui „Conținut liber” vine din blocurile lui", () => {
  assert.equal(numeleContinutului([]), ETICHETA_CONTINUT_LIBER, "gol, ramane numele cutiei");
  assert.equal(numeleContinutului([bloc("a", "button")]), "Buton");
  assert.equal(numeleContinutului([bloc("a", "button"), bloc("b", "text")]), "Buton, Text");
  assert.equal(numeleContinutului([bloc("a", "button"), bloc("b", "text"), bloc("c", "image")]), "Buton, Text și încă 1");
  assert.equal(numeleContinutului([bloc("a", "button"), bloc("b", "text"), bloc("c", "image"), bloc("d", "button")]), "Buton, Text și încă 2");
});

test("blocul unic: doar cand containerul are exact un bloc", () => {
  assert.equal(blocUnic({ blocuri: [] }), null);
  assert.equal(blocUnic(undefined), null);
  assert.equal(blocUnic({ blocuri: [bloc("a", "button")] })?.id, "a");
  assert.equal(blocUnic({ blocuri: [bloc("a", "button"), bloc("b", "text")] }), null);
});

/** Codul fara comentarii: explicatiile pomenesc chiar formele vechi. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("arborele si capul panoului spun numele blocurilor, cu „Conținut liber” mic dedesubt", () => {
  const lista = cod("src/components/store-editor/SectionList.tsx");
  assert.match(lista, /const nume = continutLiber \? numeleContinutului\(blocuriLibere\) : \(meta\?\.label \?\? section\.kind\);/);
  assert.match(lista, /<span className="truncate">\{nume\}<\/span>/);
  assert.match(cod("src/components/editor-magazin/PanouContinutLiber.tsx"), /\{numeleContinutului\(blocuri\)\}/);
});

test("un container cu un singur bloc se deschide direct pe el, iar „Înapoi” duce in arbore", () => {
  const e = cod("src/components/editor-magazin/EditorMagazin.tsx");
  const selecteaza = e.slice(e.indexOf("const selecteaza = useCallback"), e.indexOf("const selecteazaBloc"));
  assert.match(selecteaza, /const unic = sectiune\?\.kind === "continut_liber" \? blocUnic\(sectiune\.settings\) : null;\s*if \(unic\) \{/);
  assert.match(selecteaza, /setLiber\(\{ cheie, bloc: unic\.id, tinta: null \}\)/);
  assert.match(e, /const unBlocPeAcasa = !!caleLiber && !caleLiber\.bloc && blocuriLibere\.length === 1;/);
  assert.match(e, /onInapoi=\{blocUnicDeschis \? inapoiLaArbore : /);
  assert.match(e, /Adaugă alt bloc aici/);
});

test("⚠ „Șterge” pe tot continutul si „Înapoi” in arbore: doar pe blocul unic, NU pe un bloc din coloanele lui", () => {
  /*
   * Gasit la recitirea din 09.11: cu un „Conținut liber” de pe Acasa care are doar un bloc Coloane, un clic pe un text
   * din coloana deschide panoul textului (coloanele isi marcheaza si ele blocurile). Panoul se lua dupa „containerul are
   * un bloc”, deci textul primea „Șterge” pe TOT continutul. Regula: blocul deschis trebuie sa fie chiar cel unic.
   */
  const coloane = { id: "col", type: "columns", items: [{ blocks: [bloc("t1", "text")] }, { blocks: [] }] } as unknown as Block;
  assert.equal(esteBloculUnic([coloane], "col"), true, "Coloanele, singure in container, sunt blocul unic");
  assert.equal(esteBloculUnic([coloane], "t1"), false, "un text din coloana nu e");
  assert.equal(esteBloculUnic([bloc("a", "button"), bloc("b", "text")], "a"), false, "doua blocuri: niciunul");
  assert.equal(esteBloculUnic([], undefined), false);
  assert.equal(esteBloculUnic([bloc("a", "button")], undefined), false, "fara bloc deschis");
  const e = cod("src/components/editor-magazin/EditorMagazin.tsx");
  assert.match(e, /const blocUnicDeschis = useMemo\(\s*\(\) => !!caleLiber && !caleLiber\.bloc && esteBloculUnic\(blocuriLibere, blocLiberDeschis\?\.id\),/);
  // Panoul blocului: tot ce tine de „containerul e blocul” (Înapoi, Adaugă alt bloc, Șterge) se ia dupa blocul DESCHIS.
  assert.match(e, /inapoiLa=\{blocUnicDeschis \? "secțiuni" : "conținut"\}/);
  assert.match(e, /actiuneSus=\{blocUnicDeschis \? \(/);
  assert.doesNotMatch(e, /(onInapoi|actiuneSus)=\{unBlocPeAcasa \?/, "panoul blocului nu se mai ia dupa numarul blocurilor");
  // Si meniul de clic dreapta trece prin aceeasi regula.
  assert.match(cod("src/lib/editor-magazin/meniu-contextual.ts"), /return esteBloculUnic\(blocuriLaCale\(design, cale\) \?\? \[\], bloc\);/);
});

test("animatiile pornesc si in editor, langa blocurile desenate din designul viu", () => {
  /* In magazin le porneste slotul de pe server; in editor slotul e ocolit, deci trebuie pornite aici. */
  const c = cod("src/components/storefront/ContinutLiber.tsx");
  assert.match(c, /<BlockRenderer[\s\S]*?\/>\s*<PornesteAnimatiile \/>/);
});

test("„Șterge” langa „Ascunde”, cu regula arborelui, prin ciorna", () => {
  const p = cod("src/components/editor-magazin/PanouNod.tsx");
  assert.match(p, /const poateFiStearsa = meta\?\.scope === "home" && meta\.removable !== false;/);
  assert.match(p, /ciorna\.aplica\(\(d: StoreDesign\) => removeSection\(d, sectiune\.id\)\);/);
  assert.match(p, /\{poateFiStearsa && \(/);
  const e = cod("src/components/editor-magazin/EditorMagazin.tsx");
  assert.match(e, /onSterge=\{stergeContinutulDeschis\}/, "si containerul de pe prima pagina");
  assert.match(e, /: removeSection\(d, cale\.sectiune\)\)\);/);
});

test("linkul bannerului are sugestii (pagini, categorii, produse)", () => {
  const a = cod("src/components/editor-magazin/continut/ContinutAcasa.tsx");
  assert.match(a, /<CampLink eticheta=\{`Linkul bannerului \$\{i \+ 1\} \(opțional\)`\}/);
  assert.doesNotMatch(a, /aria-label=\{`Linkul bannerului/, "campul simplu de dinainte");
  const e = cod("src/components/editor-magazin/EditorMagazin.tsx");
  assert.match(e, /<FurnizorLegaturi value=\{dateBlocuri \? \{ businessId: dateBlocuri\.business\.id, \.\.\.dateBlocuri\.legaturi \} : null\}>\s*<PanouNod/);
  assert.match(e, /useEffect\(\(\) => \{ if \(heroDeschis\) cereDateBlocuri\(\); \}/);
});
