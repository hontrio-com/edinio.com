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

const TABELE = [
  "store_settings", "orders", "businesses", "users_profile",
  /*
    ⚠ BLOGUL E AICI FIINDCĂ NU E ÎN TIPURILE GENERATE.

    `src/types/database.types.ts` nu cunoaște niciun `blog_*`, deci tot codul de
    blog merge pe clienți fără tipuri (`as unknown as SupabaseClient`). Urmarea:
    `tsc` nu poate spune nimic despre coloanele lui, iar
    `coloanele-scrise-exista.test.ts` — care citește tot din tipuri — sare peste
    fiecare scriere de blog fără să lase vreun semn că a sărit.

    Unealta de față nu se uită în tipuri, se uită în BAZĂ. Deci e singura care
    poate apăra blogul azi, și e mai puternică decât tipurile: tipurile pot fi
    vechi, PostgREST-ul nu.
  */
  "blog_posts", "blog_authors", "blog_categories", "blog_tags", "blog_post_tags",
  "blog_post_revisions", "blog_redirects", "blog_subscribers", "blog_post_stats",
  /*
    ⚠ PROIECTIA DE CATALOG, din acelasi motiv ca blogul, dar cu o pedeapsa mai mare.

    `din-proiectie.ts` cere coloanele pe FATA, intr-un sir (`COLOANE_PROIECTIE`), pe calea de
    rezerva a paginii de magazin si a cautarii. PostgREST nu ignora o coloana necunoscuta: pica
    INTREAGA interogare. Deci cod pusat inaintea migratiei nu inseamna „lipseste un camp”,
    inseamna GRILA GOALA pe toate magazinele platformei — chiar paguba scrisa in memoria
    „o coloana lipsa rupe TOATA interogarea”.

    Iar `catalog_produs` intra si in tipurile generate, deci proba de tipuri o vede — dar
    tipurile pot fi vechi, PostgREST-ul nu.
  */
  "catalog_produs", "catalog_murdar",
  /*
    ⚠ CELE SASE TABELE DE CONFIGURATOR, si lipseau desi doua migratii spun pe fata
    „se ruleaza `npm run verifica:coloane` inainte de push”.

    Lista de aici e INCHISA, deci unealta trecea vesela peste orice coloana ceruta de codul de
    configurator — inclusiv peste tabele care nici nu existau in productie. Adica exact
    promisiunea din antetele migratiilor nu era acoperita de nimic.

    `catalog_produs` era acoperit din alt motiv (proiectia), si de aceea cazul cu pedeapsa cea
    mai mare — grila goala pe toate magazinele — chiar era aparat. Restul, nu.
  */
  "configuratoare", "configurator_versiuni", "configurator_produse", "configurator_categorii",
  "configurator_componente", "configurator_fisiere",
];

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
 * ⚠ Se sare peste `select("*")`. Selecturile compuse din variabile se rezolva insa, cand
 * variabila e o CONSTANTA de sir din acelasi fisier — vezi `constantele()`.
 *
 * ⚠ DE CE MERITA. `din-proiectie.ts` cere coloanele proiectiei de catalog printr-o astfel de
 * constanta, pe calea de rezerva a paginii de magazin si a cautarii. PostgREST nu ignora o
 * coloana necunoscuta: pica INTREAGA interogare. Deci cod pusat inaintea migratiei nu inseamna
 * „lipseste un camp”, inseamna GRILA GOALA pe toate magazinele platformei. Cat timp unealta era
 * oarba acolo, tocmai locul cu pedeapsa cea mai mare nu era aparat de nimic.
 *
 * Ce ramane nerezolvat — siruri compuse la rulare, importate din alt fisier — se sare mai
 * departe: o proba care se preface ca a verificat e mai rea decat una care spune ca n-a putut.
 */
/**
 * Constantele de sir din fisier: `const NUME = "a, b";`, si formele scrise pe mai multe
 * randuri cu `+`.
 *
 * ⚠ Numai literalii. O constanta compusa din alta variabila nu se urmareste: ar fi insemnat
 * sa interpretez fisierul, si prima interpretare gresita ar fi dat o alarma falsa — iar o
 * unealta care da alarme false nu se mai citeste tocmai cand are dreptate.
 */
function constantele(text) {
  const out = new Map();
  const re = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*((?:[\s\S]{0,1200}?));/g;
  let m;
  while ((m = re.exec(text))) {
    const [, nume, corp] = m;
    const bucati = [...corp.matchAll(/["'`]([^"'`]*)["'`]/g)].map((x) => x[1]);
    // Corpul trebuie sa fie DOAR siruri lipite cu `+`; orice altceva inseamna ca nu stim.
    if (bucati.length === 0) continue;
    const doarSiruri = corp.replace(/["'`][^"'`]*["'`]/g, "").replace(/[\s+]/g, "") === "";
    if (!doarSiruri) continue;
    out.set(nume, bucati.join(""));
  }
  return out;
}

function cereriDinFisier(text, consts) {
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

  /*
   * A doua trecere: `.select(NUME_DE_CONSTANTA)`.
   *
   * ⚠ Fara ea, tocmai selectul cu pedeapsa cea mai mare ramanea neverificat. Vezi antetul.
   */
  const reVar = /\.from\(\s*["'`](\w+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,400}?)\.select\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g;
  let v;
  while ((v = reVar.exec(text))) {
    const [, tabel, , nume] = v;
    const lista = consts.get(nume);
    if (!lista || !TABELE.includes(tabel) || lista.includes("*")) continue;
    cereri.push({ tabel, lista });
  }

  return cereri;
}

/**
 * `.from("tabel").insert({…})` / `.update({…})` / `.upsert({…})`.
 *
 * ⚠ O COLOANA SCRISA GRESIT E MAI RAU DECAT UNA CITITA GRESIT.
 *
 * La citire, PostgREST raspunde cu eroare si pagina se vede goala — urat, dar
 * vizibil. La scriere, INTREAGA scriere e respinsa: omul apasa „Salveaza",
 * primeste „nu s-a putut", si nimic nu spune care camp e de vina. Iar daca
 * scrierea e intr-o cale rara — o stergere, o dezabonare — poate sta stricata
 * luni de zile fara ca cineva sa dea peste ea.
 *
 * Se citesc doar cheile de la primul nivel al obiectului, si numai cele scrise
 * ca nume simplu (`slug: …`). Cheile calculate (`[camp]: …`) si raspandirile
 * (`...rand`) se sar: acolo nu avem ce compara, iar o proba care se preface ca a
 * verificat e mai rea decat una care spune ca n-a putut.
 */
function scrieriDinFisier(text) {
  const cereri = [];
  const re = /\.from\(\s*["'\`](\w+)["'\`]\s*\)((?:(?!\.from\()[\s\S]){0,200}?)\.(insert|update|upsert)\(\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const tabel = m[1];
    if (!TABELE.includes(tabel)) continue;

    /* De la acolada deschisa, pana la perechea ei. */
    const start = re.lastIndex - 1;
    let adanc = 0, i = start;
    for (; i < text.length; i++) {
      if (text[i] === "{") adanc++;
      else if (text[i] === "}") { adanc--; if (adanc === 0) break; }
    }
    const corp = text.slice(start + 1, i);

    /* Doar nivelul de sus: se sar obiectele imbricate. */
    const chei = [];
    let nivel = 0;
    for (const linie of corp.split("\n")) {
      const curat = linie.trim();
      if (nivel === 0) {
        const k = /^([a-z_][a-z0-9_]*)\s*:/i.exec(curat);
        // ⚠ Vezi `OPTIUNI_NU_COLOANE`: `{ count }` nu e o coloana scrisa.
        if (k && !OPTIUNI_NU_COLOANE.has(k[1])) chei.push(k[1]);
      }
      nivel += (linie.match(/[{[]/g) ?? []).length - (linie.match(/[}\]]/g) ?? []).length;
      if (nivel < 0) nivel = 0;
    }
    if (chei.length) cereri.push({ tabel, coloane: chei });
  }
  return cereri;
}

/*
 * ⚠ OPTIUNILE LUI POSTGREST NU SUNT COLOANE.
 *
 * `.select("id", { count: "exact", head: true })` are al doilea argument un obiect de OPTIUNI.
 * Extractorul de chei de mai sus il citea la fel ca pe unul de valori scrise, deci aduna `count`
 * si `head` in lista de coloane cerute. Cerute apoi lui PostgREST, ele fac raspunsul sa cada cu
 * `42803` — iar unealta scrie `NEVERIFICAT` si merge mai departe.
 *
 * Adica tabelele care foloseau `{ count }` erau raportate ca nepazite, si nimeni nu se uita la
 * randul ala: un `NEVERIFICAT` arata ca un mesaj de mediu, nu ca o gaura. Doua dintre cele sase
 * tabele de configurator au iesit asa din prima rulare.
 */
const OPTIUNI_NU_COLOANE = new Set(["count", "head", "ascending", "nullsFirst", "referencedTable", "foreignTable"]);

/** Numele de coloane dintr-o lista de `select`, fara embeduri si fara alias-uri. */
function coloaneDin(lista) {
  return lista
    /* Scoate embedurile cu tot cu continut — ele se verifica separat. */
    .replace(/(\w+)\s*\([^()]*\)/g, "")
    .split(",")
    .map((c) => c.trim().split(":").pop().trim())
    .filter((c) => /^[a-z_][a-z0-9_]*$/i.test(c))
    .filter((c) => !OPTIUNI_NU_COLOANE.has(c));
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
  /*
   * ⚠ PGRST205 = TABELUL NU EXISTA, si asta NU e „neverificabil" — e chiar paguba pe care
   * unealta o pazeste, in forma ei cea mai mare.
   *
   * Pana acum cadea pe ramura de mai jos, adica un AVERTISMENT care nu schimba codul de iesire.
   * Deci daca singura problema era ca tot tabelul lipseste — exact ce se intampla cand codul
   * pleaca inaintea migratiei — unealta iesea cu 0 si lasa push-ul sa treaca. O coloana lipsa
   * bloca; un TABEL lipsa, nu.
   */
  if (corp?.code === "PGRST205") return { fel: "tabel_lipsa" };

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

/*
 * ⚠ CONSTANTELE SE STRANG DIN TOT `src`, NU DIN FISIERUL CURENT.
 *
 * `COLOANE_PROIECTIE` se declara in `din-proiectie.ts` si se FOLOSESTE in `pagina-magazin.tsx`
 * si in cautare — exact tiparul obisnuit pentru o lista de coloane. Cautata doar in fisierul
 * care o cheama, n-ar fi fost gasita niciodata, si tocmai selectul cu pedeapsa cea mai mare ar
 * fi ramas neverificat: PostgREST pica INTREAGA interogare la o coloana necunoscuta, deci acolo
 * greseala nu inseamna un camp lipsa, ci grila goala pe toata platforma.
 *
 * ⚠ Un nume declarat de DOUA ori, cu valori diferite, se ARUNCA: nu se poate sti care se
 * foloseste unde, iar o ghicire gresita ar da o alarma falsa — si o unealta care da alarme
 * false nu se mai citeste tocmai cand are dreptate.
 */
const toateFisierele = fisiere("src");
const constanteGlobale = new Map();
const ambigue = new Set();
for (const cale of toateFisierele) {
  const text = readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
  for (const [nume, val] of constantele(text)) {
    if (constanteGlobale.has(nume) && constanteGlobale.get(nume) !== val) ambigue.add(nume);
    else constanteGlobale.set(nume, val);
  }
}
for (const nume of ambigue) constanteGlobale.delete(nume);

for (const cale of toateFisierele) {
  const text = readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
  for (const { tabel, lista } of cereriDinFisier(text, constanteGlobale)) {
    for (const col of coloaneDin(lista)) {
      const m = cerute.get(tabel);
      if (!m.has(col)) m.set(col, cale);
    }
  }
  /* Si coloanele SCRISE. Se verifica prin acelasi `select=`: daca PostgREST
     poate CITI numele, atunci coloana exista, deci scrierea nu va fi respinsa
     din pricina lui. */
  for (const { tabel, coloane } of scrieriDinFisier(text)) {
    const m = cerute.get(tabel);
    for (const col of coloane) if (!m.has(col)) m.set(col, cale + " (scriere)");
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
  if (r.fel === "tabel_lipsa") {
    lipsuri += coloane.size;
    console.error(`LIPSA     ${tabel}: TABELUL nu exista in PostgREST (${coloane.size} coloane cerute de cod)`);
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
