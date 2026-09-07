import assert from "node:assert/strict";
import { test, before, after, beforeEach } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { cheieIncarcare, esteCheiaNoastra } from "@/lib/customization/fisiere-private";
/*
 * ⚠ ASTA E MODULUL ADEVARAT `@/lib/r2`, si ramane adevarat.
 *
 * Importul se rezolva la INCARCAREA fisierului de proba, iar carligul care il inlocuieste cu unul
 * de proba se pune abia in `before()`. Deci `esteObiectLipsa` de aici e chiar codul din productie,
 * iar ruta — care cere `@/lib/r2` mai tarziu — primeste depozitul de proba. Fara asta, deosebirea
 * dintre „nu exista” si „n-am putut citi” ar fi fost probata numai pe un dublu care o presupune.
 */
import { citesteDinR2, esteObiectLipsa } from "@/lib/r2";
import { S3Client } from "@aws-sdk/client-s3";

/**
 * FISIERUL UNUI CUMPARATOR NU SE DA DECAT COMERCIANTULUI CARE ARE COMANDA.
 *
 * ═══ ⚠ DE CE SE RULEAZA CHIAR RUTA, cu o baza care vorbeste PostgREST ═══
 *
 * Ce se apara aici nu e o functie pura, sunt PATRU porti puse una dupa alta, iar trei din ele
 * sunt INTEROGARI. O proba pe sursa ar fi trecut peste un filtru scris gresit, peste un `.eq`
 * uitat, si — masurat — peste chiar defectul care era in prima scriere: `.like("items", "%cheie%")`.
 *
 * ⚠ ACELA E MOTIVUL PENTRU CARE FISIERUL ASTA EXISTA. `orders.items` e `jsonb`, iar in Postgres
 * `jsonb LIKE text` NU EXISTA: prin clientul real iese `42883 operator does not exist: jsonb ~~
 * unknown`, si nici `items::text` nu ajuta, fiindca PostgREST lasa castul deoparte in filtre.
 * Ruta ar fi raspuns 503 la FIECARE cerere — adica niciun comerciant nu si-ar mai fi vazut
 * vreodata fisierele, si nimic din tsc, teste sau build n-ar fi spus nimic. Baza de proba de mai
 * jos refuza `like` peste o valoare care nu e text EXACT ca Postgres, ca regresia sa nu se mai
 * poata intoarce in tacere.
 *
 * ⚠ INLOCUITE SUNT DOAR CAPATUL DE IDENTITATE SI DEPOZITUL. Interogarile sunt cele adevarate.
 *
 * ═══ ⚠ SI CE MAI APARA FISIERUL, PE LANGA CELE PATRU PORTI ═══
 *
 * Trei feluri de raspuns care nu se vad din cod si costa cel mai mult tocmai cand se strica:
 *   1. ce se spune cand NU SE STIE (baza cazuta, depozitul cazut) — 503, niciodata „negasit”;
 *   2. ca un secret ROTIT nu ascunde fisierele comenzilor deja incasate;
 *   3. ca fisierul salvat poarta un nume dupa care comerciantul il mai poate recunoaste la tipar.
 */

const BIZ = "11111111-1111-4111-8111-111111111111";
const ALT_BIZ = "22222222-2222-4222-8222-222222222222";
/**
 * Comerciantul care are magazinul.
 *
 * ⚠ FRANA E IN MEMORIE SI E IMPARTITA DE TOT FISIERUL. Nu se poate goli intre probe, deci fiecare
 * cerere facuta cu identitatea asta consuma una din cele 120 de fise pe minut ale rutei. Azi se
 * folosesc vreo douazeci. Cine adauga zeci de probe noi pe acelasi cont le va vedea iesind 429, iar
 * esecul va arata ca un defect al rutei, nu al probelor: atunci se ia un cont nou, nu se umfla
 * plafonul.
 */
const UTILIZATOR = "user-1";
const COMANDA = "33333333-3333-4333-8333-333333333333";
const ALTA_COMANDA = "44444444-4444-4444-8444-444444444444";
const NUMAR_COMANDA = "C-1043";

/* ── Baza de proba: atat PostgREST cat intreaba ruta ──────────────────────────── */

type Rand = Record<string, unknown>;

let comenzi: Rand[] = [];
/** Pornit, citirea comenzii cade — cum ar cadea baza in productie. */
let cadeCitireaComenzii = false;
/** Pornit, cade verificarea de proprietate a magazinului. */
let cadeCitireaMagazinului = false;
/** Caile lovite de la ultima golire. Asa se vede daca baza a fost ATINSA. */
let cai: string[] = [];

/**
 * Un filtru PostgREST peste un rand.
 *
 * ⚠ `like` se poarta ca in Postgres, nu ca in JavaScript: peste o coloana care nu e text ARUNCA.
 * Fara asta, baza de proba ar fi fost mai ingaduitoare decat cea adevarata, iar proba ar fi
 * trecut tocmai peste defectul pe care il pazeste.
 */
function potriveste(rand: Rand, coloana: string, expresie: string): boolean {
  const punct = expresie.indexOf(".");
  const op = expresie.slice(0, punct);
  const val = expresie.slice(punct + 1);
  const v = rand[coloana] ?? null;

  if (op === "eq") {
    /*
     * ⚠ COLOANELE `uuid` REFUZA CE NU E UUID, ca in Postgres (`22P02`), nu intorc „zero
     * randuri”. Fara asta, proba pentru forma lui `comanda` ar fi fost SLABA: si fara verificarea
     * din ruta ar fi iesit tot 404, doar ca in productie ar fi iesit 503.
     */
    if ((coloana === "id" || coloana === "business_id") && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
      throw new Error(`invalid input syntax for type uuid: "${val}"`);
    }
    return v !== null && String(v) === val;
  }
  if (op === "like" || op === "ilike") {
    if (typeof v !== "string") {
      throw new Error(`operator does not exist: jsonb ~~ unknown (coloana ${coloana})`);
    }
    const bucata = val.replace(/^%|%$/g, "");
    return v.includes(bucata);
  }
  throw new Error(`operator PostgREST neinteles: ${coloana}=${expresie}`);
}

/** Coloanele cerute, si numai ele. Coloana necunoscuta iese ca 500, ca la PostgREST. */
function proiecteaza(rand: Rand, select: string): Rand {
  if (!select || select === "*") return rand;
  const iesire: Rand = {};
  for (const bucata of select.split(",").map((s) => s.trim())) {
    if (!bucata) continue;
    if (!(bucata in rand)) throw new Error(`coloana ceruta si necunoscuta: ${bucata}`);
    iesire[bucata] = rand[bucata];
  }
  return iesire;
}

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const cale = url.pathname.replace("/rest/v1/", "");
  req.resume();
  req.on("end", () => {
    const json = (cod: number, date: unknown) => {
      res.writeHead(cod, { "content-type": "application/json" });
      res.end(JSON.stringify(date));
    };
    try {
      cai.push(cale);
      const unul = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const select = url.searchParams.get("select") ?? "";

      if (cale === "orders" && cadeCitireaComenzii) {
        return json(500, { code: "57014", message: "baza de proba: citirea comenzii a cazut" });
      }
      if (cale === "businesses" && cadeCitireaMagazinului) {
        return json(500, { code: "57014", message: "baza de proba: citirea magazinului a cazut" });
      }

      const tabele: Record<string, Rand[]> = {
        businesses: [{ id: BIZ, user_id: UTILIZATOR }, { id: ALT_BIZ, user_id: "alt-user" }],
        orders: comenzi,
      };
      if (!(cale in tabele)) return json(200, []);

      let randuri = tabele[cale];
      for (const [cheie, valoare] of url.searchParams) {
        if (["select", "order", "limit", "offset"].includes(cheie)) continue;
        randuri = randuri.filter((r) => potriveste(r, cheie, valoare));
      }

      const iesire = randuri.map((r) => proiecteaza(r, select));
      if (unul) return json(iesire.length === 1 ? 200 : 406, iesire[0] ?? { message: "gol" });
      return json(200, iesire);
    } catch (e) {
      /* ⚠ Greseala bazei de proba iese ca 500 CU MESAJ, nu ca tacere. */
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: `baza de proba: ${(e as Error).message}` }));
    }
  });
});

/* ── Ce se inlocuieste: identitatea si depozitul, nimic altceva ───────────────── */

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/supabase/server") {
       return {
         url: "data:text/javascript," + encodeURIComponent("export const createClient = async () => globalThis.__clientDeProba();"),
         shortCircuit: true, format: "module",
       };
     }
     if (specifier === "@/lib/r2") {
       return {
         url: "data:text/javascript," + encodeURIComponent(
           "export const citesteDinR2 = async (k) => globalThis.__r2DeProba(k);"
           + "export const getFromR2 = async (k) => { const r = await globalThis.__r2DeProba(k); return r.fel === 'octeti' ? r.octeti : null; };"
         ),
         shortCircuit: true, format: "module",
       };
     }
     return next(specifier, context);
   }`,
)}`;

/** Cine e conectat. `null` = nimeni. */
let utilizator: string | null = UTILIZATOR;
/** Ce are depozitul. Lipsa = fisierul nu mai e acolo. */
let depozit: Record<string, Buffer> = {};
/** Pornit, depozitul nu raspunde deloc — incident R2, credentiala schimbata, timeout. */
let esecDepozit = false;

let GET: (req: NextRequest) => Promise<Response>;
let CHEIE = "";
let CHEIE_PDF = "";

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  const adresa = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = adresa;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  /*
   * ⚠ Se pune variabila DEDICATA, fiindca ea are intaietate in `secret()`. Asa proba secretului
   * rotit masoara chiar ce spune, indiferent ce mai are mediul in care se ruleaza.
   */
  process.env.CUSTOMIZATION_FILE_SECRET = "secret-de-proba-pentru-semnatura";

  CHEIE = cheieIncarcare(BIZ, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "jpg");
  CHEIE_PDF = cheieIncarcare(BIZ, "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee", "pdf");

  register(HOOK);
  const { createClient } = await import("@supabase/supabase-js");
  const adevarat = createClient(adresa, "cheie-anonima-de-proba", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  (globalThis as unknown as { __clientDeProba: () => unknown }).__clientDeProba = () => ({
    auth: { getUser: async () => ({ data: { user: utilizator ? { id: utilizator } : null }, error: null }) },
    from: (tabel: string) => adevarat.from(tabel),
  });
  (globalThis as unknown as { __r2DeProba: (k: string) => Promise<unknown> }).__r2DeProba =
    async (k) => {
      if (esecDepozit) return { fel: "eroare", motiv: "proba: depozitul nu raspunde" };
      const o = depozit[k];
      return o ? { fel: "octeti", octeti: o } : { fel: "lipsa" };
    };

  ({ GET } = (await import("./route")) as unknown as { GET: typeof GET });
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  utilizator = UTILIZATOR;
  cadeCitireaComenzii = false;
  cadeCitireaMagazinului = false;
  esecDepozit = false;
  cai = [];
  depozit = { [CHEIE]: Buffer.from("octetii-pozei"), [CHEIE_PDF]: Buffer.from("%PDF-1.4 ") };
  comenzi = [
    {
      id: COMANDA,
      business_id: BIZ,
      order_number: NUMAR_COMANDA,
      items: [{
        product_id: "p-1", name: "Tablou canvas", quantity: 1, price: 199,
        /* Eticheta vine cu diacritice, ca in panoul comerciantului. */
        customization: { f: { type: "image", label: "Poză față", value: [CHEIE] } },
      }],
    },
    {
      id: ALTA_COMANDA,
      business_id: ALT_BIZ,
      order_number: "C-2001",
      items: [{ product_id: "p-2", name: "Cana", quantity: 1, price: 39 }],
    },
  ];
});

function cere(p: { cheie?: string; businessId?: string; comanda?: string }) {
  const u = new URL("https://panou.edinio.com/api/customization-file");
  if (p.cheie !== undefined) u.searchParams.set("cheie", p.cheie);
  if (p.businessId !== undefined) u.searchParams.set("businessId", p.businessId);
  if (p.comanda !== undefined) u.searchParams.set("comanda", p.comanda);
  return new NextRequest(u.toString());
}

/* ═══════════════════════════════════════════════════════════════════════════
   DRUMUL BUN — si el e o proba, fiindca a fost rupt o data
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ comerciantul care are comanda primeste octetii, cu antetele care nu lasa urme", async () => {
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));

  /* Corpul se citeste O SINGURA DATA, deci mesajul de esec nu are voie sa-l consume. */
  assert.equal(r.status, 200, "fisierul nu s-a servit");
  assert.equal(Buffer.from(await r.arrayBuffer()).toString(), "octetii-pozei");
  assert.equal(r.headers.get("Content-Type"), "image/jpeg", "terminatia cheii nu a devenit tip");
  assert.equal(
    r.headers.get("Cache-Control"), "private, no-store",
    "poza de familie a unui cumparator poate ramane la un intermediar sau in CDN",
  );
});

test("⚠ si un PDF de tipar iese ca PDF, nu ca octeti anonimi", async () => {
  comenzi[0].items = [{ customization: { f: { type: "fisier", label: "Macheta", value: [CHEIE_PDF] } } }];
  const r = await GET(cere({ cheie: CHEIE_PDF, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 200, "PDF-ul nu s-a servit");
  assert.equal(r.headers.get("Content-Type"), "application/pdf");
});

/* ═══════════════════════════════════════════════════════════════════════════
   CELE PATRU PORTI, fiecare confruntata cu cazul ei
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ POARTA 1: o cheie de alta forma nu atinge deloc baza", async () => {
  /*
   * ⚠ NU E DOAR „raspunde 404”. Daca forma s-ar verifica DUPA interogari, capatul ar fi devenit
   * o sonda: cine incearca chei inventate ar fi aflat, din timpul de raspuns si din felul
   * refuzului, ce magazine si ce comenzi exista. De-aia se numara caile lovite.
   */
  const stramba = `products/customizations/${BIZ}/fara-nicio-semnatura.jpg`;
  const r = await GET(cere({ cheie: stramba, businessId: BIZ, comanda: COMANDA }));

  assert.equal(r.status, 404);
  assert.deepEqual(cai, [], `forma se verifica dupa baza: s-a interogat ${cai.join(", ")}`);
});

test("⚠ POARTA 1 bis: cheia ALTUI magazin nu se poate cere pe magazinul tau", async () => {
  const straina = cheieIncarcare(ALT_BIZ, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "jpg");
  const r = await GET(cere({ cheie: straina, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 404, "prefixul nu leaga cheia de magazin");
  assert.deepEqual(cai, []);
});

test("⚠ POARTA 1 ter: o cheie cu `/` in coada nu poate arata catre alt dosar", async () => {
  const r = await GET(cere({ cheie: `products/customizations/${BIZ}/x/y-z.jpg`, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 404);
  assert.deepEqual(cai, []);
});

test("⚠ POARTA 2: fara sesiune nu se da nimic, nici cu cheia buna", async () => {
  utilizator = null;
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 401, "cheia buna a tinut loc de autentificare");
});

test("⚠ POARTA 3: un cont care nu are magazinul primeste 403", async () => {
  utilizator = "alt-user";
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 403, "proprietatea magazinului nu se verifica");
});

test("⚠ POARTA 4: cheia buna, dar comanda NU o poarta", async () => {
  /*
   * ⚠ ASTA E POARTA CARE FACE DREPTUL SA FIE PE FISIER, nu pe magazin. Fara ea, comerciantul —
   * sau oricine ii vede o cheie intr-un email vechi — ar fi putut cere orice fisier al oricarei
   * comenzi de-a lui, doar aratand cu degetul spre o comanda oarecare.
   */
  comenzi[0].items = [{ product_id: "p-1", name: "Cana", quantity: 1 }];
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 404, "fisierul s-a dat pe o comanda care nu-l contine");
});

test("⚠ POARTA 4 bis: comanda ALTUI magazin nu tine loc de comanda", async () => {
  /* Randul EXISTA si poarta cheia, dar e al altui magazin: filtrul e si autorizare. */
  comenzi[1].items = [{ customization: { f: { value: [CHEIE] } } }];
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: ALTA_COMANDA }));
  assert.equal(r.status, 404, "s-a citit o comanda a altui magazin");
});

/* ═══════════════════════════════════════════════════════════════════════════
   SEMNATURA NU SE MAI CERE AICI — si ce tine in locul ei
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ UN SECRET ROTIT NU ASCUNDE fisierele comenzilor deja incasate", async () => {
  /*
   * ⚠ ASTA E MOTIVUL PENTRU CARE RUTA NU MAI VERIFICA SEMNATURA.
   *
   * Cheia se scrie in comanda o data pentru totdeauna, dar semnatura s-ar recalcula din secretul
   * de ACUM. Secretul se roteste (butonul de service role din Supabase, sau simpla ADAUGARE a lui
   * `SHIPPING_QUOTE_SECRET`, pe care mesajul de eroare al etichetelor GLS chiar o cere) — si din
   * clipa aia comerciantul ar fi citit „fisier negasit” pentru macheta unei comenzi PLATITE, cu
   * octetii nevatamati in depozit si fara nicio cale de intoarcere din interfata.
   */
  const acum = process.env.CUSTOMIZATION_FILE_SECRET;
  process.env.CUSTOMIZATION_FILE_SECRET = "secretul-de-acum-doua-luni";
  const cheieVeche = cheieIncarcare(BIZ, "cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee", "jpg");
  process.env.CUSTOMIZATION_FILE_SECRET = acum; /* intre timp secretul s-a rotit */

  /* Fara randul asta proba ar fi putut deveni goala fara sa se vada: cheia inca se potriveste. */
  assert.equal(esteCheiaNoastra(cheieVeche, BIZ), false, "proba nu masoara nimic: semnatura tot se potriveste");

  depozit[cheieVeche] = Buffer.from("macheta-platita");
  comenzi[0].items = [{ customization: { f: { type: "image", label: "Poză față", value: [cheieVeche] } } }];

  const r = await GET(cere({ cheie: cheieVeche, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 200, "un secret rotit a ascuns fisierul unei comenzi incasate");
  assert.equal(Buffer.from(await r.arrayBuffer()).toString(), "macheta-platita");
});

test("⚠ si totusi o cheie inventata cu forma buna nu se serveste: comanda hotaraste", async () => {
  /*
   * ⚠ ASTA E PRETUL PLATIT PENTRU PROBA DE MAI SUS, si el trebuie sa ramana platit.
   *
   * Fara semnatura, poarta intai nu mai deosebeste o cheie scrisa de noi de una compusa de mana cu
   * aceeasi forma. Ce o opreste e apartenenta la comanda — si daca cineva scoate vreodata poarta a
   * patra, proba asta cade prima, cu octeti straini serviti dintr-un depozit.
   */
  const inventata = `products/customizations/${BIZ}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee-000000000000000000000000.jpg`;
  depozit[inventata] = Buffer.from("octeti-straini");
  const r = await GET(cere({ cheie: inventata, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 404, "s-a servit un fisier care nu e pe nicio comanda");
});

/* ═══════════════════════════════════════════════════════════════════════════
   ESECURILE: ce se spune cand nu se STIE, si ce cand se stie ca nu
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ baza picata spune 503, nu 404", async () => {
  /*
   * ⚠ Un 404 aici ar fi o MINCIUNE: comerciantul are dreptul la fisier, doar ca n-am putut
   * verifica. El ar fi cautat o macheta pierduta in loc sa mai incerce o data.
   */
  cadeCitireaComenzii = true;
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 503, "o baza picata a fost data drept fisier inexistent");
});

test("⚠ si magazinul necitit spune 503, nu «Acces interzis»", async () => {
  /*
   * ⚠ Aceeasi minciuna, cu alte cuvinte. `.single()` cu eroarea aruncata dadea `data === null` si
   * cand randul lipsea, si cand baza clipea — deci amandoua ieseau 403. Comerciantul citea ca nu
   * mai are voie la comanda LUI si scria la suport, in loc sa reincarce pagina.
   */
  cadeCitireaMagazinului = true;
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 503, "o baza picata a fost data drept lipsa de drept");
  assert.equal(
    (await r.json()).error, "Nu am putut verifica fisierul. Incearca din nou.",
    "mesajul nu-l trimite pe om sa mai incerce",
  );
});

test("⚠ DEPOZITUL CAZUT spune 503; numai fisierul chiar disparut iese 404", async () => {
  /*
   * ⚠ `getFromR2` intoarce `null` si pentru „nu exista”, si pentru un incident R2 sau o
   * credentiala schimbata. Tradus in „Fisier negasit”, comerciantul ii cerea clientului sa trimita
   * macheta din nou — cand trebuia doar sa mai incerce peste zece minute.
   */
  esecDepozit = true;
  const cazut = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(cazut.status, 503, "un incident al depozitului a fost dat drept fisier pierdut");
  assert.equal((await cazut.json()).error, "Nu am putut verifica fisierul. Incearca din nou.");

  esecDepozit = false;
  depozit = {};
  const lipsa = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(lipsa.status, 404, "un fisier chiar disparut trebuie sa iasa 404");
});

test("⚠ CE E «LIPSA» SI CE E «N-AM PUTUT CITI», dupa eroarea chiar a SDK-ului", () => {
  /*
   * ⚠ Deosebirea de mai sus nu valoreaza nimic daca cel care o face pune totul intr-o galeata.
   * Aici se masoara chiar clasificarea din `@/lib/r2`, cu erorile pe care le arunca S3/R2.
   *
   * ⚠ `NoSuchBucket` VINE TOT CU 404. O galeata redenumita sau stearsa nu e un fisier lipsa: e o
   * cadere pe TOATE fisierele deodata, si spusa ca „negasit” ar trimite comerciantul sa ceara
   * fiecare macheta din nou.
   */
  const s3 = (name: string, cod?: number) =>
    Object.assign(new Error(name), { name, $metadata: { httpStatusCode: cod } });

  assert.equal(esteObiectLipsa(s3("NoSuchKey", 404)), true, "obiectul chiar lipsa");
  assert.equal(esteObiectLipsa(s3("NotFound", 404)), true, "raspunsul de HEAD");
  assert.equal(esteObiectLipsa(s3("NoSuchBucket", 404)), false, "o galeata disparuta nu e un fisier lipsa");
  assert.equal(esteObiectLipsa(s3("InvalidAccessKeyId", 403)), false, "o credentiala schimbata nu e un fisier lipsa");
  assert.equal(esteObiectLipsa(s3("AccessDenied", 403)), false);
  assert.equal(esteObiectLipsa(s3("TimeoutError")), false, "un timeout nu e un fisier lipsa");
  assert.equal(esteObiectLipsa(null), false);
  assert.equal(esteObiectLipsa("NoSuchKey"), false, "un sir nu e o eroare de SDK");

  /*
   * ⚠ SI NUMELE POATE SA NU SPUNA NIMIC. SDK-ul nu mapeaza fiecare raspuns al lui R2 la un nume
   * cunoscut: cand codul de eroare nu e in modelul lui, `name` iese generic (`Error`,
   * `UnknownError`). De-aia ultima cadenta e pe codul HTTP — fara ea un obiect chiar disparut ar
   * iesi „n-am putut citi”, adica 503 „mai incearca” la nesfarsit, pentru un fisier care nu vine.
   */
  assert.equal(esteObiectLipsa(s3("UnknownError", 404)), true, "un 404 fara nume cunoscut e tot o lipsa");
  assert.equal(esteObiectLipsa(s3("UnknownError", 500)), false, "un 500 nu e o lipsa, oricum s-ar numi");
});

/**
 * Ruleaza `f` cu raspunsul depozitului inlocuit — si numai atat.
 *
 * ⚠ SE INLOCUIESTE `send` PE PROTOTIPUL CLIENTULUI S3, NU MODULUL. `citesteDinR2` ramane cel din
 * productie, cu tot cu clasificarea lui; asa se pot da raspunsurile pe care dublul de depozit de
 * mai sus nu le poate da niciodata, fiindca el intoarce direct cele trei feluri gata alese.
 */
async function cuDepozitulRaspunzand<T>(raspuns: () => unknown, f: () => Promise<T>): Promise<T> {
  const proto = S3Client.prototype as unknown as { send?: (...a: unknown[]) => unknown };
  const avea = Object.prototype.hasOwnProperty.call(proto, "send");
  const vechi = proto.send;
  proto.send = async () => raspuns();
  try {
    return await f();
  } finally {
    if (avea) proto.send = vechi;
    else delete proto.send;
  }
}

test("⚠ UN RASPUNS FARA CORP NU E O LIPSA: obiectul a fost gasit si tot n-avem octetii", async () => {
  /*
   * ⚠ Singurul fel in care `citesteDinR2` poate minti FARA sa fi fost aruncata vreo exceptie: S3
   * raspunde bine si `Body` lipseste — un raspuns taiat pe drum, o cadere intre noduri. Numarat
   * drept „lipsa”, iese 404 „Fisier negasit” pentru un fisier care E in depozit, adica exact
   * minciuna pentru care exista tipul `CitireR2`.
   */
  const faraCorp = await cuDepozitulRaspunzand(() => ({}), () => citesteDinR2("k"));
  assert.equal(faraCorp.fel, "eroare", "un raspuns fara corp a fost dat drept fisier inexistent");

  /*
   * ⚠ PERECHEA POZITIVA, SI EA E SI DOVADA CA INLOCUIREA A PRINS. Cu `send` neinlocuit, cererea
   * ar pleca spre gazda adevarata, ar cadea, si primul assert ar fi iesit „eroare” din motivul
   * gresit. Octetii astia nu pot veni de nicaieri altundeva.
   */
  const cuCorp = await cuDepozitulRaspunzand(
    () => ({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }),
    () => citesteDinR2("k"),
  );
  assert.equal(cuCorp.fel, "octeti", "citirea buna nu a intors octetii");
  assert.deepEqual(cuCorp.fel === "octeti" ? [...cuCorp.octeti] : [], [1, 2, 3]);

  /* Si cele doua exceptii ies fiecare pe drumul ei, prin aceeasi clasificare. */
  const arunca = (name: string) => () => { throw Object.assign(new Error(name), { name }); };
  assert.equal((await cuDepozitulRaspunzand(arunca("NoSuchKey"), () => citesteDinR2("k"))).fel, "lipsa");
  assert.equal((await cuDepozitulRaspunzand(arunca("TimeoutError"), () => citesteDinR2("k"))).fel, "eroare");
});

test("⚠ un `comanda` care nu e UUID iese 404, nu 503", async () => {
  /*
   * ⚠ Fara verificarea de forma, `.eq("id", "nu-e-uuid")` cade cu `22P02` si ruta ar fi raspuns
   * „mai incearca” la o cerere care n-avea cum sa reuseasca vreodata.
   */
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: "nu-e-uuid" }));
  assert.equal(r.status, 404);
  assert.deepEqual(cai, [], "s-a interogat baza cu un id care nu e UUID");
});

test("⚠ si un `businessId` care nu e UUID iese tot 404, nu 503", async () => {
  /*
   * ⚠ CEALALTA JUMATATE A ACELEIASI PORTI, si e cea mai usor de scapat: `businessId` intra si el
   * intr-un `.eq()` pe o coloana `uuid`, la magazin. Cheia se compune dupa el, deci forma trece
   * (prefixul E chiar sirul dat), si abia baza refuza — cu `22P02`, adica 503 „mai incearca” la o
   * cerere care n-avea cum sa reuseasca. Pe deasupra fiecare incercare ar fi o atingere de baza.
   */
  const stramb = "%";
  const cheieStramba = `products/customizations/${stramb}/x-000000000000000000000000.jpg`;
  const r = await GET(cere({ cheie: cheieStramba, businessId: stramb, comanda: COMANDA }));
  assert.equal(r.status, 404, "un `businessId` care nu e UUID a ajuns la baza");
  assert.deepEqual(cai, [], "s-a interogat baza cu un magazin care nu e UUID");
});

test("parametrii lipsa ies 400", async () => {
  assert.equal((await GET(cere({ businessId: BIZ, comanda: COMANDA }))).status, 400);
  assert.equal((await GET(cere({ cheie: CHEIE, comanda: COMANDA }))).status, 400);
  assert.equal((await GET(cere({ cheie: CHEIE, businessId: BIZ }))).status, 400,
    "fara comanda ruta ar trebui sa refuze: pe ea se sprijina poarta a patra");
});

/* ═══════════════════════════════════════════════════════════════════════════
   CE RAMANE PE FISIER DUPA CE PLEACA DIN PANOU
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ fiecare fisier se salveaza cu numele LUI, nu cu «fisier.jpg»", async () => {
  /*
   * ⚠ Toate ieseau `fisier.jpg`. Atelierul care deschidea sase fisiere ale aceleiasi comenzi le
   * primea in dosarul de descarcari ca `fisier.jpg`, `fisier(1).jpg`… si la masina de tipar nu mai
   * stia care merge pe fata si care pe spate — pe chiar hartia dupa care se produce marfa.
   */
  const aDoua = cheieIncarcare(BIZ, "dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee", "jpg");
  depozit[aDoua] = Buffer.from("a-doua-poza");
  comenzi[0].items = [{
    customization: {
      f: { type: "image", label: "Poză față", value: [CHEIE, aDoua] },
      s: { type: "fisier", label: "Macheta spate", value: [CHEIE_PDF] },
    },
  }];

  const numele = async (k: string) => {
    const r = await GET(cere({ cheie: k, businessId: BIZ, comanda: COMANDA }));
    assert.equal(r.status, 200, `nu s-a servit ${k}`);
    await r.arrayBuffer();
    return r.headers.get("Content-Disposition");
  };

  /* Numarul comenzii, eticheta campului (fara diacritice) si a cata valoare e. */
  assert.equal(await numele(CHEIE), `inline; filename="c-1043-poza-fata-1.jpg"`);
  assert.equal(await numele(aDoua), `inline; filename="c-1043-poza-fata-2.jpg"`);
  assert.equal(await numele(CHEIE_PDF), `inline; filename="c-1043-macheta-spate-1.pdf"`);
});

test("⚠ un camp FARA eticheta isi ia numele din id-ul lui, nu unul fix", async () => {
  /*
   * ⚠ `customization` nu poarta dintotdeauna `label` — comenzile de dinaintea lui il au doar pe
   * `value`. Cazut pe un cuvant fix, doua campuri diferite ale ACELEIASI comenzi ar da acelasi
   * nume de fisier, adica exact `fisier.jpg`-ul pe care numele asta il repara, cu alt cuvant.
   */
  const aDoua = cheieIncarcare(BIZ, "dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee", "jpg");
  depozit[aDoua] = Buffer.from("a-doua-poza");
  comenzi[0].items = [{ customization: { fata: { value: [CHEIE] }, spate: { value: [aDoua] } } }];

  const numele = async (k: string) => {
    const r = await GET(cere({ cheie: k, businessId: BIZ, comanda: COMANDA }));
    assert.equal(r.status, 200, `nu s-a servit ${k}`);
    await r.arrayBuffer();
    return r.headers.get("Content-Disposition");
  };

  assert.equal(await numele(CHEIE), `inline; filename="c-1043-fata-1.jpg"`);
  assert.equal(await numele(aDoua), `inline; filename="c-1043-spate-1.jpg"`,
    "doua campuri fara eticheta au dat acelasi nume de fisier");
});

test("⚠ cheia gasita in alta forma de `items` tot primeste un nume care o deosebeste", async () => {
  /*
   * ⚠ `items` s-a rescris deja o data. Cand numele nu se mai poate citi din forma cunoscuta,
   * dreptul RAMANE dovedit (cautarea de drept se face pe instantaneul intreg) si se pierde doar
   * eticheta — nu fisierul. Ce ramane e inceputul cheii, ca doua fisiere sa nu iasa la fel.
   */
  comenzi[0].items = [{ personalizare_veche: { poze: [CHEIE] } }];
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 200, "o forma necunoscuta de `items` a inchis fisierul");
  await r.arrayBuffer();
  assert.equal(r.headers.get("Content-Disposition"), `inline; filename="c-1043-aaaaaaaa.jpg"`);
});

test("⚠ o cheie a carei terminatie nu se poate citi iese ca octeti anonimi, nu ghicita", async () => {
  /*
   * ⚠ ASTA E RAMURA `?? "bin"`, SI NU E MOARTA. `areFormaCheii` cere doar `<ceva>-<24hex>.<ext>`
   * fara `/`, iar `<ceva>` are voie sa poarte `?` — acolo taie `terminatia`, care intoarce `null`.
   * Cheile noastre nu arata asa, dar numele si tipul se compun din `items`, adica din date vechi
   * de luni; fara cadenta, un `Content-Type` s-ar fi ghicit dintr-o terminatie inexistenta.
   */
  const ciudata = `products/customizations/${BIZ}/x?y-000000000000000000000000.jpg`;
  depozit[ciudata] = Buffer.from("octeti-fara-terminatie-citibila");
  comenzi[0].items = [{ customization: { f: { label: "Macheta", value: [ciudata] } } }];

  const r = await GET(cere({ cheie: ciudata, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 200, "o cheie cu terminatie necitibila a inchis fisierul");
  await r.arrayBuffer();
  assert.equal(r.headers.get("Content-Type"), "application/octet-stream", "tipul s-a ghicit");
  assert.equal(r.headers.get("Content-Disposition"), `inline; filename="c-1043-macheta-1.bin"`);
});

test("⚠ o eticheta cu ghilimele sau rand nou nu poate rupe antetul", async () => {
  /*
   * ⚠ Eticheta e text scris de comerciant si ajunge intr-un ANTET. Necuratata, un rand nou in ea
   * ar fi rupt raspunsul (undici arunca), iar o ghilimea ar fi inchis numele mai devreme.
   */
  comenzi[0].items = [{ customization: { f: { label: `Poza" ;\r\n x=y`, value: [CHEIE] } } }];
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 200);
  await r.arrayBuffer();
  assert.match(
    r.headers.get("Content-Disposition") ?? "", /^inline; filename="[a-z0-9.-]+"$/,
    "in numele fisierului a ajuns text necuratat",
  );
});

test("⚠ si o eticheta LUNGA ramane un nume: fiecare bucata se taie la 24 de caractere", async () => {
  /*
   * ⚠ Eticheta e text liber al comerciantului si n-are nicio limita de lungime nicaieri. Intreaga
   * in antet, numele cu care fisierul ajunge pe masina de tipar devine un paragraf — exact ce
   * repara numele asta — iar antetul creste la fiecare cerere, pe o ruta care nu se pune in cache.
   */
  comenzi[0].items = [{
    customization: { f: { label: "Poza de pe capacul cutiei, varianta finala trimisa de client", value: [CHEIE] } },
  }];
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 200);
  await r.arrayBuffer();
  assert.equal(
    r.headers.get("Content-Disposition"), `inline; filename="c-1043-poza-de-pe-capacul-cutie-1.jpg"`,
    "eticheta lunga a intrat netaiata in numele fisierului",
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   FRANA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ o bucla e franata, si cererea franata nu mai atinge baza", async () => {
  /*
   * ⚠ Ruta citeste obiectul INTREG in memorie si il mai copiaza o data la iesire (40 MB plafon la
   * documente), iar `no-store` inseamna ca nici CDN-ul nu absoarbe nimic: fiecare cerere e egress
   * R2 platit. Surorile care ating depozitul au frana; asta n-avea niciuna.
   *
   * ⚠ SE INUNDA CU ALT CONT DINADINS: contorul e pe `user.id`, deci proba nu are voie sa lase
   * plafonul consumat pentru celelalte probe din fisier. Iar ca frana e chiar pe SESIUNE — nu pe
   * magazin si nu pe toata lumea — se MASOARA la sfarsitul probei; de aici nu se presupune.
   */
  utilizator = "user-de-inundare";
  let ultim = 0;
  let cereri = 0;
  for (; cereri < 400; cereri++) {
    ultim = (await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }))).status;
    if (ultim === 429) break;
  }
  assert.equal(ultim, 429, "ruta n-a franat nimic dupa 400 de cereri ale aceleiasi sesiuni");
  assert.ok(cereri > 20, `frana e prea stransa: a taiat dupa ${cereri} cereri, iar o comanda are pana la 20 de fisiere`);

  cai = [];
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 429);
  assert.deepEqual(cai, [], "cererea franata a atins totusi baza");

  /*
   * ⚠ SI ALTA SESIUNE TRECE MAI DEPARTE. Asta e jumatatea care lipsea: pana aici proba arata doar
   * ca se franeaza CINEVA. Cu un contor global — o singura cheie pentru toata lumea — un singur
   * comerciant cu o bucla ar fi taiat miniaturile TUTUROR comerciantilor de pe instanta, si suita
   * ar fi ramas verde.
   *
   * Contul de aici e proaspat dinadins si nu are magazinul: 403 inseamna ca a trecut DE frana, iar
   * proba nu mananca din plafonul lui `UTILIZATOR`, pe care se sprijina celelalte probe.
   */
  utilizator = "user-nefranat";
  const alta = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(alta.status, 403, "frana a taiat si o alta sesiune: contorul nu e pe `user.id`");
});

test("⚠ frana vine DUPA sesiune: fara cont iese 401, nu 429", async () => {
  /* Altfel un anonim ar fi putut consuma plafonul cuiva, sau si-ar fi luat unul al lui. */
  utilizator = null;
  const r = await GET(cere({ cheie: CHEIE, businessId: BIZ, comanda: COMANDA }));
  assert.equal(r.status, 401);
});
