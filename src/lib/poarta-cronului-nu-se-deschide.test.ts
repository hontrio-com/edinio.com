import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verificaCron } from "@/lib/cron-auth";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * POARTA CRONURILOR NU SE DESCHIDE CU UN ANTET OBISNUIT      (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comentariul de deasupra lui `verificaCron` a spus, pana azi, ca poarta „accepta si antetul
 * `x-vercel-cron` pe care il pune Vercel". Implementarea nu l-a acceptat niciodata.
 *
 * ⚠ Afirmatia falsa era mai periculoasa decat o lipsa, fiindca era o INVITATIE la reparatie:
 * cine venea sa afle de ce nu merge un cron gasea comentariul, vedea ca implementarea „nu-l
 * face", si o completa. Iar `x-vercel-cron` e un antet OBISNUIT, nu un secret: oricine il
 * poate pune pe o cerere. Acceptat ca dovada, ar deschide toate cele saptesprezece cronuri
 * catre internet, cu rol de serviciu, adica ocolind RLS.
 *
 * ⚠ Proba nu apara doar comentariul: apara REGULA. Daca antetul ajunge vreodata in fisier,
 * cade aici, indiferent cat de bine ar suna comentariul de langa el.
 */

const SURSA = "src/lib/cron-auth.ts";
const cerere = (antete: Record<string, string>) =>
  ({ headers: new Headers(antete) } as unknown as Parameters<typeof verificaCron>[0]);

describe("Poarta cronurilor", () => {
  const vechi = process.env.CRON_SECRET;
  const pune = (v: string | undefined) => {
    if (v === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = v;
  };

  test("fara secret configurat nu intra nimeni (fail-closed)", () => {
    pune(undefined);
    try {
      assert.equal(verificaCron(cerere({ authorization: "Bearer orice" })), false);
      assert.equal(verificaCron(cerere({})), false);
    } finally { pune(vechi); }
  });

  test("cu secretul bun, intra", () => {
    pune("secret-de-proba");
    try {
      assert.equal(verificaCron(cerere({ authorization: "Bearer secret-de-proba" })), true);
      assert.equal(verificaCron(cerere({ authorization: "secret-de-proba" })), true);
    } finally { pune(vechi); }
  });

  test("cu secret gresit, sau fara antet, nu intra", () => {
    pune("secret-de-proba");
    try {
      assert.equal(verificaCron(cerere({ authorization: "Bearer altceva" })), false);
      assert.equal(verificaCron(cerere({ authorization: "Bearer secret-de-proba-mai-lung" })), false);
      assert.equal(verificaCron(cerere({})), false);
    } finally { pune(vechi); }
  });

  test("⚠⚠ `x-vercel-cron` NU deschide poarta, oricat de convingator ar arata", () => {
    pune("secret-de-proba");
    try {
      assert.equal(verificaCron(cerere({ "x-vercel-cron": "1" })), false);
      assert.equal(verificaCron(cerere({ "x-vercel-cron": "secret-de-proba" })), false);
      /* Nici macar impreuna cu un `authorization` gresit. */
      assert.equal(
        verificaCron(cerere({ "x-vercel-cron": "1", authorization: "Bearer altceva" })),
        false,
      );
    } finally { pune(vechi); }
  });

  test("⚠ si antetul nu apare deloc in fisier: nici in cod, nici ca promisiune intr-un comentariu", () => {
    const s = readFileSync(SURSA, "utf8");
    const inCod = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    assert.ok(
      !/x-vercel-cron/i.test(inCod),
      "poarta citeste un antet care nu e secret: oricine poate sa-l puna",
    );
    /* In comentariu are voie sa apara, dar numai ca sa spuna de ce NU se accepta. */
    if (/x-vercel-cron/i.test(s)) {
      assert.match(
        s, /NU\b[^]{0,400}x-vercel-cron|x-vercel-cron[^]{0,400}\bnu\b/i,
        "comentariul pomeneste antetul fara sa spuna limpede ca NU se accepta",
      );
    }
  });
});
