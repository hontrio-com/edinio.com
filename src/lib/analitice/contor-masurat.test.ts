import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { FEREASTRA_ACUM_MS, FEREASTRA_ZI_MS, numaraPrivitorii } from "./privitori";
import {
  EXEMPLU_CONTOR, FEREASTRA_IMPLICITA, fereastraContorului, numarulContorului, textulContorului,
} from "@/lib/storefront/contor-vizitatori";
import { CHEI_CONTINUT, felBloc } from "@/lib/editor-magazin/noduri";
import { CHEI_PC_CIORNA } from "@/lib/storefront/design/continut-ciorna";

/*
 * Etapa 12: contorul de vizitatori numara oameni, nu un numar inventat.
 *
 * Pana acum scria „{n} persoane se uita acum”, cu n = 18 + hash(id) % 10. Masurat pe 28.10.2026:
 * „acum” (15 minute) ar fi fost gol la 95% din vizite, „ultimele 24 de ore” la 44%. Comerciantul
 * alege din panoul blocului; implicit 24 de ore.
 */

const ACUM = Date.parse("2026-10-28T18:00:00Z");
const inUrma = (ms: number) => new Date(ACUM - ms).toISOString();
const MIN = 60 * 1000;

test("privitorii: oameni DISTINCTI, nu vederi (cine reincarca de cinci ori e un om)", () => {
  const vederi = [
    { visitor_id: "a", created_at: inUrma(1 * MIN) },
    { visitor_id: "a", created_at: inUrma(2 * MIN) },
    { visitor_id: "a", created_at: inUrma(3 * MIN) },
    { visitor_id: "b", created_at: inUrma(4 * MIN) },
  ];
  assert.deepEqual(numaraPrivitorii(vederi, [], ACUM), { acum: 2, zi: 2 });
});

test("privitorii: omul de fata NU se numara, nici cu id-ul de ieri (sarea se schimba la miezul noptii)", () => {
  const vederi = [
    { visitor_id: "eu-azi", created_at: inUrma(1 * MIN) },
    { visitor_id: "eu-ieri", created_at: inUrma(10 * 60 * MIN) },
    { visitor_id: "altcineva", created_at: inUrma(20 * 60 * MIN) },
  ];
  assert.deepEqual(numaraPrivitorii(vederi, ["eu-azi", "eu-ieri"], ACUM), { acum: 0, zi: 1 });
  // Doar el: pastila nu are pe cine sa numere.
  assert.deepEqual(numaraPrivitorii(vederi.slice(0, 2), ["eu-azi", "eu-ieri"], ACUM), { acum: 0, zi: 0 });
});

test("privitorii: ferestrele, cu marginile lor", () => {
  const vederi = [
    { visitor_id: "pe-margine-acum", created_at: inUrma(FEREASTRA_ACUM_MS) },
    { visitor_id: "dupa-acum", created_at: inUrma(FEREASTRA_ACUM_MS + 1) },
    { visitor_id: "pe-margine-zi", created_at: inUrma(FEREASTRA_ZI_MS) },
    { visitor_id: "prea-vechi", created_at: inUrma(FEREASTRA_ZI_MS + 1) },
    { visitor_id: "din-viitor", created_at: new Date(ACUM + MIN).toISOString() },
    { visitor_id: null, created_at: inUrma(MIN) },
    { visitor_id: "data-stricata", created_at: "nu e o data" },
  ];
  assert.deepEqual(numaraPrivitorii(vederi, [], ACUM), { acum: 1, zi: 3 });
});

test("textul: pluralul romanesc, fara diacritice ca restul paginii de produs", () => {
  assert.equal(textulContorului(1, "now"), "persoana se uita acum");
  assert.equal(textulContorului(3, "now"), "persoane se uita acum");
  assert.equal(textulContorului(19, "now"), "persoane se uita acum");
  assert.equal(textulContorului(20, "now"), "de persoane se uita acum");
  assert.equal(textulContorului(100, "now"), "de persoane se uita acum");
  assert.equal(textulContorului(101, "now"), "persoane se uita acum");
  assert.equal(textulContorului(119, "now"), "persoane se uita acum");
  assert.equal(textulContorului(120, "now"), "de persoane se uita acum");
  assert.equal(textulContorului(1, "day"), "persoana a vazut produsul in ultimele 24 de ore");
  assert.equal(textulContorului(2, "day"), "persoane au vazut produsul in ultimele 24 de ore");
  assert.equal(textulContorului(25, "day"), "de persoane au vazut produsul in ultimele 24 de ore");
  for (const n of [1, 2, 20, 101]) {
    for (const f of ["now", "day"] as const) {
      assert.doesNotMatch(textulContorului(n, f), /[ăâîșțşţ]/i, `${n} ${f}: diacritice`);
    }
  }
});

test("numarul: real cand exista; exemplul DOAR in editor sau miniatura; in magazin zero ramane zero", () => {
  const privitori = { acum: 2, zi: 7 };
  assert.equal(numarulContorului({ privitori, fereastra: "now", exemplu: false }), 2);
  assert.equal(numarulContorului({ privitori, fereastra: "day", exemplu: false }), 7);
  // Real si in editor: exemplul nu acopera un numar adevarat.
  assert.equal(numarulContorului({ privitori, fereastra: "day", exemplu: true }), 7);
  const nimeni = { acum: 0, zi: 0 };
  assert.equal(numarulContorului({ privitori: nimeni, fereastra: "day", exemplu: false }), 0);
  assert.equal(numarulContorului({ privitori: null, fereastra: "day", exemplu: false }), 0);
  assert.equal(numarulContorului({ privitori: nimeni, fereastra: "now", exemplu: true }), EXEMPLU_CONTOR);
  assert.equal(numarulContorului({ privitori: undefined, fereastra: "now", exemplu: true }), EXEMPLU_CONTOR);
});

test("fereastra: implicit ultimele 24 de ore; orice altceva decat „now” e implicitul", () => {
  assert.equal(FEREASTRA_IMPLICITA, "day");
  assert.equal(fereastraContorului({}), "day");
  assert.equal(fereastraContorului(null), "day");
  assert.equal(fereastraContorului({ social_proof_window: "now" }), "now");
  assert.equal(fereastraContorului({ social_proof_window: "day" }), "day");
  assert.equal(fereastraContorului({ social_proof_window: "ceva" }), "day");
});

test("editorul: blocul are nodul lui, iar alegerea trece prin ciorna si „Publică”", () => {
  assert.equal(felBloc("dovada"), "produs_dovada");
  assert.deepEqual(CHEI_CONTINUT.produs_dovada, ["social_proof_window"]);
  assert.ok(CHEI_PC_CIORNA.has("social_proof_window"), "cheia trebuie sa poata sta in ciorna");
});

/** Codul fara comentarii: explicatiile pomenesc chiar formele vechi. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("paginile de produs: fara numarul inventat, si fara pastila la zero", () => {
  for (const f of ["ProductPageClassic.tsx", "ProductPageDetailed.tsx"]) {
    const c = cod(`src/components/storefront/sections/product/${f}`);
    assert.doesNotMatch(c, /hashSir|18 \+/, `${f}: numarul inventat`);
    assert.match(c, /numarulContorului\(\{ privitori, fereastra: fereastraContor, exemplu: demo \|\| chrome\?\.esteEditorDesign === true \}\)/, f);
    // Pastila (si invelisul ei) numai cand e cine sa fie numarat; harta pastreaza forma `dovada: (`.
    // (`{}` sunt comentariile JSX, ramase goale dupa curatare.)
    assert.match(c, /dovada: \(\s*<>\s*(?:\{\}\s*)*\{viewerCount > 0 && \(?\s*<div[^>]*>\s*<SocialProof count=\{viewerCount\} fereastra=\{fereastraContor\}/, `${f}: pastila trebuie sa lipseasca la zero`);
  }
});

test("ruta produsului: numara pe server, numai cand blocul se vede sau in editor, fara omul de fata", () => {
  const c = cod("src/app/(public)/[slug]/_rute/pagina-produs.tsx");
  assert.match(c, /\.some\(\(b\) => b\.type === "dovada" && b\.enabled\)/);
  assert.match(c, /const privitori = contorulSeVede \|\| esteEditorDesign\s*\? await privitoriiProdusului\(/);
  assert.match(c, /exclusi: await vizitatoriiCererii\(\{/);
  assert.match(c, /privitori=\{privitori\}/);
});

test("identitatea: formula vizitatorului sta intr-un singur loc", () => {
  /*
   * Contorul refac id-ul omului de fata ca sa-l scoata. O a doua copie a formulei s-ar fi putut
   * desparti de cea cu care se scriu vederile, iar omul s-ar fi vazut numarat pe sine.
   */
  const c = cod("src/lib/analitice/identitate.ts");
  assert.equal([...c.matchAll(/dispersie\(sare/g)].length, 1, "o singura formula");
  assert.match(c, /const visitorId = idVizitator\(sare, businessId, ip, userAgent\);/);
  assert.match(c, /\[azi, ieri\]\.filter\(\(s\): s is string => !!s\)\.map\(\(s\) => idVizitator\(s, businessId, ip, userAgent\)\)/,
    "omul se scoate cu AMANDOUA id-urile, de azi si de ieri");
  assert.match(c, /sareaUneiZileTrecute\(ziuaDinainte\(zi\)\)/);
});

test("ruta produsului: in editor, componenta primeste continutul din ciorna (gasit la proba 12.4)", () => {
  /*
   * Componenta paginii de produs isi citeste continutul din `storeSettings.page_content`. Ruta ii dadea
   * randul din baza, deci in editor beneficiile, intrebarile, pasii, livrarea, efectul butonului si
   * fereastra contorului ramaneau cele publicate pana la „Publică”, desi ciorna le avea.
   */
  const c = cod("src/app/(public)/[slug]/_rute/pagina-produs.tsx");
  assert.match(c, /storeSettings=\{faraDesignulBrut\(storeSettings && \{ \.\.\.storeSettings, page_content: pageContent as Json \}\) as never\}/);
  assert.doesNotMatch(c, /storeSettings=\{faraDesignulBrut\(storeSettings\) as never\}/);
});
