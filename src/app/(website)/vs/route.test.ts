import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GET } from "./route";
import { NON_STORE_SEGMENTS } from "@/lib/segmente-rezervate";
import { COMPETITORS } from "@/lib/website/nav";

/*
  ═══ CE APĂRĂ PROBA ASTA ═══

  Hotărârea din 11.09.2026: indexul `/vs` e retras și răspunde 410, iar cele
  șase comparații de sub el rămân. Că adresa nu mai e anunțată se probează în
  `src/app/sitemap.test.ts`, pe ieșirea sitemapului. Aici, restul:

    - cineva „uniformizează" și pune redirectare 308 ca la `/start`, care aici
      ar fi înșelătoare (vezi nota din `route.ts`);
    - o curățenie prea largă ia și comparațiile, care sunt în meniu;
    - o legătură către `/vs` rămâne sau revine. O legătură către un 410 nu rupe
      niciun build și nu dă nicio eroare.
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AICI, "..", "..", "..");

/** Sursa fără comentarii: notele despre `/vs` o citează chiar pe ea. */
const faraComentarii = (text: string) =>
  text.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("/vs răspunde 410, nu altceva", () => {
  test("statusul și antetele", async () => {
    const r = await GET();
    assert.equal(r.status, 410, "a încetat să mai fie 410: vezi nota din route.ts");
    assert.equal(r.headers.get("x-robots-tag"), "noindex", "adresa retrasă poate rămâne în index");
    assert.equal(r.headers.get("cache-control"), "no-store", "un CDN ar putea ține răspunsul");
    assert.match(r.headers.get("content-type") ?? "", /text\/plain/);
    assert.ok((await r.text()).length > 0, "corp gol: un om venit din Google n-ar afla nimic");
  });
});

describe("indexul a plecat, comparațiile au rămas", () => {
  test("`vs/page.tsx` nu mai există", () => {
    /* `page.tsx` și `route.ts` în același dosar: rutarea n-are cum să le
       servească pe amândouă. */
    assert.ok(!existsSync(join(AICI, "page.tsx")), "a revenit pagina /vs lângă ruta de 410");
  });

  test("paginile `/vs/{concurent}` sunt încă acolo", () => {
    /* Cererea a fost DOAR indexul. */
    assert.ok(existsSync(join(AICI, "[competitor]", "page.tsx")), "au dispărut paginile de comparație");
    assert.ok(COMPETITORS.length > 0, "lista de comparații e goală");
    for (const c of COMPETITORS) {
      assert.match(c.href, /^\/vs\/[a-z0-9-]+$/, `${c.href} nu mai e o comparație de sub /vs`);
    }
  });

  test("`vs` rămâne în NON_STORE_SEGMENTS", () => {
    assert.ok(NON_STORE_SEGMENTS.has("vs"), "un magazin ar putea lua slugul `vs`");
  });
});

describe("nimic nu mai trimite la /vs", () => {
  /**
   * O legătură către chiar `/vs`, nu către `/vs/shopify`: ca `href`, relativă sau
   * absolută (`https://www.edinio.com/vs`, `${PLATFORM_ORIGIN}/vs`), ori ca
   * navigare din cod (`redirect("/vs")`, `router.push("/vs")`).
   *
   * ⚠ NU prinde prefixul `"de-ce-noi": ["/vs"]` din `MENU_PREFIXES`, și e
   * dinadins: acela doar aprinde intrarea din meniu pe `/vs/{concurent}`.
   */
  const LEGATURA =
    /(?:\bhref\s*[:=]\s*\{?\s*|\b(?:redirect|permanentRedirect|push|replace)\(\s*)["'`](?:https?:\/\/(?:www\.)?edinio\.com|\$\{PLATFORM_ORIGIN\})?\/vs["'`?#]/;
  /** Treapta de firimituri către `/vs`, pe orice pagină: `cale: "vs"` iese `https://www.edinio.com/vs`. */
  const TREAPTA = /\bcale\s*:\s*["'`]vs["'`]/;

  function surse(dir: string, out: string[] = []): string[] {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const cale = join(dir, d.name);
      if (d.isDirectory()) surse(cale, out);
      else if (/\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name)) out.push(cale);
    }
    return out;
  }

  test("nicio legătură și nicio treaptă de firimituri către /vs, nicăieri în `src`", () => {
    const toate = surse(SRC);
    assert.ok(toate.length > 100, `doar ${toate.length} fișiere: proba s-a uitat în alt dosar`);
    const vinovate = toate.filter((f) => {
      const s = faraComentarii(readFileSync(f, "utf8"));
      return LEGATURA.test(s) || TREAPTA.test(s);
    });
    assert.deepEqual(vinovate, [], "trimit la o adresă care răspunde 410");
  });

  test("subsolul și llms.txt nu pomenesc /vs ca adresă", () => {
    for (const f of [join(SRC, "lib", "website", "footer.ts"), join(SRC, "app", "llms.txt", "route.ts")]) {
      assert.doesNotMatch(faraComentarii(readFileSync(f, "utf8")), /["'`]\/vs["'`]/, `${f} încă trimite la /vs`);
    }
  });

  test("comparațiile nu mai declară /vs ca treaptă în firimituri", () => {
    /* Era ultima legătură rămasă: `parinte: { nume: "Comparatii", cale: "vs" }`
       punea `https://www.edinio.com/vs` în `BreadcrumbList`, pe toate șase. */
    const sursa = faraComentarii(readFileSync(join(AICI, "[competitor]", "page.tsx"), "utf8"));
    assert.doesNotMatch(sursa, /\bparinte\s*:/, "comparațiile declară iar o treaptă-părinte");
  });

  test("regula chiar poate cădea", () => {
    assert.match('<Link href="/vs">', LEGATURA, "nu prinde o legătură în JSX");
    assert.match('{ label: "x", href: "/vs" }', LEGATURA, "nu prinde o legătură din date");
    assert.match("<Link href={'/vs'}>", LEGATURA, "nu prinde forma cu acolade");
    assert.doesNotMatch('<Link href="/vs/shopify">', LEGATURA, "s-a aprins pe o comparație");
    assert.doesNotMatch(faraComentarii('/* <Link href="/vs"> */'), LEGATURA, "s-a aprins pe un comentariu");
  });
});
