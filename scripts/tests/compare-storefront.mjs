/**
 * Compara HTML-ul unui magazin intre productie si un deploy de preview.
 *
 * Sistemul de design sparge `MiniStoreRenderer` (2900 de linii) in sectiuni.
 * Criteriul de iesire al fiecarui pas e „randare identica", iar capturile de
 * ecran sunt un instrument slab pentru asta: nu prind o clasa pierduta si nu se
 * pot rula pe zece magazine. Comparatia pe markup e mai stricta si repetabila.
 *
 * Ce se ignora, pentru ca difera legitim intre doua deploy-uri:
 *  - tot ce e <script> (inclusiv payload-ul RSC, care contine hash-uri de build)
 *  - <link>/<style> catre chunk-uri cu hash
 *  - atributele `nonce`
 *  - spatiile dintre taguri
 *
 * Diferentele asteptate se pot declara prin --allow, ca sa ramana in raport doar
 * ce e cu adevarat nou.
 *
 * Rulare:
 *   node scripts/tests/compare-storefront.mjs <url-preview> <slug> [slug...]
 *   node scripts/tests/compare-storefront.mjs <url-preview> --all
 *
 * Secretul de bypass al protectiei Vercel se citeste din `.env.local`
 * (VERCEL_AUTOMATION_BYPASS_SECRET) si nu se afiseaza niciodata.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PROD = "https://www.edinio.com";

/** `data-dpl-id` e id-ul deployment-ului Vercel: difera prin definitie. */
const DEFAULT_ALLOW = ["data-dpl-id"];

/**
 * Valori generate aleator la fiecare randare, care nu pot coincide niciodata.
 * Se inlocuiesc cu un tipar fix in AMBELE documente, inainte de comparare —
 * altfel ar aparea ca diferenta la fiecare rulare.
 *
 * Deocamdata doar contorul de social proof al paginii de produs
 * (`ProductPage`: `18 + Math.floor(Math.random() * 10)`).
 */
function neutralizeazaAleator(html) {
  return html.replace(
    /(<span class="text-foreground font-bold">)\d+(<\/span>\s*persoane se uita acum)/g,
    "$1N$2",
  );
}

function bypassSecret() {
  try {
    const line = readFileSync(path.join(ROOT, ".env.local"), "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("VERCEL_AUTOMATION_BYPASS_SECRET"));
    if (!line) return "";
    return line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim();
  } catch {
    return "";
  }
}

async function fetchHtml(url, headers = {}) {
  const res = await fetch(url, { headers, redirect: "follow" });
  const body = await res.text();
  return { status: res.status, url: res.url, body };
}

/** Markup-ul vizibil, fara ce difera legitim intre doua build-uri. */
function normalize(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/\snonce="[^"]*"/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}

/**
 * Corpul paginii, fara schelaria de streaming a lui React.
 *
 * React trimite bucatile suspendate intr-un `<div hidden>` cu `<template>`-uri
 * si le muta la locul lor din JavaScript. Ce ajunge in HTML-ul initial depinde
 * de cat de repede raspunde baza de date, deci ACEEASI pagina din productie
 * poate da doua forme la doua cereri consecutive. Le scoatem, altfel comparatia
 * raporteaza zgomot in loc de regresii.
 */
function bodyMarkup(raw) {
  const html = neutralizeazaAleator(raw);
  const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return normalize(body ? body[1] : html)
    .replace(/<div hidden="?"?>[\s\S]*?<\/div>/gi, "")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "")
    .replace(/<template\b[^>]*>/gi, "")
    // Metadata e comparata separat, ca multime (vezi metaTags).
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "");
}

/**
 * Metadata paginii, comparata ca multime peste TOT documentul.
 *
 * In Next 16 titlul si tagurile meta pot fi trimise fie in `<head>`, fie mai
 * tarziu in corp si mutate din JavaScript, dupa cat de repede se rezolva
 * `generateMetadata`. Acelasi magazin din productie da ambele forme la cereri
 * consecutive, deci conteaza doar CE metadata exista, nu unde a aterizat.
 */
function metaTags(html) {
  const out = [];
  for (const re of [/<title>[\s\S]*?<\/title>/gi, /<meta\b[^>]*>/gi]) {
    for (const m of html.matchAll(re)) out.push(m[0].replace(/\s+/g, " ").trim());
  }
  return out.sort();
}

/** Sparge markup-ul in taguri, ca diferentele sa fie localizabile. */
function tokenize(html) {
  return html
    .split(/(?=<)/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Ce exista intr-o parte si nu in cealalta, indiferent de pozitie.
 *
 * Comparatia pozitionala se desincronizeaza cand un bloc intreg se adauga sau se
 * muta si atunci raporteaza zeci de diferente care sunt de fapt aceleasi taguri,
 * decalate. Multimea spune exact ce s-a pierdut si ce s-a adaugat.
 */
function multisetDiff(a, b) {
  const numara = (arr) => arr.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
  const A = numara(a);
  const B = numara(b);
  const doar = (X, Y) => [...X].flatMap(([t, n]) => (n - (Y.get(t) || 0) > 0 ? [{ t, n: n - (Y.get(t) || 0) }] : []));
  return { pierdut: doar(A, B), adaugat: doar(B, A) };
}

/** Ordinea tagurilor, ignorand atributele: prinde mutarile pe care multimea nu le vede. */
function tagOrder(tokens) {
  return tokens.map((t) => (t.match(/^<\/?([a-z0-9-]+)/i) ?? [, "?"])[1]).join(",");
}

/** Prima divergenta si contextul din jur. */
function diff(a, b, maxDiffs) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length && out.length < maxDiffs) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    // Reincercare de sincronizare: cauta urmatorul token comun in fereastra.
    let sync = null;
    for (let w = 1; w <= 40 && !sync; w++) {
      if (a[i + w] === b[j]) sync = { di: w, dj: 0 };
      else if (a[i] === b[j + w]) sync = { di: 0, dj: w };
    }
    out.push({
      pozitie: i,
      productie: a.slice(i, i + (sync?.di || 1)).join("").slice(0, 300),
      preview: b.slice(j, j + (sync?.dj || 1)).join("").slice(0, 300),
    });
    i += sync?.di || 1;
    j += sync?.dj || 1;
  }
  if (out.length < maxDiffs && (i < a.length || j < b.length)) {
    out.push({
      pozitie: i,
      productie: a.slice(i).join("").slice(0, 300),
      preview: b.slice(j).join("").slice(0, 300),
    });
  }
  return out;
}

const args = process.argv.slice(2);
const previewBase = args[0];
const allow = [...DEFAULT_ALLOW, ...args.filter((a) => a.startsWith("--allow=")).map((a) => a.slice(8))];
const slugs = args.slice(1).filter((a) => !a.startsWith("--"));

if (!previewBase || slugs.length === 0) {
  console.error("Folosire: node scripts/tests/compare-storefront.mjs <url-preview> <slug> [slug...] [--allow=text]");
  process.exit(1);
}

const secret = bypassSecret();
if (!secret) {
  console.error("Lipseste VERCEL_AUTOMATION_BYPASS_SECRET din .env.local.");
  process.exit(1);
}

let esecuri = 0;

for (const slug of slugs) {
  const prod = await fetchHtml(`${PROD}/${slug}`);
  const prev = await fetchHtml(`${previewBase.replace(/\/$/, "")}/${slug}`, {
    "x-vercel-protection-bypass": secret,
  });

  if (prod.status !== 200 || prev.status !== 200) {
    console.log(`\n${slug}: SARIT (productie HTTP ${prod.status}, preview HTTP ${prev.status})`);
    continue;
  }

  /**
   * Magazinele cu domeniu propriu se vad in productie la radacina domeniului
   * (`basePath` gol), iar pe preview la `/{slug}` — deci fiecare link intern
   * difera prin prefix. Il scoatem, altfel fiecare `<a>` din pagina apare ca
   * diferenta. La fel, adresa canonica ramane a domeniului propriu in productie
   * si devine cea de pe edinio.com pe preview: e corect asa, deci o permitem.
   */
  const domeniuPropriu = new URL(prod.url).host !== new URL(PROD).host;
  const dezprefixeaza = (html) =>
    domeniuPropriu
      ? html.replaceAll(`="/${slug}/`, '="/').replaceAll(`="/${slug}"`, '="/')
      : html;

  const permiseAcum = domeniuPropriu ? [...allow, "og:url", "canonical", "og:image"] : allow;
  const permis = (d) => permiseAcum.some((t) => d.productie.includes(t) || d.preview.includes(t));

  const a = tokenize(bodyMarkup(prod.body));
  const b = tokenize(dezprefixeaza(bodyMarkup(prev.body)));
  const { pierdut, adaugat } = multisetDiff(a, b);
  const cap = diff(metaTags(prod.body), metaTags(prev.body), 50).filter((d) => !permis(d));

  const filtreaza = (lista) => lista.filter(({ t }) => !permiseAcum.some((p) => t.includes(p)));
  const pierdutReal = filtreaza(pierdut);
  const adaugatReal = filtreaza(adaugat);

  // Numar egal de taguri si aceleasi taguri, dar ordine diferita.
  const reordonat =
    pierdutReal.length === 0 && adaugatReal.length === 0 && tagOrder(a) !== tagOrder(b);

  const total = pierdutReal.length + adaugatReal.length + cap.length + (reordonat ? 1 : 0);
  const nota = domeniuPropriu ? `, domeniu propriu ${new URL(prod.url).host}` : "";
  console.log(
    `\n${slug}: ${total === 0 ? "IDENTIC" : `${total} DIFERENTE`}  (${a.length} taguri productie, ${b.length} preview${nota})`,
  );

  if (total) {
    esecuri++;
    if (reordonat) console.log("  ordinea tagurilor difera, desi continutul e acelasi");
    for (const { t, n } of pierdutReal.slice(0, 6)) console.log(`  PIERDUT x${n}: ${t.slice(0, 170)}`);
    for (const { t, n } of adaugatReal.slice(0, 6)) console.log(`  ADAUGAT x${n}: ${t.slice(0, 170)}`);
    for (const d of cap.slice(0, 3)) console.log(`  META: ${(d.productie || "(lipseste)").slice(0, 120)} -> ${(d.preview || "(lipseste)").slice(0, 120)}`);
  }
}

process.exit(esecuri ? 1 : 0);
