import test from "node:test";
import assert from "node:assert/strict";
import * as aplicatia from "./latimi-imagini";
import { esteIncarcareDeCumparator as incarcareAplicatie } from "./customization/adresa";
import worker, * as w from "../../infra/cloudflare/imagini-directe/worker.js";

/**
 * WORKERUL `imagini-directe` — regulile lui si purtarea lui, fara Cloudflare.
 *
 * ═══ ⚠ CE APARA ═══
 *
 * 1. REGULILE SUNT O COPIE. Workerul nu poate importa din `src/`, deci treptele, `KEY_RE` si
 *    regula fisierelor de cumparator sunt scrise a doua oara in el. Despartite, ori Workerul refuza
 *    adrese pe care pagina le da (POZA RUPTA, 404), ori serveste chei pe care ruta le refuza
 *    (fisierele cumparatorilor ar fi iesit pe un domeniu public).
 *
 * 2. O VARIANTA LIPSA TRIMITE LA RUTA, nu da 404 — altfel prima afisare a oricarei poze noi e o
 *    poza rupta. Si 302-ul acela nu se tine in cache, altfel browserul ar ocoli prin ruta pentru
 *    totdeauna.
 *
 * 3. NIMIC DIN AFARA VARIANTELOR NU ATINGE GALEATA: originalele si fisierele cumparatorilor nu se
 *    pot citi prin hostname-ul Workerului.
 */

/* ── Galeata si cache-ul, simulate ─────────────────────────────────────────── */

type Obiect = { body: ReadableStream; size: number; httpEtag: string };

function galeata(continut: Record<string, string>) {
  const atinse: string[] = [];
  const obiect = (cheie: string): Obiect | null => {
    atinse.push(cheie);
    if (!(cheie in continut)) return null;
    const octeti = new TextEncoder().encode(continut[cheie]);
    return { body: new Response(octeti).body!, size: octeti.length, httpEtag: `"etag-${cheie.length}"` };
  };
  return { atinse, IMAGINI: { get: async (k: string) => obiect(k), head: async (k: string) => obiect(k) } };
}

function cacheSimulat() {
  const intrari = new Map<string, Response>();
  const puse: string[] = [];
  const cache = {
    match: async (r: Request) => intrari.get(r.url)?.clone(),
    put: async (r: Request, raspuns: Response) => { puse.push(r.url); intrari.set(r.url, raspuns); },
  };
  (globalThis as unknown as { caches: unknown }).caches = { default: cache };
  return { intrari, puse };
}

function context() {
  const asteptate: Promise<unknown>[] = [];
  return { asteptate, ctx: { waitUntil: (p: Promise<unknown>) => { asteptate.push(p); } } };
}

const GAZDA = "https://img.de-proba.exemplu";
const ORIGINE = "https://www.platforma.exemplu";
const CHEIE = "products/11111111-1111-4111-8111-111111111111/poza.webp";
const OBIECT = `_optim/w640q75/${CHEIE}.webp`;

async function cere(cale: string, env: object, metoda = "GET") {
  const { ctx, asteptate } = context();
  const r = await worker.fetch(new Request(`${GAZDA}${cale}`, { method: metoda }), env as never, ctx);
  await Promise.all(asteptate);
  return r;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. REGULILE — aceleasi ca ale aplicatiei
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ treptele si regula cheilor din Worker sunt EXACT cele ale aplicatiei", () => {
  assert.deepEqual(w.TREPTE_LATIME, [...aplicatia.TREPTE_LATIME]);
  assert.deepEqual(w.TREPTE_CALITATE, [...aplicatia.TREPTE_CALITATE]);
  assert.equal(w.KEY_RE.source, aplicatia.KEY_RE.source);
  assert.equal(w.KEY_RE.flags, aplicatia.KEY_RE.flags);
});

test("⚠ Workerul si aplicatia raspund la fel pentru chei bune, rele si viclene", () => {
  const chei = [
    CHEIE, "logos/u/a.png", "covers/u/a.JPG", "gallery/a/b.gif", "avatars/u/a.avif", "products/u/a.jpeg",
    "products/customizations/u/a.webp", "products/u/customizations/x.webp", "PRODUCTS/CUSTOMIZATIONS/a.webp",
    "products//customizations/a.webp", "products/./customizations/a.webp", "logos/products/customizations/a.png",
    "products/../secrete.webp", "products/u/a.pdf", "products/u/a.webp.exe", "altele/u/a.webp", "",
    "products/u/cu spatiu.webp", "products/u/%2e%2e/a.webp", "products/u/ä.webp", "/products/u/a.webp",
  ];
  for (const c of chei) {
    assert.equal(w.esteIncarcareDeCumparator(c), incarcareAplicatie(c), `fisier de cumparator, parere diferita: ${c}`);
    assert.equal(w.cheieOptimizabila(c), aplicatia.cheieOptimizabila(c), `cheie optimizabila, parere diferita: ${c}`);
  }
});

test("calea se citeste numai la trepte si chei pe care ruta le scrie", () => {
  assert.deepEqual(w.variantaCeruta(`/${OBIECT}`), { latime: 640, calitate: 75, cheie: CHEIE, obiect: OBIECT });
  for (const cale of [
    `/${CHEIE}`, // originalul, nu o varianta
    `/_optim/w641q75/${CHEIE}.webp`, // latime din afara treptelor
    `/_optim/w640q80/${CHEIE}.webp`, // calitate din afara treptelor
    `/_optim/w640q75/${CHEIE}.png`, // PNG-ul de email nu se serveste pe aici
    `/_optim/w640q75/products/customizations/u/a.webp.webp`, // fisier de cumparator
    `/_optim/w640q75/products/u/%2e%2e/a.webp.webp`, // nu se decodeaza
    `/_optim/w640q75/products/../a.webp.webp`,
    `/_optim/w640q75/altele/a.webp.webp`,
    `/_optim//w640q75/${CHEIE}.webp`,
    `/_optim/w00640q75/${CHEIE}.webp`,
    "/", "/_optim/", "/favicon.ico",
  ]) {
    assert.equal(w.variantaCeruta(cale), null, `trebuia refuzata: ${cale}`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. PURTAREA
   ═══════════════════════════════════════════════════════════════════════════ */

test("varianta din galeata se da cu 200, WebP, immutable, si intra in cache", async () => {
  const { puse } = cacheSimulat();
  const g = galeata({ [OBIECT]: "OCTETI" });
  const r = await cere(`/${OBIECT}`, { ...g, ORIGINE });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/webp");
  assert.equal(r.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(r.headers.get("content-length"), "6");
  assert.ok(r.headers.get("etag"));
  assert.equal(await r.text(), "OCTETI");
  assert.deepEqual(puse, [`${GAZDA}/${OBIECT}`]);
});

test("a doua cerere vine din cache, fara sa mai atinga galeata; interogarea nu face alta intrare", async () => {
  cacheSimulat();
  const g = galeata({ [OBIECT]: "OCTETI" });
  await cere(`/${OBIECT}`, { ...g, ORIGINE });
  const r = await cere(`/${OBIECT}?ocolire=123`, { ...g, ORIGINE });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "OCTETI");
  assert.equal(g.atinse.length, 1, "a doua cerere trebuia servita din cache");
});

test("⚠ varianta LIPSA trimite browserul la /api/img (302, no-store), nu da 404", async () => {
  const { puse } = cacheSimulat();
  const g = galeata({});
  for (const [cale, w, q] of [[`/${OBIECT}`, 640, 75], [`/_optim/w1920q95/logos/u/a.png.webp`, 1920, 95]] as const) {
    const r = await cere(cale, { ...g, ORIGINE: `${ORIGINE}/` });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const dest = new URL(r.headers.get("location")!);
    assert.equal(dest.origin + dest.pathname, `${ORIGINE}/api/img`);
    const cheie = cale.replace(/^\/_optim\/w\d+q\d+\//, "").replace(/\.webp$/, "");
    assert.equal(dest.searchParams.get("p"), cheie);
    assert.equal(dest.searchParams.get("w"), String(w));
    assert.equal(dest.searchParams.get("q"), String(q));
    /* Ce cere ruta scrie exact obiectul pe care l-a cautat Workerul. */
    assert.equal(aplicatia.cheieVarianta(cheie, aplicatia.latimeaVariantei(w), aplicatia.calitateaVariantei(q)), cale.slice(1));
  }
  assert.deepEqual(puse, [], "un 302 sau un 404 nu au voie in cache");
});

test("⚠ caile refuzate dau 404 FARA sa atinga galeata", async () => {
  cacheSimulat();
  const g = galeata({ [CHEIE]: "ORIGINAL", "products/customizations/u/a.webp": "FISIER" });
  for (const cale of [`/${CHEIE}`, "/products/customizations/u/a.webp", "/_optim/w640q75/products/customizations/u/a.webp.webp", "/"]) {
    const r = await cere(cale, { ...g, ORIGINE });
    assert.equal(r.status, 404, cale);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(g.atinse, []);
});

test("fara ORIGINE, o varianta lipsa da 404 (nu un 302 catre nicaieri)", async () => {
  cacheSimulat();
  const r = await cere(`/${OBIECT}`, { ...galeata({}) });
  assert.equal(r.status, 404);
});

test("HEAD raspunde fara corp; alte metode dau 405", async () => {
  cacheSimulat();
  const g = galeata({ [OBIECT]: "OCTETI" });
  const h = await cere(`/${OBIECT}`, { ...g, ORIGINE }, "HEAD");
  assert.equal(h.status, 200);
  assert.equal(h.headers.get("content-type"), "image/webp");
  assert.equal(await h.text(), "");
  for (const m of ["POST", "PUT", "DELETE"]) {
    const r = await cere(`/${OBIECT}`, { ...g, ORIGINE }, m);
    assert.equal(r.status, 405, m);
  }
});
