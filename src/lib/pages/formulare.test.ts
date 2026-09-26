import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { campuriFormularSimplu, valideazaTrimitere } from "./validare-formular";
import { campuriSablon, esteTipCamp, MAX_CAMPURI, MAX_OPTIUNI, SABLOANE_FORMULAR, type FormField } from "./forms.types";
import { prepareBlocksForPublic } from "./prepare-blocks";

/*
  Formularele (26.09.2026): serverul reconstruieste raspunsul din definitie,
  sabloanele sunt valide si incap in limite, limitele se aplica pe server.
*/

const def: FormField[] = [
  { id: "n", label: "Nume", type: "text", required: true },
  { id: "e", label: "Email", type: "email", required: true },
  { id: "t", label: "Telefon", type: "phone", required: false },
  { id: "s", label: "Serviciu", type: "select", required: true, options: ["Montaj", "Consultanță"] },
  { id: "b", label: "Ce ți-a plăcut", type: "checkboxes", required: false, options: ["Prețul", "Livrarea, rapidă"] },
  { id: "d", label: "Data și ora", type: "datetime", required: false },
  { id: "a", label: "Acord", type: "checkbox", required: true },
];

test("raspunsul se reconstruieste din definitie: campurile inventate nu trec", () => {
  const r = valideazaTrimitere(def, [
    { id: "n", label: "Nume", value: " Ana " },
    { id: "e", label: "Email", value: "ana@exemplu.ro" },
    { id: "s", label: "Serviciu", value: "Montaj" },
    { id: "b", label: "Ce ți-a plăcut", value: "Prețul\u0000Livrarea, rapidă" },
    { id: "d", label: "Data și ora", value: "2026-10-01T14:30" },
    { id: "a", label: "Acord", value: "Da" },
    { id: "x", label: "Camp inventat", value: "<script>" },
  ]);
  assert.ok("campuri" in r, JSON.stringify(r));
  assert.deepEqual(r.campuri.map((c) => c.label), def.map((f) => f.label));
  assert.equal(r.campuri.find((c) => c.label === "Nume")?.value, "Ana");
  assert.equal(r.campuri.find((c) => c.label === "Ce ți-a plăcut")?.value, "Prețul; Livrarea, rapidă", "virgula dintr-o optiune nu rupe bifa");
  const singura = valideazaTrimitere(def, [
    { id: "n", label: "Nume", value: "Ana" }, { id: "e", label: "Email", value: "ana@exemplu.ro" },
    { id: "s", label: "Serviciu", value: "Montaj" }, { id: "a", label: "Acord", value: "Da" },
    { id: "b", label: "Ce ți-a plăcut", value: "Livrarea, rapidă" },
  ]);
  assert.ok("campuri" in singura, "o singura bifa cu virgula in ea trece");
  assert.equal(r.campuri.find((c) => c.label === "Data și ora")?.value, "01.10.2026, 14:30");
  assert.ok(!r.campuri.some((c) => c.label === "Camp inventat"));
});

test("obligatoriile, emailul, telefonul, optiunile si acordul se verifica pe server", () => {
  const baza = [
    { id: "n", label: "Nume", value: "Ana" }, { id: "e", label: "Email", value: "ana@exemplu.ro" },
    { id: "s", label: "Serviciu", value: "Montaj" }, { id: "a", label: "Acord", value: "Da" },
  ];
  const cu = (id: string, value: string) => baza.filter((x) => x.id !== id).concat({ id, label: id, value });
  assert.ok("error" in valideazaTrimitere(def, cu("n", "")));
  assert.ok("error" in valideazaTrimitere(def, cu("e", "nu-e-email")));
  assert.ok("error" in valideazaTrimitere(def, [...baza, { id: "t", label: "Telefon", value: "abc" }]));
  assert.ok("error" in valideazaTrimitere(def, cu("s", "Alt serviciu")));
  assert.ok("error" in valideazaTrimitere(def, cu("a", "Nu")));
  assert.ok("error" in valideazaTrimitere(def, [...baza, { id: "d", label: "Data și ora", value: "maine" }]));
  assert.ok("campuri" in valideazaTrimitere(def, baza));
});

test("formularul simplu are aceleasi campuri pe pagina si pe server; bifa de acord doar cand e ceruta", () => {
  assert.deepEqual(campuriFormularSimplu({}).map((f) => f.id), ["name", "email", "phone", "message"]);
  assert.deepEqual(campuriFormularSimplu({ showPhone: false, showMessage: false, consent: true }).map((f) => f.id), ["name", "email", "acord"]);
  const pagina = readFileSync(new URL("../../components/pages/blocks/ContactFormBlock.tsx", import.meta.url), "utf8");
  assert.match(pagina, /campuriFormularSimplu\(block\)/);
  assert.doesNotMatch(pagina, /function builtinFields/, "a doua lista, scrisa separat, s-ar desparti de cea a serverului");
});

test("sabloanele: tipuri valide, id-uri unice, in limite, optiuni unde trebuie", () => {
  for (const s of SABLOANE_FORMULAR) {
    const c = campuriSablon(s.cheie);
    assert.ok(c.length <= MAX_CAMPURI, s.cheie);
    assert.equal(new Set(c.map((f) => f.id)).size, c.length, `id-uri repetate in ${s.cheie}`);
    for (const f of c) {
      assert.ok(esteTipCamp(f.type), `${s.cheie}: ${f.type}`);
      if (["select", "radio", "checkboxes"].includes(f.type)) assert.ok((f.options ?? []).length > 0 && f.options!.length <= MAX_OPTIUNI, `${s.cheie}: ${f.label}`);
    }
  }
  assert.equal(campuriSablon("gol").length, 0);
});

test("limitele se aplica si pe server, iar trimiterea verifica definitia si capcana de timp", () => {
  const act = readFileSync(new URL("../actions/form.actions.ts", import.meta.url), "utf8");
  assert.match(act, /\.slice\(0, MAX_CAMPURI\)/);
  assert.match(act, /\.slice\(0, MAX_OPTIUNI\)/);
  assert.match(act, />= MAX_FORMULARE/);
  const pg = readFileSync(new URL("../actions/page.actions.ts", import.meta.url), "utf8");
  const f = pg.slice(pg.indexOf("export async function submitPageForm"), pg.indexOf("export async function aboneazaNewsletter"));
  assert.match(f, /valideazaTrimitere\(definitie, fields\)/);
  assert.match(f, /if \(!definitie\) return \{ error:/);
  assert.match(f, /input\.durata < DURATA_MINIMA_MS\) return \{ success: true \}/);
});

test("pachete: o data de sfarsit gresita nu ajunge in pagina, descrierile sunt taiate", () => {
  const [b] = prepareBlocksForPublic([{ id: "p", type: "bundles", countdownEnd: "</script>", descrieri: { a: "x".repeat(900) } }]);
  assert.equal(b.type === "bundles" && b.countdownEnd, null);
  assert.equal(b.type === "bundles" && b.descrieri?.a.length, 300);
  const [c] = prepareBlocksForPublic([{ id: "p", type: "bundles", countdownEnd: "2026-10-01T18:00" }]);
  assert.equal(c.type === "bundles" && c.countdownEnd, "2026-10-01T18:00");
});

test("FOMO din date reale: niciun numar generat in blocul de pachete", () => {
  const src = readFileSync(new URL("../../components/pages/blocks/BundlesBlock.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Math\.random/);
  const rez = readFileSync(new URL("./resolve-bundles.ts", import.meta.url), "utf8");
  assert.match(rez, /\.not\("status", "in", "\(cancelled,refunded\)"\)/);
});
