import test from "node:test";
import assert from "node:assert/strict";
import { TEME } from "@/lib/teme/teme";
import { prepareBlocksForPublic } from "@/lib/pages/prepare-blocks";
import type { Block } from "@/lib/pages/blocks.types";
import { CHEI_PC_CIORNA, jsonCanonic, parseContinutCiorna } from "./continut-ciorna";
import { MAX_PRODUCT_IDS, MAX_REPEATER_ITEMS, MAX_TEXT, MAX_TEXTAREA, faraControl, sanitizeColor, sanitizeHref, sanitizeImage } from "./curatare";
import { styleToCssVars } from "./css-vars";
import { resolveStyle } from "./defaults";
import { parseStoreDesign } from "./parse";
import { sectionMeta, type Field } from "./registry";
import type { DesignContext, SectionInstance, StoreDesign } from "./types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  INTRARI OSTILE: PARSERUL DESIGNULUI NU ARE VOIE SA CADA, SA DEVIEZE SAU SA LASE CEVA NECURATAT
  ═══════════════════════════════════════════════════════════════════════════

  Auditul din 19.11.2026. Designul si ciorna sunt `jsonb` pe care comerciantul si le poate scrie si direct, pe langa
  editor, iar `saveDesignDraft` / `publishDesign` primesc orice trimite browserul. Probele de pana acum verificau
  forme anume (un link `javascript:`, o culoare stricata); nimic nu incerca intrari STRICATE LA INTAMPLARE peste designuri
  adevarate.

  Aici, designul fiecareia din cele 30 de teme e stricat in sute de feluri (valori ostile puse la intamplare pe orice
  cale, chei sterse, liste dublate), cu un generator cu samanta fixa (aceleasi mutatii la fiecare rulare), si se cere:
   1. parserul nu arunca niciodata si nu sta mult;
   2. e STABIL: parsat a doua oara, designul iese identic (garda de concurenta a ciornei se sprijina pe asta);
   3. fiecare reglaj ramas respecta campul lui din registru (link curat, culoare curata, optiune din lista, limite);
   4. nimic nu ajunge in prototipul obiectelor;
   5. stilul rezolvat nu poate adauga proprietati CSS (niciun `;`, `{`, `}`, `<` in variabilele `--st-*`).
*/

const CTX: DesignContext = { primaryColor: "#0B3D7A", pageContent: {}, features: {} };

/*
 * Cate mutatii pe tema si cu ce samanta. In suita: 40 x 30 de teme, mereu aceleasi. La o cautare mai adanca (dupa o
 * schimbare in parser sau in registru): `RUNDE_OSTILE=2000 SAMANTA_OSTILE=7 npm test -- ...intrari-ostile.test.ts`.
 */
const RUNDE = Number(process.env.RUNDE_OSTILE) || 40;
const SAMANTA = Number(process.env.SAMANTA_OSTILE) || 20261119;

/** Generator cu samanta (mulberry32): aceleasi mutatii la fiecare rulare, deci o cadere se poate reproduce. */
function aleator(samanta: number): () => number {
  let a = samanta >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const adanc = (n: number): unknown => (n === 0 ? "fund" : { a: adanc(n - 1) });

/** Valorile ostile. Functie, nu constanta: fiecare mutatie primeste obiecte proaspete. */
function ostile(): unknown[] {
  return [
    null, true, false, 0, -1, 1.5, 1e308, -1e308, Number.NaN, Number.POSITIVE_INFINITY,
    "", " ", "\n", "a".repeat(100_000), "ă".repeat(5000),
    "<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "\"><svg onload=alert(1)>", "</style><script>alert(1)</script>",
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)", "\u0001javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "//rau.example/x", "https://rau.example/?a=<b>",
    "#fff;position:fixed;inset:0;background:url(//rau.example/x)", "red;}</style><script>alert(1)</script>", "var(--x);color:red",
    "url(javascript:alert(1))", "expression(alert(1))", "rgb(0,0,0);x:y", "#12345", "#GGGGGG",
    "${alert(1)}", "{{constructor.constructor('alert(1)')()}}", "__proto__", "constructor", "toString",
    [], [[]], [{}], [null, undefined, 1, "x"], Array.from({ length: 3000 }, (_, i) => i), Array.from({ length: 200 }, () => ({ kind: "hero", variant: "banners" })),
    {}, { length: 5 }, { toString: "x" }, { valueOf: 1 }, adanc(60),
    JSON.parse('{"__proto__":{"poluat":true}}'), JSON.parse('{"constructor":{"prototype":{"poluat":true}}}'),
    { kind: "hero" }, { kind: "nu-exista" }, { kind: "product_page", variant: "classic", id: "x" }, { id: "x".repeat(500), kind: "footer", variant: "dark" },
  ];
}

type Cale = (string | number)[];

/** Toate caile dintr-un JSON, pana la o adancime; destule ca mutatiile sa nimereasca peste tot. */
function cai(v: unknown, cale: Cale = [], out: Cale[] = [], adancime = 0): Cale[] {
  if (out.length > 4000 || adancime > 8) return out;
  if (Array.isArray(v)) {
    v.forEach((x, i) => { out.push([...cale, i]); cai(x, [...cale, i], out, adancime + 1); });
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) { out.push([...cale, k]); cai(x, [...cale, k], out, adancime + 1); }
  }
  return out;
}

function pune(radacina: unknown, cale: Cale, f: (parinte: Record<string | number, unknown>, cheie: string | number) => void): void {
  let p = radacina as Record<string | number, unknown>;
  for (const k of cale.slice(0, -1)) {
    const urm = p?.[k];
    if (!urm || typeof urm !== "object") return;
    p = urm as Record<string | number, unknown>;
  }
  f(p, cale[cale.length - 1]);
}

/** Un design stricat: intre una si patru mutatii la intamplare peste designul unei teme. */
function mutant(baza: StoreDesign, r: () => number): unknown {
  const d = structuredClone(baza) as unknown;
  const toate = cai(d);
  const valori = ostile();
  const cate = 1 + Math.floor(r() * 4);
  for (let i = 0; i < cate; i++) {
    const cale = toate[Math.floor(r() * toate.length)];
    const fel = r();
    pune(d, cale, (p, k) => {
      if (fel < 0.6) p[k] = valori[Math.floor(r() * valori.length)];
      else if (fel < 0.75) { if (Array.isArray(p)) p.splice(Number(k), 1); else delete p[k]; }
      else if (fel < 0.9 && Array.isArray(p)) p.splice(Number(k), 0, structuredClone(p[k]), structuredClone(p[k]));
      else p[k] = { [String(k)]: p[k], kind: "hero", variant: 42, settings: valori[Math.floor(r() * valori.length)] };
    });
  }
  return d;
}

/** Prima cale la care doua JSON-uri difera, cu cele doua valori: mesajul unei caderi spune UNDE, nu doar ca difera. */
function primaDiferenta(a: unknown, b: unknown, cale = "$"): string | null {
  if (jsonCanonic(a) === jsonCanonic(b)) return null;
  const obiect = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";
  if (!obiect(a) || !obiect(b) || Array.isArray(a) !== Array.isArray(b)) {
    return `${cale}: ${JSON.stringify(a)?.slice(0, 140)} != ${JSON.stringify(b)?.slice(0, 140)}`;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = primaDiferenta(a[k], b[k], Array.isArray(a) ? `${cale}[${k}]` : `${cale}.${k}`);
    if (d) return d;
  }
  return `${cale}: (difera doar prin chei)`;
}

/** Un reglaj respecta campul lui din registru: ce a lasat parserul e exact ce ar lasa curatarea. */
function verificaCamp(camp: Field, valoare: unknown, unde: string): void {
  if (valoare === undefined) return;
  switch (camp.type) {
    case "text":
      assert.equal(typeof valoare, "string", unde);
      assert.ok((valoare as string).length <= (camp.maxLength ?? MAX_TEXT), `${unde}: text peste limita`);
      break;
    case "textarea":
      assert.equal(typeof valoare, "string", unde);
      assert.ok((valoare as string).length <= (camp.maxLength ?? MAX_TEXTAREA), `${unde}: text lung peste limita`);
      break;
    case "category":
      assert.equal(typeof valoare, "string", unde);
      assert.ok((valoare as string).length <= MAX_TEXT, unde);
      break;
    case "link": {
      assert.equal(sanitizeHref(valoare), valoare, `${unde}: link necuratat ${JSON.stringify(valoare).slice(0, 60)}`);
      const v = faraControl(valoare as string).toLowerCase();
      assert.ok(!/^(javascript|data|vbscript):/.test(v), `${unde}: schema periculoasa`);
      break;
    }
    case "color":
      assert.equal(sanitizeColor(valoare), valoare, `${unde}: culoare necuratata ${JSON.stringify(valoare).slice(0, 60)}`);
      assert.doesNotMatch(valoare as string, /[;{}<>"']/, `${unde}: culoarea poate iesi din proprietatea ei`);
      break;
    case "image":
      assert.equal(sanitizeImage(valoare), valoare, `${unde}: imagine necuratata`);
      break;
    case "toggle":
      assert.equal(typeof valoare, "boolean", unde);
      break;
    case "select":
      assert.ok(camp.options.some((o) => o.value === valoare), `${unde}: optiune din afara listei`);
      break;
    case "range":
      assert.ok(typeof valoare === "number" && valoare >= camp.min && valoare <= camp.max, `${unde}: in afara limitelor`);
      break;
    case "icon":
      assert.match(valoare as string, /^[A-Za-z0-9]{1,40}$/, unde);
      break;
    case "products":
      assert.ok(Array.isArray(valoare) && valoare.length <= MAX_PRODUCT_IDS && valoare.every((x) => typeof x === "string" && x.length <= 64), unde);
      break;
    case "actions":
      assert.ok(Array.isArray(valoare), unde);
      for (const a of valoare as { key: string; on: boolean }[]) {
        assert.ok(camp.options.some((o) => o.value === a.key) && typeof a.on === "boolean", `${unde}: actiune necunoscuta`);
      }
      break;
    case "repeater":
      assert.ok(Array.isArray(valoare) && valoare.length <= (camp.max ?? MAX_REPEATER_ITEMS), `${unde}: lista peste limita`);
      for (const [i, element] of (valoare as Record<string, unknown>[]).entries()) {
        for (const sub of camp.fields) verificaCamp(sub, element[sub.key], `${unde}[${i}].${sub.key}`);
      }
      break;
  }
}

function sectiuni(d: StoreDesign): SectionInstance[] {
  const lista: (SectionInstance | null | undefined)[] = [
    d.chrome.announcement, d.chrome.header, d.chrome.footer, ...d.home, d.product.page, ...(d.product.sabloane ?? []).map((s) => s.page),
    ...Object.values(d.shop ?? {}), ...Object.values(d.commerce ?? {}),
  ] as (SectionInstance | null | undefined)[];
  return lista.filter((s): s is SectionInstance => !!s && typeof s === "object" && typeof (s as SectionInstance).kind === "string");
}

function verificaDesignul(d: StoreDesign, unde: string): void {
  const iduri = new Set<string>();
  for (const s of sectiuni(d)) {
    const meta = sectionMeta(s.kind);
    assert.ok(meta, `${unde}: sectiune de un fel necunoscut (${String(s.kind)})`);
    assert.ok(meta.variants[s.variant], `${unde}: varianta necunoscuta ${s.kind}/${s.variant}`);
    assert.ok(typeof s.id === "string" && s.id.length > 0 && s.id.length <= 64, `${unde}: id de sectiune stricat`);
    assert.ok(!iduri.has(s.id), `${unde}: id de sectiune dublat (${s.id})`);
    iduri.add(s.id);
    assert.equal(typeof s.enabled, "boolean", `${unde}: \`enabled\` nu e boolean`);
    // Reglajele: fata de campurile TUTUROR variantelor sectiunii, cum le curata si parserul. Cand doua variante au un
    // camp cu aceeasi cheie (`carduri`, cu alt plafon), parserul il curata pe rand cu fiecare si ramane ULTIMUL: la fel aici.
    const campuri = new Map<string, Field>();
    for (const v of Object.values(meta.variants)) for (const c of v.fields) campuri.set(c.key, c);
    for (const [cheie, valoare] of Object.entries(s.settings ?? {})) {
      const camp = campuri.get(cheie);
      if (camp) verificaCamp(camp, valoare, `${unde}: ${s.kind}.${cheie}`);
    }
  }
  assert.ok(d.home.length <= 40, `${unde}: prea multe sectiuni pe prima pagina`);
  assert.ok(d.home.some((s) => s.kind === "product_grid"), `${unde}: catalogul a disparut de pe prima pagina`);
  assert.equal(d.chrome.header.enabled, true, `${unde}: antetul s-a putut stinge`);
  assert.equal(d.chrome.footer.enabled, true, `${unde}: subsolul s-a putut stinge`);
}

test("⚠⚠ designul fiecarei teme, stricat la intamplare: parserul nu cade, e stabil si lasa doar reglaje curate", () => {
  const r = aleator(SAMANTA);
  let incercate = 0;
  let celMaiLent = 0;
  for (const tema of TEME) {
    const baza = tema.design(CTX, tema.date);
    // Intai designul bun: trece neschimbat prin a doua parsare (altfel proba de mai jos n-ar masura mutatiile).
    const curat = parseStoreDesign(baza, CTX);
    assert.equal(jsonCanonic(parseStoreDesign(curat, CTX)), jsonCanonic(curat), `${tema.cheie}: designul temei nu e stabil la parsare`);
    for (let i = 0; i < RUNDE; i++) {
      const stricat = mutant(baza, r);
      const t0 = performance.now();
      let d: StoreDesign;
      try {
        d = parseStoreDesign(stricat, CTX);
      } catch (e) {
        const unde = e instanceof Error ? (e.stack ?? "").split("\n").slice(1, 4).map((l) => l.trim().replace(/^at /, "").replace(/\(file:.*\/src\//, "(src/")).join(" <- ") : "";
        assert.fail(`${tema.cheie}, mutatia ${i}: parserul a ARUNCAT (${e instanceof Error ? e.message : String(e)}) ${unde}`);
      }
      celMaiLent = Math.max(celMaiLent, performance.now() - t0);
      verificaDesignul(d, `${tema.cheie}#${i}`);
      const aDoua = parseStoreDesign(JSON.parse(JSON.stringify(d)), CTX);
      if (jsonCanonic(aDoua) !== jsonCanonic(d)) {
        assert.fail(`${tema.cheie}, mutatia ${i}: a doua parsare da alt design, la ${primaDiferenta(JSON.parse(JSON.stringify(d)), JSON.parse(JSON.stringify(aDoua)))}`);
      }
      // Stilul rezolvat: nicio variabila nu poate inchide proprietatea ei.
      for (const [nume, valoare] of Object.entries(styleToCssVars(resolveStyle(d.style, CTX)))) {
        assert.doesNotMatch(valoare, /[;{}<>]/, `${tema.cheie}, mutatia ${i}: ${nume} = ${valoare.slice(0, 60)}`);
      }
      incercate++;
    }
  }
  assert.equal(incercate, TEME.length * RUNDE);
  assert.ok(celMaiLent < 1500, `o parsare a durat ${Math.round(celMaiLent)} ms`);
  // 4. Nimic in prototip.
  assert.equal(({} as Record<string, unknown>).poluat, undefined, "o intrare a ajuns in prototipul obiectelor");
});

test("⚠⚠ continutul magazinului stricat (`page_content`): derivarea designului nu cade si ramane stabila", () => {
  /*
   * Designul „clasic” si starea sectiunilor derivate se citesc din `page_content` la FIECARE parsare, iar valorile lui
   * nu se valideaza la scriere (le curata cititorii). Un rand de produse care e un numar, o lista de bannere care e un
   * sir, un semn care e un obiect: nimic din astea n-are voie sa darame pagina magazinului.
   */
  const r = aleator(SAMANTA + 1);
  const chei = [...CHEI_PC_CIORNA, "product_sections", "hero_banners", "store_benefits_section", "reviews_section", "menu", "pagina_acasa", "checkout_config", "permalinks", "magazin_demo", "tema_aplicata", "date_demo"];
  const valori = ostile();
  let incercate = 0;
  for (const tema of TEME) {
    for (let i = 0; i < Math.max(10, Math.floor(RUNDE / 2)); i++) {
      const pc: Record<string, unknown> = {};
      const cate = 1 + Math.floor(r() * 6);
      for (let j = 0; j < cate; j++) pc[chei[Math.floor(r() * chei.length)]] = valori[Math.floor(r() * valori.length)];
      const ctx: DesignContext = {
        primaryColor: r() < 0.2 ? (valori[Math.floor(r() * valori.length)] as string) : "#0B3D7A",
        pageContent: pc,
        features: r() < 0.3 ? (valori[Math.floor(r() * valori.length)] as Record<string, unknown>) : {},
        coverUrl: r() < 0.3 ? (valori[Math.floor(r() * valori.length)] as string) : null,
        tagline: r() < 0.3 ? (valori[Math.floor(r() * valori.length)] as string) : null,
      };
      for (const [fel, brut] of [["clasic", {}], ["tema", tema.design(CTX, tema.date)]] as const) {
        let d: StoreDesign;
        try {
          d = parseStoreDesign(brut, ctx);
        } catch (e) {
          const unde = e instanceof Error ? (e.stack ?? "").split("\n").slice(1, 4).map((l) => l.trim().replace(/^at /, "").replace(/\(file:.*\/src\//, "(src/")).join(" <- ") : "";
          assert.fail(`${tema.cheie}/${fel}, continutul ${i}: parserul a ARUNCAT (${e instanceof Error ? e.message : String(e)}) ${unde}\n  page_content: ${JSON.stringify(pc)?.slice(0, 300)}`);
        }
        /*
         * Designul clasic (magazin fara design salvat) nu are plafonul de 40 de sectiuni: un magazin cu zeci de randuri
         * de produse le arata pe toate, ca inainte de sistemul de design. Plafonul vine la prima salvare, deci aici a
         * doua parsare ar taia; cazul e al continutului (sute de randuri), nu al parserului, si se sare.
         */
        if (fel === "clasic" && d.home.length > 40) { incercate++; continue; }
        verificaDesignul(d, `${tema.cheie}/${fel}#${i}`);
        const aDoua = parseStoreDesign(JSON.parse(JSON.stringify(d)), ctx);
        if (jsonCanonic(aDoua) !== jsonCanonic(d)) {
          assert.fail(`${tema.cheie}/${fel}, continutul ${i}: a doua parsare da alt design, la ${primaDiferenta(JSON.parse(JSON.stringify(d)), JSON.parse(JSON.stringify(aDoua)))}\n  page_content: ${JSON.stringify(pc)?.slice(0, 300)}`);
        }
        let variabile: Record<string, string>;
        try {
          variabile = styleToCssVars(resolveStyle(d.style, ctx));
        } catch (e) {
          assert.fail(`${tema.cheie}/${fel}, continutul ${i}: stilul a ARUNCAT (${e instanceof Error ? e.message : String(e)})`);
        }
        for (const [nume, valoare] of Object.entries(variabile)) assert.doesNotMatch(valoare, /[;{}<>]/, `${tema.cheie}/${fel}#${i}: ${nume}`);
        incercate++;
      }
    }
  }
  assert.ok(incercate >= TEME.length * 20);
  assert.equal(({} as Record<string, unknown>).poluat, undefined);
});

test("intrari care nu sunt deloc un design: tot un design valid, cel clasic", () => {
  for (const [i, v] of [undefined, ...ostile()].entries()) {
    const d = parseStoreDesign(v, CTX);
    verificaDesignul(d, `ostil#${i}`);
    // Si cu versiunea buna in fata, ca intrarea sa treaca de „design gol” si sa ajunga la parsarea propriu-zisa.
    const cuVersiune = v && typeof v === "object" && !Array.isArray(v) ? { ...(v as object), version: 1 } : { version: 1, home: v, chrome: v, product: v, shop: v, commerce: v, style: v, sterse: v };
    verificaDesignul(parseStoreDesign(cuVersiune, CTX), `ostil-cu-versiune#${i}`);
  }
  assert.equal(({} as Record<string, unknown>).poluat, undefined);
});

test("⚠ culoarea magazinului si fundalul din „Stil” nu pot adauga proprietati CSS (ajung in `style`, ca variabile)", () => {
  // Auditul din 19.11.2026: `businesses.primary_color` e text fara constrangere, iar `store_bg_color` o valoare libera.
  for (const rea of ["#fff;position:fixed;inset:0", "red;}</style><script>alert(1)</script>", "url(//rau.example/x)", "rgb(0,0,0);x:y", "var(--x);color:red", "", "  ", "#12345"]) {
    const ctx: DesignContext = { primaryColor: rea, pageContent: { store_bg_color: rea }, features: {} };
    const variabile = styleToCssVars(resolveStyle(parseStoreDesign({}, ctx).style, ctx));
    for (const [nume, valoare] of Object.entries(variabile)) {
      assert.doesNotMatch(valoare, /[;{}<>]/, `${JSON.stringify(rea)} a ajuns in ${nume}: ${valoare}`);
      assert.ok(!valoare.includes("rau.example"), `${nume} poarta adresa straina`);
    }
    assert.equal(variabile["--st-primary"], "#07c527", "o culoare nevalida cade pe culoarea platformei");
    assert.equal(variabile["--st-bg"], "var(--color-background)", "un fundal nevalid cade pe fundalul implicit");
  }
  // Culorile bune trec neschimbate, in toate formele pe care le-a putut salva un magazin.
  for (const buna of ["#0B3D7A", "#abc", "#11223344", "rgb(10, 20, 30)", "hsl(210 50% 40%)", "tomato"]) {
    const ctx: DesignContext = { primaryColor: buna, pageContent: { store_bg_color: buna }, features: {} };
    const variabile = styleToCssVars(resolveStyle(parseStoreDesign({}, ctx).style, ctx));
    assert.equal(variabile["--st-primary"], buna);
    assert.equal(variabile["--st-bg"], buna);
  }
});

test("continutul ciornei, cu intrari ostile: doar cheile de pe lista, doar adrese si culori curate", () => {
  for (const [i, v] of ostile().entries()) {
    const c = parseContinutCiorna({ pc: v, magazin: v, scoase: v });
    assert.deepEqual(Object.keys(c).sort().filter((k) => k !== "scoase"), ["magazin", "pc"], `ostil#${i}`);
    const m = parseContinutCiorna({ magazin: { logo_url: v, cover_url: v, primary_color: v, gallery: [v, v, "https://exemplu.ro/a.png"] } }).magazin;
    for (const url of [m.logo_url, m.cover_url, ...(m.gallery ?? [])]) {
      if (url === null || url === undefined) continue;
      assert.match(url, /^(https?:\/\/|\/)/, `ostil#${i}: adresa de imagine ${String(url).slice(0, 40)}`);
    }
    if (m.primary_color !== undefined) assert.match(m.primary_color, /^#[0-9A-Fa-f]{6}$/);
  }
  assert.equal(({} as Record<string, unknown>).poluat, undefined);
});

test("⚠⚠ blocurile cu HTML ostil ies curate din poarta de randare (text, coloane, cod fara JavaScript)", () => {
  const rele = [
    "<img src=x onerror=alert(1)>", "<svg onload=alert(1)></svg>", "<a href=\"javascript:alert(1)\">x</a>", "<a href=\"java\tscript:alert(1)\">x</a>",
    "<iframe src=\"javascript:alert(1)\"></iframe>", "<iframe srcdoc=\"&lt;script&gt;alert(1)&lt;/script&gt;\"></iframe>", "<iframe src=\"https://rau.example/\"></iframe>",
    "<object data=\"https://rau.example/x.swf\"></object>", "<embed src=\"https://rau.example/x\">", "<meta http-equiv=\"refresh\" content=\"0;url=javascript:alert(1)\">",
    "<base href=\"https://rau.example/\">", "<link rel=\"stylesheet\" href=\"https://rau.example/x.css\">", "<math><maction actiontype=\"statusline#\" xlink:href=\"javascript:alert(1)\">x</maction></math>",
    "<style>a{}</style/><img src=x onerror=alert(1)>", "<p style=\"background:url(javascript:alert(1))\">x</p>", "<div onclick=alert(1) OnMouseOver=alert(2)>x</div>",
    "<form action=\"https://rau.example/\"><input name=parola></form>", "<script>alert(1)</script>", "<scr<script>ipt>alert(1)</scr</script>ipt>",
  ];
  /** Nimic executabil in pagina: fara `<script`, fara atribute `on...`, fara scheme periculoase, fara cadre straine. */
  const verifica = (html: string, unde: string) => {
    assert.doesNotMatch(html, /<\s*script/i, `${unde}: <script>`);
    assert.doesNotMatch(html, /<[^>]*\son[a-z]+\s*=/i, `${unde}: atribut de eveniment`);
    assert.doesNotMatch(html.replace(/[\u0000-\u001f]/g, ""), /(href|src|data|action|xlink:href)\s*=\s*["']?\s*(javascript|vbscript|data:text\/html)/i, `${unde}: schema periculoasa`);
    assert.doesNotMatch(html, /<\s*(object|embed|base|meta|link|form|input)\b/i, `${unde}: eticheta nepermisa`);
    assert.doesNotMatch(html, /srcdoc/i, `${unde}: srcdoc`);
    for (const m of html.matchAll(/<iframe[^>]*src\s*=\s*["']([^"']+)["']/gi)) {
      assert.match(m[1], /^https:\/\/(www\.youtube(-nocookie)?\.com|youtube(-nocookie)?\.com|player\.vimeo\.com|www\.google\.com|maps\.google\.com|www\.openstreetmap\.org|open\.spotify\.com|w\.soundcloud\.com)\//, `${unde}: cadru de pe alta gazda (${m[1].slice(0, 40)})`);
    }
  };
  for (const [i, rau] of rele.entries()) {
    const blocuri = [
      { id: "t", type: "text", html: rau },
      { id: "c", type: "columns", items: [{ html: rau, blocks: [{ id: "ct", type: "text", html: rau }, { id: "ch", type: "html", html: rau }] }] },
      { id: "h", type: "html", html: rau },
    ] as unknown as Block[];
    const [text, coloane, cod] = prepareBlocksForPublic(blocuri) as unknown as [{ html: string }, { items: { html: string; blocks: { type: string; html: string; js?: string }[] }[] }, { html: string; js?: string }];
    verifica(text.html, `text#${i}`);
    verifica(coloane.items[0].html, `coloana#${i}`);
    verifica(coloane.items[0].blocks[0].html, `text-in-coloana#${i}`);
    // Blocul de cod: ori a ramas intreg fiindca merge in cadrul izolat (cod activ), ori e curatat.
    for (const [bloc, unde] of [[cod, `cod#${i}`], [coloane.items[0].blocks[1], `cod-in-coloana#${i}`]] as const) {
      const izolat = /<\s*(script|form|input|select|textarea|object|embed)\b|\son[a-z]+\s*=/i.test(bloc.html);
      if (!izolat) verifica(bloc.html, unde);
    }
  }
});
