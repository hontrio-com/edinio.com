import { strict as assert } from "node:assert";
import { test } from "node:test";
import { aplicaFiltreProduse, subarboreUnNivel, FARA_CATEGORIE } from "./produse-filtre";
import type { FiltreProduse } from "./produse-filtre";

/*
 * Un filtru care intoarce alta multime decat scrie pe el nu da nicio eroare:
 * lista arata plauzibil si comerciantul o crede. De aia se probeaza CE se cere
 * de la baza, nu doar ca functia intoarce ceva.
 */

/** Interogare falsa: retine apelurile in loc sa vorbeasca cu baza. */
function interogareFalsa() {
  const apeluri: { metoda: string; args: unknown[] }[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "or", "in", "ilike", "lte", "gte", "not", "is"]) {
    q[m] = (...args: unknown[]) => { apeluri.push({ metoda: m, args }); return q; };
  }
  return { q, apeluri };
}

const FILTRE_GOALE: FiltreProduse = {
  cautare: "", categorie: "", stare: "all", stoc: "all", pagina: 1, sort: "",
} as unknown as FiltreProduse;

const CATEGORII = [
  { id: "c1", name: "Scule", parent_id: null },
  { id: "c2", name: "Bormasini", parent_id: "c1" },
  { id: "c3", name: "Gradina", parent_id: null },
];

test("⚠⚠ „Produse fara categorie\" cere si NULL, si sirul gol", () => {
  /*
   * Masurat pe productie: 584 de produse fara categorie, toate cu `NULL`. Dar un
   * import care scrie `""` in loc de nimic le-ar fi lasat pe dinafara exact la
   * filtrul facut ca sa le gaseasca — in SQL, `category = ''` si
   * `category IS NULL` sunt lucruri diferite, iar `is.null` singur nu le prinde
   * pe amandoua.
   */
  const { q, apeluri } = interogareFalsa();
  aplicaFiltreProduse(q as never, { ...FILTRE_GOALE, categorie: FARA_CATEGORIE }, CATEGORII);

  const or = apeluri.find((a) => a.metoda === "or");
  assert.ok(or, "trebuie sa se ceara un OR pe categorie");
  assert.equal(or.args[0], "category.is.null,category.eq.");

  /* Si NU se cere `in(category, ...)`: semnul nu e un nume de categorie. */
  assert.equal(apeluri.some((a) => a.metoda === "in"), false);
});

test("o categorie obisnuita cere categoria plus copiii ei directi", () => {
  const { q, apeluri } = interogareFalsa();
  aplicaFiltreProduse(q as never, { ...FILTRE_GOALE, categorie: "Scule" }, CATEGORII);
  const inn = apeluri.find((a) => a.metoda === "in");
  assert.ok(inn);
  assert.equal(inn.args[0], "category");
  assert.deepEqual(inn.args[1], ["Scule", "Bormasini"]);
});

test("fara filtru de categorie nu se ingusteaza nimic pe categorie", () => {
  const { q, apeluri } = interogareFalsa();
  aplicaFiltreProduse(q as never, FILTRE_GOALE, CATEGORII);
  assert.equal(apeluri.some((a) => a.metoda === "in"), false);
  assert.equal(apeluri.some((a) => a.metoda === "or"), false);
});

test("⚠ semnul nu se confunda cu o categorie chiar daca cineva ar numi-o asa", () => {
  /*
   * Ramura semnului se verifica INAINTEA celei obisnuite, deci un magazin care
   * si-ar numi o categorie exact asa tot ar primi produsele fara categorie —
   * ceea ce e purtarea scrisa pe eticheta optiunii. Proba fixeaza ordinea.
   */
  const cuNumeCiudat = [...CATEGORII, { id: "c9", name: FARA_CATEGORIE, parent_id: null }];
  const { q, apeluri } = interogareFalsa();
  aplicaFiltreProduse(q as never, { ...FILTRE_GOALE, categorie: FARA_CATEGORIE }, cuNumeCiudat);
  assert.equal(apeluri.some((a) => a.metoda === "in"), false);
  assert.ok(apeluri.some((a) => a.metoda === "or" && a.args[0] === "category.is.null,category.eq."));
});

test("subarboreUnNivel ramane la UN nivel, nu recursiv", () => {
  /* Catalogul public foloseste alt ajutator, recursiv. Adus aici, filtrul din
     panou ar fi inceput sa arate alte produse decat pana acum. */
  const adanc = [...CATEGORII, { id: "c4", name: "Percutie", parent_id: "c2" }];
  assert.deepEqual(subarboreUnNivel(adanc, "Scule"), ["Scule", "Bormasini"]);
});

test("pachetele nu apar niciodata in lista de produse", () => {
  const { q, apeluri } = interogareFalsa();
  aplicaFiltreProduse(q as never, FILTRE_GOALE, CATEGORII);
  assert.ok(apeluri.some((a) => a.metoda === "eq" && a.args[0] === "is_bundle" && a.args[1] === false));
});
