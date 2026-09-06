import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { MOTIV_PRET_CARE_MINTE } from "@/lib/customization/pretul-din-catalog-minte";

/**
 * ACTIUNILE ADEVARATE, CU O BAZA DE PROBA CARE VORBESTE POSTGREST.
 *
 * ═══ ⚠ DE CE NU AJUNGE O PROBA PE SURSA ═══
 *
 * Ce se repara aici nu e o functie, e o INTEROGARE: o sortare cu o taietura la 200 sub care cadea
 * exact randul care avea ceva de spus. O proba care citeste sursa ar fi trecut si peste un `or`
 * scris gresit, si peste o taietura pusa in locul nepotrivit — adica peste chiar defectul.
 *
 * Deci aici se cheama CHIAR `getMerchantProducts` si `getMerchantStatus` din
 * `google-merchant.actions.ts`, iar cererile lor ajung la un server HTTP local care raspunde ca
 * PostgREST: respecta `select`, `order`, `limit`, `eq`, `not.in` si `or`. Numaratorile trec pe
 * acelasi drum ca in productie: `HEAD` + `content-range`.
 *
 * ⚠ INLOCUIT E DOAR CAPATUL DE IDENTITATE. `@/lib/supabase/server` iese pe un client care arata
 * spre baza de proba si care raspunde „da" la `auth.getUser()`; proprietatea magazinului se
 * dovedeste mai departe printr-o interogare adevarata pe `businesses`. Ce se probeaza — forma
 * interogarilor si ce iese din ele — e neatins.
 *
 * ⚠ ORICE FILTRU PE CARE BAZA DE PROBA NU-L INTELEGE IESE CA 500, nu ca lista goala: altfel o
 * interogare stricata ar fi trecut drept „magazin fara randuri", adica proba ar fi fost verde
 * tocmai in cazul pe care il pazeste.
 */

const BIZ = "biz-1";
const UTILIZATOR = "user-1";

type RandGmc = {
  id: string; business_id: string; product_id: string; offer_id: string;
  status: string; error: string | null; issues: unknown[];
  last_status_at: string | null; last_synced_at: string | null; updated_at: string;
};

let gmcProduse: RandGmc[] = [];
let produse: { id: string; business_id: string; is_active: boolean; name: string }[] = [];
let coada: { id: string; business_id: string }[] = [];

/** Pornit, felia cu motive (singura cu `or`) e refuzata — cum ar fi daca PostgREST n-ar primi filtrul. */
let cadeFeliaCuMotive = false;
/** Tabelele lovite de la ultima golire. Asa se vede daca s-a scris CHIAR in jurnal. */
const cai: string[] = [];

/* ── Baza de proba: atat PostgREST cat intreaba actiunile ─────────────────────── */

/** Sparge `(a,b,c)` in bucati, fara sa taie in interiorul unui `in.(x,y)`. */
function bucati(text: string): string[] {
  const iesire: string[] = [];
  let adancime = 0, curent = "";
  for (const ch of text) {
    if (ch === "(") adancime++;
    if (ch === ")") adancime--;
    if (ch === "," && adancime === 0) { iesire.push(curent); curent = ""; continue; }
    curent += ch;
  }
  if (curent) iesire.push(curent);
  return iesire;
}

/**
 * Un singur filtru PostgREST peste un rand: `eq.X`, `neq.X`, `is.null`, `in.(a,b)` si oricare
 * dintre ele prefixat cu `not.`.
 *
 * ⚠ NULL se poarta ca in SQL: negatia unei comparatii cu NULL NU e adevarata. Fara asta, un
 * `status=not.in.(exclus,error)` ar fi numarat si randurile fara status, si numaratoarea reparata
 * ar fi iesit verde dintr-un motiv gresit.
 */
function potriveste(rand: Record<string, unknown>, coloana: string, expresie: string): boolean {
  let expr = expresie;
  let negat = false;
  if (expr.startsWith("not.")) { negat = true; expr = expr.slice(4); }
  const punct = expr.indexOf(".");
  const op = expr.slice(0, punct);
  const val = expr.slice(punct + 1);
  const v = rand[coloana] ?? null;

  let rezultat: boolean;
  if (op === "eq") rezultat = v !== null && String(v) === val;
  else if (op === "neq") rezultat = v !== null && String(v) !== val;
  else if (op === "is") rezultat = val === "null" ? v === null : String(v) === val;
  else if (op === "in") {
    const lista = bucati(val.replace(/^\(|\)$/g, "")).map((s) => s.replace(/^"|"$/g, ""));
    rezultat = v !== null && lista.includes(String(v));
  } else throw new Error(`operator PostgREST neinteles: ${coloana}=${expresie}`);

  if (!negat) return rezultat;
  if (op !== "is" && v === null) return false;
  return !rezultat;
}

/**
 * Coloanele cerute in `select`, si numai ele.
 *
 * ⚠ O BAZA CARE INTOARCE MEREU TOATE COLOANELE FACE PROBA OARBA. Cele doua felii ale listei se
 * lipesc una de alta si trec prin acelasi `map`: daca una cere mai putine coloane decat cealalta,
 * randul ei iese SARACIT — fara `issues` panoul arata textul erorii in locul problemelor de la
 * Google — si nimic n-ar fi picat aici. Coloana necunoscuta iese ca 500, ca la PostgREST.
 */
function proiecteaza(rand: Record<string, unknown>, select: string): Record<string, unknown> {
  if (!select || select === "*") return rand;
  const iesire: Record<string, unknown> = {};
  for (const bucata of bucati(select).map((s) => s.trim())) {
    if (!bucata || bucata.includes("(")) continue; // legatura incorporata, se pune separat
    if (!(bucata in rand)) throw new Error(`coloana ceruta si necunoscuta: ${bucata}`);
    iesire[bucata] = rand[bucata];
  }
  return iesire;
}

function sorteaza<T extends Record<string, unknown>>(randuri: T[], spec: string | null): T[] {
  if (!spec) return randuri;
  const parti = spec.split(".");
  const camp = parti[0];
  const desc = parti.includes("desc");
  /* Implicit in Postgres: ASC pune NULL-urile la coada, DESC le pune in frunte. */
  const nullLaCoada = parti.includes("nullslast") ? true : parti.includes("nullsfirst") ? false : !desc;
  return [...randuri].sort((a, b) => {
    const va = a[camp] ?? null, vb = b[camp] ?? null;
    if (va === null || vb === null) {
      if (va === null && vb === null) return 0;
      return (va === null ? 1 : -1) * (nullLaCoada ? 1 : -1);
    }
    const c = va < vb ? -1 : va > vb ? 1 : 0;
    return desc ? -c : c;
  });
}

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const cale = url.pathname.replace("/rest/v1/", "");
  /* Amandoua actiunile probate doar CITESC, deci corpul cererii nu se strange: nu-l cere nimeni. */
  req.resume();
  req.on("end", () => {
    const json = (cod: number, date: unknown, antete: Record<string, string> = {}) => {
      res.writeHead(cod, { "content-type": "application/json", ...antete });
      res.end(JSON.stringify(date));
    };
    try {
      raspunde();
    } catch (e) {
      /* ⚠ Greseala bazei de proba iese ca 500 CU MESAJ, nu ca tacere: altfel s-ar cauta in cod bun. */
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: `baza de proba: ${(e as Error).message}` }));
    }

    function raspunde() {
      const unul = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const select = url.searchParams.get("select") ?? "";
      cai.push(cale);
      if (cadeFeliaCuMotive && cale === "gmc_products" && url.searchParams.has("or")) {
        throw new Error("PostgREST a refuzat filtrul `or`");
      }

      const tabele: Record<string, Record<string, unknown>[]> = {
        gmc_products: gmcProduse as unknown as Record<string, unknown>[],
        products: produse as unknown as Record<string, unknown>[],
        gmc_sync_queue: coada as unknown as Record<string, unknown>[],
        businesses: [{ id: BIZ, user_id: UTILIZATOR, slug: "exemplu", custom_domain: null, store_name: "Exemplu", business_name: "Exemplu SRL" }],
        store_settings: [{ id: "ss-1", business_id: BIZ, google_merchant_config: { connected: true, account_id: "123" } }],
      };
      if (!(cale in tabele)) return json(200, []);

      let randuri = tabele[cale];
      for (const [cheie, valoare] of url.searchParams) {
        if (["select", "order", "limit", "offset"].includes(cheie)) continue;
        if (cheie === "or") {
          const brate = bucati(valoare.replace(/^\(|\)$/g, ""));
          randuri = randuri.filter((r) => brate.some((brat) => {
            const p = brat.indexOf(".");
            return potriveste(r, brat.slice(0, p), brat.slice(p + 1));
          }));
          continue;
        }
        randuri = randuri.filter((r) => potriveste(r, cheie, valoare));
      }

      randuri = sorteaza(randuri, url.searchParams.get("order"));
      const total = randuri.length;
      const limita = Number(url.searchParams.get("limit") ?? 0);
      if (limita > 0) randuri = randuri.slice(0, limita);

      /* ⚠ Numaratoarea trece pe acelasi drum ca in productie: `HEAD` + `content-range`. */
      if (req.method === "HEAD") {
        res.writeHead(200, { "content-range": `*/${total}`, "content-type": "application/json" });
        return res.end();
      }

      /* Legatura incorporata `products(name)` din `select`. */
      const cuLegatura = select.includes("products(name)");
      const iesire = randuri.map((r) => {
        const nume = produse.find((p) => p.id === r.product_id)?.name;
        const proiectat = proiecteaza(r, select);
        return cuLegatura ? { ...proiectat, products: nume ? { name: nume } : null } : proiectat;
      });
      if (unul) return json(iesire.length ? 200 : 406, iesire[0] ?? { message: "gol" });
      return json(200, iesire);
    }
  });
});

/* ── Clientul: doar identitatea e inlocuita, interogarile sunt cele adevarate ─── */

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/supabase/server") {
       return {
         url: "data:text/javascript," + encodeURIComponent("export const createClient = async () => globalThis.__clientDeProba();"),
         shortCircuit: true, format: "module",
       };
     }
     return next(specifier, context);
   }`,
)}`;

let getMerchantProducts: (businessId: string) => Promise<{
  product_id: string; offer_id: string; status: string; error: string | null; name: string;
  issues: { code?: string }[]; last_synced_at: string | null;
}[]>;
let getMerchantStatus: (businessId: string) => Promise<{ counts: { total: number; synced: number; active: number; pending: number; disapproved: number; queued: number } }>;

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  const adresa = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = adresa;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";

  register(HOOK);
  const { createClient } = await import("@supabase/supabase-js");
  const adevarat = createClient(adresa, "cheie-anonima-de-proba", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  (globalThis as unknown as { __clientDeProba: () => unknown }).__clientDeProba = () => ({
    auth: { getUser: async () => ({ data: { user: { id: UTILIZATOR } }, error: null }) },
    from: (tabel: string) => adevarat.from(tabel),
  });

  ({ getMerchantProducts, getMerchantStatus } = (await import("@/lib/actions/google-merchant.actions")) as unknown as {
    getMerchantProducts: typeof getMerchantProducts;
    getMerchantStatus: typeof getMerchantStatus;
  });
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

/** O clipa, ca sir ISO. `i` mai mare = mai vechi. */
function clipa(i: number): string {
  return new Date(Date.UTC(2026, 8, 6, 12, 0, 0) - i * 60_000).toISOString();
}

/** Asteapta ceva ce se intampla DUPA ce actiunea a raspuns: jurnalul se scrie din urma, nu se asteapta. */
async function asteapta(gata: () => boolean, mesaj: string) {
  for (let i = 0; i < 200; i++) {
    if (gata()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail(mesaj);
}

function rand(x: Partial<RandGmc> & { offer_id: string }): RandGmc {
  return {
    id: `g-${x.offer_id}`, business_id: BIZ, product_id: x.product_id ?? x.offer_id,
    status: "active", error: null, issues: [], last_status_at: clipa(1),
    last_synced_at: clipa(1), updated_at: clipa(1), ...x,
  };
}

/** Randurile care trebuie sa razbata peste taietura, si BRATUL filtrului care le scoate pe fiecare. */
const CU_MOTIV = ["fototapet", "fototapet-fara-motiv", "stricat", "stricat-fara-motiv", "pending-cu-motiv"];

test("⚠ randul retras se vede si pe un magazin cu peste 200 de randuri deja verificate", async () => {
  /*
   * Starea de plecare e cea care costa: 240 de randuri obisnuite, fiecare cu o data de verificare,
   * si sub ele — la fundul sortarii — fototapetul retras, care are `last_status_at` GOL dinadins.
   * Cu o singura felie taiata la 200, comerciantul nu l-ar fi vazut niciodata.
   *
   * ⚠ FIECARE BRAT AL FILTRULUI ARE AICI UN RAND NUMAI AL LUI. Cu un singur fototapet, doua dintre
   * cele trei brate ar fi putut fi sterse fara ca proba sa clipeasca: randul lui e prins si dupa
   * status, si dupa motivul scris. Randurile de mai jos le despart.
   */
  gmcProduse = [];
  produse = [];
  const numeste = (id: string, nume: string) => produse.push({ id, business_id: BIZ, is_active: true, name: nume });

  for (let i = 0; i < 240; i++) {
    gmcProduse.push(rand({ offer_id: `n-${i}`, status: ["active", "pending", "disapproved"][i % 3], last_status_at: clipa(i + 10), updated_at: clipa(i + 10) }));
    numeste(`n-${i}`, `Produs ${i}`);
  }
  /* Retras de noi, cu motivul scris: cazul din productie. */
  gmcProduse.push(rand({
    offer_id: "fototapet", status: "exclus", last_status_at: null, last_synced_at: null,
    updated_at: clipa(2), error: MOTIV_PRET_CARE_MINTE,
  }));
  numeste("fototapet", "Fototapet Personalizat");
  /* Retras, dar cu motivul pierdut. Statusul singur trebuie sa-l tina la vedere: un produs scos de
     la vanzare care dispare in tacere e chiar defectul, iar textul motivului e doar o coloana. */
  gmcProduse.push(rand({ offer_id: "fototapet-fara-motiv", status: "exclus", last_status_at: null, last_synced_at: null, updated_at: clipa(3), error: null }));
  numeste("fototapet-fara-motiv", "Fototapet fara motiv");
  /* In eroare, mai vechi decat toate cele 240. */
  gmcProduse.push(rand({
    offer_id: "stricat", status: "error", last_status_at: clipa(9999), updated_at: clipa(9999),
    error: "Google a refuzat trimiterea", issues: [{ code: "image_link_broken" }],
  }));
  numeste("stricat", "Produs stricat");
  gmcProduse.push(rand({ offer_id: "stricat-fara-motiv", status: "error", last_status_at: clipa(9998), updated_at: clipa(9998), error: null }));
  numeste("stricat-fara-motiv", "Produs stricat fara motiv");
  /*
   * ⚠ Motiv scris, dar status de la Google — si asta NU e o nascocire: reimprospatarea de status
   * sare doar randurile `exclus`, deci un rand `error` intrebat la Google se intoarce „pending" cu
   * motivul vechi ramas pe el. Fara bratul `error.not.is.null`, el ar cadea iar sub taietura.
   */
  gmcProduse.push(rand({ offer_id: "pending-cu-motiv", status: "pending", last_status_at: clipa(9997), updated_at: clipa(9997), error: "Google a refuzat trimiterea" }));
  numeste("pending-cu-motiv", "Produs cu motiv vechi");
  /* ⚠ Si un rand al ALTUI magazin, retras si el: felia cu motive nu are voie sa-l aduca aici. */
  gmcProduse.push(rand({ offer_id: "strain", business_id: "biz-2", status: "exclus", last_status_at: null, updated_at: clipa(0), error: "pretul minte" }));
  numeste("strain", "Produsul altui magazin");

  const lista = await getMerchantProducts(BIZ);
  const dupaOferta = new Map(lista.map((p) => [p.offer_id, p]));

  /* ⚠ SEMNUL PENTRU COMERCIANT. Fara el, produsul dispare de la vanzare fara o vorba. */
  const retras = dupaOferta.get("fototapet");
  assert.ok(retras, "randul retras a cazut sub taietura: comerciantul nu afla niciodata de ce nu mai vinde");
  assert.equal(retras.status, "exclus");
  /* ⚠ Chiar propozitia aratata comerciantului, nu o parafraza: daca ea se schimba si drumul pana la
     ecran se rupe, proba trebuie sa pice, nu sa se potriveasca cu o copie invechita a ei. */
  assert.equal(retras.error, MOTIV_PRET_CARE_MINTE, "motivul nu a ajuns pana la ecran");
  assert.equal(retras.name, "Fototapet Personalizat", "numele produsului nu s-a mai legat pe felia cu motive");

  /* Cate un rand pentru fiecare brat, ca stergerea oricaruia sa se vada. */
  assert.ok(dupaOferta.get("fototapet-fara-motiv"), "un rand retras fara motiv scris a ramas nevazut (bratul `status.eq.exclus`)");
  const stricat = dupaOferta.get("stricat");
  assert.ok(stricat, "randul in eroare mai vechi de ultimele 200 a ramas nevazut (bratul `status.eq.error`)");
  assert.ok(dupaOferta.get("stricat-fara-motiv"), "un rand in eroare fara motiv scris a ramas nevazut (bratul `status.eq.error`)");
  assert.ok(dupaOferta.get("pending-cu-motiv"), "un rand cu motiv scris dar cu status de la Google a ramas nevazut (bratul `error.not.is.null`)");

  /*
   * ⚠ AMANDOUA FELIILE ADUC ACELEASI COLOANE. Randul venit pe felia cu motive trece prin acelasi
   * `map` ca restul, deci o coloana lipsa de acolo nu iese ca eroare, ci ca rand SARACIT: fara
   * `issues`, panoul arata textul erorii in locul listei de probleme de la Google; fara
   * `last_synced_at`, un produs trimis demult scrie „In coada". Un ecran care minte mai putin
   * zgomotos decat unul gol, dar tot minte.
   */
  assert.deepEqual(stricat.issues, [{ code: "image_link_broken" }], "felia cu motive a adus randul fara `issues`");
  assert.equal(stricat.last_synced_at, clipa(1), "felia cu motive a adus randul fara `last_synced_at`");

  /* ⚠ Nimic din alt magazin. */
  assert.equal(dupaOferta.has("strain"), false, "felia cu motive a adus randul altui magazin in panou");

  /* ⚠ Sortarea feliei obisnuite ramane NEATINSA: cele 200 de randuri proaspete vin in aceeasi
     ordine ca inainte, doar in urma celor care au ceva de spus. */
  const obisnuite = lista.filter((p) => !CU_MOTIV.includes(p.offer_id));
  assert.equal(obisnuite.length, 200, "felia obisnuita nu mai e taiata la 200");
  assert.deepEqual(
    obisnuite.slice(0, 3).map((p) => p.offer_id), ["n-0", "n-1", "n-2"],
    "randurile obisnuite nu mai vin de la cel mai proaspat la cel mai vechi",
  );
  assert.deepEqual(
    lista.slice(0, CU_MOTIV.length).map((p) => p.offer_id).sort(), [...CU_MOTIV].sort(),
    "randurile cu motiv nu stau in capul listei, adica tot nu se vad primele",
  );
});

test("⚠ un rand cu motiv care e SI proaspat apare o singura data, iar variantele nu se inghit intre ele", async () => {
  /*
   * Cele doua felii se suprapun: un rand `error` verificat adineauri e in amandoua. Aratat de doua
   * ori, tabelul ar spune ca sunt doua produse stricate acolo unde e unul — si numaratoarea din
   * capul tabelului („Produse in Google (N)") ar minti la fel.
   *
   * ⚠ DEZDUPLICAREA SE FACE DUPA `offer_id`, NU DUPA PRODUS, si asta se probeaza aici fiindca
   * altfel e doar o parere scrisa intr-un comentariu. Un produs cu variante are cate un rand pe
   * FIECARE oferta: `p1-rosu` in eroare si `p1-albastru` la vanzare sunt doua randuri cu acelasi
   * `product_id`. Dezduplicate dupa produs, randul ramas il inghite pe celalalt — comerciantul
   * vede varianta stricata si crede ca sora ei nici n-a plecat la Google.
   */
  gmcProduse = [
    rand({ offer_id: "proaspat", status: "error", error: "a picat", last_status_at: clipa(0), updated_at: clipa(0) }),
    rand({ offer_id: "p1-rosu", product_id: "p1", status: "error", error: "a picat", last_status_at: clipa(1), updated_at: clipa(1) }),
    rand({ offer_id: "p1-albastru", product_id: "p1", status: "active", last_status_at: clipa(2), updated_at: clipa(2) }),
    rand({ offer_id: "linistit", status: "active", last_status_at: clipa(5), updated_at: clipa(5) }),
  ];
  produse = [
    { id: "proaspat", business_id: BIZ, is_active: true, name: "Proaspat" },
    { id: "p1", business_id: BIZ, is_active: true, name: "Perdea pe comanda" },
    { id: "linistit", business_id: BIZ, is_active: true, name: "Linistit" },
  ];

  const lista = await getMerchantProducts(BIZ);
  assert.deepEqual(
    lista.map((p) => p.offer_id), ["proaspat", "p1-rosu", "p1-albastru", "linistit"],
    "ori randul din amandoua feliile s-a dublat, ori o varianta a fost inghitita de sora ei (dezduplicare dupa produs, nu dupa `offer_id`)",
  );
});

test("⚠ „Produse active” numara ce e chiar la vanzare, nu cate randuri sunt in tabel", async () => {
  /*
   * Sase randuri sunt chiar la Google (3 aprobate, 2 in asteptare, 1 respins), doua sunt retrase de
   * noi si doua au ramas in eroare. Numarate laolalta ies zece — si comerciantul crede ca vinde cu
   * patru produse mai mult decat vinde.
   */
  gmcProduse = [
    rand({ offer_id: "a1", status: "active" }), rand({ offer_id: "a2", status: "active" }), rand({ offer_id: "a3", status: "active" }),
    rand({ offer_id: "p1", status: "pending" }), rand({ offer_id: "p2", status: "pending" }),
    rand({ offer_id: "d1", status: "disapproved" }),
    rand({ offer_id: "e1", status: "error", error: "a picat" }), rand({ offer_id: "e2", status: "error", error: "a picat" }),
    rand({ offer_id: "x1", status: "exclus", error: "pretul minte", last_status_at: null }),
    rand({ offer_id: "x2", status: "exclus", error: "pretul minte", last_status_at: null }),
  ];
  produse = gmcProduse.map((r) => ({ id: r.product_id, business_id: BIZ, is_active: true, name: r.offer_id }));
  coada = [{ id: "q1", business_id: BIZ }];

  const stare = await getMerchantStatus(BIZ);
  assert.equal(stare.counts.synced, 6, "„Produse active” numara si randurile retrase sau in eroare");

  /* ⚠ Perechea care tine proba cinstita: celelalte numaratori NU s-au stricat facand-o pe asta. */
  assert.equal(stare.counts.active, 3, "„Aprobate” s-a schimbat");
  assert.equal(stare.counts.pending, 2, "„In asteptare” s-a schimbat");
  assert.equal(stare.counts.disapproved, 1, "„Respinse” s-a schimbat");
  assert.equal(stare.counts.queued, 1, "coada de sincronizare s-a schimbat");
  assert.equal(stare.counts.total, 10, "numarul produselor active din catalog s-a schimbat");
});

test("⚠ felia cu motive cazuta lasa panoul in picioare si tipa in jurnal", async () => {
  /*
   * ⚠ A DOUA INTEROGARE E SI UN DRUM NOU CATRE ESEC. Filtrul `or=(…,error.not.is.null)` nu a fost
   * incercat pe o baza adevarata, deci ce se intampla la un refuz nu are voie sa ramana o parere.
   * Doua lucruri se cer deodata, si fiecare fara celalalt e mai rau decat defectul reparat:
   *  - panoul arata mai departe lista obisnuita (un ecran GOL tocmai la omul venit sa afle de ce
   *    nu mai vinde ar fi cea mai proasta minciuna cu putinta);
   *  - caderea se scrie in jurnal, altfel „nu se vede nimic in panou" n-ar avea unde fi cautat.
   */
  gmcProduse = [
    rand({ offer_id: "linistit", status: "active", last_status_at: clipa(5), updated_at: clipa(5) }),
    rand({ offer_id: "stricat", status: "error", error: "a picat", last_status_at: clipa(6), updated_at: clipa(6) }),
  ];
  produse = [
    { id: "linistit", business_id: BIZ, is_active: true, name: "Linistit" },
    { id: "stricat", business_id: BIZ, is_active: true, name: "Stricat" },
  ];
  cai.length = 0;
  cadeFeliaCuMotive = true;
  try {
    const lista = await getMerchantProducts(BIZ);
    assert.deepEqual(
      lista.map((p) => p.offer_id), ["linistit", "stricat"],
      "felia cu motive a cazut si a luat cu ea si lista obisnuita",
    );
    await asteapta(() => cai.includes("error_logs"), "felia cu motive a cazut in tacere: nimic in jurnal");
  } finally {
    cadeFeliaCuMotive = false;
  }
});
