#!/usr/bin/env node
/**
 * Fiecare coloana ceruta de stratul PUBLIC de citire chiar se poate citi ca `anon`.
 *
 *     node scripts/tests/coloane-publice-citibile.mjs
 *
 * ═══ DE CE EXISTA ═══
 *
 * ⚠ A CAZUT `/blog` IN PRODUCTIE, PE 31.08.2026, LA CATEVA MINUTE DUPA DESFASURARE.
 *
 * Am adaugat coloana `content_updated_at` pe `blog_authors` si am pus-o in
 * `CAMPURI_LISTA`. Dar `blog_authors` NU are `select` pe tabela pentru `anon` —
 * are granturi pe COLOANA, pe noua coloane anume. Iar granturile pe coloana nu se
 * intind singure la coloanele noi.
 *
 * Rezultatul: `permission denied for table blog_authors`, si `/blog` a raspuns
 * 500. Migratia trecuse, typecheck-ul trecuse, cele 5047 de probe trecusera,
 * build-ul trecuse, iar `verifica:coloane` spusese „OK, toate cele 328 exista".
 *
 * ⚠ DE CE N-A VAZUT `verifica:coloane`: el ruleaza cu CHEIA DE SERVICIU, care
 * trece peste granturile pe coloana. Deci raspundea la intrebarea „exista
 * coloana?", nu la „o poate citi cine o citeste".
 *
 * Scriptul asta intreaba cu CHEIA PUBLICA, adica din locul cititorului.
 *
 * ⚠ SI ARATA DE CE MERITA GRANTURILE PE COLOANA, nu ca sunt o pacoste: ele sunt
 * apararea impotriva ridicarii de privilegii. RLS filtreaza RANDURI; granturile
 * pe coloana filtreaza COLOANE. `blog_authors` are si campuri care n-au ce cauta
 * public. Pretul e exact rigoarea de aici.
 */
import { readFileSync } from "node:fs";

const URL_BAZA = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const CHEIA =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

if (!URL_BAZA || !CHEIA) {
  console.error("Lipsesc NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  console.error("⚠ ANUME cheia PUBLICA, nu cea de serviciu: cea de serviciu trece");
  console.error("  peste granturile pe coloana, deci n-ar vedea tocmai ce cautam.");
  process.exit(2);
}

const sursa = readFileSync("src/lib/blog/citire.ts", "utf8").split("\r\n").join("\n");

/**
 * Coloanele cerute de la fiecare tabela, citite din sursa.
 *
 * ⚠ DIN SURSA, NU DINTR-O LISTA SCRISA AICI. O listă scrisă separat ar rămâne în
 * urmă exact în ziua în care cineva adaugă o coloană — adică exact ziua în care
 * proba ar trebui să muște.
 */
function coloaneCerute() {
  const cerute = new Map([
    ["blog_posts", new Set()],
    ["blog_authors", new Set()],
    ["blog_categories", new Set()],
  ]);

  /*
   * ⚠ SE REZOLVA CONSTANTELE PE NUME, NU SE GHICESTE DUPA FORMA.
   *
   * Prima mea varianta se lua dupa cum arata sirul („contine `id, slug` deci e
   * de articol"). A raportat `blog_posts.sameas` — o coloana care nici nu
   * exista pe tabela aceea — fiindca `CAMPURI_AUTOR` arata la fel. Un fals
   * pozitiv intr-o proba de securitate e mai rau decat lipsa ei: prima data o
   * crezi, a doua oara o ignori, a treia oara o stergi.
   *
   * Acum: se citesc constantele `const CAMPURI_X = "..." + "...";`, apoi se
   * leaga de tabela prin `.from("T").select(CAMPURI_X)`.
   */
  const constante = new Map();
  for (const m of sursa.matchAll(/const (CAMPURI_[A-Z_]+)\s*=([\s\S]*?);\n/g)) {
    const bucati = [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]).join("");
    constante.set(m[1], bucati);
  }

  const adauga = (tabel, lista) => {
    /* Imbricarile merg la tabela lor, restul la tabela de baza. */
    for (const im of lista.matchAll(/([a-z_]+)\(([^)]*)\)/g)) {
      if (!cerute.has(im[1])) continue;
      for (const c of im[2].split(",").map((x) => x.trim()).filter(Boolean)) {
        if (/^[a-z_]+$/.test(c)) cerute.get(im[1]).add(c);
      }
    }
    for (const c of lista.replace(/[a-z_]+\([^)]*\)/g, "").split(",").map((x) => x.trim())) {
      if (/^[a-z_]+$/.test(c) && cerute.has(tabel)) cerute.get(tabel).add(c);
    }
  };

  for (const m of sursa.matchAll(/\.from\("(blog_[a-z_]+)"\)\s*\.select\(\s*(CAMPURI_[A-Z_]+|"[^"]*")/g)) {
    const [, tabel, ce] = m;
    if (!cerute.has(tabel)) continue;
    const lista = ce.startsWith('"') ? ce.slice(1, -1) : (constante.get(ce) ?? "");
    if (lista === "*" || lista === "") continue; /* `*` cere tot; nu se poate rupe pe coloane */
    adauga(tabel, lista);
  }

  return cerute;
}

async function poateCiti(tabel, coloane) {
  const adresa = `${URL_BAZA}/rest/v1/${tabel}?select=${encodeURIComponent(coloane.join(","))}&limit=1`;
  const r = await fetch(adresa, {
    headers: { apikey: CHEIA, Authorization: `Bearer ${CHEIA}` },
  });
  if (r.ok) return { ok: true };
  const corp = await r.text().catch(() => "");
  return { ok: false, cod: r.status, corp: corp.slice(0, 200) };
}

const cerute = coloaneCerute();
let rele = 0;
let total = 0;

for (const [tabel, set] of cerute) {
  const coloane = [...set].sort();
  if (coloane.length === 0) {
    console.error(`NIMIC    ${tabel}: n-am extras nicio coloana din citire.ts`);
    console.error("         ⚠ O proba care nu gaseste nimic nu apara nimic. S-a mutat sursa?");
    rele++;
    continue;
  }
  total += coloane.length;

  const toate = await poateCiti(tabel, coloane);
  if (toate.ok) {
    console.log(`OK       ${tabel}: ${coloane.length} coloane, citibile public`);
    continue;
  }

  /* PostgREST se opreste la prima coloana refuzata — se reia una cate una. */
  console.error(`REFUZAT  ${tabel}: ${toate.cod} ${toate.corp}`);
  for (const c of coloane) {
    const una = await poateCiti(tabel, [c]);
    if (!una.ok) {
      rele++;
      console.error(`  ✖ ${tabel}.${c} — \`anon\` NU o poate citi`);
      console.error(`    grant select (${c}) on public.${tabel} to anon, authenticated;`);
    }
  }
}

if (rele > 0) {
  console.error(`\n${rele} coloane cerute public NU sunt citibile de \`anon\`.`);
  console.error("⚠ Asta rupe INTREAGA interogare, deci si paginile care n-au treaba cu coloana.");
  console.error("  Pe 31.08.2026 a scos `/blog` din functiune cu 500, dupa un build verde.");
  process.exit(1);
}

console.log(`\nOK: toate cele ${total} coloane cerute public sunt citibile de \`anon\`.`);
process.exit(0);
