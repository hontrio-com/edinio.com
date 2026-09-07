import assert from "node:assert/strict";
import { test, before, after, beforeEach } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";

/**
 * PORTILE STERGERII — probate pe CHIAR RUTA, fiindca ele nu incap in modulul pur.
 *
 * ═══ ⚠ DE CE NU AJUNG PROBELE DIN `reguli.test.ts` ═══
 *
 * Acolo se probeaza intrebarea „ce merita sters?". Aici se probeaza altceva, si mai periculos:
 * „cand NU are voie nimeni sa raspunda la intrebarea aia". Cronul sterge definitiv fisiere ale
 * unor oameni si hartia dupa care atelierul produce marfa. Regula poate fi perfecta si ruta poate
 * totusi sterge tot — de pilda daca citirea comenzilor cade la jumatate si ce s-a apucat sa afle
 * se ia drept intreg: atunci fiecare fisier pare orfan.
 *
 * Cele patru porti nu se pot scrie in `reguli.ts` fiindca fiecare e despre o cadere de RETEA sau
 * despre plafonul unei rulari. Deci se probeaza aici, ruland chiar `GET`.
 *
 * ⚠ INLOCUIT E DOAR DEPOZITUL. Baza e un PostgREST de proba, vorbit prin clientul supabase
 * ADEVARAT: o coloana redenumita, un filtru scris altfel sau paginarea stricata cad aici, nu in
 * productie. `verificaCron` e cel adevarat.
 *
 * ⚠ SI FIECARE PROBA CERE DOUA LUCRURI: ce s-a sters SI ce a ramas. „Nu s-a sters nimic" e verde
 * si pentru o ruta care nu face absolut nimic — de-aia fiecare cadere e insotita de o rulare
 * sanatoasa care CHIAR sterge.
 */

const SECRET = "secret-de-cron-de-proba";
const BIZ = "11111111-1111-4111-8111-111111111111";
const PREFIX = "products/customizations/";
const ZI = 24 * 60 * 60 * 1000;

const cheie = (n: string) => `${PREFIX}${BIZ}/${n}`;
const acumMinus = (zile: number) => new Date(Date.now() - zile * ZI);

/* ── Depozitul de proba ───────────────────────────────────────────────────── */

/** Ce „exista" in depozit. */
let depozit: { cheie: string; incarcatLa: Date; octeti: number }[] = [];
/** Ce s-a sters, in ordine. */
let sterse: string[] = [];
/** Pornit, listarea arunca — cum ar arunca R2 cand clipeste. */
let cadeListarea = false;
/** Chei pentru care stergerea raspunde cu eroare individuala (200 cu `Errors`). */
let stergeriEsuate = new Set<string>();

/* ── Baza de proba ────────────────────────────────────────────────────────── */

/** Comenzile pe care le intoarce PostgREST-ul de proba, in ordinea ceruta. */
let comenzi: { id: string; created_at: string; items: unknown }[] = [];
/** Pornit, citirea comenzilor cade. */
let cadeBaza = false;
/** Ce intervale `Range` a cerut ruta: asa se vede daca a paginat cu adevarat. */
let intervale: string[] = [];
/** Filtrul pe `created_at` pe care l-a trimis ruta. */
let filtre: string[] = [];

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const cale = url.pathname.replace("/rest/v1/", "");
  const bucati: Buffer[] = [];
  req.on("data", (c: Buffer) => bucati.push(c));
  req.on("end", () => {
    if (cale !== "orders") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end("[]");
    }
    if (cadeBaza) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ code: "57014", message: "baza de proba: comenzile au cazut" }));
    }

    for (const [k, v] of url.searchParams) if (k === "created_at") filtre.push(v);

    /*
     * ⚠ PAGINAREA SE CITESTE DE UNDE O TRIMITE CHIAR CLIENTUL: `offset` si `limit` in ADRESA.
     *
     * Scrisa intai pe antetul `Range` — asa o documenteaza PostgREST —, baza de proba nu vedea
     * nimic si intorcea toate cele 700 de comenzi la prima cerere; proba pica, dar din motivul
     * gresit. `supabase-js` 2.106 traduce `.range(de, pana)` in `offset`/`limit`, si ce trebuie sa
     * imite baza de proba e CLIENTUL adevarat, nu specificatia.
     */
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? comenzi.length);
    intervale.push(`${offset}+${limit}`);
    const felie = comenzi.slice(offset, offset + limit);

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(felie));
  });
});

/* ── Ce se inlocuieste: `@/lib/r2`, si nimic altceva ──────────────────────── */

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/r2") {
       return {
         url: "data:text/javascript," + encodeURIComponent(
           "export const listeazaPrefix = async (p, m) => globalThis.__r2Lista(p, m);" +
           "export const stergeMulteDinR2 = async (c) => globalThis.__r2Sterge(c);"),
         shortCircuit: true, format: "module",
       };
     }
     return next(specifier, context);
   }`,
)}`;

let GET: (req: NextRequest) => Promise<Response>;

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  process.env.CRON_SECRET = SECRET;

  register(HOOK);
  const g = globalThis as unknown as {
    __r2Lista: (p: string, m: number) => Promise<unknown>;
    __r2Sterge: (c: string[]) => Promise<unknown>;
  };
  g.__r2Lista = async (prefix, max) => {
    if (cadeListarea) throw new Error("depozitul de proba: listarea a cazut");
    const obiecte = depozit.filter((o) => o.cheie.startsWith(prefix));
    return { obiecte: obiecte.slice(0, max), trunchiat: obiecte.length > max };
  };
  g.__r2Sterge = async (chei) => {
    const esecuri: string[] = [];
    for (const c of chei) {
      if (stergeriEsuate.has(c)) esecuri.push(`${c}: AccessDenied`);
      else sterse.push(c);
    }
    return { sterse: chei.length - esecuri.length, esecuri };
  };

  ({ GET } = (await import("./route")) as unknown as { GET: typeof GET });
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  depozit = [];
  sterse = [];
  comenzi = [];
  cadeBaza = false;
  cadeListarea = false;
  stergeriEsuate = new Set();
  intervale = [];
  filtre = [];
});

function cere(secret: string | null = SECRET) {
  return new NextRequest("https://edinio.com/api/cron/curata-fisiere", {
    headers: secret === null ? {} : { authorization: `Bearer ${secret}` },
  });
}

/** Un fisier vechi, neaparat de nimic: ce trebuie sters intr-o rulare sanatoasa. */
function pune(nume: string, zile: number) {
  depozit.push({ cheie: cheie(nume), incarcatLa: acumMinus(zile), octeti: 1024 });
  return cheie(nume);
}

/* ═══════════════════════════════════════════════════════════════════════════
   POARTA 1 — cine are voie sa ceara stergerea
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ fara secretul de cron nu se sterge nimic, si nici nu se atinge baza", async () => {
  pune("vechi.jpg", 400);

  for (const secret of [null, "", "gresit"]) {
    const r = await GET(cere(secret));
    assert.equal(r.status, 401, `a intrat cu secretul ${JSON.stringify(secret)}`);
  }
  assert.deepEqual(sterse, [], "s-a sters ceva pentru o cerere neautorizata");
  assert.deepEqual(intervale, [], "s-au citit comenzi pentru o cerere neautorizata");
});

/* ═══════════════════════════════════════════════════════════════════════════
   POARTA 2 — baza care nu raspunde
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ daca citirea comenzilor CADE, nu se sterge NIMIC", async () => {
  /*
   * ⚠ CEA MAI GREA DIN FISIER. Fara lista intreaga a cheilor aparate, fiecare fisier din depozit
   * pare orfan — deci o baza care clipeste ar goli tot depozitul de personalizari. Aici se cere
   * ca ruta sa aleaga rularea sarita, nu curatenia „cu ce stiu".
   */
  pune("vechi.jpg", 400);
  pune("si-mai-vechi.jpg", 800);
  cadeBaza = true;

  const r = await GET(cere());
  assert.equal(r.status, 200, "cronul a cazut cu eroare in loc sa raporteze rularea sarita");
  const raport = (await r.json()) as { ok: boolean; motiv?: string };
  assert.equal(raport.ok, false, "rularea s-a dat drept reusita");
  assert.match(String(raport.motiv), /comenzi/i);
  assert.deepEqual(sterse, [], "s-a sters cu lista de comenzi incompleta");
});

test("⚠ perechea: cu baza sanatoasa, ACELEASI fisiere chiar se sterg", async () => {
  /*
   * Fara randul asta, proba de deasupra ar fi trecut verde si peste o ruta care nu sterge
   * niciodata nimic — adica peste chiar defectul „reparatie inerta".
   */
  const a = pune("vechi.jpg", 400);
  const b = pune("si-mai-vechi.jpg", 800);

  const r = await GET(cere());
  const raport = (await r.json()) as { ok: boolean; sterse: number };
  assert.equal(raport.ok, true);
  assert.deepEqual(sterse.sort(), [a, b].sort(), "rularea sanatoasa n-a sters ce trebuia");
});

/* ═══════════════════════════════════════════════════════════════════════════
   POARTA 3 — paginarea comenzilor (plafonul tacut de o mie al lui PostgREST)
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ comenzile se citesc PANA LA CAPAT: fisierul de pe comanda a 700-a e aparat", async () => {
  /*
   * ⚠ CE APARA: PostgREST intoarce cel mult 1000 de randuri si TACE. O singura cerere ar fi parut
   * ca merge — pe o baza mica ar fi si mers — si ar fi lasat neaparate tocmai fisierele de pe
   * comenzile de dupa taietura. Cronul le-ar fi sters, tacut, la prima zi cu destule comenzi.
   *
   * Aici pagina e de 500, deci comanda 700 sta pe a doua pagina. Cerinta e pe PURTARE: fisierul ei
   * ramane, si se vede ca ruta a cerut mai mult de un interval.
   */
  const aparat = pune("de-pe-comanda-700.jpg", 120);
  const orfan = pune("nimeni-nu-ma-apara.jpg", 120);

  for (let i = 0; i < 700; i++) {
    comenzi.push({
      id: `c${i}`,
      created_at: acumMinus(100).toISOString(),
      items: i === 699
        ? [{ customization: { f: { type: "fisier", label: "Tipar", value: [aparat] } } }]
        : [{ nume: "produs simplu" }],
    });
  }

  const r = await GET(cere());
  const raport = (await r.json()) as { ok: boolean; comenziCitite: number; cheiAparate: number };
  assert.equal(raport.ok, true);
  assert.equal(raport.comenziCitite, 700, "nu s-au citit toate comenzile");
  assert.ok(intervale.length >= 2, `s-a cerut o singura pagina: ${intervale.join(", ")}`);
  assert.equal(raport.cheiAparate, 1);
  assert.deepEqual(sterse, [orfan], "fisierul de pe comanda de dupa prima pagina a fost sters");
});

test("⚠ se cer doar comenzile din fereastra, nu toate din istorie", async () => {
  /*
   * Fereastra e chiar regula: o comanda mai veche de sase luni nu mai apara nimic. Cerute toate,
   * cronul ar fi citit istoria intreaga la fiecare rulare — si, mai rau, ar fi aparat pe veci
   * fisiere pe care hotararea le da la stergere.
   */
  pune("orice.jpg", 400);
  await GET(cere());
  assert.equal(filtre.length > 0, true, "nu s-a trimis niciun filtru pe data comenzii");
  assert.ok(filtre.every((f) => f.startsWith("gte.")), `filtrul nu e o margine de jos: ${filtre.join(", ")}`);
});

/* ═══════════════════════════════════════════════════════════════════════════
   POARTA 4 — depozitul care nu raspunde, si plafonul unei rulari
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ daca listarea depozitului CADE, nu se sterge nimic", async () => {
  pune("vechi.jpg", 400);
  cadeListarea = true;

  const r = await GET(cere());
  const raport = (await r.json()) as { ok: boolean; motiv?: string };
  assert.equal(raport.ok, false);
  assert.match(String(raport.motiv), /depozit/i);
  assert.deepEqual(sterse, []);
});

test("⚠ o rulare nu poate sterge mai mult de plafon, si o spune", async () => {
  /*
   * ⚠ FRANA DE MANA, si de-aia se probeaza: un defect in regula — un prag socotit invers, o
   * multime aparata ramasa goala — ar sterge TOT depozitul intr-o rulare. Cu plafonul, prima zi ia
   * cel mult atat, iar restul ramane pentru maine, cand un om poate sa fi vazut deja cifra.
   */
  for (let i = 0; i < 620; i++) pune(`vechi-${i}.jpg`, 400);

  const r = await GET(cere());
  const raport = (await r.json()) as { deSters: number; sterse: number };
  assert.equal(raport.deSters, 620, "verdictul n-a vazut toate fisierele");
  assert.equal(raport.sterse, 500, `s-au sters ${raport.sterse} intr-o singura rulare`);
  assert.equal(sterse.length, 500);
});

test("⚠ un fisier care NU s-a putut sterge nu se numara ca sters", async () => {
  /*
   * `DeleteObjects` intoarce 200 si cu erori pe obiecte individuale. Numarate ca reusite, cronul
   * ar raporta o curatenie care nu s-a facut, iar aceleasi fisiere i-ar iesi „sterse" in fiecare
   * zi, la nesfarsit — un raport care minte in aceeasi directie mereu.
   */
  const bun = pune("se-sterge.jpg", 400);
  const rau = pune("nu-se-sterge.jpg", 400);
  stergeriEsuate.add(rau);

  const r = await GET(cere());
  const raport = (await r.json()) as { sterse: number; esecuri: number; deSters: number };
  assert.equal(raport.deSters, 2);
  assert.equal(raport.sterse, 1, "esecul individual s-a numarat ca reusita");
  assert.equal(raport.esecuri, 1);
  assert.deepEqual(sterse, [bun]);
});

/* ═══════════════════════════════════════════════════════════════════════════
   RULAREA SANATOASA, intreaga
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ ce se apara si ce se sterge, pe acelasi drum", async () => {
  const proaspat = pune("urcat-azi.jpg", 0);
  const peComanda = pune("pe-comanda-noua.jpg", 100);
  const orfanVechi = pune("orfan.jpg", 60);
  const dePeComandaVeche = pune("comanda-iesita-din-fereastra.jpg", 300);

  comenzi.push({
    id: "c1",
    created_at: acumMinus(100).toISOString(),
    items: [{ customization: { p: { type: "image", label: "Poza", value: peComanda } } }],
  });

  const r = await GET(cere());
  const raport = (await r.json()) as {
    ok: boolean; obiecte: number; orfani: number; comenziVechi: number; sterse: number;
  };

  assert.equal(raport.ok, true);
  assert.equal(raport.obiecte, 4);
  assert.deepEqual(
    sterse.sort(), [orfanVechi, dePeComandaVeche].sort(),
    "s-a sters altceva decat cele doua fisiere fara aparare",
  );
  /* Si cele doua motive se deosebesc in raport, ca omul care-l citeste sa stie ce s-a intamplat. */
  assert.equal(raport.orfani, 1);
  assert.equal(raport.comenziVechi, 1);

  /* ⚠ Perechea, spusa pe fata: fisierul proaspat si cel de pe comanda noua sunt INCA acolo. */
  assert.equal(sterse.includes(proaspat), false, "s-a sters fisierul urcat azi");
  assert.equal(sterse.includes(peComanda), false, "s-a sters fisierul unei comenzi din fereastra");
});
