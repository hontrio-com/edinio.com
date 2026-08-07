import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

/**
 * Testele care ar fi prins caderea lui `atelierullarisei.ro` (2026-08-07) si a
 * lui `vetdepo.ro` inaintea lui.
 *
 * Amandoua au aratat la fel: domeniul era atasat PROIECTULUI Vercel, se vedea
 * frumos in panou, iar Edinio scria „Domeniu conectat" — dar nu fusese
 * inregistrat in CONT, deci Vercel nu avea zona DNS pentru el. Nameserverele
 * raspundeau REFUSED si domeniul era cazut complet, si site si email, zile
 * intregi, fara ca nimic sa semnaleze.
 *
 * Doua lucruri se verifica aici, pentru ca amandoua au fost cauze:
 *   1. `zone: true` chiar pleaca spre endpointul de CONT (nu doar cel de proiect)
 *   2. un adaugare esuata NU se mai raporteaza drept succes doar pentru ca
 *      mesajul de eroare contine cuvantul „already"
 */

process.env.VERCEL_TOKEN = "test-token";
process.env.VERCEL_PROJECT_ID = "prj_test";
delete process.env.VERCEL_TEAM_ID;

type Call = { url: string; method: string; body: Record<string, unknown> | null };
type Reply = { status: number; body?: Record<string, unknown> };

let calls: Call[] = [];
let reply: (url: string, method: string, body: Record<string, unknown> | null) => Reply;

const PROJECT_SELF = "/v10/projects/prj_test";
const PROJECT_DOMAINS = "/v10/projects/prj_test/domains";
const ACCOUNT_DOMAINS = "/v5/domains";

globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  calls.push({ url, method, body });

  // Interogarea prin care modulul afla ce echipa detine proiectul. E tratata
  // aici, nu in `reply`, ca sa raspunda la fel in toate testele: rezultatul e
  // memorat in modul, deci ordinea testelor nu are voie sa-l schimbe.
  if (url.split("?")[0].endsWith(PROJECT_SELF) && method === "GET") {
    return new Response(JSON.stringify({ accountId: "team_test" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const r = reply(url, method, body);
  return new Response(JSON.stringify(r.body ?? {}), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}) as unknown as typeof fetch;

/** Toate cererile merg bine. */
const allOk = (): Reply => ({ status: 200 });

function postsTo(path: string): Call[] {
  return calls.filter((c) => c.method === "POST" && c.url.includes(path));
}

beforeEach(() => {
  calls = [];
  reply = allOk;
});

test("conectarea cere explicit Vercel sa creeze zona DNS", async () => {
  const { addDomainToVercel } = await import("./vercel");

  const res = await addDomainToVercel("magazin.ro");
  assert.equal(res.success, true);

  const accountAdd = postsTo(ACCOUNT_DOMAINS).find((c) => c.body?.name === "magazin.ro");
  assert.ok(
    accountAdd,
    "domeniul nu a fost inregistrat in contul Vercel — fara asta nameserverele nu au ce servi si domeniul e cazut complet",
  );
  assert.equal(
    accountAdd.body?.zone,
    true,
    "`zone: true` lipseste: domeniul intra in cont dar FARA zona DNS, exact starea in care a stat atelierullarisei.ro",
  );
});

test("inregistrarea in cont merge la ECHIPA care detine proiectul, nu la contul personal", async () => {
  const { addDomainToVercel } = await import("./vercel");

  await addDomainToVercel("magazin.ro");

  const accountAdd = postsTo(ACCOUNT_DOMAINS)[0];
  assert.ok(accountAdd, "nu s-a facut nicio inregistrare in cont");
  assert.match(
    accountAdd.url,
    /teamId=team_test/,
    "fara teamId, domeniul si zona lui ajung in contul personal — arata adaugat, dar magazinul ramane mort",
  );
});

test("apexul si geamanul www ajung amandoua pe proiect, www ca redirect 308", async () => {
  const { addDomainToVercel } = await import("./vercel");

  await addDomainToVercel("magazin.ro");

  const added = postsTo(PROJECT_DOMAINS);
  const apex = added.find((c) => c.body?.name === "magazin.ro");
  const www = added.find((c) => c.body?.name === "www.magazin.ro");

  assert.ok(apex, "apexul nu a fost atasat proiectului");
  assert.ok(www, "geamanul www lipseste — cine tasteaza www primeste eroare de certificat");
  assert.equal(www.body?.redirect, "magazin.ro");
  assert.equal(www.body?.redirectStatusCode, 308);
});

test("un 'www.' lipit in fata nu creeaza un domeniu www.www", async () => {
  const { addDomainToVercel } = await import("./vercel");

  await addDomainToVercel("www.magazin.ro");

  const names = postsTo(PROJECT_DOMAINS).map((c) => c.body?.name);
  assert.deepEqual(names.sort(), ["magazin.ro", "www.magazin.ro"]);
});

test("daca zona nu se poate crea, conectarea ESUEAZA in loc sa raporteze succes", async () => {
  const { addDomainToVercel } = await import("./vercel");

  reply = (url, method) => {
    // Contul refuza domeniul, iar interogarea de control confirma ca nu-l avem.
    if (url.includes(ACCOUNT_DOMAINS)) {
      return method === "POST"
        ? { status: 403, body: { error: { code: "forbidden", message: "Domain is already owned by another account" } } }
        : { status: 404 };
    }
    return { status: 200 };
  };

  const res = await addDomainToVercel("magazin.ro");

  assert.equal(
    res.success,
    false,
    "un domeniu fara zona a fost raportat drept conectat — exact minciuna care a tinut magazinul cazut doua zile",
  );
  assert.equal(postsTo(PROJECT_DOMAINS).length, 0, "nu se ataseaza nimic la proiect daca zona a esuat");
});

test("zona deja existenta in cont e succes, nu eroare", async () => {
  const { addDomainToVercel } = await import("./vercel");

  reply = (url, method) => {
    if (url.includes(ACCOUNT_DOMAINS)) {
      // Vercel respinge re-adaugarea, dar interogarea arata ca domeniul e al nostru.
      return method === "POST"
        ? { status: 409, body: { error: { code: "domain_already_exists", message: "Domain already exists" } } }
        : { status: 200, body: { domain: { name: "magazin.ro", serviceType: "zeit.world" } } };
    }
    return { status: 200 };
  };

  const res = await addDomainToVercel("magazin.ro");
  assert.equal(res.success, true, "re-conectarea unui domeniu deja al nostru trebuie sa fie idempotenta");
});

test("un domeniu tinut de ALT cont nu mai trece drept conectat din cauza cuvantului 'already'", async () => {
  const { addDomainToVercel } = await import("./vercel");

  reply = (url, method) => {
    if (url.includes(ACCOUNT_DOMAINS)) return { status: 200 };
    if (url.includes(PROJECT_DOMAINS)) {
      // Mesajul contine „already", dar inseamna „e al altcuiva", nu „e deja al nostru".
      // Controlul prin GET arata ca domeniul NU e pe proiectul nostru.
      return method === "POST"
        ? {
            status: 409,
            body: { error: { code: "domain_already_in_use", message: "Domain magazin.ro is already in use by another project" } },
          }
        : { status: 404 };
    }
    return { status: 200 };
  };

  const res = await addDomainToVercel("magazin.ro");

  assert.equal(
    res.success,
    false,
    "testul pe sirul „already\" raporta succes cand nu se adaugase nimic — de aici pornea toata minciuna",
  );
  assert.match(String(res.error), /already in use/);
});

test("un domeniu deja pe proiectul nostru ramane succes", async () => {
  const { addDomainToVercel } = await import("./vercel");

  reply = (url, method) => {
    if (url.includes(ACCOUNT_DOMAINS)) return { status: 200 };
    if (url.includes(PROJECT_DOMAINS)) {
      // Aceeasi eroare la POST, dar controlul confirma ca domeniul CHIAR e al nostru.
      return method === "POST" ? { status: 409, body: { error: { message: "already exists" } } } : { status: 200 };
    }
    return { status: 200 };
  };

  const res = await addDomainToVercel("magazin.ro");
  assert.equal(res.success, true);
});

test("un subdomeniu nu cere zona si nu primeste geaman www", async () => {
  const { addDomainToVercel } = await import("./vercel");

  const res = await addDomainToVercel("shop.magazin.ro");
  assert.equal(res.success, true);

  assert.equal(
    postsTo(ACCOUNT_DOMAINS).length,
    0,
    "un subdomeniu nu se inregistreaza in cont — DNS-ul ramane la furnizorul clientului",
  );
  const names = postsTo(PROJECT_DOMAINS).map((c) => c.body?.name);
  assert.deepEqual(names, ["shop.magazin.ro"]);
});

test("un www care nu se poate adauga da avertisment, dar nu blocheaza apexul", async () => {
  const { addDomainToVercel } = await import("./vercel");

  reply = (url, method, body) => {
    // Apexul intra normal; doar geamanul www e respins, si controlul confirma
    // ca nu a ajuns pe proiect.
    if (method === "POST" && body?.name === "www.magazin.ro") {
      return { status: 400, body: { error: { message: "Invalid domain" } } };
    }
    if (method === "GET" && url.includes(`${PROJECT_DOMAINS}/www.magazin.ro`)) {
      return { status: 404 };
    }
    return { status: 200 };
  };

  const res = await addDomainToVercel("magazin.ro");

  assert.equal(res.success, true, "apexul merge, deci conectarea nu trebuie sa esueze");
  assert.match(
    String(res.warning),
    /www\.magazin\.ro/,
    "esecul pe www era aruncat la gunoi — vizitatorul care tasteaza www primeste eroare de certificat si nimeni nu afla",
  );
});

test("cand totul merge nu se emite niciun avertisment", async () => {
  const { addDomainToVercel } = await import("./vercel");

  const res = await addDomainToVercel("magazin.ro");
  assert.equal(res.success, true);
  assert.equal(res.warning, undefined);
});

test("starea raportata nu poate fi sanatoasa fara zona DNS", async () => {
  const { getDomainStatus } = await import("./vercel");

  reply = (url) => {
    // Proiectul are domeniul si DNS-ul arata corect, DAR contul nu are zona.
    if (url.includes(ACCOUNT_DOMAINS)) return { status: 404 };
    if (url.includes("/config")) return { status: 200, body: { misconfigured: false } };
    return { status: 200, body: { verified: true } };
  };

  const status = await getDomainStatus("magazin.ro");

  assert.equal(status.inProject, true);
  assert.equal(status.verified, true);
  assert.equal(status.zone, false, "lipsa zonei trebuie sa se vada");
  assert.equal(
    status.healthy,
    false,
    "exact combinatia din 07.08: totul verde in proiect, dar domeniul mort pentru ca nu exista zona",
  );
});
