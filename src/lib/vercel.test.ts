import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

/**
 * Testele domeniilor custom, rescrise dupa incidentul esafe.ro (10.08.2026).
 *
 * De ce a fost nevoie de rescriere: seria de dinainte a trecut VERDE peste doua
 * zile de magazin cazut, fiindca simulatorul ei CODIFICA drept adevar exact
 * ipotezele nedovedite care au produs incidentul:
 *   - decreta ca `GET /v5/domains/{apex}/records` da 404 cand zona nu exista.
 *     In realitate da 200, cu inregistrarile CAA de sistem, chiar si cu Vercel
 *     DNS DEZACTIVAT. Asta a fost cauza radacina.
 *   - decreta ca `PATCH /v3/domains` da mereu 200 si ca asta inseamna zona
 *     creata. E o ruta declarativa; nu provizioneaza nimic.
 *   - decreta ca rezolvarea echipei reuseste intotdeauna.
 *
 * Un test care presupune raspunsul nu poate prinde defectul. De aceea simulatorul
 * de aici raspunde ca serverul REAL (inclusiv cu minciunile lui), iar adevarul de
 * teren vine dintr-o a doua sursa: DNS-ul public, prin DoH.
 */

process.env.VERCEL_TOKEN = "test-token";
process.env.VERCEL_PROJECT_ID = "prj_test";
delete process.env.VERCEL_TEAM_ID;

/*
 * Jurnalul scrie in Supabase cu clientul de sistem. Fara chei, `createAdminClient`
 * arunca si `logError` prinde — deci nicio jurnalizare nu ajunge in stubul de
 * `fetch` si nu polueaza lista de apeluri pe care se fac verificarile.
 */
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const consolaEroare = console.error;
console.error = (...date: unknown[]) => {
  // Jurnalizarea esuata e ASTEPTATA aici (nu exista baza in teste). Restul trece.
  if (typeof date[0] === "string" && date[0].startsWith("[error-logger]")) return;
  consolaEroare(...date);
};

// ─── Simulatorul de retea ─────────────────────────────────────────────────────

type Cerere = { url: string; cale: string; method: string; body: Record<string, unknown> | null };
type Raspuns = { status: number; body?: Record<string, unknown> };

/** Forma raspunsului DNS-over-HTTPS: type 6 = SOA, type 2 = NS. */
type Doh = {
  Status?: number;
  Answer?: { name: string; type: number; data: string }[];
  Authority?: { name: string; type: number; data: string }[];
  Comment?: string;
};

const PROIECT = "/v10/projects/prj_test";
const PROIECT_DOMENII = "/v10/projects/prj_test/domains";
const PROIECT_DOMENIU = "/v9/projects/prj_test/domains";
const CONT_CITIRE = "/v5/domains";
const CONT_ADAUGA = "/v7/domains";
const CONT_PATCH = "/v3/domains";
const CONFIG = "/v6/domains";

const NS_VERCEL = ["ns1.vercel-dns.com", "ns2.vercel-dns.com"];
const NS_STRAIN = ["ns1.romarg.com", "ns2.romarg.com"];

let apeluri: Cerere[] = [];
let vercel: (c: Cerere) => Raspuns | undefined;
let dns: (nume: string, tip: string, rezolver: number) => Doh | null;

/** Ce raspunde Vercel cand testul nu are nimic special de spus: totul e in regula. */
function implicit(c: Cerere): Raspuns {
  if (c.cale === PROIECT && c.method === "GET") return { status: 200, body: { accountId: "team_test" } };
  return { status: 200 };
}

globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const url = String(input);

  if (url.startsWith("https://dns.google") || url.startsWith("https://cloudflare-dns.com")) {
    const u = new URL(url);
    const raspuns = dns(
      u.searchParams.get("name") ?? "",
      u.searchParams.get("type") ?? "",
      u.hostname === "dns.google" ? 0 : 1,
    );
    // `null` = rezolverul nu a raspuns. Nu e acelasi lucru cu „domeniul e mort".
    if (!raspuns) return new Response("", { status: 503 });
    return new Response(JSON.stringify(raspuns), {
      status: 200,
      headers: { "content-type": "application/dns-json" },
    });
  }

  if (!url.startsWith("https://api.vercel.com")) {
    // Orice alta gazda inseamna ca un test a scapat un apel spre reteaua reala.
    throw new Error(`Apel de retea neasteptat in teste: ${url}`);
  }

  const cale = decodeURIComponent(url.replace("https://api.vercel.com", "").split("?")[0]);
  const method = init?.method ?? "GET";
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  const cerere: Cerere = { url, cale, method, body };
  apeluri.push(cerere);

  const r = vercel(cerere) ?? implicit(cerere);
  return new Response(JSON.stringify(r.body ?? {}), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}) as unknown as typeof fetch;

/*
 * Instanta PROASPATA de modul la fiecare test.
 *
 * `resolveTeam` memoreaza echipa intr-o variabila de modul. Cu un singur modul
 * reutilizat, testul care cere ESUAREA rezolvarii ar depinde de ce a rulat
 * inaintea lui — adica exact genul de ordine implicita din care ies teste care
 * trec doar in ordinea in care le-a scris cineva.
 */
let instanta = 0;
async function incarca(): Promise<typeof import("./vercel")> {
  instanta += 1;
  const adresa = new URL(`./vercel.ts?instanta=${instanta}`, import.meta.url).href;
  return (await import(adresa)) as typeof import("./vercel");
}

// ─── Ajutoare ─────────────────────────────────────────────────────────────────

function soaOk(nume: string): Doh {
  return {
    Status: 0,
    Answer: [{ name: `${nume}.`, type: 6, data: "ns1.exemplu.net. hostmaster.exemplu.net. 1 7200 3600 1209600 3600" }],
  };
}

/** Semnatura exacta a zonei care nu exista: serverul autoritativ refuza intrebarea. */
const SOA_REFUZAT: Doh = { Status: 2, Comment: "Response from 198.51.100.1; REFUSED" };

function nsOk(nume: string, gazde: string[]): Doh {
  return { Status: 0, Answer: gazde.map((g) => ({ name: `${nume}.`, type: 2, data: `${g}.` })) };
}

function dnsul(opt: { soa: "raspunde" | "refuzat" | "tacere"; ns: string[] }) {
  return (nume: string, tip: string): Doh | null => {
    if (tip === "SOA") {
      if (opt.soa === "raspunde") return soaOk(nume);
      if (opt.soa === "refuzat") return SOA_REFUZAT;
      return null;
    }
    if (tip === "NS") return opt.ns.length ? nsOk(nume, opt.ns) : null;
    return null;
  };
}

function posturi(cale: string): Cerere[] {
  return apeluri.filter((c) => c.method === "POST" && c.cale === cale);
}

function indexUltim(pred: (c: Cerere) => boolean): number {
  let idx = -1;
  apeluri.forEach((c, i) => {
    if (pred(c)) idx = i;
  });
  return idx;
}

function indexPrim(pred: (c: Cerere) => boolean, dupa = -1): number {
  return apeluri.findIndex((c, i) => i > dupa && pred(c));
}

/**
 * Domeniu in „a treia stare": in contul Vercel, FARA zona, si ATASAT la proiect.
 *
 * Simuleaza ordinea descoperita pe esafe.ro: cat timp domeniul e atasat la
 * proiect, `POST /v7/domains` cade cu conflict si zona nu se poate crea pe nicio
 * ruta. `PATCH /v3/domains` raspunde 200 si nu schimba nimic — e declarativ.
 */
function treiaStare(apex: string, opt: { zonaSeCreeaza: boolean }) {
  const peProiect = new Set([apex, `www.${apex}`]);
  let zona = false;
  const conflict: Raspuns = {
    status: 409,
    body: { error: { code: "domain_already_in_use", message: "Domain already in use" } },
  };

  const handler = (c: Cerere): Raspuns | undefined => {
    if (c.cale === CONT_ADAUGA && c.method === "POST") {
      if (peProiect.has(apex)) return conflict;
      if (!opt.zonaSeCreeaza) return conflict;
      zona = true;
      return { status: 200, body: { domain: { name: apex } } };
    }
    if (c.cale === `${CONT_PATCH}/${apex}` && c.method === "PATCH") return { status: 200 };
    if (c.cale === `${CONT_CITIRE}/${apex}/records`) {
      return zona ? { status: 200, body: { records: [] } } : { status: 404 };
    }
    if (c.cale === `${CONT_CITIRE}/${apex}`) {
      return { status: 200, body: { domain: { name: apex, intendedNameservers: NS_VERCEL } } };
    }
    if (c.cale.startsWith(`${PROIECT_DOMENIU}/`)) {
      const nume = c.cale.slice(`${PROIECT_DOMENIU}/`.length);
      if (c.method === "DELETE") {
        peProiect.delete(nume);
        return { status: 200 };
      }
      return peProiect.has(nume) ? { status: 200, body: { name: nume } } : { status: 404 };
    }
    if (c.cale === PROIECT_DOMENII && c.method === "POST") {
      peProiect.add(String(c.body?.name ?? ""));
      return { status: 200, body: { name: String(c.body?.name ?? "") } };
    }
    if (c.cale.startsWith(CONFIG)) {
      return { status: 200, body: { misconfigured: !zona, configuredBy: zona ? "dns-01" : null } };
    }
    return undefined;
  };

  return { handler, peProiect, zonaExista: () => zona };
}

beforeEach(() => {
  apeluri = [];
  vercel = () => undefined;
  dns = () => null;
});

// ─── 1. Cazul care a scapat: esafe.ro ─────────────────────────────────────────

test("esafe.ro: /records raspunde 200 dar nameserverele REFUZA — starea trebuie sa spuna MORT", async () => {
  const { getDomainStatus } = await incarca();

  vercel = (c) => {
    if (c.cale === `${CONT_CITIRE}/esafe.ro`) {
      return { status: 200, body: { domain: { name: "esafe.ro", intendedNameservers: NS_VERCEL } } };
    }
    /*
     * Capcana exacta din incident: ruta raspunde 200 cu inregistrarile CAA de
     * SISTEM si pe un domeniu la care Vercel DNS e dezactivat. Aceleasi trei CAA,
     * cu aceeasi vechime, erau in panou si inainte, si dupa „Enable Vercel DNS".
     */
    if (c.cale === `${CONT_CITIRE}/esafe.ro/records`) {
      return {
        status: 200,
        body: {
          records: [
            { id: "1", type: "CAA", name: "", value: '0 issue "letsencrypt.org"', createdAt: 1 },
            { id: "2", type: "CAA", name: "", value: '0 issue "sectigo.com"', createdAt: 1 },
            { id: "3", type: "CAA", name: "", value: '0 issuewild "letsencrypt.org"', createdAt: 1 },
          ],
        },
      };
    }
    // Si Vercel il considera perfect configurat. TOATE semnalele de API sunt verzi.
    if (c.cale.startsWith(CONFIG)) return { status: 200, body: { misconfigured: false, configuredBy: "dns-01" } };
    return undefined;
  };
  dns = dnsul({ soa: "refuzat", ns: NS_VERCEL });

  const s = await getDomainStatus("esafe.ro");

  assert.equal(s.zone, true, "sonda de zona chiar raspunde 200 — tocmai de asta n-are voie sa decida singura");
  assert.equal(s.verified, true, "Vercel il considera verificat: verdictul lui nu e adevar de teren");
  assert.equal(s.delegated, true);
  assert.equal(s.metoda, "nameservere");
  assert.equal(
    s.dnsRaspunde,
    false,
    "nameserverele raspund REFUSED: domeniul e mort pentru toata lumea, si site si email",
  );
  assert.equal(
    s.zoneMissing,
    true,
    "delegat catre noi si fara raspuns = defect AL NOSTRU; asta e semnalul pe care cronul trebuie sa-l vada",
  );
  assert.equal(s.healthy, false, "un domeniu la care nimeni nu raspunde nu poate fi sanatos, orice ar zice API-ul");
  assert.equal(
    s.error,
    undefined,
    "nicio citire n-a esuat: starea e completa si TOTUSI domeniul e mort — exact combinatia care a pacalit cronul",
  );
});

// ─── 2-3. Cele doua metode, amandoua sanatoase ────────────────────────────────

test("metoda NAMESERVERE, totul in regula: sanatos, cu zona care chiar raspunde", async () => {
  const { getDomainStatus } = await incarca();

  vercel = (c) => {
    if (c.cale === `${CONT_CITIRE}/magazin.ro`) {
      return { status: 200, body: { domain: { name: "magazin.ro", intendedNameservers: NS_VERCEL } } };
    }
    if (c.cale === `${CONT_CITIRE}/magazin.ro/records`) return { status: 200, body: { records: [] } };
    if (c.cale.startsWith(CONFIG)) return { status: 200, body: { misconfigured: false, configuredBy: "dns-01" } };
    return undefined;
  };
  dns = dnsul({ soa: "raspunde", ns: NS_VERCEL });

  const s = await getDomainStatus("magazin.ro");

  assert.equal(s.metoda, "nameservere");
  assert.equal(s.delegated, true);
  assert.equal(s.dnsRaspunde, true);
  assert.equal(s.zoneMissing, false);
  assert.equal(s.healthy, true);
  assert.deepEqual(s.intendedNameservers, NS_VERCEL, "nameserverele afisate clientului vin de la Vercel, nu din cod");
  assert.equal(s.error, undefined);
});

test("metoda INREGISTRARI (caian-textile.ro): sanatos fara zona la Vercel, si citirea nu scrie nimic", async () => {
  const { getDomainStatus } = await incarca();

  vercel = (c) => {
    if (c.cale === `${CONT_CITIRE}/caian-textile.ro`) {
      return { status: 200, body: { domain: { name: "caian-textile.ro" } } };
    }
    // Clientul si-a lasat DNS-ul la furnizorul lui: la noi nu exista nicio zona.
    if (c.cale === `${CONT_CITIRE}/caian-textile.ro/records`) return { status: 404 };
    if (c.cale.startsWith(CONFIG)) return { status: 200, body: { misconfigured: false, configuredBy: "A" } };
    return undefined;
  };
  dns = dnsul({ soa: "raspunde", ns: NS_STRAIN });

  const s = await getDomainStatus("caian-textile.ro");

  assert.equal(s.metoda, "inregistrari");
  assert.equal(s.delegated, false);
  assert.equal(s.zone, false, "nu are zona la noi — si e perfect corect asa");
  assert.equal(s.zoneMissing, false, "fara zona, dar functional prin A/CNAME: nu e nimic de reparat");
  assert.equal(s.configuredBy, "A");
  assert.equal(s.healthy, true);
  assert.equal(s.error, undefined);
  assert.equal(
    apeluri.every((c) => c.method === "GET"),
    true,
    "citirea starii a scris ceva la Vercel; o citire n-are voie sa atinga zona sau proiectul clientului",
  );
});

// ─── 4. Metoda implicita nu atinge DNS-ul clientului ──────────────────────────

for (const caz of [
  { nume: "implicita (fara optiuni)", optiuni: undefined },
  { nume: "explicit inregistrari", optiuni: { metoda: "inregistrari" as const } },
]) {
  test(`conectarea ${caz.nume} NU cere zona la Vercel`, async () => {
    const { addDomainToVercel } = await incarca();
    dns = dnsul({ soa: "raspunde", ns: NS_STRAIN });

    const res = await addDomainToVercel("magazin.ro", caz.optiuni);

    assert.equal(res.success, true);
    assert.equal(
      apeluri.filter((c) => c.cale.startsWith(CONT_ADAUGA)).length,
      0,
      "POST /v7/domains creeaza zona la Vercel; pe calea A/CNAME zona n-are ce cauta, iar cerand-o riscam sa mutam DNS-ul clientului si sa-i rupem emailul",
    );
    assert.equal(apeluri.filter((c) => c.cale.startsWith(CONT_PATCH)).length, 0);
    assert.deepEqual(
      posturi(PROIECT_DOMENII).map((c) => c.body?.name).sort(),
      ["magazin.ro", "www.magazin.ro"],
      "atasarea la proiect trebuie sa se intample oricum: fara ea nu functioneaza nicio metoda",
    );
  });
}

test("conectarea prin NAMESERVERE cere zona explicit, pe echipa care detine proiectul", async () => {
  const { addDomainToVercel } = await incarca();
  dns = dnsul({ soa: "raspunde", ns: NS_VERCEL });

  const res = await addDomainToVercel("magazin.ro", { metoda: "nameservere" });
  assert.equal(res.success, true);

  const adaugare = posturi(CONT_ADAUGA)[0];
  assert.ok(adaugare, "fara zona, delegarea catre ns1/ns2.vercel-dns.com omoara domeniul complet");
  assert.equal(adaugare.body?.zone, true, "`zone: true` e singurul lucru care CREEAZA zona; fara el domeniul intra in cont si moare");
  assert.match(
    adaugare.url,
    /teamId=team_test/,
    "fara teamId, domeniul si zona ajung in contul personal — arata adaugat, magazinul ramane mort",
  );
});

// ─── 5. Citire picata: niciun verdict fals negativ ────────────────────────────

test("429/5xx pe rutele Vercel: „nu stiu\" nu devine niciodata „e stricat\"", async () => {
  const { getDomainStatus } = await incarca();

  vercel = (c) => (c.cale === PROIECT ? undefined : { status: 429, body: { error: { message: "rate limited" } } });
  // Adevarul de teren e BUN: domeniul merge, doar noi nu putem citi.
  dns = dnsul({ soa: "raspunde", ns: NS_STRAIN });

  const s = await getDomainStatus("magazin.ro");

  assert.equal(s.inProject, null, "un 429 nu inseamna „nu e pe proiect\"");
  assert.equal(s.inAccount, null);
  assert.equal(s.zone, null);
  assert.equal(s.dnsRaspunde, true, "sonda de teren a raspuns si spune ca domeniul e viu");
  assert.equal(
    s.zoneMissing,
    false,
    "un 429 trecator ar declansa altfel o reparatie (cu detasare!) pe un magazin perfect sanatos",
  );
  assert.equal(s.healthy, false, "fara dovezi pozitive nu se declara sanatos");
  assert.equal(s.verified, false);
  assert.match(String(s.error), /nu am putut citi/i, "esecul de citire trebuie raportat, nu ascuns");
});

test("cand nu putem CONFIRMA ca zona s-a creat, nu raportam succes", async () => {
  const { addDomainToVercel } = await incarca();

  vercel = (c) => {
    if (c.cale === CONT_ADAUGA && c.method === "POST") return { status: 200, body: { domain: { name: "magazin.ro" } } };
    // Sonda de confirmare nu raspunde. Vechiul cod trecea asta drept succes, cu
    // justificarea ca „apelantul re-verifica oricum" — dar apelantul folosea exact
    // aceeasi sonda oarba, deci justificarea era circulara.
    if (c.cale === `${CONT_CITIRE}/magazin.ro/records`) return { status: 429, body: { error: { message: "rate limited" } } };
    return undefined;
  };
  dns = dnsul({ soa: "refuzat", ns: NS_VERCEL });

  const res = await addDomainToVercel("magazin.ro", { metoda: "nameservere" });

  assert.equal(res.success, false, "„Vercel a acceptat cererea\" nu e acelasi lucru cu „zona exista\"");
  assert.match(String(res.error), /nu am putut confirma/i);
});

test("rezolverii DNS tac: domeniul NU se declara mort", async () => {
  const { getDomainStatus } = await incarca();
  dns = () => null;

  const s = await getDomainStatus("magazin.ro");

  assert.equal(s.dnsRaspunde, null);
  assert.equal(s.currentNameservers.length, 0);
  assert.equal(s.metoda, null, "fara nameservere citite nu putem sti ce metoda foloseste clientul");
  assert.equal(s.zoneMissing, false, "tacerea a doi rezolveri nu e dovada ca domeniul e cazut");
  assert.equal(s.healthy, false);
  assert.match(String(s.error), /nameserverelor/i);
});

test("cand cei doi rezolveri DNS nu sunt de acord, nu declaram domeniul mort", async () => {
  const { getDomainStatus } = await incarca();

  dns = (nume, tip, rezolver) => {
    if (tip === "NS") return nsOk(nume, NS_VERCEL);
    if (tip !== "SOA") return null;
    return rezolver === 0 ? SOA_REFUZAT : soaOk(nume);
  };

  const s = await getDomainStatus("magazin.ro");

  assert.equal(s.dnsRaspunde, null, "un singur rezolver capricios nu are voie sa produca un verdict");
  assert.equal(
    s.zoneMissing,
    false,
    "altfel o clipa proasta a unui rezolver declanseaza detasarea de proiect a unui domeniu VIU",
  );
  assert.equal(s.healthy, false);
});

// ─── 6. Echipa nerezolvata: apelurile de cont se ABANDONEAZA ──────────────────

test("cand nu aflam ce cont detine proiectul, NU trimitem nimic nescopat catre cont", async () => {
  const { addDomainToVercel } = await incarca();

  vercel = (c) => (c.cale === PROIECT ? { status: 500, body: { error: { message: "boom" } } } : undefined);
  dns = dnsul({ soa: "raspunde", ns: NS_STRAIN });

  const res = await addDomainToVercel("magazin.ro", { metoda: "nameservere" });

  const catreCont = apeluri.filter(
    (c) => c.cale.startsWith(CONT_ADAUGA) || c.cale.startsWith(CONT_CITIRE) || c.cale.startsWith(CONT_PATCH),
  );
  assert.deepEqual(
    catreCont.map((c) => `${c.method} ${c.cale}`),
    [],
    "o scriere nescopata inregistreaza domeniul si zona pe contul PERSONAL: pare adaugat, nu se vede din panoul echipei, si magazinul ramane mort",
  );

  // Pasii sunt INDEPENDENTI: esecul zonei nu mai anuleaza atasarea la proiect.
  assert.ok(posturi(PROIECT_DOMENII).some((c) => c.body?.name === "magazin.ro"), "atasarea la proiect trebuia sa mearga oricum");
  assert.equal(res.success, true);
  assert.match(String(res.warning), /nu stim ce cont/i, "esecul zonei ramane vizibil ca avertisment");
});

// ─── 7. Apexuri cu sufix compus ───────────────────────────────────────────────

for (const [gazda, asteptat] of [
  ["magazin.ro", true],
  ["firma.com.ro", true],
  ["magazin.co.uk", true],
  ["edinio.com.ro", true],
  ["www.firma.com.ro", true],
  ["shop.magazin.ro", false],
  ["shop.firma.com.ro", false],
  ["magazin.com.ro.ro", false],
] as const) {
  test(`esteApex("${gazda}") === ${asteptat}`, async () => {
    const { esteApex } = await incarca();
    assert.equal(
      esteApex(gazda),
      asteptat,
      "numaratoarea simpla de etichete trata firma.com.ro drept subdomeniu: nu primea nici zona, nici geamanul www",
    );
  });
}

// ─── 8. Gazdele platformei nu se sterg niciodata ──────────────────────────────

for (const gazda of ["edinio.com", "www.edinio.com", "sub.edinio.com", "edinio-preview.vercel.app"]) {
  test(`removeDomainFromVercel refuza gazda de platforma "${gazda}"`, async () => {
    const { removeDomainFromVercel } = await incarca();

    const res = await removeDomainFromVercel(gazda);

    assert.equal(res.success, false);
    assert.match(String(res.error), /platform/i);
    assert.deepEqual(
      apeluri.filter((c) => c.method === "DELETE").map((c) => c.cale),
      [],
      "un singur DELETE aici lasa panoul, site-ul de prezentare si toate magazinele pe edinio.com/<slug> fara ruta si fara certificat",
    );
  });
}

test("deconectarea scoate apexul si geamanul din PROIECT, dar nu atinge contul si nici zona", async () => {
  const { removeDomainFromVercel } = await incarca();

  const res = await removeDomainFromVercel("magazin.ro");

  assert.equal(res.success, true);
  assert.deepEqual(
    apeluri.filter((c) => c.method === "DELETE").map((c) => c.cale),
    [`${PROIECT_DOMENIU}/www.magazin.ro`, `${PROIECT_DOMENIU}/magazin.ro`],
  );
  assert.equal(
    apeluri.some((c) => c.method === "DELETE" && (c.cale.startsWith(CONT_CITIRE) || c.cale.startsWith(CONT_ADAUGA))),
    false,
    "stergerea din CONT ar sterge si zona clientului cu tot cu MX-uri — ireversibil, si inutil pentru o deconectare",
  );
});

test("deconectarea unui domeniu deja absent din proiect e succes, nu eroare", async () => {
  const { removeDomainFromVercel } = await incarca();
  vercel = (c) => (c.method === "DELETE" ? { status: 404 } : undefined);

  assert.equal((await removeDomainFromVercel("magazin.ro")).success, true);
});

// ─── 9. Iesirea din „a treia stare": detaseaza, cere zona, REATASEAZA ─────────

test("a treia stare, dovedita moarta: detasare, zona, si reatasare la final", async () => {
  const { addDomainToVercel } = await incarca();
  const sim = treiaStare("magazin.ro", { zonaSeCreeaza: true });
  vercel = sim.handler;
  dns = dnsul({ soa: "refuzat", ns: NS_VERCEL });

  const res = await addDomainToVercel("magazin.ro", { metoda: "nameservere" });

  const stergere = indexUltim((c) => c.method === "DELETE" && c.cale === `${PROIECT_DOMENIU}/magazin.ro`);
  assert.ok(stergere >= 0, "fara detasare, POST /v7/domains cade cu conflict la infinit si zona nu se creeaza NICIODATA");

  const zonaCeruta = indexPrim((c) => c.method === "POST" && c.cale === CONT_ADAUGA, stergere);
  assert.ok(zonaCeruta > stergere, "zona trebuie ceruta DUPA ce domeniul a fost eliberat de proiect");

  const reatasare = indexPrim(
    (c) => c.method === "POST" && c.cale === PROIECT_DOMENII && c.body?.name === "magazin.ro",
    zonaCeruta,
  );
  assert.ok(reatasare > zonaCeruta, "domeniul nu a fost pus la loc pe proiect");

  assert.equal(sim.zonaExista(), true);
  assert.equal(sim.peProiect.has("magazin.ro"), true);
  assert.equal(sim.peProiect.has("www.magazin.ro"), true, "geamanul www a fost detasat si uitat acolo");
  assert.equal(res.success, true);
});

test("a treia stare cand zona TOT nu se creeaza: reatasarea se face oricum", async () => {
  const { addDomainToVercel } = await incarca();
  const sim = treiaStare("magazin.ro", { zonaSeCreeaza: false });
  vercel = sim.handler;
  dns = dnsul({ soa: "refuzat", ns: NS_VERCEL });

  const res = await addDomainToVercel("magazin.ro", { metoda: "nameservere" });

  const stergere = indexUltim((c) => c.method === "DELETE" && c.cale === `${PROIECT_DOMENIU}/magazin.ro`);
  assert.ok(stergere >= 0);
  assert.ok(
    indexPrim((c) => c.method === "POST" && c.cale === PROIECT_DOMENII && c.body?.name === "magazin.ro", stergere) > stergere,
    "esecul zonei a lasat domeniul si fara zona, SI nelegat de proiect — adica mai rau decat l-am gasit",
  );
  assert.equal(sim.peProiect.has("magazin.ro"), true);
  assert.equal(sim.peProiect.has("www.magazin.ro"), true);

  assert.equal(res.success, false, "delegat catre noi si fara zona = domeniu cazut; nu se raporteaza succes");
  assert.match(String(res.error), /A\/CNAME/, "clientului i se spune calea care ii repara magazinul FARA sa-i mute DNS-ul");
});

for (const soa of ["tacere", "raspunde"] as const) {
  test(`nu detasam un domeniu care nu e DOVEDIT mort (SOA: ${soa})`, async () => {
    const { addDomainToVercel } = await incarca();
    const sim = treiaStare("magazin.ro", { zonaSeCreeaza: true });
    vercel = sim.handler;
    dns = dnsul({ soa, ns: NS_VERCEL });

    const res = await addDomainToVercel("magazin.ro", { metoda: "nameservere" });

    assert.deepEqual(
      apeluri.filter((c) => c.method === "DELETE").map((c) => c.cale),
      [],
      "detasarea e sigura DOAR pe un domeniu deja mort; pe unul viu scoate magazinul offline ca sa repare o problema neprobata",
    );
    assert.equal(res.success, false);
  });
}

test("poateDetasa:false opreste detasarea chiar si pe un domeniu dovedit mort", async () => {
  const { addDomainToVercel } = await incarca();
  const sim = treiaStare("magazin.ro", { zonaSeCreeaza: true });
  vercel = sim.handler;
  dns = dnsul({ soa: "refuzat", ns: NS_VERCEL });

  await addDomainToVercel("magazin.ro", { metoda: "nameservere", poateDetasa: false });

  assert.deepEqual(apeluri.filter((c) => c.method === "DELETE").map((c) => c.cale), []);
  assert.equal(sim.zonaExista(), false);
});

// ─── Repararea alege metoda din REALITATE ─────────────────────────────────────

test("reparare pe DNS extern: nu se cere zona deloc", async () => {
  const { repairDomainOnVercel } = await incarca();

  vercel = (c) => {
    if (c.cale === `${CONT_CITIRE}/magazin.ro/records`) return { status: 404 };
    if (c.cale.startsWith(CONFIG)) return { status: 200, body: { misconfigured: false, configuredBy: "A" } };
    return undefined;
  };
  dns = dnsul({ soa: "raspunde", ns: NS_STRAIN });

  const res = await repairDomainOnVercel("magazin.ro");

  assert.equal(res.success, true);
  assert.equal(
    apeluri.filter((c) => c.cale.startsWith(CONT_ADAUGA) || c.cale.startsWith(CONT_PATCH)).length,
    0,
    "clientul e pe DNS extern: cererea de zona ar esua degeaba si ar afisa o eroare falsa peste un magazin care merge",
  );
});

test("reparare pe nameservere: zona se creeaza, si succesul se declara doar dupa ce DNS-ul chiar raspunde", async () => {
  const { repairDomainOnVercel, getDomainStatus } = await incarca();
  const sim = treiaStare("magazin.ro", { zonaSeCreeaza: true });
  vercel = sim.handler;
  // Nameserverele incep sa raspunda exact cand zona exista. Asta e legatura reala
  // dintre obiectul de la Vercel si adevarul de teren.
  dns = (nume, tip) => {
    if (tip === "SOA") return sim.zonaExista() ? soaOk(nume) : SOA_REFUZAT;
    if (tip === "NS") return nsOk(nume, NS_VERCEL);
    return null;
  };

  const res = await repairDomainOnVercel("magazin.ro");

  assert.ok(posturi(CONT_ADAUGA).some((c) => c.body?.zone === true), "delegat la noi inseamna ca zona e obligatorie");
  assert.equal(res.success, true);

  const dupa = await getDomainStatus("magazin.ro");
  assert.equal(dupa.dnsRaspunde, true);
  assert.equal(dupa.zoneMissing, false);
  assert.equal(dupa.healthy, true);
});

test("Repara nu declara victorie cand TOT API-ul zice DA si nameserverele tac", async () => {
  const { repairDomainOnVercel } = await incarca();

  // Reconstituirea completa a incidentului: fiecare pas catre Vercel reuseste, si
  // pana si sonda de zona raspunde 200 (CAA-urile de sistem). Singurul lucru care
  // stie adevarul e citirea de DUPA, pe DNS-ul public.
  vercel = (c) => {
    if (c.cale === `${CONT_CITIRE}/magazin.ro/records`) {
      return { status: 200, body: { records: [{ id: "1", type: "CAA", name: "", value: '0 issue "letsencrypt.org"' }] } };
    }
    if (c.cale.startsWith(CONFIG)) return { status: 200, body: { misconfigured: false, configuredBy: "dns-01" } };
    return undefined;
  };
  dns = dnsul({ soa: "refuzat", ns: NS_VERCEL });

  const res = await repairDomainOnVercel("magazin.ro");

  assert.equal(
    res.success,
    false,
    "toti pasii au reusit si domeniul e tot mort: succesul se judeca pe starea de DUPA, nu pe raspunsurile primite pe drum",
  );
  assert.match(String(res.error), /A\/CNAME/);
});

test("Repara NU raporteaza succes cat timp domeniul e tot cazut", async () => {
  const { repairDomainOnVercel } = await incarca();
  const sim = treiaStare("magazin.ro", { zonaSeCreeaza: false });
  vercel = sim.handler;
  dns = dnsul({ soa: "refuzat", ns: NS_VERCEL });

  const res = await repairDomainOnVercel("magazin.ro");

  assert.equal(
    res.success,
    false,
    "butonul raporta „reparat\" fara sa fi facut nimic — de aici zilele in care nimeni n-a stiut ca magazinul e cazut",
  );
  assert.match(String(res.error), /A\/CNAME/);
});

// ─── Atasarea la proiect ──────────────────────────────────────────────────────

test("apexul primeste geaman www ca redirect 308", async () => {
  const { addDomainToVercel } = await incarca();
  dns = dnsul({ soa: "raspunde", ns: NS_STRAIN });

  await addDomainToVercel("magazin.ro");

  const www = posturi(PROIECT_DOMENII).find((c) => c.body?.name === "www.magazin.ro");
  assert.ok(www, "fara geamanul www, cine il tasteaza primeste eroare de certificat");
  assert.equal(www.body?.redirect, "magazin.ro");
  assert.equal(www.body?.redirectStatusCode, 308);
});

test("un 'www.' lipit in fata nu creeaza un domeniu www.www", async () => {
  const { addDomainToVercel } = await incarca();
  await addDomainToVercel("www.magazin.ro");
  assert.deepEqual(posturi(PROIECT_DOMENII).map((c) => c.body?.name).sort(), ["magazin.ro", "www.magazin.ro"]);
});

test("un subdomeniu nu cere zona nici macar pe metoda nameservere, si nu primeste geaman", async () => {
  const { addDomainToVercel } = await incarca();

  const res = await addDomainToVercel("shop.magazin.ro", { metoda: "nameservere" });

  assert.equal(res.success, true);
  assert.equal(apeluri.filter((c) => c.cale.startsWith(CONT_ADAUGA)).length, 0, "un subdomeniu ramane pe DNS-ul clientului");
  assert.deepEqual(posturi(PROIECT_DOMENII).map((c) => c.body?.name), ["shop.magazin.ro"]);
});

test("'already in use by one of your projects' e SUCCES cand proiectul e chiar al nostru", async () => {
  const { addDomainToVercel } = await incarca();

  vercel = (c) => {
    if (c.method === "POST" && c.cale === PROIECT_DOMENII) {
      return {
        status: 409,
        body: { error: { code: "domain_already_in_use", message: "Cannot add magazin.ro since it's already in use by one of your projects." } },
      };
    }
    return undefined;
  };

  assert.equal((await addDomainToVercel("magazin.ro")).success, true);
});

test("cand sonda spune ca domeniul NU e pe proiectul nostru, textul erorii nu-l poate salva", async () => {
  const { addDomainToVercel } = await incarca();

  vercel = (c) => {
    if (c.method === "POST" && c.cale === PROIECT_DOMENII) {
      return { status: 409, body: { error: { message: "Domain already exists" } } };
    }
    if (c.method === "GET" && c.cale.startsWith(`${PROIECT_DOMENIU}/`)) return { status: 404 };
    return undefined;
  };

  const res = await addDomainToVercel("magazin.ro");
  assert.equal(res.success, false, "sonda a raspuns „nu e al nostru\"; nicio potrivire pe text n-are voie sa treaca peste ea");
  assert.match(String(res.error), /alt proiect/i, "comerciantul trebuie sa afle ce are de facut, nu doar ca a esuat");
});

test("cand nici sonda de proiect nu raspunde, nu declaram nici succes, nici „e al altcuiva\"", async () => {
  const { addDomainToVercel } = await incarca();

  vercel = (c) => {
    if (c.method === "POST" && c.cale === PROIECT_DOMENII) {
      return { status: 409, body: { error: { message: "Domain already exists" } } };
    }
    if (c.method === "GET" && c.cale.startsWith(`${PROIECT_DOMENIU}/`)) {
      return { status: 429, body: { error: { message: "rate limited" } } };
    }
    return undefined;
  };

  const res = await addDomainToVercel("magazin.ro");
  assert.equal(res.success, false);
  assert.match(String(res.error), /nu am putut verifica/i, "un 429 nu e nici dovada ca e al nostru, nici ca e al altcuiva");
});

// ─── Valorile DNS date clientului ─────────────────────────────────────────────

test("valorile A/CNAME recomandate vin de la Vercel, nu din cod", async () => {
  const { getDomainStatus } = await incarca();

  vercel = (c) => {
    if (c.cale.startsWith(CONFIG)) {
      return {
        status: 200,
        body: {
          misconfigured: true,
          recommendedIPv4: [{ rank: 1, value: ["216.198.79.1"] }],
          recommendedCNAME: [{ rank: 1, value: "d1d4fc829fe7bc7c.vercel-dns-017.com" }],
        },
      };
    }
    return undefined;
  };
  dns = dnsul({ soa: "raspunde", ns: NS_STRAIN });

  const s = await getDomainStatus("magazin.ro");
  assert.deepEqual(s.recommendedIPv4, ["216.198.79.1"]);
  assert.deepEqual(s.recommendedCNAME, ["d1d4fc829fe7bc7c.vercel-dns-017.com"]);
  assert.equal(s.healthy, false, "misconfigured de la Vercel inseamna ca traficul nu ajunge la noi");
});

test("configuratia se cere cu strict=true", async () => {
  const { getDomainStatus } = await incarca();
  await getDomainStatus("magazin.ro");

  const config = apeluri.find((c) => c.cale.startsWith(CONFIG));
  assert.ok(config);
  assert.match(
    config.url,
    /strict=true/,
    "fara strict, raspunsul imprumuta nameserverele zonei parinte si ascunde ca domeniul insusi n-are nimic",
  );
});

// ─── 10. `sanatateDomeniu`: ce ajunge in custom_domain_healthy ────────────────

type DomainStatus = import("./vercel").DomainStatus;
type Verdict = import("./vercel").Verdict;

/**
 * Stare completa, cu toate campurile pe „nu stiu", peste care fiecare caz pune
 * DOAR ce probeaza el.
 *
 * `misconfigured: false` in baza e deliberat: campul care poate produce verdictul
 * negativ trebuie sa fie pus explicit de test, altfel n-am mai sti care caz il
 * declanseaza si un default nefericit ar face toate testele sa treaca degeaba.
 */
function stare(peste: Partial<DomainStatus>): DomainStatus {
  return {
    inAccount: null, zone: null, inProject: null, wwwInProject: null,
    verified: false, misconfigured: false, configuredBy: null,
    intendedNameservers: [], currentNameservers: [], delegated: false,
    recommendedIPv4: [], recommendedCNAME: [], metoda: null,
    dnsRaspunde: null, zoneMissing: false, healthy: false,
    ...peste,
  };
}

test("okai.ro/alexshop.ro: zona raspunde (e la alt furnizor) dar traficul NU ajunge la noi -> CAZUT", async () => {
  const { sanatateDomeniu } = await incarca();

  /*
   * Reconstituirea celor doua domenii care au tinut poarta deschisa: `okai.ro` are
   * zona la ird.ro, `alexshop.ro` la cyberfolks. Nameserverele lor raspund perfect,
   * deci `dnsRaspunde` e `true`, si predicatul vechi se uita DOAR la campul asta.
   * Iesea `null`, iar `null` inseamna pentru proxy „lasa redirectul sa mearga",
   * adica exact poarta care fusese construita citand aceste doua domenii nu se
   * inchidea pentru niciunul din ele.
   *
   * Intrebarea corecta nu e „raspunde cineva autoritativ pentru domeniu", ci
   * „domeniul asta serveste magazinul". Aici Vercel raspunde in clar ca nu.
   */
  const s = stare({
    inProject: true,
    dnsRaspunde: true,
    currentNameservers: ["ns1.ird.ro", "ns2.ird.ro"],
    metoda: "inregistrari",
    misconfigured: true,
    configuredBy: null,
  });

  assert.equal(s.error, undefined, "citirea a fost COMPLETA: nu exista scuza de „n-am aflat\"");
  assert.equal(
    sanatateDomeniu(s),
    false,
    "citire completa + misconfigured + configuredBy null = dovada ca traficul nu ajunge la noi pe NICIO cale",
  );
});

test("sanatateDomeniu: healthy inseamna sanatos", async () => {
  const { sanatateDomeniu } = await incarca();
  assert.equal(sanatateDomeniu(stare({ healthy: true, inProject: true, dnsRaspunde: true })), true);
});

test("sanatateDomeniu: nameservere dovedit mute -> cazut", async () => {
  const { sanatateDomeniu } = await incarca();
  assert.equal(
    sanatateDomeniu(stare({ dnsRaspunde: false, delegated: true, zoneMissing: true })),
    false,
    "nimeni nu raspunde pentru domeniu: e mort pentru toata lumea, si site si email",
  );
});

test("sanatateDomeniu: proxy extern (configuredBy setat) NU se declara cazut", async () => {
  const { sanatateDomeniu } = await incarca();

  // Cloudflare cu norul portocaliu: Vercel raporteaza `misconfigured: true`
  // fiindca nu-si vede propriul IP, desi site-ul serveste perfect prin proxy.
  // Un `false` aici ar taia redirectul unui magazin care merge.
  const s = stare({ inProject: true, dnsRaspunde: true, misconfigured: true, configuredBy: "A" });

  assert.equal(sanatateDomeniu(s), null, "„ajunge la noi altfel decat ma asteptam\" nu e acelasi lucru cu „nu ajunge\"");
});

test("sanatateDomeniu: citire incompleta + misconfigured -> „nu stiu\", nu „cazut\"", async () => {
  const { sanatateDomeniu } = await incarca();

  // `misconfigured` porneste de la `true` tocmai cand configuratia NU s-a putut
  // citi. Fara poarta pe `error`, un 429 pe /v6/domains ar stinge domeniile
  // sanatoase in bloc, pe toata durata limitarii.
  const s = stare({
    inProject: true,
    dnsRaspunde: true,
    misconfigured: true,
    configuredBy: null,
    error: "Nu am putut citi: configuratia DNS.",
  });

  assert.equal(sanatateDomeniu(s), null);
});

// ─── 11. Verdictul negativ pe DNS cere CONSENSUL amandurora ───────────────────

type VotSim = "refuzat" | "indisponibil" | "soa";

/** `null` din simulator = rezolverul raspunde 503, deci `doh` intoarce `null`. */
function votSimulat(v: VotSim, nume: string): Doh | null {
  if (v === "soa") return soaOk(nume);
  if (v === "refuzat") return SOA_REFUZAT;
  return null;
}

const CONSENS: { google: VotSim; cloudflare: VotSim; dnsRaspunde: Verdict; zoneMissing: boolean; deCe: string }[] = [
  {
    google: "refuzat", cloudflare: "refuzat", dnsRaspunde: false, zoneMissing: true,
    deCe: "doi martori independenti spun acelasi lucru: asta e singura forma de dovada acceptata pentru un verdict negativ",
  },
  {
    google: "refuzat", cloudflare: "indisponibil", dnsRaspunde: null, zoneMissing: false,
    deCe: "un REFUSED plus un rezolver picat nu sunt doi martori; regula veche detasa de proiect un domeniu VIU pe combinatia asta",
  },
  {
    google: "indisponibil", cloudflare: "refuzat", dnsRaspunde: null, zoneMissing: false,
    deCe: "acelasi lucru, cu rezolverii inversati: verdictul nu are voie sa depinda de ordinea in care raspund",
  },
  {
    google: "refuzat", cloudflare: "soa", dnsRaspunde: null, zoneMissing: false,
    deCe: "dezacord curat intre cei doi: nu stim, deci nu atingem nimic",
  },
  {
    google: "soa", cloudflare: "refuzat", dnsRaspunde: null, zoneMissing: false,
    deCe: "dezacord in cealalta ordine",
  },
  {
    google: "soa", cloudflare: "indisponibil", dnsRaspunde: true, zoneMissing: false,
    deCe: "`true` e inofensiv (cel mult nu reparam ceva), deci un singur martor pozitiv ajunge",
  },
];

for (const caz of CONSENS) {
  test(`consens SOA: google=${caz.google}, cloudflare=${caz.cloudflare} -> dnsRaspunde=${String(caz.dnsRaspunde)}`, async () => {
    const { getDomainStatus } = await incarca();

    // Delegat catre noi in toate cazurile, ca `zoneMissing` sa depinda EXCLUSIV de
    // verdictul DNS si sa se vada daca ar aprinde calea distructiva pe nedrept.
    dns = (nume, tip, rezolver) => {
      if (tip === "NS") return nsOk(nume, NS_VERCEL);
      if (tip !== "SOA") return null;
      return votSimulat(rezolver === 0 ? caz.google : caz.cloudflare, nume);
    };

    const s = await getDomainStatus("magazin.ro");

    assert.equal(s.dnsRaspunde, caz.dnsRaspunde, caz.deCe);
    assert.equal(
      s.zoneMissing,
      caz.zoneMissing,
      "`zoneMissing` deschide detasarea domeniului de proiect: se aprinde doar pe dovada, nu pe banuiala",
    );
  });
}

// ─── 12. `delegated` are DOUA surse ───────────────────────────────────────────

test("esafe.ro complet: NS-ul e REFUZAT si el, dar randul din cont arata delegarea catre noi", async () => {
  const { getDomainStatus } = await incarca();

  vercel = (c) => {
    if (c.cale === `${CONT_CITIRE}/esafe.ro`) {
      return {
        status: 200,
        body: {
          domain: {
            name: "esafe.ro",
            // Ce vede Vercel la REGISTRAR, in zona PARINTE. Raspunde si cand zona
            // copil e complet muta, si tocmai de aceea e a doua sursa.
            nameservers: NS_VERCEL,
            intendedNameservers: NS_VERCEL,
          },
        },
      };
    }
    if (c.cale === `${CONT_CITIRE}/esafe.ro/records`) return { status: 200, body: { records: [] } };
    if (c.cale.startsWith(CONFIG)) return { status: 200, body: { misconfigured: true, configuredBy: null } };
    return undefined;
  };

  /*
   * Cand zona e moarta, nameserverele domeniului refuza ORICE intrebare, nu doar
   * SOA. Deci si interogarea NS iese goala, fix pe cazul pentru care aveam
   * nevoie de raspuns. Cu o singura sursa, `delegated` iesea `false` tocmai pe
   * esafe.ro, si `zoneMissing` nu se putea aprinde NICIODATA in scenariul pentru
   * care a fost scris.
   */
  dns = () => SOA_REFUZAT;

  const s = await getDomainStatus("esafe.ro");

  assert.deepEqual(s.currentNameservers, NS_VERCEL, "cand DNS-ul public tace, afisam ce vede Vercel la registrar");
  assert.equal(s.delegated, true, "a doua sursa e singura care mai stie ca domeniul e delegat catre noi");
  assert.equal(s.dnsRaspunde, false);
  assert.equal(s.metoda, "nameservere");
  assert.equal(s.zoneMissing, true, "delegat catre noi si mut = defect AL NOSTRU, si abia asta declanseaza repararea");
});

// ─── 13. `zoneMissing` nu mai prinde domenii nedelegate ───────────────────────

test("registrar expirat, nameservere straine: domeniul e mort, dar NU e zona noastra de reparat", async () => {
  const { getDomainStatus } = await incarca();

  vercel = (c) => {
    if (c.cale === `${CONT_CITIRE}/magazin.ro`) {
      return { status: 200, body: { domain: { name: "magazin.ro", nameservers: NS_STRAIN } } };
    }
    if (c.cale === `${CONT_CITIRE}/magazin.ro/records`) return { status: 404 };
    if (c.cale.startsWith(CONFIG)) return { status: 200, body: { misconfigured: true, configuredBy: null } };
    return undefined;
  };
  dns = dnsul({ soa: "refuzat", ns: NS_STRAIN });

  const s = await getDomainStatus("magazin.ro");

  assert.equal(s.dnsRaspunde, false);
  assert.equal(s.delegated, false, "nici DNS-ul public, nici randul din cont nu arata catre vercel-dns.com");
  assert.equal(
    s.zoneMissing,
    false,
    "varianta `delegated || zone === false` aprindea si aici: n-avem ce zona sa cream si trimiteam clientul sa apese „Repara\" degeaba",
  );
});

// ─── 14. `wwwInProject` pentru subdomenii ─────────────────────────────────────

test("subdomeniu: wwwInProject e „nu stiu\", nu un `true` fabricat", async () => {
  const { getDomainStatus } = await incarca();
  dns = dnsul({ soa: "raspunde", ns: NS_STRAIN });

  const s = await getDomainStatus("shop.magazin.ro");

  assert.equal(
    s.wwwInProject,
    null,
    "un `true` fabricat facea diagnosticul sa afirme ca si geamanul www e configurat corect, despre o gazda care nu fusese nici ceruta, nici atasata",
  );
  assert.equal(
    apeluri.some((c) => c.cale.includes("www.")),
    false,
    "pentru un subdomeniu nu exista geaman www, deci nu se intreaba nimic despre el",
  );
  assert.equal(s.inProject, true, "restul citirii ramane intacta");
});
