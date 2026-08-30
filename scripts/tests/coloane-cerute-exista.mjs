#!/usr/bin/env node
/**
 * Fiecare coloana ceruta de cod exista in baza?
 *
 * ═══ DE CE EXISTA UNEALTA ASTA ═══
 *
 * 2026-09-03: codul a plecat pe productie inaintea migratiei, si `store_settings`
 * a ajuns sa fie interogata cu doua coloane inexistente (`posta_config`,
 * `innoship_config`). PostgREST raspunde cu EROARE la intreaga interogare, nu doar
 * pentru coloana lipsa. Urmarea, pe TOATE cele 127 de magazine:
 *
 *   - „Setari → Livrare" arata „Nu ai un magazin activ. Finalizeaza onboarding-ul"
 *     — fiindca `bizRow` iesea `null` si pagina nu putea deosebi „interogare
 *     picata" de „omul chiar n-are magazin";
 *   - `getShippingOptions` intorcea LISTA GOALA, deci checkout-ul intregii
 *     platforme ramanea fara nicio optiune de livrare.
 *
 * Niciuna dintre cele trei porti obisnuite n-avea cum sa prinda asta: `tsc` vede
 * tipurile pe care le-am scris NOI in `database.types.ts`, nu baza; probele nu
 * ating reteaua; iar build-ul nu interogheaza nimic.
 *
 * Deci proba trebuie sa compare CODUL cu BAZA. Asta face fisierul de fata.
 *
 * ═══ CUM SE FOLOSESTE ═══
 *
 *   node scripts/tests/coloane-cerute-exista.mjs
 *
 * Cere `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (sau `NEXT_PUBLIC_SUPABASE_URL`
 * si cheia anon — nomenclatorul de coloane e citit prin PostgREST, cu o cerere care
 * nu intoarce randuri).
 *
 * ⚠ NU intra in `npm test`: aia ruleaza offline, iar o proba care cere reteaua ar
 * face suita sa cada la fiecare pana de internet. Se ruleaza INAINTE DE PUSH, si
 * chiar acesta e rostul ei — vezi memoria „migratii-si-cod-impreuna".
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TABELE = ["store_settings", "orders", "businesses", "users_profile"];

/* ── 1. Ce coloane cere codul ─────────────────────────────────────────────── */

function fisiere(radacina) {
  const iesire = [];
  for (const nume of readdirSync(radacina)) {
    const cale = join(radacina, nume);
    const st = statSync(cale);
    if (st.isDirectory()) iesire.push(...fisiere(cale));
    else if (/\.tsx?$/.test(nume) && !/\.test\.tsx?$/.test(nume)) iesire.push(cale);
  }
  return iesire;
}

/**
 * Scoate perechile (tabel, coloane) din:
 *   .from("orders").select("a, b, c")
 *   .select("id, store_settings(x, y)")      ← embed
 *
 * ⚠ Se sare peste `select("*")` si peste selecturile compuse din variabile: acolo
 * nu avem ce compara, iar o proba care se preface ca a verificat e mai rea decat
 * una care spune ca n-a putut.
 */
function cereriDinFisier(text) {
  const cereri = [];

  /*
   * `.from("tabel")` urmat, in ACEEASI expresie, de `.select("…")`.
   *
   * ⚠ Intervalul dintre ele NU are voie sa contina alt `.from(`, si asta a fost
   * primul defect al uneltei: un `.select(VARIABILA)` n-are ghilimele, deci
   * potrivirea lenesa sarea peste el si lega `.from("businesses")` de urmatorul
   * `.select("…")` din fisier — care era al altui tabel. Iesea o alarma falsa, iar
   * o unealta care da alarme false nu se mai citeste tocmai cand are dreptate.
   */
  const re = /\.from\(\s*["'`](\w+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,400}?)\.select\(\s*(["'])([\s\S]*?)\3/g;
  let m;
  while ((m = re.exec(text))) {
    const [, tabel, , , lista] = m;
    if (!TABELE.includes(tabel) || lista.includes("*")) continue;
    cereri.push({ tabel, lista });
    /* Embedurile din aceeasi lista: `store_settings(a,b)`. */
    for (const e of lista.matchAll(/(\w+)\s*\(([^()]*)\)/g)) {
      if (TABELE.includes(e[1])) cereri.push({ tabel: e[1], lista: e[2] });
    }
  }
  return cereri;
}

/** Numele de coloane dintr-o lista de `select`, fara embeduri si fara alias-uri. */
function coloaneDin(lista) {
  return lista
    /* Scoate embedurile cu tot cu continut — ele se verifica separat. */
    .replace(/(\w+)\s*\([^()]*\)/g, "")
    .split(",")
    .map((c) => c.trim().split(":").pop().trim())
    .filter((c) => /^[a-z_][a-z0-9_]*$/i.test(c));
}

/* ── 2. Ce coloane are baza ───────────────────────────────────────────────── */

/**
 * Intreaba PostgREST daca un set de coloane exista, cerandu-le chiar pe ele.
 *
 * ⚠ NU se citeste `information_schema`, si nu din lene: dupa o migratie fara
 * `notify pgrst`, baza ARE coloana iar PostgREST inca nu — iar aplicatia vorbeste
 * cu PostgREST, nu cu baza. Deci proba trebuie sa intrebe acelasi interlocutor pe
 * care il intreaba si aplicatia.
 *
 * `limit=0` nu intoarce niciun rand: nu se citesc date, doar se valideaza numele.
 *
 * Intoarce:
 *   { fel: "ok" }                     toate exista
 *   { fel: "lipsa", coloana }         PostgREST numeste coloana lipsa (42703)
 *   { fel: "neverificabil", motiv }   n-am avut drepturi (ex. `orders` cu anon)
 */
async function verificaColoane(url, cheie, tabel, coloane) {
  const lista = [...coloane].join(",");
  const r = await fetch(`${url}/rest/v1/${tabel}?select=${encodeURIComponent(lista)}&limit=0`, {
    headers: { apikey: cheie, Authorization: `Bearer ${cheie}` },
  });
  if (r.ok) return { fel: "ok" };

  let corp = {};
  try { corp = await r.json(); } catch { /* raspuns necitibil */ }

  /* 42703 = „column does not exist". PostgREST pune numele in `message`. */
  if (corp?.code === "42703") {
    const m = /column\s+\S*?["']?([a-z0-9_]+)["']?\s+does not exist/i.exec(corp.message ?? "");
    return { fel: "lipsa", coloana: m?.[1] ?? corp.message ?? "necunoscuta" };
  }
  /* 42501 = „permission denied": tabelul e inchis pentru cheia asta. */
  return { fel: "neverificabil", motiv: `${r.status} ${corp?.code ?? ""} ${corp?.message ?? ""}`.trim() };
}

/* ── 3. Comparatia ────────────────────────────────────────────────────────── */

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const cheie = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!url || !cheie) {
  console.error("Lipsesc SUPABASE_URL / cheia. Vezi antetul fisierului.");
  process.exit(2);
}

/* Se aduna reuniunea coloanelor cerute, pe tabel, cu locul de unde vin. */
const cerute = new Map(TABELE.map((t) => [t, new Map()]));
for (const cale of fisiere("src")) {
  const text = readFileSync(cale, "utf8");
  for (const { tabel, lista } of cereriDinFisier(text)) {
    for (const col of coloaneDin(lista)) {
      const m = cerute.get(tabel);
      if (!m.has(col)) m.set(col, cale);
    }
  }
}

let lipsuri = 0;
let neverificate = 0;
let total = 0;

for (const [tabel, coloane] of cerute) {
  if (coloane.size === 0) continue;
  total += coloane.size;

  const r = await verificaColoane(url, cheie, tabel, coloane.keys());
  if (r.fel === "ok") {
    console.log(`OK        ${tabel}: ${coloane.size} coloane`);
    continue;
  }
  if (r.fel === "neverificabil") {
    neverificate += coloane.size;
    console.warn(`NEVERIFICAT ${tabel}: ${r.motiv} — ruleaza cu SUPABASE_SERVICE_ROLE_KEY`);
    continue;
  }

  /*
   * PostgREST se opreste la PRIMA coloana lipsa, deci nu stim daca mai sunt si
   * altele. Se reia una cate una — e lent, dar se intampla numai cand ceva chiar
   * lipseste, adica exact atunci cand vrem lista intreaga.
   */
  for (const [col, cale] of coloane) {
    const p = await verificaColoane(url, cheie, tabel, [col]);
    if (p.fel === "lipsa") {
      lipsuri++;
      console.error(`LIPSA     ${tabel}.${col}  ← ${cale}`);
    }
  }
}

if (lipsuri > 0) {
  console.error(`\n${lipsuri} coloane cerute de cod NU exista in PostgREST.`);
  console.error("Aplica migratia INAINTE de push: codul care cere o coloana inexistenta");
  console.error("rupe INTREAGA interogare, deci si paginile care nu au treaba cu ea.");
  process.exit(1);
}
if (neverificate > 0) {
  console.warn(`\n${total - neverificate}/${total} verificate. Restul cer cheia de service role.`);
  process.exit(0);
}
console.log(`\nOK: toate cele ${total} coloane cerute de cod exista in PostgREST.`);
process.exit(0);
