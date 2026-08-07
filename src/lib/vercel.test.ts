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

/** Randul din cont, cu nameserverele pe care le vede Vercel. */
function contFaraZona(nameservers: string[], extra: Record<string, unknown> = {}) {
  return { domain: { name: "magazin.ro", serviceType: "external", nameservers, ...extra } };
}

const NS_VERCEL = ["ns1.vercel-dns.com", "ns2.vercel-dns.com"];
const NS_EXTERN = ["ns1.romarg.com", "ns2.romarg.com"];

test("delegat catre Vercel dar fara zona: domeniul e scos din cont si readaugat CU zona", async () => {
  const { repairDomainOnVercel } = await import("./vercel");

  let adaugariInCont = 0;
  reply = (url, method) => {
    if (method === "POST" && url.includes(ACCOUNT_DOMAINS)) {
      adaugariInCont++;
      if (adaugariInCont === 1) {
        return {
          status: 409,
          body: { error: { code: "domain_already_in_use", message: "Cannot add magazin.ro since it's already in use by one of your projects." } },
        };
      }
      return { status: 200 };
    }
    if (method === "GET" && url.includes(`${ACCOUNT_DOMAINS}/magazin.ro`)) {
      return { status: 200, body: contFaraZona(NS_VERCEL) };
    }
    return { status: 200 };
  };

  const res = await repairDomainOnVercel("magazin.ro");

  assert.equal(res.success, true);
  assert.ok(
    calls.some((c) => c.method === "DELETE" && c.url.includes("/v6/domains/magazin.ro")),
    "blocat in cont fara zona, cu nameserverele deja pe Vercel = domeniu mort; singura iesire e scoaterea si readaugarea CU zona",
  );
});

test("pe DNS EXTERN, lipsa zonei NU e defect si domeniul nu se atinge", async () => {
  const { repairDomainOnVercel } = await import("./vercel");

  reply = (url, method) => {
    if (method === "POST" && url.includes(ACCOUNT_DOMAINS)) {
      return { status: 409, body: { error: { message: "already in use by one of your projects" } } };
    }
    if (method === "GET" && url.includes(`${ACCOUNT_DOMAINS}/magazin.ro`)) {
      // Cazul caian-textile.ro: nameservere la registrar, A catre IP-ul Vercel,
      // merge perfect, si nicio zona la Vercel.
      return { status: 200, body: contFaraZona(NS_EXTERN) };
    }
    return { status: 200 };
  };

  const res = await repairDomainOnVercel("magazin.ro");

  assert.equal(res.success, true);
  assert.equal(
    calls.some((c) => c.method === "DELETE"),
    false,
    "zona Vercel e una din DOUA metode valide, nu o cerinta — a demola un magazin viu fiindca nu foloseste zona ar fi mai rau decat defectul initial",
  );
});

test("un domeniu cumparat PRIN Vercel nu se sterge niciodata din cont", async () => {
  const { repairDomainOnVercel } = await import("./vercel");

  reply = (url, method) => {
    if (method === "POST" && url.includes(ACCOUNT_DOMAINS)) {
      return { status: 409, body: { error: { message: "already in use by one of your projects" } } };
    }
    if (method === "GET" && url.includes(`${ACCOUNT_DOMAINS}/magazin.ro`)) {
      return { status: 200, body: contFaraZona(NS_VERCEL, { boughtAt: 1700000000000 }) };
    }
    return { status: 200 };
  };

  const res = await repairDomainOnVercel("magazin.ro");

  assert.equal(res.success, false);
  assert.equal(
    calls.some((c) => c.method === "DELETE" && c.url.includes("/v6/domains/")),
    false,
    "stergerea din cont a unui domeniu inregistrat prin Vercel ar pierde inregistrarea, nu doar zona",
  );
  assert.match(String(res.error), /inregistrat prin Vercel/);
});

test("'already in use by one of your projects' e SUCCES cand proiectul e al nostru", async () => {
  const { addDomainToVercel } = await import("./vercel");

  reply = (url, method) => {
    if (url.includes(ACCOUNT_DOMAINS)) return { status: 200 };
    if (method === "POST" && url.includes(PROJECT_DOMAINS)) {
      return {
        status: 409,
        body: { error: { code: "domain_already_in_use", message: "Cannot add magazin.ro since it's already in use by one of your projects." } },
      };
    }
    // Interogarea de control confirma: e chiar pe proiectul NOSTRU.
    return { status: 200 };
  };

  const res = await addDomainToVercel("magazin.ro");

  assert.equal(
    res.success,
    true,
    "mesajul spune „one of YOUR projects\" — daca proiectul ala e al nostru, nu e nimic de reparat si „Repara\" nu are voie sa refuze",
  );
});

test("delegat catre Vercel fara zona = zoneMissing, oricat de verde ar parea proiectul", async () => {
  const { getDomainStatus } = await import("./vercel");

  reply = (url) => {
    if (url.includes(`${ACCOUNT_DOMAINS}/magazin.ro`)) {
      return { status: 200, body: contFaraZona(NS_VERCEL) };
    }
    if (url.includes("/config")) return { status: 200, body: { misconfigured: true } };
    return { status: 200, body: { verified: true } };
  };

  const status = await getDomainStatus("magazin.ro");

  assert.equal(status.inProject, true);
  assert.equal(status.zone, false);
  assert.equal(status.delegated, true);
  assert.equal(
    status.zoneMissing,
    true,
    "exact starea din 07.08: nameservere pe Vercel, zona inexistenta, domeniul mort de tot",
  );
  assert.equal(status.healthy, false);
});

test("pe DNS extern si configurat corect, domeniul e SANATOS desi n-are zona", async () => {
  const { getDomainStatus } = await import("./vercel");

  reply = (url) => {
    if (url.includes(`${ACCOUNT_DOMAINS}/magazin.ro`)) {
      return { status: 200, body: contFaraZona(NS_EXTERN) };
    }
    if (url.includes("/config")) return { status: 200, body: { misconfigured: false } };
    return { status: 200, body: { verified: true } };
  };

  const status = await getDomainStatus("magazin.ro");

  assert.equal(status.zone, false);
  assert.equal(status.delegated, false);
  assert.equal(status.zoneMissing, false, "fara delegare catre Vercel, lipsa zonei e normala");
  assert.equal(
    status.healthy,
    true,
    "cazul caian-textile.ro: merge prin A/CNAME de la registrar si nu are nimic de reparat",
  );
});
