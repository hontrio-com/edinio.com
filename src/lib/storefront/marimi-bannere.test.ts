import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { CHEIE_MARIMI_BANNERE, resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import type { SectionInstance } from "@/lib/storefront/design/types";
import { cheiaDinAdresa, cuMarimileBannerelor, marimiDinBiblioteca } from "./marimi-bannere";

/*
 * Marimile bannerelor citite de pe server (13.11.2026), prin CLIENTUL REAL Supabase, contra unei baze false pe HTTP: se
 * vede exact ce cerere pleaca (tabela, filtrele pe cheia unica) si ce se face cu raspunsul.
 */

type Rand = { business_id: string; r2_key: string; width: number | null; height: number | null };
let randuri: Rand[] = [];
let cereri: URL[] = [];
let cade = false;

const baza = createServer((req: IncomingMessage, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  cereri.push(url);
  if (cade) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "baza de proba a cazut" }));
    return;
  }
  const firma = (url.searchParams.get("business_id") ?? "").replace(/^eq\./, "");
  const chei = /^in\.\((.*)\)$/.exec(url.searchParams.get("r2_key") ?? "")?.[1]
    .split(",").map((c) => c.replace(/^"|"$/g, "")) ?? [];
  const gasite = randuri.filter((r) => r.business_id === firma && chei.includes(r.r2_key))
    .map(({ r2_key, width, height }) => ({ r2_key, width, height }));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(gasite));
});

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

const hero = (variant: string, enabled = true): SectionInstance => ({ id: "hero", kind: "hero", variant, enabled, settings: {} });
const CDN = "https://edinio-cdn.com/covers/u1";

test("cheia din adresa: calea, fara domeniu si fara prefixul de redimensionare; relativele si stricatele n-au", () => {
  assert.equal(cheiaDinAdresa(`${CDN}/a.webp`), "covers/u1/a.webp");
  assert.equal(cheiaDinAdresa("https://pub-x.r2.dev/covers/u1/a.webp"), "covers/u1/a.webp");
  assert.equal(cheiaDinAdresa("https://edinio-cdn.com/cdn-cgi/image/width=800,format=auto/covers/u1/a.webp"), "covers/u1/a.webp");
  assert.equal(cheiaDinAdresa("/teme/jupiter/bannere/a.webp"), null);
  assert.equal(cheiaDinAdresa("javascript:alert(1)"), null);
  assert.equal(cheiaDinAdresa("https://"), null);
});

test("hero fara loc potrivit (text peste imagine), stins sau fara bannere: acelasi obiect, nicio cerere", async () => {
  cereri = [];
  const pc = { hero_banners: [`${CDN}/a.webp`] };
  assert.equal(await cuMarimileBannerelor("f-0", pc, [hero("overlay")], null), pc);
  assert.equal(await cuMarimileBannerelor("f-0", pc, [hero("carduri", false)], null), pc);
  assert.equal(await cuMarimileBannerelor("f-0", pc, [], null), pc);
  const gol = {};
  assert.equal(await cuMarimileBannerelor("f-0", gol, [hero("carduri")], null), gol);
  // Doar poze ale temelor (relative): nimic de cautat in Biblioteca.
  const teme = { hero_banners: ["/teme/jupiter/bannere/a.webp"] };
  assert.equal(await cuMarimileBannerelor("f-0", teme, [hero("carduri")], null), teme);
  assert.equal(cereri.length, 0);
});

test("eSafe: o singura cerere, pe cheia unica (firma + r2_key); marimile ajung pe adresa, aliniate cu bannerele", async () => {
  cereri = [];
  randuri = [
    { business_id: "f-esafe", r2_key: "covers/u1/a.webp", width: 1600, height: 900 },
    { business_id: "f-esafe", r2_key: "covers/u1/b.webp", width: 1600, height: 900 },
    // Aceeasi cheie la alt magazin: nu se amesteca.
    { business_id: "alt-magazin", r2_key: "covers/u1/c.webp", width: 10, height: 10 },
    // Inregistrata fara dimensiuni (incarcari vechi): ramane fara marime.
    { business_id: "f-esafe", r2_key: "covers/u1/d.webp", width: null, height: null },
  ];
  const pc = { hero_banners: [`${CDN}/a.webp`, `${CDN}/b.webp`, `${CDN}/c.webp`, `${CDN}/d.webp`, "/teme/x.webp"] };
  const rez = await cuMarimileBannerelor("f-esafe", pc, [hero("carduri")], null);

  assert.equal(cereri.length, 1);
  assert.equal(cereri[0].pathname, "/rest/v1/media_library");
  assert.equal(cereri[0].searchParams.get("business_id"), "eq.f-esafe");
  assert.match(cereri[0].searchParams.get("r2_key") ?? "", /^in\.\(/);
  assert.deepEqual(rez[CHEIE_MARIMI_BANNERE], { [`${CDN}/a.webp`]: [1600, 900], [`${CDN}/b.webp`]: [1600, 900] });
  // Restul `page_content` neatins, iar obiectul primit nu se modifica.
  assert.deepEqual(rez.hero_banners, pc.hero_banners);
  assert.equal(CHEIE_MARIMI_BANNERE in pc, false);
  assert.deepEqual(resolveHeroBanners(rez).marimi, [[1600, 900], [1600, 900], null, null, null]);

  // A doua randare nu mai intreaba baza: adresa unei poze nu se schimba.
  await cuMarimileBannerelor("f-esafe", pc, [hero("carduri")], null);
  assert.equal(cereri.length, 1);
});

test("caruselul clasic si hero-ul cu categorii cer si ele marimile; coperta veche, cand nu sunt bannere", async () => {
  cereri = [];
  randuri = [{ business_id: "f-cop", r2_key: "covers/u1/coperta.webp", width: 1200, height: 400 }];
  const dinCoperta = await cuMarimileBannerelor("f-cop", {}, [hero("banners")], `${CDN}/coperta.webp`);
  assert.deepEqual(dinCoperta[CHEIE_MARIMI_BANNERE], { [`${CDN}/coperta.webp`]: [1200, 400] });
  randuri = [{ business_id: "f-cat", r2_key: "covers/u1/lat.webp", width: 1600, height: 659 }];
  const cat = await cuMarimileBannerelor("f-cat", { hero_banners: [`${CDN}/lat.webp`] }, [hero("categories")], null);
  assert.deepEqual(cat[CHEIE_MARIMI_BANNERE], { [`${CDN}/lat.webp`]: [1600, 659] });
  assert.equal(cereri.length, 2);
});

test("baza cazuta: `page_content` ramane cum era, iar data viitoare se intreaba din nou (nu se tine minte caderea)", async () => {
  cereri = [];
  randuri = [{ business_id: "f-cade", r2_key: "covers/u1/a.webp", width: 1600, height: 900 }];
  const pc = { hero_banners: [`${CDN}/a.webp`] };
  cade = true;
  try {
    assert.equal(await cuMarimileBannerelor("f-cade", pc, [hero("carduri")], null), pc);
  } finally {
    cade = false;
  }
  const dupa = await cuMarimileBannerelor("f-cade", pc, [hero("carduri")], null);
  assert.deepEqual(dupa[CHEIE_MARIMI_BANNERE], { [`${CDN}/a.webp`]: [1600, 900] });
  assert.equal(cereri.length, 2);
});

test("o poza negasita nu se cere din nou la fiecare randare (se tine minte pe scurt)", async () => {
  cereri = [];
  randuri = [];
  assert.deepEqual(await marimiDinBiblioteca("f-lipsa", [`${CDN}/nou.webp`]), {});
  assert.deepEqual(await marimiDinBiblioteca("f-lipsa", [`${CDN}/nou.webp`]), {});
  assert.equal(cereri.length, 1);
});
