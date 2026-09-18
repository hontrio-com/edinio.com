import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ErrorEvent } from "@sentry/nextjs";
import { curataEvenimentul, curataFirimitura, faraQuery, treceDePlafon } from "./optiuni";

/*
  Regulile de aici hotarasc doua lucruri care nu se vad pana nu e prea tarziu:
  cat din cota Sentry se arde pe aceeasi eroare, si ce date ale cumparatorilor
  pleaca din platforma. Probele le apara pe amandoua.
*/

const eroare = (mesaj: string): ErrorEvent =>
  ({ type: undefined, exception: { values: [{ type: "Error", value: mesaj }] } }) as ErrorEvent;

test("prima aparitie a unei erori trece intotdeauna, repetarile se taie dupa 5 in 10 minute", () => {
  const t0 = 1_000_000;
  const e = eroare("cron-proba-plafon a cazut");
  const rezultate = Array.from({ length: 8 }, (_, i) => treceDePlafon(e, t0 + i * 1000));
  assert.deepEqual(rezultate, [true, true, true, true, true, false, false, false]);
  // dupa fereastra, aceeasi eroare trece iar: o problema care persista ramane vizibila
  assert.equal(treceDePlafon(e, t0 + 10 * 60 * 1000 + 1), true);
});

test("plafonul e pe eroare, nu global: o eroare noua trece chiar daca alta e taiata", () => {
  const t0 = 5_000_000;
  const zgomot = eroare("cron-proba-zgomot a cazut");
  for (let i = 0; i < 10; i++) treceDePlafon(zgomot, t0 + i);
  assert.equal(treceDePlafon(zgomot, t0 + 20), false);
  assert.equal(treceDePlafon(eroare("checkout-proba a cazut"), t0 + 21), true);
});

test("adresele pierd query string-ul si fragmentul: acolo stau jetoane si coduri", () => {
  assert.equal(faraQuery("https://edinio.com/reset-password?code=abc123"), "https://edinio.com/reset-password");
  assert.equal(faraQuery("/comanda/confirmare?token=x#sus"), "/comanda/confirmare");
  assert.equal(faraQuery("/dashboard/orders"), "/dashboard/orders");
});

test("evenimentul pleaca fara query, cookie-uri si corpul cererii", () => {
  const e = {
    ...eroare("proba-cerere a cazut"),
    request: {
      url: "https://edinio.com/api/plata?ntpID=123&token=secret",
      query_string: "ntpID=123&token=secret",
      cookies: { "sb-access-token": "x" },
      data: { telefon: "0722 000 000" },
    },
  } as ErrorEvent;
  const curat = curataEvenimentul(e);
  assert.ok(curat);
  assert.equal(curat.request?.url, "https://edinio.com/api/plata");
  assert.equal(curat.request?.query_string, undefined);
  assert.equal(curat.request?.cookies, undefined);
  assert.equal(curat.request?.data, undefined);
});

test("firimiturile din consola nu pleaca; celelalte pleaca fara query", () => {
  assert.equal(curataFirimitura({ category: "console", message: "comanda: Ion Popescu, 0722..." }), null);
  const cerere = curataFirimitura({ category: "fetch", data: { url: "/api/x?email=a@b.ro", method: "GET" } });
  assert.equal(cerere?.data?.url, "/api/x");
  const navigare = curataFirimitura({ category: "navigation", data: { from: "/login?next=/a", to: "/dashboard?tab=1" } });
  assert.deepEqual(navigare?.data, { from: "/login", to: "/dashboard" });
});

/*
  ⚠ Sentry NU are voie sa intre static in fisierele care se leaga pe FIECARE pagina,
  inclusiv pe vitrine. Un `import * as Sentry from "@sentry/nextjs"` pus „ca sa fie
  mai simplu" in unul din ele ar adauga zeci de kilobytes la fiecare magazin, fara
  ca vreo proba de comportament sa observe. Se cauta doar pe randurile de cod, nu
  in comentarii (care pomenesc Sentry dinadins).
*/
test("instrumentation-client si granitele de eroare nu importa Sentry static", () => {
  for (const fisier of ["src/instrumentation-client.ts", "src/app/error.tsx", "src/app/global-error.tsx", "src/lib/sentry/raporteaza.ts"]) {
    const cod = readFileSync(fisier, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((r) => !r.trim().startsWith("//"));
    const importuriStatice = cod.filter(
      (r) => /^\s*import\s[^(]*["']@sentry\//.test(r) || /^\s*import\s[^(]*["'](\.\/|[^"']*lib\/sentry\/)client["']/.test(r),
    );
    assert.deepEqual(importuriStatice, [], `${fisier} importa Sentry static`);
  }
});
