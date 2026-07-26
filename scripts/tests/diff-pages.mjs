/**
 * Diferentele reale dintre doua pagini, ca multime de taguri.
 *
 * Comparatia liniara din `compare-storefront.mjs` se desincronizeaza cand un bloc
 * intreg se muta sau se adauga, si atunci raporteaza zeci de „diferente" care
 * sunt de fapt aceleasi taguri, decalate. Aici se calculeaza ce exista intr-o
 * parte si nu in cealalta, indiferent de pozitie — util cand o schimbare e
 * intentionata si vrei sa vezi exact ce s-a adaugat si ce s-a pierdut.
 *
 * Rulare:
 *   node scripts/tests/diff-pages.mjs <url-productie> <url-preview> [prefix-de-scos]
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

function bypassSecret() {
  try {
    const line = readFileSync(path.join(ROOT, ".env.local"), "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("VERCEL_AUTOMATION_BYPASS_SECRET"));
    return line ? line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim() : "";
  } catch {
    return "";
  }
}

const strip = (h) =>
  h
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><");

const bodyOf = (h) => {
  const m = strip(h).match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return (m ? m[1] : h)
    .replace(/<div hidden="?"?>[\s\S]*?<\/div>/gi, "")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "")
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "");
};

const tokens = (h) => h.split(/(?=<)/).map((t) => t.trim()).filter(Boolean);

const [prodUrl, prevUrl, prefix] = process.argv.slice(2);
if (!prodUrl || !prevUrl) {
  console.error("Folosire: node scripts/tests/diff-pages.mjs <url-productie> <url-preview> [prefix-de-scos]");
  process.exit(1);
}

const secret = bypassSecret();
const prod = await (await fetch(prodUrl)).text();
let prev = await (await fetch(prevUrl, { headers: { "x-vercel-protection-bypass": secret } })).text();
if (prefix) prev = prev.replaceAll(`="${prefix}/`, '="/').replaceAll(`="${prefix}"`, '="/');

const count = (arr) => arr.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
const A = count(tokens(bodyOf(prod)));
const B = count(tokens(bodyOf(prev)));
const only = (X, Y) => [...X].flatMap(([t, n]) => (n - (Y.get(t) || 0) > 0 ? [[t, n - (Y.get(t) || 0)]] : []));

const lipsa = only(A, B);
const nou = only(B, A);
console.log(`\nPIERDUT in preview (${lipsa.length}):`);
for (const [t, n] of lipsa) console.log(`  x${n} ${t.slice(0, 160)}`);
console.log(`\nADAUGAT in preview (${nou.length}):`);
for (const [t, n] of nou) console.log(`  x${n} ${t.slice(0, 160)}`);
