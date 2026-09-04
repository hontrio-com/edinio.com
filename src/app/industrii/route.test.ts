import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GET as getHub, raspunsRetras } from "./route";
import { GET as getSubEl } from "./[...restul]/route";
import { NON_STORE_SEGMENTS } from "@/lib/segmente-rezervate";

/*
  ═══ CE APĂRĂ PROBA ASTA ═══

  Nu că `/industrii` „nu mai există" — asta se vede și fără probă. Apără
  **HOTĂRÂREA**: 410, nu 404, nu redirectare, nu o pagină de explicație cu 200.

  Cele cinci pagini șterse înaintea ei au primit toate redirectare 308 către `/`
  (`/roadmap`, `/start`, `/despre`, `/magazin-online`, `/index`). Deci varianta
  cea mai probabilă de regresie NU e ștergerea rutei, ci ca cineva să
  „uniformizeze" și s-o mute la 308 „ca la celelalte" — iar asta ar fi o
  redirectare înșelătoare: o pagină despre magazine de piese auto n-are
  echivalent la pagina de start.

  Măsurat pe 04.09.2026, înainte de ștergere: NIMIC din cod nu apăra alegerea.
*/

const AICI = dirname(fileURLToPath(import.meta.url));

describe("adresele retrase răspund 410, nu altceva", () => {
  for (const [nume, cheama] of [
    ["hub-ul /industrii", getHub],
    ["orice e sub el (/industrii/haine)", getSubEl],
  ] as [string, () => Promise<Response>][]) {
    test(nume, async () => {
      const r = await cheama();
      assert.equal(r.status, 410, "a încetat să mai fie 410 — vezi nota din route.ts");
      assert.equal(r.headers.get("x-robots-tag"), "noindex", "adresa retrasă poate rămâne în index");
      assert.equal(r.headers.get("cache-control"), "no-store", "un CDN ar putea ține răspunsul");
      assert.match(r.headers.get("content-type") ?? "", /text\/plain/);
      assert.ok((await r.text()).length > 0, "corp gol: un om venit din Google n-ar afla nimic");
    });
  }

  test("cele două rute dau ACELAȘI răspuns, din același loc", async () => {
    /* Două corpuri de 410 scrise separat s-ar despărți la prima modificare, iar
       cel de sub hub — cel pe care cad chiar cele șapte adrese vechi — n-ar mai
       fi probat de nimeni. */
    const [a, b, model] = await Promise.all([getHub(), getSubEl(), Promise.resolve(raspunsRetras())]);
    const [ta, tb, tm] = await Promise.all([a.text(), b.text(), model.text()]);
    assert.equal(ta, tm);
    assert.equal(tb, tm);
    assert.equal(a.status, b.status);
  });
});

describe("ce ține adresa rezervată nu e ruta", () => {
  test("`industrii` rămâne în NON_STORE_SEGMENTS", () => {
    /*
      ⚠ RUTA NU ȚINE LOCUL REZERVĂRII, și e ușor de crezut că da.
      `rute-pe-disc.ts` caută `page.tsx`/`page.ts`, NU `route.ts`: pentru el
      adresa nu mai există deloc. Ce oprește un magazin să ia slugul `industrii`
      — și, pe domeniu propriu, să fie servit de proxy ca vitrină — e strict
      rândul din lista de segmente rezervate.
    */
    assert.ok(
      NON_STORE_SEGMENTS.has("industrii"),
      "`industrii` a ieșit din segmentele rezervate: un magazin poate lua slugul, iar ruta de 410 " +
        "nu-l oprește, fiindcă proxy-ul decide înaintea ei",
    );
  });

  test("paginile chiar au plecat de pe disc", () => {
    /* Altfel ruta de 410 ar sta lângă o pagină vie, iar care dintre ele câștigă
       e o întrebare pe care nu vreau s-o pun rutării. */
    const app = join(AICI, "..");
    for (const ramas of [
      join(app, "(website)", "industrii", "page.tsx"),
      join(app, "(website)", "industrii", "[industrie]", "page.tsx"),
    ]) {
      assert.ok(!existsSync(ramas), `a rămas o pagină de industrie pe disc: ${ramas}`);
    }
  });
});

describe("nimic nu mai trimite acolo", () => {
  /*
    Adresa moartă e ușor de scos; legăturile către ea sunt cele care rămân, și
    nimic nu le reclamă: o legătură către 410 nu rupe niciun build.
  */
  const faraComentarii = (cale: string) =>
    readFileSync(cale, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

  const SURSE: [string, string][] = [
    ["subsolul", join(AICI, "..", "..", "lib", "website", "footer.ts")],
    ["meniul", join(AICI, "..", "..", "lib", "website", "nav.ts")],
    ["sitemapul", join(AICI, "..", "sitemap.ts")],
    ["llms.txt", join(AICI, "..", "llms.txt", "route.ts")],
  ];

  for (const [nume, cale] of SURSE) {
    test(`${nume} nu mai pomenește /industrii`, () => {
      assert.doesNotMatch(
        faraComentarii(cale),
        /\/industrii/,
        `${nume} încă trimite la o adresă care răspunde 410`,
      );
    });
  }

  test("regula de mai sus chiar poate cădea", () => {
    /* O scanare care-și scoate comentariile poate deveni tăcută fără să observe
       nimeni — mai ales aici, unde fișierele atinse au comentarii LUNGI despre
       chiar cuvântul căutat. Se verifică unealta, pe amândouă fețele. */
    const scoate = (t: string) =>
      t.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    assert.match(scoate('const x = "/industrii/haine";'), /\/industrii/, "regula nu prinde cod viu");
    assert.doesNotMatch(scoate("/* nota despre /industrii */"), /\/industrii/, "regula se aprinde pe un comentariu");
    assert.doesNotMatch(scoate("// /industrii a plecat"), /\/industrii/, "regula se aprinde pe un comentariu de rând");
  });
});
