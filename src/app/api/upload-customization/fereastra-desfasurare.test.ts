import assert from "node:assert/strict";
import { test, before, after, beforeEach } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { esteCheiaNoastra } from "@/lib/customization/fisiere-private";

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
/** Ce ar intoarce `uploadToR2` adevarat: `${R2_PUBLIC_URL}/${cheie}`. */
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

type ApelLimita = { p_cheie: string; p_limita: number; p_fereastra_sec: number; p_blocare_sec?: number };

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
           "export const uploadToR2 = async (b, k, t, c) => globalThis.__r2DeProba(b, k, t, c);"),
         shortCircuit: true, format: "module",
       };
     }
     return next(specifier, context);
   }`,
)}`;

type Scriere = { cheie: string; tip: string; cache: string; octeti: number };
let scrieri: Scriere[] = [];

let POST: (req: NextRequest) => Promise<Response>;

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  process.env.CUSTOMIZATION_FILE_SECRET = "secret-de-proba-pentru-semnatura";

  register(HOOK);
  (globalThis as unknown as { __r2DeProba: (b: Buffer, k: string, t: string, c: string) => Promise<string> })
    .__r2DeProba = async (b, k, t, c) => {
      scrieri.push({ cheie: k, tip: t, cache: c, octeti: b.length });
      return `${CDN}/${k}`;
    };

  ({ POST } = (await import("./route")) as unknown as { POST: typeof POST });
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
});

/**
 * O cerere adevarata catre ruta.
 *
 * ⚠ FIECARE PROBA PRIMESTE ALT IP. Limitatorul din memorie e cel adevarat si tine minte intre
 * probe: pe un IP comun, a douazeci si una cerere ar fi picat cu 429 fara nicio legatura cu ce se
 * verifica, iar proba ar fi devenit una care pica dupa ordinea in care e rulata.
 */
let nrIp = 0;
function cere(p: { ip?: string; businessId?: string | null; octeti?: Buffer | null; documente?: boolean } = {}) {
  const ip = p.ip ?? `203.0.113.${++nrIp}`;
  const fd = new FormData();
  if (p.octeti !== null) {
    fd.append("file", new File([new Uint8Array(p.octeti ?? PNG)], "poza.png", { type: "image/png" }));
  }
  if (p.businessId !== null) fd.append("business_id", p.businessId ?? BIZ);
  if (p.documente) fd.append("documente", "1");
  const req = new NextRequest("https://magazin.edinio.com/api/upload-customization", {
    method: "POST",
    body: fd,
    headers: { "x-forwarded-for": ip },
  });
  return { req, ip };
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
  const { req } = cere();
  const r = await POST(req);
  assert.equal(r.status, 200, "incarcarea a esuat inainte sa se ajunga la forma raspunsului");

  const date = (await r.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(date), ["cheie"], "raspunsul poarta si altceva decat cheia");

  const brut = JSON.stringify(date);
  assert.equal(brut.includes(CDN), false, `adresa publica a iesit din ruta: ${brut}`);
  assert.equal(/https?:\/\//.test(brut), false, `raspunsul poarta o adresa: ${brut}`);
});

test("⚠ cheia intoarsa e chiar fisierul scris, si trece de poarta comenzii", async () => {
  const { req } = cere();
  const r = await POST(req);
  assert.equal(r.status, 200);
  const date = (await r.json()) as Record<string, unknown>;

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
    scrieri, [{ cheie, tip: "image/png", cache: "private, no-store", octeti: PNG.length }],
    "poza cumparatorului nu s-a scris asa cum promite ruta",
  );
});

test("⚠ raspunsul de EROARE nu poarta nici cheie, nici adresa", async () => {
  const { req } = cere({ octeti: null });
  const r = await POST(req);
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys((await r.json()) as object), ["error"]);
  assert.deepEqual(scrieri, [], "s-a scris in depozit pentru o cerere refuzata");
});

/* ═══════════════════════════════════════════════════════════════════════════
   PLAFONUL DURABIL — capatul public care scrie in depozit platit
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ contorul din baza e chemat pe AMANDOUA cheile, si inainte de orice scriere", async () => {
  const { req, ip } = cere();
  const r = await POST(req);
  assert.equal(r.status, 200);

  const chei = apeluri.map((a) => a.p_cheie);
  assert.deepEqual(
    chei, [`upload-personalizare:ip:${ip}`, `upload-personalizare:mag:${BIZ}`],
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
    assert.ok(
      a.p_limita <= 1000,
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

test("⚠ contorul cazut LASA cumparatorul sa urce — limitatorul nu devine el caderea", async () => {
  cadeRpc = true;
  const r = await POST(cere().req);
  assert.equal(
    r.status, 200,
    "o baza care clipeste opreste incarcarile: la un camp obligatoriu, asta e comanda pierduta",
  );
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

  const r = await POST(cere({ ip }).req);
  assert.equal(r.status, 429, "stratul din memorie nu mai opreste nimic: rafala trece intreaga la baza");
  assert.match(
    (await r.json() as { error: string }).error, /in scurt timp/i,
    "a raspuns alt refuz decat cel din memorie",
  );
  assert.equal(scrieri.length, 20, "cererea taiata a scris totusi in depozit");
  assert.equal(apeluri.length, apeluriInainte, "cererea taiata a mai consultat o data contorul din baza");
  assert.equal(cai.length, caiInainte, "cererea taiata a atins totusi baza");
});

/* ═══════════════════════════════════════════════════════════════════════════
   CELELALTE DOUA PAZE — cele pentru care exista schela, dar nu si proba
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ un magazin NEPUBLICAT nu capata voie sa scrie in depozitul platit", async () => {
  /*
   * ⚠ SCHELA EXISTA DE LA INCEPUT SI NU CEREA NIMENI NIMIC: `NEPUBLICAT`, randul lui din
   * `MAGAZINE` si filtrarea pe `is_published` din baza de proba erau toate scrise, deci fisierul se
   * CITEA ca si cum cazul ar fi acoperit. Nu era: masurat, `if (false)` peste refuz trece 7/7, si
   * nicio alta proba din proiect nu-l prinde (`Magazin indisponibil` nu apare in niciun `.test.ts`).
   *
   * Ce apara randul asta: fara el, orice UUID inventat redevine un prefix in care se poate scrie la
   * nesfarsit sub `products/customizations/<uuid>/` — obiecte fara proprietar, pe care nimic nu le
   * sterge vreodata (`deleteOrphanImages` e no-op explicit), pe o factura care se plateste.
   */
  const r = await POST(cere({ businessId: NEPUBLICAT }).req);
  assert.equal(r.status, 404, "un magazin nepublicat a putut scrie in depozit");
  assert.deepEqual(scrieri, [], "s-a scris in depozit pentru un magazin care nu e pe vitrina");
  assert.equal(cai.includes("businesses"), true, "magazinul nici nu s-a cautat: refuzul ar veni din alta parte");
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
  const rPng = await POST(cere().req);
  assert.equal(rPng.status, 200);
  assert.equal(scrieri.length, 1);
  assert.match(scrieri[0].cheie, /\.png$/, `octeti PNG scrisi sub cheia ${scrieri[0].cheie}`);
  assert.equal(scrieri[0].tip, "image/png");

  scrieri = [];
  const rPdf = await POST(cere({ octeti: PDF, documente: true }).req);
  assert.equal(rPdf.status, 200, "PDF-ul de tipar a fost refuzat");
  assert.equal(scrieri.length, 1);
  assert.match(scrieri[0].cheie, /\.pdf$/, `octeti PDF scrisi sub cheia ${scrieri[0].cheie}`);
  assert.equal(scrieri[0].tip, "application/pdf");
});
