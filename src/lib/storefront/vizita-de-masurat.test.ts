import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { seMasoaraVizita, UA_SANTINELA } from "./vizita-de-masurat";

/*
 * Cine intra in „Surse de trafic". Regula se ruleaza aici; cablarea din cele doua pagini
 * care scriu vizite se verifica pe sursa, fiindca sunt fisiere `.tsx` (vezi
 * `scripts/tests/ts-resolve.mjs`) si nu se pot rula in probe.
 */

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

test("un vizitator oarecare, pe domeniul magazinului sau pe platforma: se masoara", () => {
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "caian-textile.ro", userAgent: CHROME }), true);
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "www.edinio.com", userAgent: null }), true);
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "www.edinio.com", userAgent: "" }), true);
});

test("⚠ santinela nu e o vizita", () => {
  assert.equal(UA_SANTINELA, "edinio-santinela");
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "vetdepo.ro", userAgent: UA_SANTINELA }), false);
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "vetdepo.ro", userAgent: ` ${UA_SANTINELA} ` }), false);
  // Egalitate exacta: un user-agent care doar o pomeneste e al altcuiva.
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "vetdepo.ro", userAgent: `${CHROME} ${UA_SANTINELA}` }), true);
});

test("proprietarul si gazdele de test raman afara, ca pana acum", () => {
  assert.equal(seMasoaraVizita({ esteProprietar: true, host: "caian-textile.ro", userAgent: CHROME }), false);
  for (const host of ["localhost", "127.0.0.1", "edinio-git-lucru.vercel.app"]) {
    assert.equal(seMasoaraVizita({ esteProprietar: false, host, userAgent: CHROME }), false, host);
  }
});

/** ⚠ Terminatiile se normalizeaza, iar comentariile se scot: un apel dintr-un comentariu nu e un apel. */
function cod(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Corpul `{...}` al lui `if (...)` care incepe la `start`, cu parantezele si acoladele echilibrate. */
function corpulLui(text: string, start: number): string {
  let i = text.indexOf("(", start);
  for (let adancime = 0; i < text.length; i++) {
    if (text[i] === "(") adancime++;
    else if (text[i] === ")" && --adancime === 0) break;
  }
  const deschis = text.indexOf("{", i);
  for (let j = deschis, adancime = 0; j < text.length; j++) {
    if (text[j] === "{") adancime++;
    else if (text[j] === "}" && --adancime === 0) return text.slice(deschis, j + 1);
  }
  throw new Error("bloc neinchis");
}

test("⚠ AMBELE locuri care scriu vizite trec prin aceeasi regula, cu user-agentul cererii", () => {
  /*
   * Scrisa doar intr-unul, jumatate din vizitele santinelei ar fi ramas in statistici,
   * iar nicio cifra n-ar fi aratat care jumatate.
   */
  for (const cale of ["src/lib/storefront/catalog/pagina-magazin.tsx", "src/app/(public)/[slug]/page.tsx"]) {
    const c = cod(cale);
    assert.equal([...c.matchAll(/\.from\("site_analytics"\)\.insert\(/g)].length, 1, `${cale}: un singur loc scrie vizita`);
    const unde = c.indexOf("if (seMasoaraVizita(");
    assert.ok(unde >= 0, `${cale}: vizita se scrie fara regula comuna`);
    assert.match(c.slice(unde), /^if \(seMasoaraVizita\(\{ esteProprietar: isOwner, host, userAgent: ua \}\)\)/, `${cale}: regula trebuie sa primeasca proprietarul, gazda si user-agentul`);
    assert.match(corpulLui(c, unde), /\.from\("site_analytics"\)\.insert\(/, `${cale}: scrierea e in afara regulii`);
    assert.match(c, /const ua = \w+\.get\("user-agent"\) \?\? "";/, `${cale}: user-agentul trebuie sa fie al cererii`);
    assert.doesNotMatch(c, /isNonProductionHost\(/, `${cale}: o conditie scrisa de mana s-ar desparti de regula`);
  }
});

test("santinela trimite chiar user-agentul pe care il recunosc paginile", () => {
  const c = cod("src/app/api/cron/santinela/route.ts");
  assert.match(c, /import \{ UA_SANTINELA \} from "@\/lib\/storefront\/vizita-de-masurat";/);
  assert.match(c, /const ANTET = \{ "user-agent": UA_SANTINELA \} as const;/);
  assert.doesNotMatch(c, /"edinio-santinela"/, "scris de mana, s-ar desparti de constanta");
});
