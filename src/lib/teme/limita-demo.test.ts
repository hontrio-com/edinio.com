import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DATE_DEMO_JUPITER } from "./jupiter/date-demo";
import { externalIdDemo } from "./import-demo";
import { citesteLoculPentruDemo, loculPentruDemo, motivulLimitei, produseDemoNoi } from "./limita-demo";

/*
 * Etapa 18.2: „Importă și datele demo” nu trece de limita de produse a planului (gratuit 10, Basic 500, Premium 2500,
 * Ultra fara limita), numarata pe cont, ca la adaugarea de mana. Jupiter are 58 de produse demo.
 */

const D = DATE_DEMO_JUPITER;
const N = D.produse.length;

test("limita: incap pana la limita inclusiv; peste ea, nu; Ultra fara limita; importul repetat, oricand", () => {
  assert.equal(loculPentruDemo(10, 3, N).incap, false, "gratuit: 58 nu incap in 10");
  assert.equal(loculPentruDemo(500, 500 - N, N).incap, true, "exact la limita: incap");
  assert.equal(loculPentruDemo(500, 501 - N, N).incap, false, "un produs peste: nu");
  const ultra = loculPentruDemo(Infinity, 100_000, N);
  assert.equal(ultra.incap, true);
  assert.equal(ultra.limita, null, "Infinity nu pleaca spre browser (JSON il face null oricum)");
  assert.equal(loculPentruDemo(500, 900, 0).incap, true, "nimic nou de adaugat: nu e oprit nici peste limita");
});

test("produsele noi: doar cele ale temei care lipsesc din magazin, dupa cod", () => {
  assert.equal(produseDemoNoi("jupiter", D, []), N);
  const jumatate = D.produse.slice(0, 50).map((p) => externalIdDemo("jupiter", p.cheie));
  assert.equal(produseDemoNoi("jupiter", D, jumatate), N - 50);
  assert.equal(produseDemoNoi("jupiter", D, D.produse.map((p) => externalIdDemo("saturn", p.cheie))), N, "codurile altei teme nu conteaza");
  assert.equal(produseDemoNoi("jupiter", D, [null, ...D.produse.map((p) => externalIdDemo("jupiter", p.cheie))]), 0);
});

test("motivul, in romana cu „de”: ce adauga, ce permite planul si cate are", () => {
  assert.equal(motivulLimitei(loculPentruDemo(10, 3, N)), "Datele demo adaugă 58 de produse, iar planul tău permite 10 produse (ai deja 3).");
  assert.equal(motivulLimitei(loculPentruDemo(500, 1453, N)), "Datele demo adaugă 58 de produse, iar planul tău permite 500 de produse (ai deja 1.453).");
});

/** Baza falsa: planul contului, codurile produselor demo ale magazinului, numarul produselor contului. */
function baza(o: { plan?: string | null; ePlan?: string; coduri?: (string | null)[]; eCoduri?: string; produse?: number }) {
  const cereri: string[] = [];
  return {
    cereri,
    client: {
      from(tabel: string) {
        let coloane = "";
        const filtre: string[] = [];
        const q = {
          select(c: string) { coloane = c; return q; },
          eq(col: string, v: unknown) { filtre.push(`${col}=${String(v)}`); return q; },
          in(col: string, v: unknown[]) { filtre.push(`${col} in ${v.join(",")}`); return q; },
          single() {
            cereri.push(`${tabel}.${coloane} ${filtre.join(" ")}`);
            return Promise.resolve(o.ePlan ? { data: null, error: { message: o.ePlan } } : { data: { plan: o.plan ?? null }, error: null });
          },
          then(ok: (v: unknown) => unknown, nu?: (e: unknown) => unknown) {
            cereri.push(`${tabel}.${coloane} ${filtre.join(" ")}`);
            let v: unknown = { data: null, error: null };
            if (tabel === "products" && coloane === "external_id") {
              v = o.eCoduri ? { data: null, error: { message: o.eCoduri } } : { data: (o.coduri ?? []).map((external_id) => ({ external_id })), error: null };
            } else if (tabel === "businesses") v = { data: [{ id: "m1" }, { id: "m2" }], error: null };
            else if (tabel === "products") v = { count: o.produse ?? 0, error: null };
            return Promise.resolve(v).then(ok, nu);
          },
        };
        return q;
      },
    },
  };
}

test("citirea: planul contului, produsele demo ale magazinului si produsele contului pe toate magazinele lui", async () => {
  const b = baza({ plan: "basic", produse: 300, coduri: [externalIdDemo("jupiter", D.produse[0].cheie)] });
  const loc = await citesteLoculPentruDemo(b.client as never, "u1", "m1", "jupiter", D);
  assert.deepEqual(loc, { noi: N - 1, limita: 500, produse: 300, incap: true });
  assert.ok(b.cereri.includes("users_profile.plan id=u1"));
  assert.ok(b.cereri.includes("products.external_id business_id=m1 source=tema-demo"), "doar produsele demo ale magazinului");
  assert.ok(b.cereri.includes("businesses.id user_id=u1"), "numaratoarea pe CONT");
  assert.ok(b.cereri.includes("products.id business_id in m1,m2"));
});

test("⚠ un plan necitit e o eroare, nu „gratuit”; un plan lipsa sau necunoscut e gratuit, ca la adaugarea de mana", async () => {
  const cazut = await citesteLoculPentruDemo(baza({ ePlan: "timeout", produse: 3 }).client as never, "u1", "m1", "jupiter", D);
  assert.ok("error" in cazut);
  const coduri = await citesteLoculPentruDemo(baza({ plan: "ultra", eCoduri: "timeout" }).client as never, "u1", "m1", "jupiter", D);
  assert.ok("error" in coduri, "fara codurile demo nu se stie cate sunt noi");
  for (const plan of [null, "necunoscut"]) {
    const loc = await citesteLoculPentruDemo(baza({ plan, produse: 3 }).client as never, "u1", "m1", "jupiter", D);
    assert.ok(!("error" in loc) && loc.limita === 10 && !loc.incap, String(plan));
  }
  const ultra = await citesteLoculPentruDemo(baza({ plan: "ultra", produse: 5000 }).client as never, "u1", "m1", "jupiter", D);
  assert.ok(!("error" in ultra) && ultra.incap && ultra.limita === null);
});
