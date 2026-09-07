import assert from "node:assert/strict";
import { test, before, after, beforeEach } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { cheieMiniatura, esteCheiaNoastra } from "@/lib/customization/fisiere-private";
import { semneazaPermisul } from "@/lib/customization/permis-incarcare";
import { MB_IMAGINE } from "@/lib/customization/definitie";

/**
 * CE POARTA RASPUNSUL RUTEI DE INCARCARE — si de ce forma lui e o promisiune, nu un detaliu.
 *
 * ═══ ⚠ CE A COSTAT LIPSA PROBEI ASTEIA ═══
 *
 * Raspunsul s-a redenumit din `{ url }` in `{ cheie }` fara ca nimic sa scartaie: tsc trece
 * (raspunsul e `NextResponse.json(...)`, adica `any` pentru apelant), eslint trece, build-ul trece.
 * Dar pachetul care rula atunci in browserele cumparatorilor citea `date.url`, si facea
 * `if (date.url) ... else { refuzat = true; }`. Fara `url`, orice pagina ramasa deschisa peste
 * desfasurare lua ramura de esec pe un fisier care TOCMAI fusese scris cu succes in depozit, si
 * arata textul generic „Accepta JPG, PNG, WEBP si HEIC, pana in 10 MB” — format si marime, doua
 * explicatii false. Campul de personalizare e de obicei OBLIGATORIU: comanda se pierde, si fiecare
 * reincercare mai lasa un obiect orfan in depozitul platit.
 *
 * De-aia proba de aici nu se uita la sursa, ci RULEAZA CHIAR RUTA si citeste raspunsul exact cum
 * il citeste pachetul din browser. O redenumire tacuta nu mai are pe unde sa treaca.
 *
 * ═══ ⚠ FEREASTRA S-A INCHIS PE 07.09.2026, SI FISIERUL RAMANE ═══
 *
 * `url` a iesit din raspuns, impreuna cu `esteAdresaVeche` din `comanda.ts`. Numele fisierului
 * ramane cel de acum, fiindca intrebarea e aceeasi — CE POARTA RASPUNSUL RUTEI —, doar ca
 * raspunsul corect s-a intors: atunci se cerea ca `url` sa FIE acolo, acum se cere sa NU fie, si
 * niciun fel de adresa cu el. Probele care apara o granita nu se sterg cand granita se muta; se
 * intorc, si atunci pastreaza si istoria mutarii.
 *
 * ═══ ⚠ SI CA PLAFONUL DURABIL CHIAR E CONSULTAT ═══
 *
 * Capatul e public, neautentificat, si scrie in depozit platit din care nimic nu se sterge
 * vreodata. Singura paza era contorul din memoria procesului — care pe serverless se inmulteste cu
 * instantele calde si se pierde la fiecare desfasurare. Se cere aici ca al doilea contor, cel din
 * Postgres, sa fie chemat INAINTE de scriere si sa poata chiar sa opreasca scrierea.
 *
 * ═══ ⚠ SI CELELALTE TREI PAZE ALE ACELUIASI CAPAT ═══
 *
 * Adaugate dupa ce fiecare a fost masurata ca NEAPARATA: stratul din memorie, refuzul magazinului
 * nepublicat si terminatia cheii puteau fi toate scoase din ruta fara ca vreo proba din proiect sa
 * clipeasca. Ele stau aici, langa celelalte, fiindca sunt tot despre ce iese din capatul asta
 * public: cate cereri, de la cine, si sub ce nume ajunge fisierul in depozitul platit.
 *
 * ⚠ INLOCUIT E DOAR DEPOZITUL. Baza e un PostgREST de proba, vorbit prin clientul supabase
 * ADEVARAT, deci un nume de functie gresit sau un parametru redenumit cade aici, nu in productie.
 * `sharp`, semnarea cheii si limitatorul din memorie sunt cele adevarate.
 */

const BIZ = "11111111-1111-4111-8111-111111111111";
const NEPUBLICAT = "22222222-2222-4222-8222-222222222222";
/** Produsul de pe a carui pagina se incarca — intra in permis. */
const PRODUS = "33333333-3333-4333-8333-333333333333";
/** Ce ar fi intors `uploadToR2`: adresa publica. Ramane ca sa se poata cere ca ea sa NU apara. */
const CDN = "https://cdn-de-proba.r2.dev";

/** Un PNG de 1x1 adevarat: octetii trec si de semnatura, si de `sharp`. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Un PDF, cat cere `detectDocMime`: standardul pune `%PDF-` chiar la inceputul fisierului, si
 * exact primii cinci octeti se citesc. Restul e umplutura, ca sa arate a fisier, nu a semnatura.
 */
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n", "ascii");

/* ── Baza de proba: atat PostgREST cat intreaba ruta ──────────────────────────── */

type ApelLimita = { p_cheie: string; p_limita: number; p_fereastra_sec: number; p_blocare_sec?: number; p_cost?: number };

/** Cheile pentru care contorul raspunde „nu mai ai”. */
let epuizate = new Set<string>();
/** Pornit, RPC-ul cade — cum ar cadea baza in productie. */
let cadeRpc = false;
/** Ce a fost intrebat contorul, in ordine. */
let apeluri: ApelLimita[] = [];
/** Caile lovite de la ultima golire: asa se vede CE s-a atins si in ce ordine. */
let cai: string[] = [];

const MAGAZINE = [
  { id: BIZ, is_published: true },
  { id: NEPUBLICAT, is_published: false },
];

function potriveste(rand: Record<string, unknown>, coloana: string, expresie: string): boolean {
  const punct = expresie.indexOf(".");
  const op = expresie.slice(0, punct);
  const val = expresie.slice(punct + 1);
  if (op !== "eq") throw new Error(`operator PostgREST neinteles: ${coloana}=${expresie}`);
  const v = rand[coloana] ?? null;
  return v !== null && String(v) === val;
}

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const cale = url.pathname.replace("/rest/v1/", "");
  const bucati: Buffer[] = [];
  req.on("data", (c: Buffer) => bucati.push(c));
  req.on("end", () => {
    const json = (cod: number, date: unknown) => {
      res.writeHead(cod, { "content-type": "application/json" });
      res.end(JSON.stringify(date));
    };
    try {
      cai.push(cale);

      if (cale === "rpc/consuma_limita") {
        if (cadeRpc) return json(500, { code: "57014", message: "baza de proba: contorul a cazut" });
        const p = JSON.parse(Buffer.concat(bucati).toString() || "{}") as ApelLimita;
        if (typeof p.p_cheie !== "string" || typeof p.p_limita !== "number" || typeof p.p_fereastra_sec !== "number") {
          throw new Error(`parametri de limitare de forma neasteptata: ${JSON.stringify(p)}`);
        }
        apeluri.push(p);
        /* `returns table (permis, blocat_pana)` — deci un SIR de randuri, ca in Postgres. */
        return json(200, [{ permis: !epuizate.has(p.p_cheie), blocat_pana: null }]);
      }

      if (cale === "businesses") {
        let randuri: Record<string, unknown>[] = MAGAZINE;
        for (const [cheie, valoare] of url.searchParams) {
          if (["select", "order", "limit", "offset"].includes(cheie)) continue;
          randuri = randuri.filter((r) => potriveste(r, cheie, valoare));
        }
        /* Ruta cere `select=id`, iar `.maybeSingle()` desface singur sirul. */
        return json(200, randuri.map((r) => ({ id: r.id })));
      }

      return json(200, []);
    } catch (e) {
      /* ⚠ Greseala bazei de proba iese ca 500 CU MESAJ, nu ca tacere. */
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: `baza de proba: ${(e as Error).message}` }));
    }
  });
});

/* ── Ce se inlocuieste: depozitul, si nimic altceva ───────────────────────────── */

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/r2") {
       return {
         url: "data:text/javascript," + encodeURIComponent(
           "export const linkDeIncarcarePrivata = async (k, t, n) => globalThis.__depozit.link(k, t, n);"
           + "export const masoaraIncarcarea = async (k) => globalThis.__depozit.masoara(k);"
           + "export const inceputulIncarcarii = async (k, n) => globalThis.__depozit.inceput(k, n);"
           + "export const mutaIncarcarea = async (a, b, t) => globalThis.__depozit.muta(a, b, t);"
           + "export const stergeIncarcarea = async (k) => globalThis.__depozit.sterge(k);"
           + "export const incarcaMiniatura = async (k, b) => globalThis.__depozit.miniatura(k, b);"),
         shortCircuit: true, format: "module",
       };
     }
     return next(specifier, context);
   }`,
)}`;

/*
 * ⚠ `cache` A IESIT DE AICI, si nu s-a pierdut.
 *
 * Antetul `private, no-store` era un ARGUMENT dat de ruta lui `uploadToR2`, deci se putea masura
 * din afara. De cand incarcarile trec prin `incarcaPrivat`, el e hardcodat ACOLO — ruta nu-l mai
 * poate gresi, fiindca nu-l mai trimite. Afirmatia s-a mutat unde traieste acum garantia:
 * `galeata-privata.test.ts`, „`incarcaPrivat` nu intoarce nicio adresa".
 */
type Scriere = { cheie: string; tip: string; octeti: number };
/** Ce a ajuns pe o cheie DEFINITIVA — adica ce a trecut de toate verificarile. */
let scrieri: Scriere[] = [];
/** Ce sta chiar acum in depozit, pe orice cheie. Browserul „urca" scriind aici. */
let depozit: Record<string, { octeti: Buffer; tip: string }> = {};
/** Ce s-a sters, in ordine: asa se vede ca un fisier refuzat chiar pleaca. */
let sterse: string[] = [];
/** Linkurile date, cu ce s-a semnat in ele. */
let linkuri: { cheie: string; tip: string; octeti: number }[] = [];

/** Cate si ce s-a citit inapoi din depozit. Asa se vede daca un PDF mare a fost adus INTREG. */
let citiri: { cheie: string; octeti: number }[] = [];
/** Ce miniaturi s-au scris, in ordine. */
let miniaturi: { cheie: string; octeti: Buffer }[] = [];
/** Pornit, scrierea miniaturii arunca. Incarcarea trebuie sa reuseasca mai departe. */
let cadeMiniatura = false;

let POST: (req: NextRequest) => Promise<Response>;
let FINAL: (req: NextRequest) => Promise<Response>;

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  process.env.CUSTOMIZATION_FILE_SECRET = "secret-de-proba-pentru-semnatura";

  register(HOOK);
  /*
   * ⚠ DEPOZITUL DE PROBA, nu o pipa. De pe 07.09.2026 octetii nu mai trec prin functie: browserul
   * ii pune de-a dreptul in depozit, printr-un link semnat. Aici „urcarea" e o scriere in `depozit`,
   * facuta chiar de proba — exact ce face browserul in productie.
   */
  (globalThis as unknown as { __depozit: unknown }).__depozit = {
    link: async (k: string, t: string, n: number) => {
      linkuri.push({ cheie: k, tip: t, octeti: n });
      return `https://depozit-de-proba.invalid/${encodeURIComponent(k)}`;
    },
    masoara: async (k: string) =>
      depozit[k] ? { octeti: depozit[k].octeti.length, contentType: depozit[k].tip } : null,
    inceput: async (k: string, n: number) => {
      citiri.push({ cheie: k, octeti: n });
      return depozit[k] ? depozit[k].octeti.subarray(0, n) : null;
    },
    muta: async (de: string, la: string, t: string) => {
      const o = depozit[de];
      delete depozit[de];
      depozit[la] = { octeti: o.octeti, tip: t };
      scrieri.push({ cheie: la, tip: t, octeti: o.octeti.length });
    },
    sterge: async (k: string) => { delete depozit[k]; sterse.push(k); },
    miniatura: async (k: string, b: Buffer) => {
      if (cadeMiniatura) throw new Error("proba: scrierea miniaturii a cazut");
      depozit[k] = { octeti: b, tip: "image/webp" };
      miniaturi.push({ cheie: k, octeti: b });
    },
  };

  ({ POST } = (await import("./route")) as unknown as { POST: typeof POST });
  ({ POST: FINAL } = (await import("./finalizeaza/route")) as unknown as { POST: typeof FINAL });
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  epuizate = new Set();
  cadeRpc = false;
  apeluri = [];
  cai = [];
  scrieri = [];
  depozit = {};
  sterse = [];
  linkuri = [];
  miniaturi = [];
  citiri = [];
  cadeMiniatura = false;
});

/**
 * O cerere adevarata catre ruta.
 *
 * ⚠ FIECARE PROBA PRIMESTE ALT IP. Limitatorul din memorie e cel adevarat si tine minte intre
 * probe: pe un IP comun, a douazeci si una cerere ar fi picat cu 429 fara nicio legatura cu ce se
 * verifica, iar proba ar fi devenit una care pica dupa ordinea in care e rulata.
 */
let nrIp = 0;
interface Parametri {
  ip?: string;
  businessId?: string | null;
  /** Octetii pe care ii „urca" browserul. Implicit un PNG adevarat. */
  octeti?: Buffer;
  documente?: boolean;
  /** Permis dat de-a gata — pentru probele care vor unul stricat, expirat sau lipsa. */
  permis?: string | null;
  /** Ce camp se declara. Implicit cel care exista in permis. */
  camp?: string;
  /** Ce tip DECLARA clientul. Implicit cel potrivit campului — se rejudeca pe octeti la finalizare. */
  tip?: string;
  /** Ce marime DECLARA clientul, cand proba vrea alta decat cea adevarata. */
  marime?: number;
  /** Ce referinta trimite la finalizare, cand proba vrea una straina. */
  referinta?: string;
}

function cere(p: Parametri = {}) {
  const ip = p.ip ?? `203.0.113.${++nrIp}`;
  /*
   * ⚠ AICI STATEA `business_id`, TRIMIS DE CLIENT. De pe 07.09.2026 ruta cere un PERMIS semnat pe
   * server: magazinul, produsul, campurile de fisier si FELUL fiecaruia ies din el, nu din ce
   * declara cel care incarca. Vezi `permis-incarcare.ts`.
   */
  const permis = p.permis !== undefined
    ? p.permis
    : semneazaPermisul(p.businessId ?? BIZ, PRODUS, { poza: "i", tipar: "d" });
  /*
   * ⚠ SI NU MAI PLEACA NICIUN OCTET PE AICI. Ruta da doar voie: primeste tipul si marimea
   * DECLARATE si intoarce un link semnat. Vezi antetul ei pentru de ce — Vercel refuza cererile de
   * peste 4,5 MB, iar campurile promiteau 10 si 40.
   */
  const trup = p.octeti ?? PNG;
  const req = new NextRequest("https://magazin.edinio.com/api/upload-customization", {
    method: "POST",
    body: JSON.stringify({
      ...(permis !== null ? { permis } : {}),
      camp: p.camp ?? (p.documente ? "tipar" : "poza"),
      tip: p.tip ?? (p.documente ? "application/pdf" : "image/png"),
      octeti: p.marime ?? trup.length,
    }),
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
  });
  return { req, ip };
}

/**
 * Drumul INTREG, asa cum il face browserul: cere voie, urca octetii, cere verdictul.
 *
 * ⚠ „URCAREA" E O SCRIERE DIRECTA IN DEPOZITUL DE PROBA — exact ce face browserul in productie,
 * prin linkul semnat. Serverul nu vede octetii pe drumul asta; ii citeste abia la finalizare, din
 * depozit.
 */
async function urca(p: Parametri = {}) {
  const { req, ip } = cere(p);
  const voie = await POST(req);
  if (voie.status !== 200) return { voie, final: null, ip };

  const { referinta } = (await voie.json()) as { referinta: string };
  depozit[referinta] = {
    octeti: Buffer.from(p.octeti ?? PNG),
    tip: p.documente ? "application/pdf" : "image/png",
  };

  const permis = p.permis !== undefined
    ? p.permis
    : semneazaPermisul(p.businessId ?? BIZ, PRODUS, { poza: "i", tipar: "d" });
  const final = await FINAL(new NextRequest(
    "https://magazin.edinio.com/api/upload-customization/finalizeaza",
    {
      method: "POST",
      body: JSON.stringify({
        ...(permis !== null ? { permis } : {}),
        camp: p.camp ?? (p.documente ? "tipar" : "poza"),
        referinta: p.referinta ?? referinta,
      }),
      headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    },
  ));
  return { voie, final, referinta, ip };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORMA RASPUNSULUI LA SUCCES — cea pe care n-o fixa nimic
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ FEREASTRA E INCHISA: raspunsul nu mai poarta nicio adresa", async () => {
  /*
   * ═══ ⚠ CE SE APARA AICI, DE ACUM ═══
   *
   * O desfasurare intreaga raspunsul a purtat si `url`, ca paginile ramase deschise sa nu se rupa
   * — pachetul de atunci facea `if (date.url) adrese.push(date.url); else { refuzat = true; }`.
   * Pe 07.09.2026 `url` a iesit, odata cu `esteAdresaVeche` din `comanda.ts`.
   *
   * ⚠ ACUM AFIRMATIA SE INTOARCE: adresa publica a fisierului nu mai are voie sa iasa din ruta.
   * Ea e chiar lucrul de care lucrarea asta a scapat — o adresa plecata in raspuns ajunge in
   * comanda, de acolo in emailul catre atelier, si de acolo in casutele a doi furnizori, ani de
   * zile, fara nimic care s-o expire. `uploadToR2` o intoarce mai departe (asa o cer celelalte
   * doua duzini de locuri care urca imagini de produs), deci singurul lucru care o opreste sa
   * iasa e randul de mai jos.
   *
   * ⚠ SE CERE PE VALOARE, nu doar pe numele cheii: `url` redenumit in `adresa`, `href` sau
   * `publicUrl` ar fi trecut de o proba care se uita numai la `Object.keys`.
   */
  const { final } = await urca();
  assert.equal(final?.status, 200, "incarcarea a esuat inainte sa se ajunga la forma raspunsului");

  const date = (await final!.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(date), ["cheie"], "raspunsul poarta si altceva decat cheia");

  const brut = JSON.stringify(date);
  assert.equal(brut.includes(CDN), false, `adresa publica a iesit din ruta: ${brut}`);
  assert.equal(/https?:\/\//.test(brut), false, `raspunsul poarta o adresa: ${brut}`);
});

test("⚠ VOIA nu da nicio adresa PUBLICA, si nici o cheie buna", async () => {
  /*
   * ═══ ⚠ PASUL 1 ESTE ACUM SUPRAFATA CEA MAI EXPUSA ═══
   *
   * El intoarce un link semnat catre depozit. Doua lucruri nu are voie sa dea:
   *
   *   ADRESA PUBLICA — chiar lucrul de care fisierele astea au scapat; plecata in raspuns, ea
   *   ajunge in comanda si de acolo in emailuri, ani de zile.
   *
   *   O CHEIE BUNA — daca `referinta` ar trece de `esteCheiaNoastra`, cine cere voie ar putea sa NU
   *   mai urce nimic, sa nu cheme finalizarea, si totusi sa trimita cheia in comanda. Comerciantul
   *   ar primi o comanda cu un fisier care nu exista. Sau, mai rau, ar urca ce vrea si ar sari
   *   peste verificari.
   */
  const { req } = cere();
  const r = await POST(req);
  assert.equal(r.status, 200);
  const date = (await r.json()) as { incarcare: string; referinta: string };
  assert.deepEqual(Object.keys(date).sort(), ["incarcare", "referinta"]);
  assert.equal(date.incarcare.includes(CDN), false, "linkul arata catre domeniul public");
  assert.equal(
    esteCheiaNoastra(date.referinta, BIZ), false,
    "referinta provizorie trece de poarta comenzii: se putea sari peste verificari cu totul",
  );
  assert.deepEqual(scrieri, [], "s-a scris pe o cheie definitiva inainte de vreo verificare");

  /* ⚠ Si marimea INTRA IN LINK: fara ea, plafonul ar fi ramas o promisiune a clientului. */
  assert.deepEqual(
    linkuri, [{ cheie: date.referinta, tip: "image/png", octeti: PNG.length }],
    "linkul nu leaga marimea, deci cine cere voie pentru 2 MB poate urca 500",
  );
});

test("⚠ cheia intoarsa e chiar fisierul scris, si trece de poarta comenzii", async () => {
  const { final } = await urca();
  assert.equal(final?.status, 200);
  const date = (await final!.json()) as Record<string, unknown>;

  const cheie = date.cheie as string;
  assert.equal(
    esteCheiaNoastra(cheie, BIZ), true,
    "cheia intoarsa nu trece de poarta comenzii: fisierul urcat n-ar mai putea fi trimis in comanda",
  );

  /*
   * ⚠ SI E CHIAR FISIERUL SCRIS. De cand `url` a iesit, cheia intoarsa e SINGURA legatura dintre
   * ce s-a urcat si ce se poate comanda: intoarsa alta, cumparatorul ar trimite in comanda o cheie
   * valida catre un obiect care nu exista, iar atelierul ar primi o comanda cu un fisier gol.
   * Octetii, antetul care nu lasa urme, si cheia — toate trei pe acelasi rand.
   */
  assert.deepEqual(
    scrieri, [{ cheie, tip: "image/png", octeti: PNG.length }],
    "poza cumparatorului nu s-a scris asa cum promite ruta",
  );
});

test("⚠ raspunsul de EROARE nu poarta nici cheie, nici adresa", async () => {
  /* ⚠ „Fara fisier" a devenit „fara marime": ruta nu mai primeste octeti, ci o declaratie. */
  const { req } = cere({ marime: 0 });
  const r = await POST(req);
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys((await r.json()) as object), ["error"]);
  assert.deepEqual(scrieri, [], "s-a scris in depozit pentru o cerere refuzata");
  assert.deepEqual(linkuri, [], "s-a dat un link semnat pentru o cerere refuzata");
});

/* ═══════════════════════════════════════════════════════════════════════════
   PLAFONUL DURABIL — capatul public care scrie in depozit platit
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ contorul din baza e chemat pe AMANDOUA cheile, si inainte de orice scriere", async () => {
  const { req, ip } = cere();
  const r = await POST(req);
  assert.equal(r.status, 200);

  const chei = apeluri.map((a) => a.p_cheie);
  /*
   * ⚠ TREI CHEI DE PE 07.09.2026, nu doua. A treia numara OCTETI, nu cereri: cu 400 de fisiere pe
   * ora si 40 MB pe fisier, marginea „in cereri" ingaduia ~16 GB pe ora pe magazin — iar depozitul
   * se plateste lunar, la nesfarsit.
   */
  assert.deepEqual(
    chei,
    [`upload-personalizare:ip:${ip}`, `upload-personalizare:mb:${BIZ}`, `upload-personalizare:mag:${BIZ}`],
    "capatul public scrie in depozit fara contorul durabil (cel din memorie se pierde la fiecare desfasurare)",
  );
  /*
   * ⚠ CIFRA E UN BUTON DE REGLAJ, DAR AMANDOUA MARGINILE I SE CER.
   *
   * Aici se cerea doar ca limita sa fie un numar pozitiv. Cu atat, `consumaLimita(..., 10_000_000,
   * 3600)` trecea verde — adica exact capatul public nelimitat pentru care s-a pus contorul, doar
   * ca acum imbracat intr-un apel care SEAMANA cu o paza. Marginea de sus e cea care face
   * diferenta intre plafon si decor. 1000 e larg fata de cifrele de azi (80 pe IP, 400 pe
   * magazin), deci regleaza cine vrea; ce nu se mai poate e sa fie desfiintat plafonul pastrand
   * aparenta.
   *
   * Fereastra, in schimb, nu e buton deloc: o limita „pe ora” scrisa din greseala in milisecunde
   * ar fi lasat capatul practic nelimitat.
   */
  for (const a of apeluri) {
    assert.equal(a.p_fereastra_sec, 3600, `fereastra lui ${a.p_cheie} nu mai e de o ora`);
    assert.ok(Number.isFinite(a.p_limita) && a.p_limita > 0, `limita lui ${a.p_cheie} nu e un numar folositor`);
    /*
     * ⚠ MARGINEA DE SUS E PE SCARA CHEII. Cele care numara CERERI stau sub 1000; cea care numara
     * MEGAOCTETI e pe alta scara si i se cere alta margine — 4 GB pe ora pe magazin. Aceeasi cifra
     * pentru amandoua ar fi insemnat ori un plafon de octeti inutilizabil, ori unul de cereri
     * desfiintat.
     */
    const marginea = a.p_cheie.includes(":mb:") ? 4096 : 1000;
    assert.ok(
      a.p_limita <= marginea,
      `limita lui ${a.p_cheie} e ${a.p_limita} pe ora: plafonul exista doar pe hartie`,
    );
    /*
     * ⚠ SI FARA BLOCARE PROGRESIVA. Ruta o cere cu motiv scris (`blocareSec` = 0): cheia poate fi
     * un IP impartit de un oras intreg — operatorii de mobil din Romania pun mii de abonati pe
     * aceeasi iesire NAT —, iar o blocare de-o ora peste el ar tine departe cumparatori care n-au
     * facut nimic, la un camp de obicei OBLIGATORIU. Fereastra expira singura. Fara randul asta,
     * afirmatia aia nu e aparata de nimic: parametrul se trimite, dar nu-l citeste nimeni.
     */
    assert.equal(
      a.p_blocare_sec, 0,
      `${a.p_cheie} blocheaza progresiv: un IP de operator mobil ar sta o ora afara pentru fapta altuia`,
    );
  }
});

test("⚠ cota de IP epuizata OPRESTE scrierea, si nici nu mai atinge baza dupa aceea", async () => {
  const ip = "198.51.100.7";
  epuizate.add(`upload-personalizare:ip:${ip}`);

  const r = await POST(cere({ ip }).req);
  assert.equal(r.status, 429, "cota epuizata si cererea a trecut");
  assert.match((await r.json() as { error: string }).error, /conexiune/i);
  assert.deepEqual(scrieri, [], "s-a scris in depozit desi cota era epuizata — adica plafonul nu apara nimic");
  /*
   * ⚠ SI SE OPRESTE INAINTEA INTEROGARII DE MAGAZIN. Pusa inaintea plafonului, interogarea aia e
   * o cerere de baza pe care capatul o da oricui, la nesfarsit — adica si o sonda gratuita de
   * „exista magazinul asta?”.
   */
  assert.equal(cai.includes("businesses"), false, `plafonul se consulta dupa baza: s-a atins ${cai.join(", ")}`);
});

test("⚠ si cota MAGAZINULUI opreste, cand abuzatorul isi schimba IP-ul", async () => {
  epuizate.add(`upload-personalizare:mag:${BIZ}`);

  const r = await POST(cere().req);
  assert.equal(r.status, 429, "cheia pe magazin nu opreste nimic: cine roteste IP-uri urca mai departe");
  assert.match((await r.json() as { error: string }).error, /magazinul/i);
  assert.deepEqual(scrieri, [], "s-a scris in depozit desi magazinul isi epuizase cota");
});

test("⚠ si cota de OCTETI opreste, cand fisierele sunt putine dar uriase", async () => {
  /*
   * ═══ ⚠ CE NU ACOPEREA NUMARATOAREA DE CERERI ═══
   *
   * 400 de fisiere pe ora pe magazin × 40 MB = ~16 GB pe ora, pe un capat public la care oricine
   * deschide pagina unui produs capata un permis legitim. Permisul leaga CINE si CE, dar nu si CAT
   * — iar depozitul se plateste lunar, la nesfarsit, fiindca un fisier fara comanda traieste pana
   * il ia cronul de retentie.
   */
  epuizate.add(`upload-personalizare:mb:${BIZ}`);
  const r = await POST(cere().req);
  assert.equal(r.status, 429, "cota de octeti nu opreste nimic: 400 de fisiere mari trec la fel ca 400 mici");
  assert.deepEqual(scrieri, [], "s-a scris in depozit desi magazinul isi epuizase cota de octeti");
});

test("⚠ costul e in MEGAOCTETI, rotunjit in sus", async () => {
  /*
   * ⚠ ROTUNJIT IN SUS, si nu e pedanterie: contorul numara intregi, deci un fisier de 200 KB ar fi
   * costat 0 — si o mie de fisiere mici ar fi trecut fara sa consume nimic din fereastra.
   */
  await POST(cere().req);
  const mic = apeluri.find((a) => a.p_cheie.includes(":mb:"));
  /*
   * ⚠ LIPSA INSEAMNA 1, si de-aia se cere intelesul, nu prezenta cheii. `consumaLimita` trimite
   * `p_cost` numai cand e diferit de 1 — asa, chemarea ramane pe patru argumente in cazul obisnuit
   * si merge si pe baza fara migratia aplicata inca. Cerand cheia prezenta, proba ar fi cerut de
   * fapt ca migratia sa fie deja peste tot.
   */
  assert.equal(mic?.p_cost ?? 1, 1, `un PNG de cativa octeti a costat ${mic?.p_cost}`);

  /* Iar un fisier mare costa cati megaocteti are — altfel plafonul ar fi decor. */
  apeluri = [];
  const mare = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
  await POST(cere({ octeti: mare }).req);
  const greu = apeluri.find((a) => a.p_cheie.includes(":mb:"));
  assert.equal(greu?.p_cost, 4, `un fisier de ~3,1 MB a costat ${greu?.p_cost}`);

  /* ⚠ Si celelalte doua chei raman pe cost 1: ele numara CERERI, nu octeti. */
  for (const a of apeluri.filter((x) => !x.p_cheie.includes(":mb:"))) {
    assert.ok(a.p_cost === undefined || a.p_cost === 1, `${a.p_cheie} a primit cost ${a.p_cost}`);
  }
});

test("⚠ un fisier PESTE plafon e refuzat INAINTE sa consume cota de octeti", async () => {
  /*
   * ═══ ⚠ ALTFEL PLAFONUL DEVINE O CALE DE A INCHIDE VANZARILE ═══
   *
   * Cota se consuma cu cati megaocteti are fisierul. Verificata dupa ea, o cerere de 500 MB — pe
   * care ruta oricum o refuza pentru marime — ar fi consumat 500 de unitati inainte de refuz: cinci
   * cereri de-astea si cota magazinului pe ora e goala, iar cumparatorii lui adevarati primesc 429.
   */
  const urias = Buffer.concat([PNG, Buffer.alloc((MB_IMAGINE + 1) * 1024 * 1024)]);
  const r = await POST(cere({ octeti: urias }).req);
  assert.equal(r.status, 400, "un fisier peste plafon n-a fost refuzat pentru marime");
  assert.deepEqual(apeluri, [], "fisierul refuzat a consumat totusi din cota magazinului");
  assert.deepEqual(scrieri, []);
});

test("⚠ contorul cazut LASA cumparatorul sa urce — limitatorul nu devine el caderea", async () => {
  cadeRpc = true;
  const { voie, final } = await urca();
  assert.equal(
    voie.status, 200,
    "o baza care clipeste opreste incarcarile: la un camp obligatoriu, asta e comanda pierduta",
  );
  assert.equal(final?.status, 200, "finalizarea a cazut cu baza, desi ea nici n-o atinge");
  assert.equal(scrieri.length, 1, "fisierul n-a ajuns in depozit");
});

test("⚠ primul strat, cel din memorie, taie rafala FARA sa atinga baza", async () => {
  /*
   * ⚠ CELE DOUA STRATURI NU FAC ACELASI LUCRU, si de-aia se cer amandoua.
   *
   * Cel durabil tine peste desfasurari si peste instante — dar fiecare consultare a lui e o cerere
   * de baza pe care capatul asta o da oricui, neautentificat. Cel din memorie e cel care face ca o
   * rafala sa nu se transforme in tot atatea cereri catre Postgres. Scos, suita ramanea verde:
   * masurat, `if (false)` peste el trece 7/7.
   *
   * Se cere prin PURTARE, nu prin cautare in sursa: a douazeci si una cerere din aceeasi fereastra,
   * de pe acelasi IP, iese 429 SI nu atinge baza deloc. Mesajul e si el parte din proba — cele doua
   * refuzuri de 429 spun lucruri diferite, iar cel din memorie e singurul care zice „in scurt timp”.
   */
  const ip = "198.51.100.42";
  for (let i = 1; i <= 20; i++) {
    assert.equal(
      (await POST(cere({ ip }).req)).status, 200,
      `cererea ${i} din cele douazeci permise a fost refuzata`,
    );
  }
  const apeluriInainte = apeluri.length;
  const caiInainte = cai.length;
  const linkuriInainte = linkuri.length;

  const r = await POST(cere({ ip }).req);
  assert.equal(r.status, 429, "stratul din memorie nu mai opreste nimic: rafala trece intreaga la baza");
  /* ⚠ Cele douazeci de dinainte si-au luat linkul, cum trebuie; a douazeci si una nu. */
  assert.equal(linkuri.length, linkuriInainte, "s-a dat un link semnat desi rafala fusese oprita");
  assert.match(
    (await r.json() as { error: string }).error, /in scurt timp/i,
    "a raspuns alt refuz decat cel din memorie",
  );
  /*
   * ⚠ ZERO, NU DOUAZECI — si asta e chiar mutarea. Cererile de VOIE nu scriu nimic: ele dau un
   * link. In depozit ajunge ceva abia dupa ce browserul urca si finalizarea verifica.
   */
  assert.equal(scrieri.length, 0, "cererea de voie a scris totusi in depozit");
  assert.equal(apeluri.length, apeluriInainte, "cererea taiata a mai consultat o data contorul din baza");
  assert.equal(cai.length, caiInainte, "cererea taiata a atins totusi baza");
});

/* ═══════════════════════════════════════════════════════════════════════════
   CELELALTE DOUA PAZE — cele pentru care exista schela, dar nu si proba
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ FARA PERMIS nu se scrie nimic in depozitul platit, oricat de valid ar fi UUID-ul", async () => {
  /*
   * ═══ ⚠ GARANTIA S-A MUTAT, NU A DISPARUT — 07.09.2026 ═══
   *
   * Proba cerea aici 404 pentru un magazin NEPUBLICAT, si ca ruta sa fi INTREBAT baza. Amandoua
   * descriau interogarea de magazin — care nu mai exista. Nu fiindca gaura s-ar fi inchis singura,
   * ci fiindca intrebarea s-a mutat mai devreme: permisul se emite cand se randeaza pagina
   * produsului, iar pagina aia nu se randeaza pentru un magazin nepublicat. Ruta nu mai are ce sa
   * intrebe — si nu mai poate nici sa cada deschis, cum cadea.
   *
   * ⚠ SI CE APARA ACUM, mai mult decat inainte: `business_id` era in HTML-ul fiecarui magazin, deci
   * refuzul de dinainte oprea doar UUID-urile INVENTATE. Cine il copia pe cel adevarat al unui
   * magazin publicat trecea. Acum nu trece nimeni fara semnatura noastra — nici cu id-ul corect al
   * unui magazin viu.
   */
  for (const [nume, permis] of [
    ["lipsa cu totul", null],
    ["inventat", "9999999999999.eyJiIjoiYSJ9.nuEsemnaturaNoastra"],
    ["ciuntit", "nu-e-un-permis"],
  ] as const) {
    scrieri = [];
    const r = await POST(cere({ permis }).req);
    assert.equal(r.status, 403, `permis ${nume}: a trecut`);
    assert.deepEqual(scrieri, [], `permis ${nume}: s-a scris in depozit`);
  }

  /*
   * ⚠ SI CAND EXPIRA, RASPUNSUL E ALTUL — o fila lasata deschisa peste noapte nu e un abuz, si
   * omul trebuie sa afle ca are de reincarcat pagina, nu de reparat fisierul. Un singur „nu"
   * pentru toate ar fi trimis exact indicatia gresita celui nevinovat, la un camp obligatoriu.
   */
  scrieri = [];
  const expirat = semneazaPermisul(BIZ, PRODUS, { poza: "i" }, Date.now() - 1000);
  const r = await POST(cere({ permis: expirat }).req);
  assert.equal(r.status, 400, "un permis expirat n-a fost deosebit de unul falsificat");
  assert.match(
    ((await r.json()) as { error: string }).error, /Reincarc/,
    "omul nu afla ce are de facut cu o pagina veche",
  );
  assert.deepEqual(scrieri, [], "un permis expirat a scris in depozit");
});

test("⚠ permisul leaga CAMPUL, nu doar magazinul", async () => {
  /*
   * Fara asta, un permis luat de pe pagina oricarui produs cu un camp de fisier ar fi fost o cheie
   * catre tot depozitul magazinului. Si tot fara asta, plafonul de 40 MB al documentelor se cerea
   * de pe un camp de imagine, unde el e 10 — chiar gaura pe care ruta si-o marturisea in comentariu
   * cat timp `documente=1` venea de la client.
   */
  const doarPoza = semneazaPermisul(BIZ, PRODUS, { poza: "i" });
  const r = await POST(cere({ permis: doarPoza, camp: "tipar" }).req);
  assert.equal(r.status, 403, "s-a incarcat pe un camp care nu e in permis");
  assert.deepEqual(scrieri, [], "s-a scris in depozit pentru un camp nepermis");

  /* Iar campul care CHIAR e in permis trece — altfel proba ar fi cerut doar refuzuri. */
  const bun = await POST(cere({ permis: doarPoza, camp: "poza" }).req);
  assert.equal(bun.status, 200, "campul din permis a fost refuzat");
});

test("⚠ terminatia cheii urmeaza OCTETII, nu antetul trimis de browser", async () => {
  /*
   * Amandoua cererile de aici declara `poza.png` / `image/png`; la a doua antetul minte. Octetii
   * hotarasc — asta se stia —, dar TERMINATIA e ce ramane din hotararea aia mai departe, si asta nu
   * cerea nimeni: masurat, `const ext = "jpg";` in loc de `EXT_BY_MIME[detected] ?? "jpg"` trecea
   * 7/7 aici si nicaieri altundeva in proiect.
   *
   * ⚠ DE CE CONTEAZA MAI MULT DE CAND CHEIA E SEMNATA: terminatia intra IN semnatura
   * (`semnatura(businessId, nume, ext)`), iar mai tarziu — in panoul atelierului, unde nu mai
   * exista octeti — ea e SINGURUL lucru pe care `terminatia` si `sePoateRandaCaImagine` il au la
   * dispozitie. Un PDF de tipar scris `.jpg` ar fi o cheie semnata, valida, si desenata ca poza
   * rupta chiar comerciantului care trebuie sa execute comanda.
   */
  const png = await urca();
  assert.equal(png.final?.status, 200);
  assert.equal(scrieri.length, 1);
  assert.match(scrieri[0].cheie, /\.png$/, `octeti PNG scrisi sub cheia ${scrieri[0].cheie}`);
  assert.equal(scrieri[0].tip, "image/png");

  scrieri = [];
  const pdf = await urca({ octeti: PDF, documente: true });
  assert.equal(pdf.final?.status, 200, "PDF-ul de tipar a fost refuzat");
  assert.equal(scrieri.length, 1);
  assert.match(scrieri[0].cheie, /\.pdf$/, `octeti PDF scrisi sub cheia ${scrieri[0].cheie}`);
  assert.equal(scrieri[0].tip, "application/pdf");
});

/* ═══════════════════════════════════════════════════════════════════════════
   VERIFICAREA DE DUPA INCARCARE — paza care s-a MUTAT, nu s-a pierdut
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ octetii care NU trec verificarea nu capata cheie buna, si se STERG pe loc", async () => {
  /*
   * ═══ ⚠ CEA MAI IMPORTANTA PROBA A MUTARII ═══
   *
   * Cat timp octetii treceau prin functie, un fisier care nu era imagine nici nu ajungea in
   * depozit. Acum ajunge — browserul il pune acolo direct — deci intrebarea devine alta: ce se
   * intampla cu el dupa ce se afla ca nu e bun?
   *
   * Doua lucruri, si amandoua se cer aici: nu primeste cheie buna (deci nu poate intra intr-o
   * comanda), si nu ramane pe factura comerciantului nici treizeci de zile.
   */
  const gunoi = Buffer.from("nu-sunt-o-imagine-si-nici-un-pdf-doar-text");
  const { final, referinta } = await urca({ octeti: gunoi });

  assert.equal(final?.status, 400, "octeti care nu-s imagine au primit o cheie buna");
  assert.deepEqual(scrieri, [], "s-a scris pe o cheie definitiva pentru octeti nevalizi");
  assert.deepEqual(sterse, [referinta], "fisierul refuzat a ramas in depozitul platit");
  assert.equal(depozit[referinta!], undefined, "obiectul refuzat e inca acolo");
});

test("⚠ un PDF urcat pe un camp de IMAGINE se refuza — octetii hotarasc, nu ce s-a declarat", async () => {
  /*
   * Clientul cere voie pentru o imagine (campul `poza` e de imagine, si asta iese din PERMIS), dar
   * urca un PDF. Pana la finalizare nimeni nu poate sti: linkul semneaza doar marimea si tipul
   * DECLARAT. Aici se citesc octetii adevarati.
   */
  const { final, referinta } = await urca({ octeti: PDF });
  assert.equal(final?.status, 400, "un PDF a intrat pe un camp de imagine");
  assert.deepEqual(sterse, [referinta], "PDF-ul refuzat a ramas in depozit");
});

test("⚠ finalizarea refuza o referinta care nu e a noastra, sau e a ALTUI magazin", async () => {
  /*
   * ⚠ FARA ASTA, cine cheama finalizarea putea da orice sir si punea platforma sa copieze un obiect
   * ales de el pe o cheie buna — inclusiv unul din prefixul altui magazin.
   */
  const permis = semneazaPermisul(BIZ, PRODUS, { poza: "i", tipar: "d" });
  const cereFinal = async (referinta: string) => FINAL(new NextRequest(
    "https://magazin.edinio.com/api/upload-customization/finalizeaza",
    {
      method: "POST",
      body: JSON.stringify({ permis, camp: "poza", referinta }),
      headers: { "x-forwarded-for": `203.0.113.${++nrIp}`, "content-type": "application/json" },
    },
  ));

  for (const [nume, ref] of [
    ["inventata", "products/customizations/_provizoriu/" + BIZ + "/oarecare.jpg"],
    ["a altui magazin", "products/customizations/_provizoriu/" + NEPUBLICAT + "/x-abc.jpg"],
    ["o cheie definitiva", "products/customizations/" + BIZ + "/x-abc.jpg"],
    ["goala", ""],
  ] as const) {
    const r = await cereFinal(ref);
    assert.equal(r.status, 403, `referinta ${nume} a trecut`);
  }
  assert.deepEqual(scrieri, [], "s-a scris pe o cheie definitiva pentru o referinta straina");
});

/* ═══════════════════════════════════════════════════════════════════════════
   MINIATURA: ca patratul din panou sa nu mai traga originalul
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ o imagine primeste MINIATURA, pe cheia derivata, micsorata", async () => {
  /*
   * ═══ ⚠ DE CE SE FACE AICI, LA INCARCARE, SI NU LA CERERE ═══
   *
   * Panoul comerciantului arata pozele in patratele de 56px. Fara miniatura, fiecare patrat tragea
   * ORIGINALUL: o poza de telefon de 8 MB, si cum antetul e `private, no-store` (corect, sunt date
   * personale), nici browserul n-o tinea. Facuta la cerere, micsorarea s-ar fi platit la fiecare
   * deschidere de pagina; facuta o data, aici, se plateste o data.
   *
   * ⚠ SE CERE SI MARIMEA, nu doar existenta: o „miniatura" de aceeasi latime cu originalul ar fi
   * trecut o proba care se uita numai la cheie, si n-ar fi economisit nimic.
   */
  const mare = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#3366aa" },
  }).png().toBuffer();

  const { final } = await urca({ octeti: mare });
  assert.equal(final?.status, 200, "incarcarea a picat");
  const { cheie } = (await final!.json()) as { cheie: string };

  assert.equal(miniaturi.length, 1, "nu s-a scris nicio miniatura");
  assert.equal(miniaturi[0].cheie, cheieMiniatura(cheie), "miniatura nu sta pe cheia derivata");

  const m = await sharp(miniaturi[0].octeti).metadata();
  assert.equal(m.format, "webp", `miniatura nu e webp: ${m.format}`);
  assert.equal(m.width, 160, `miniatura nu s-a micsorat: ${m.width}px`);
  assert.ok(
    miniaturi[0].octeti.length < mare.length / 2,
    `miniatura nu e mai usoara decat originalul: ${miniaturi[0].octeti.length} vs ${mare.length}`,
  );

  /* ⚠ SI ORIGINALUL RAMANE. Miniatura e in plus, nu in loc: din ea nu se poate tipari. */
  assert.equal(depozit[cheie]?.octeti.length, mare.length, "originalul s-a pierdut");
});

test("⚠ o imagine PESTE 2 MB primeste si ea miniatura: se aduc octetii INTREGI", async () => {
  /*
   * ═══ ⚠ VERIFICAREA CITESTE DOAR ANTETUL, MICSORAREA ARE NEVOIE DE TOT ═══
   *
   * Peste 2 MB, `inceput` e o felie de 512 KB, cat trebuie ca sa se citeasca semnatura si antetul.
   * Data lui `sharp` pentru micsorare, felia aia e o imagine TAIATA: `sharp` arunca, prinderea
   * inghite, si tocmai pozele MARI, cele pentru care miniatura conteaza, ar fi ramas fara ea.
   * Fisierul s-ar fi incarcat cu bine, panoul ar fi cazut inapoi pe original, si economia s-ar fi
   * pierdut exact acolo unde era de facut.
   *
   * ⚠ Imaginea e ZGOMOT dinadins: una in culoare plina s-ar fi comprimat la cativa kiloocteti si
   * n-ar fi trecut niciodata de pragul pe care proba il masoara.
   */
  const mare = await sharp({
    create: {
      width: 1400, height: 1400, channels: 3, background: "#000000",
      noise: { type: "gaussian", mean: 128, sigma: 60 },
    },
  }).png({ compressionLevel: 0 }).toBuffer();
  assert.ok(mare.length > 2 * 1024 * 1024, `proba slaba: fisierul are doar ${mare.length} octeti`);

  const { final } = await urca({ octeti: mare });
  assert.equal(final?.status, 200);
  assert.equal(miniaturi.length, 1, "poza mare a ramas fara miniatura: s-a micsorat o felie taiata");
  assert.equal((await sharp(miniaturi[0].octeti).metadata()).width, 160);
});

test("⚠ un PDF de tipar NU primeste miniatura, si nu se aduce INTREG in memorie", async () => {
  /*
   * ═══ ⚠ CE APARA CU ADEVARAT `detected !== "application/pdf"` ═══
   *
   * Ca miniatura nu iese, o apara si `sharp`: dat un PDF, arunca, prinderea inghite, si depozitul
   * ramane fara miniatura. Masurat cu un mutant care scoate conditia, o proba care se uita numai la
   * `miniaturi` trece, deci n-ar fi aparat nimic.
   *
   * ⚠ CE SE PIERDE FARA CONDITIE E MEMORIA. Ca sa micsoreze, ramura aduce octetii INTREGI; pe un
   * fisier de tipar (plafonul e 40 MB) asta inseamna 40 MB in memoria functiei, la fiecare
   * incarcare, ca sa se arunce imediat dupa. Deci proba nu se uita la ce a iesit, ci la CE S-A
   * CERUT DEPOZITULUI: nicio citire peste felia de antet.
   *
   * ⚠ PDF-ul e mare dinadins: sub 2 MB ruta aduce oricum tot fisierul (ca `sharp` sa nu vada
   * niciodata o imagine taiata), si atunci proba n-ar fi putut deosebi cele doua purtari.
   */
  const marePdf = Buffer.concat([PDF, Buffer.alloc(3 * 1024 * 1024, 0x20)]);
  const { final } = await urca({ documente: true, octeti: marePdf, camp: "tipar" });

  assert.equal(final?.status, 200);
  assert.deepEqual(miniaturi, [], "s-a incercat o miniatura pentru un PDF");
  assert.deepEqual(
    citiri.map((c) => c.octeti), [512 * 1024],
    `PDF-ul a fost citit altfel decat o singura felie de antet: ${citiri.map((c) => c.octeti).join(", ")}`,
  );
});

test("⚠ MINIATURA PICATA nu strica incarcarea: fisierul ramane bun", async () => {
  /*
   * ═══ ⚠ ASTA E ORDINEA DE PRIORITATI, SCRISA CA PROBA ═══
   *
   * Miniatura e o inlesnire; originalul e lucrul dupa care se produce marfa. Daca `sharp` cade pe
   * un format ciudat sau depozitul clipeste la scrierea miniaturii, omul care tocmai a completat
   * tot formularul NU are voie sa-si piarda fisierul. Panoul cade singur inapoi pe original.
   */
  cadeMiniatura = true;

  const { final } = await urca();
  assert.equal(final?.status, 200, "o miniatura picata a stricat incarcarea");
  const { cheie } = (await final!.json()) as { cheie: string };
  assert.ok(esteCheiaNoastra(cheie, BIZ), "cheia data nu e una de-a noastra");
  assert.ok(depozit[cheie], "fisierul nu e in depozit dupa ce miniatura a picat");
  assert.deepEqual(sterse, [], "fisierul bun a fost sters din cauza miniaturii");
});

test("⚠ o referinta a ALTUI magazin nu se poate finaliza cu permisul tau", async () => {
  /*
   * Perechea celei de sus, pe drumul intreg: se cere voie ca magazinul vecin, se urca, si apoi se
   * incearca finalizarea cu permisul propriu. Referinta e semnata pentru ALT magazin, deci cade.
   */
  const strain = await urca({ businessId: NEPUBLICAT });
  scrieri = [];

  const permis = semneazaPermisul(BIZ, PRODUS, { poza: "i", tipar: "d" });
  const r = await FINAL(new NextRequest(
    "https://magazin.edinio.com/api/upload-customization/finalizeaza",
    {
      method: "POST",
      body: JSON.stringify({ permis, camp: "poza", referinta: strain.referinta }),
      headers: { "x-forwarded-for": `203.0.113.${++nrIp}`, "content-type": "application/json" },
    },
  ));
  assert.equal(r.status, 403, "fisierul altui magazin s-a mutat sub cheia ta");
  assert.deepEqual(scrieri, []);
});

test("⚠ o referinta pe care nu s-a urcat nimic iese 404, nu o cheie goala", async () => {
  /*
   * Se cere voie si nu se mai urca nimic — pana? deschisa, retea cazuta, om razgandit. Finalizarea
   * n-are ce muta: o cheie buna data acum ar fi trimis in comanda un fisier care nu exista, si
   * atelierul ar fi primit o comanda cu o macheta goala.
   */
  const { req } = cere();
  const voie = await POST(req);
  const { referinta } = (await voie.json()) as { referinta: string };

  const permis = semneazaPermisul(BIZ, PRODUS, { poza: "i", tipar: "d" });
  const r = await FINAL(new NextRequest(
    "https://magazin.edinio.com/api/upload-customization/finalizeaza",
    {
      method: "POST",
      body: JSON.stringify({ permis, camp: "poza", referinta }),
      headers: { "x-forwarded-for": `203.0.113.${++nrIp}`, "content-type": "application/json" },
    },
  ));
  assert.equal(r.status, 404, "o referinta fara octeti a primit totusi o cheie");
  assert.deepEqual(scrieri, []);
});

test("⚠ marimea se cere si la finalizare, pe octetii ADEVARATI", async () => {
  /*
   * ⚠ SEMNATURA LINKULUI APARA SCRIEREA, dar plafonul nostru se poate schimba intre darea voii si
   * finalizare — iar `HeadObject` nu aduce octeti, deci a doua citire nu costa nimic. Aici se
   * masoara ca ea CHIAR se face: se urca mai mult decat s-a declarat.
   */
  const mare = Buffer.concat([PNG, Buffer.alloc((MB_IMAGINE + 1) * 1024 * 1024)]);
  const { final, referinta } = await urca({ octeti: mare, marime: PNG.length });
  assert.equal(final?.status, 400, "un fisier peste plafon a primit cheie buna");
  assert.match((await final!.json() as { error: string }).error, /limita de 10MB/);
  assert.deepEqual(sterse, [referinta], "fisierul prea mare a ramas in depozit");
});
