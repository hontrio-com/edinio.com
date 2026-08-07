import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

/**
 * Testele care tin inchise gaurile din 07.08.2026, cand `atelierullarisei.ro` a
 * stat doua zile complet cazut — nici site, nici email.
 *
 * Defectiunea de fond: existenta zonei DNS se DEDUCEA din `serviceType` de pe
 * `GET /v5/domains/{apex}`, camp care nu poate purta acea informatie (raspunsul
 * acelui endpoint nu are deloc un camp `zone`, iar `serviceType` e o clasificare
 * de serviciu). Deductia iesea „zona exista" tocmai pe domeniul mort, deci
 * butonul „Repara" nu intra niciodata in reparare si raporta succes.
 *
 * Regula pe care o apara testele astea: **se intreaba, nu se deduce**, si o
 * citire care n-a raspuns nu produce niciodata un verdict negativ.
 */

process.env.VERCEL_TOKEN = "test-token";
process.env.VERCEL_PROJECT_ID = "prj_test";
delete process.env.VERCEL_TEAM_ID;

type Call = { url: string; cale: string; method: string; body: Record<string, unknown> | null };
type Reply = { status: number; body?: Record<string, unknown> };

let calls: Call[] = [];
let reply: (cale: string, method: string, body: Record<string, unknown> | null) => Reply;

const PROIECT = "/v10/projects/prj_test";
const PROIECT_DOMENII = "/v10/projects/prj_test/domains";
const CONT_ADAUGA = "/v7/domains";
const CONT_PATCH = "/v3/domains";
const CONT_CITIRE = "/v5/domains";

globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const url = String(input);
  const cale = url.replace("https://api.vercel.com", "").split("?")[0];
  const method = init?.method ?? "GET";
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  calls.push({ url, cale, method, body });

  // Rezolvarea echipei: tratata aici, nu in `reply`, ca sa raspunda la fel in
  // toate testele — rezultatul e memorat in modul, deci ordinea testelor nu are
  // voie sa-l schimbe.
  if (cale === PROIECT && method === "GET") {
    return new Response(JSON.stringify({ accountId: "team_test" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const r = reply(cale, method, body);
  return new Response(JSON.stringify(r.body ?? {}), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}) as unknown as typeof fetch;

function posturi(cale: string): Call[] {
  return calls.filter((c) => c.method === "POST" && c.cale.startsWith(cale));
}
function are(method: string, fragment: string): boolean {
  return calls.some((c) => c.method === method && c.cale.includes(fragment));
}

/** Totul merge: zona exista, domeniul e pe proiect, DNS-ul e configurat. */
const totOk = (): Reply => ({ status: 200 });

beforeEach(() => {
  calls = [];
  reply = totOk;
});

// ─── Crearea zonei ────────────────────────────────────────────────────────────

test("conectarea cere explicit Vercel sa creeze zona DNS", async () => {
  const { addDomainToVercel } = await import("./vercel");

  const res = await addDomainToVercel("magazin.ro");
  assert.equal(res.success, true);

  const adaugare = posturi(CONT_ADAUGA).find((c) => c.body?.name === "magazin.ro");
  assert.ok(adaugare, "domeniul nu a fost inregistrat in contul Vercel");
  assert.equal(
    adaugare.body?.zone,
    true,
    "`zone: true` lipseste: domeniul intra in cont dar FARA zona DNS — starea in care nameserverele raspund REFUSED si domeniul e mort de tot",
  );
});

test("inregistrarea in cont merge la ECHIPA care detine proiectul", async () => {
  const { addDomainToVercel } = await import("./vercel");
  await addDomainToVercel("magazin.ro");
  assert.match(
    posturi(CONT_ADAUGA)[0].url,
    /teamId=team_test/,
    "fara teamId, domeniul si zona ajung in contul personal — arata adaugat, magazinul ramane mort",
  );
});

test("domeniu deja in cont FARA zona: se activeaza zona cu PATCH, nu se sterge nimic", async () => {
  const { addDomainToVercel } = await import("./vercel");

  let recordsCerut = 0;
  reply = (cale, method) => {
    if (method === "POST" && cale === CONT_ADAUGA) {
      return {
        status: 409,
        body: { error: { code: "domain_already_in_use", message: "Cannot add magazin.ro since it's already in use by one of your projects." } },
      };
    }
    if (cale === `${CONT_CITIRE}/magazin.ro/records`) {
      // Inainte de PATCH nu exista zona; dupa, exista.
      recordsCerut++;
      return recordsCerut === 1 && !are("PATCH", CONT_PATCH) ? { status: 404 } : { status: 200, body: { records: [] } };
    }
    return { status: 200 };
  };

  const res = await addDomainToVercel("magazin.ro");

  assert.equal(res.success, true);
  const patch = calls.find((c) => c.method === "PATCH" && c.cale === `${CONT_PATCH}/magazin.ro`);
  assert.ok(patch, "lipseste PATCH-ul care activeaza DNS-ul Vercel pe un domeniu deja in cont");
  assert.deepEqual(patch.body, { op: "update", zone: true });
  assert.equal(
    are("DELETE", "/v6/domains"),
    false,
    "stergerea din cont scoate automat aliasurile SI zona clientului (MX-urile lui) — ireversibil, unde PATCH-ul face acelasi lucru idempotent",
  );
});

test("nicio cale nu sterge vreodata domeniul din contul Vercel", async () => {
  const { addDomainToVercel, repairDomainOnVercel } = await import("./vercel");

  reply = (cale, method) => {
    if (method === "POST" && cale === CONT_ADAUGA) return { status: 409, body: { error: { message: "conflict" } } };
    if (cale === `${CONT_CITIRE}/magazin.ro/records`) return { status: 404 };
    return { status: 200 };
  };

  await addDomainToVercel("magazin.ro").catch(() => {});
  await repairDomainOnVercel("magazin.ro").catch(() => {});

  assert.equal(are("DELETE", "/v6/domains"), false);
  assert.equal(are("DELETE", "/v5/domains"), false);
});

// ─── Sonda de zona ────────────────────────────────────────────────────────────

test("existenta zonei se INTREABA pe /records, nu se deduce din serviceType", async () => {
  const { getDomainStatus } = await import("./vercel");

  reply = (cale) => {
    // Contul spune „zeit.world" — exact minciuna care a costat o zi. Zona insa
    // nu exista, si /records o spune.
    if (cale === `${CONT_CITIRE}/magazin.ro`) {
      return { status: 200, body: { domain: { name: "magazin.ro", serviceType: "zeit.world", nameservers: ["ns1.vercel-dns.com"] } } };
    }
    if (cale === `${CONT_CITIRE}/magazin.ro/records`) return { status: 404 };
    if (cale.includes("/config")) return { status: 200, body: { misconfigured: true } };
    return { status: 200, body: { verified: true } };
  };

  const s = await getDomainStatus("magazin.ro");

  assert.ok(
    calls.some((c) => c.cale === `${CONT_CITIRE}/magazin.ro/records`),
    "nu s-a interogat deloc zona",
  );
  assert.equal(s.zone, false, "serviceType: zeit.world nu are voie sa treaca drept dovada de zona");
  assert.equal(s.zoneMissing, true);
  assert.equal(s.healthy, false);
});

test("o citire care NU a raspuns nu produce niciodata verdict de zona lipsa", async () => {
  const { getDomainStatus } = await import("./vercel");

  reply = (cale) => {
    if (cale === `${CONT_CITIRE}/magazin.ro/records`) return { status: 429, body: { error: { message: "rate limited" } } };
    if (cale.includes("/config")) return { status: 200, body: { misconfigured: true } };
    return { status: 200, body: { verified: true } };
  };

  const s = await getDomainStatus("magazin.ro");

  assert.equal(s.zoneUnknown, true);
  assert.equal(
    s.zoneMissing,
    false,
    "un 429 trecator declansa altfel o reparatie pe un magazin sanatos — „n-am putut afla\" nu e „e stricat\"",
  );
});

test("cand configuratia nu se poate citi, nu se declara zona lipsa", async () => {
  const { getDomainStatus } = await import("./vercel");

  reply = (cale) => {
    if (cale === `${CONT_CITIRE}/magazin.ro/records`) return { status: 404 };
    if (cale.includes("/config")) return { status: 500, body: { error: { message: "boom" } } };
    return { status: 200, body: { verified: true } };
  };

  const s = await getDomainStatus("magazin.ro");
  assert.equal(s.zoneMissing, false, "fara verdictul Vercel despre configuratie nu stim daca domeniul chiar e mort");
  assert.ok(s.error, "esecul de citire trebuie raportat, nu ascuns");
});

test("pe DNS extern si configurat corect, domeniul e SANATOS", async () => {
  const { getDomainStatus } = await import("./vercel");

  reply = (cale) => {
    if (cale === `${CONT_CITIRE}/magazin.ro`) {
      return { status: 200, body: { domain: { name: "magazin.ro", serviceType: "external", nameservers: ["ns1.romarg.com"] } } };
    }
    if (cale === `${CONT_CITIRE}/magazin.ro/records`) return { status: 404 };
    if (cale.includes("/config")) return { status: 200, body: { misconfigured: false } };
    return { status: 200, body: { verified: true } };
  };

  const s = await getDomainStatus("magazin.ro");

  assert.equal(s.delegated, false);
  assert.equal(s.zoneMissing, false, "fara zona, dar functional prin A/CNAME — nu e nimic de reparat");
  assert.equal(s.healthy, true);
});

// ─── „Repara" nu mai minte ────────────────────────────────────────────────────

test("Butonul Repara NU raporteaza succes daca zona tot lipseste dupa incercare", async () => {
  const { repairDomainOnVercel } = await import("./vercel");

  reply = (cale, method) => {
    if (method === "POST" && cale === CONT_ADAUGA) return { status: 409, body: { error: { message: "conflict" } } };
    if (cale === `${CONT_CITIRE}/magazin.ro/records`) return { status: 404 }; // nu apare niciodata
    if (cale.includes("/config")) return { status: 200, body: { misconfigured: true } };
    return { status: 200, body: { verified: true } };
  };

  const res = await repairDomainOnVercel("magazin.ro");

  assert.equal(
    res.success,
    false,
    "butonul raporta „reparat\" fara sa fi facut nimic — de aici doua zile in care nimeni n-a stiut ca magazinul e cazut",
  );
  assert.match(String(res.error), /zona dns/i);
});

test("Butonul Repara raporteaza succes cand zona chiar apare", async () => {
  const { repairDomainOnVercel } = await import("./vercel");

  let patchFacut = false;
  reply = (cale, method) => {
    if (method === "POST" && cale === CONT_ADAUGA) return { status: 409, body: { error: { message: "conflict" } } };
    if (method === "PATCH" && cale === `${CONT_PATCH}/magazin.ro`) { patchFacut = true; return { status: 200 }; }
    if (cale === `${CONT_CITIRE}/magazin.ro/records`) return patchFacut ? { status: 200, body: { records: [] } } : { status: 404 };
    if (cale.includes("/config")) return { status: 200, body: { misconfigured: false } };
    return { status: 200, body: { verified: true } };
  };

  const res = await repairDomainOnVercel("magazin.ro");
  assert.equal(res.success, true);
});

// ─── Atasarea la proiect ──────────────────────────────────────────────────────

test("apexul si geamanul www ajung pe proiect, www ca redirect 308", async () => {
  const { addDomainToVercel } = await import("./vercel");
  await addDomainToVercel("magazin.ro");

  const puse = posturi(PROIECT_DOMENII);
  const www = puse.find((c) => c.body?.name === "www.magazin.ro");
  assert.ok(puse.find((c) => c.body?.name === "magazin.ro"), "apexul nu a fost atasat");
  assert.ok(www, "geamanul www lipseste — cine il tasteaza primeste eroare de certificat");
  assert.equal(www.body?.redirect, "magazin.ro");
  assert.equal(www.body?.redirectStatusCode, 308);
});

test("un 'www.' lipit in fata nu creeaza un domeniu www.www", async () => {
  const { addDomainToVercel } = await import("./vercel");
  await addDomainToVercel("www.magazin.ro");
  assert.deepEqual(
    posturi(PROIECT_DOMENII).map((c) => c.body?.name).sort(),
    ["magazin.ro", "www.magazin.ro"],
  );
});

test("'already in use by one of your projects' e SUCCES cand proiectul e al nostru", async () => {
  const { addDomainToVercel } = await import("./vercel");

  reply = (cale, method) => {
    if (method === "POST" && cale === PROIECT_DOMENII) {
      return { status: 409, body: { error: { code: "domain_already_in_use", message: "Cannot add magazin.ro since it's already in use by one of your projects." } } };
    }
    return { status: 200 };
  };

  const res = await addDomainToVercel("magazin.ro");
  assert.equal(res.success, true, "daca proiectul din mesaj e chiar al nostru, nu e nimic de reparat");
});

test("cand sonda spune ca domeniul NU e pe proiectul nostru, textul erorii nu-l poate salva", async () => {
  const { addDomainToVercel } = await import("./vercel");

  reply = (cale, method) => {
    if (method === "POST" && cale === PROIECT_DOMENII) {
      return { status: 409, body: { error: { message: "Domain already exists" } } };
    }
    if (method === "GET" && cale.startsWith(`${PROIECT_DOMENII}/`)) return { status: 404 };
    return { status: 200 };
  };

  const res = await addDomainToVercel("magazin.ro");
  assert.equal(
    res.success,
    false,
    "sonda a raspuns „nu e al nostru\"; nicio potrivire pe „already exists\" din text nu are voie sa treaca peste ea",
  );
});

test("un subdomeniu nu cere zona si nu primeste geaman www", async () => {
  const { addDomainToVercel } = await import("./vercel");

  const res = await addDomainToVercel("shop.magazin.ro");
  assert.equal(res.success, true);
  assert.equal(posturi(CONT_ADAUGA).length, 0, "un subdomeniu ramane pe DNS-ul clientului");
  assert.deepEqual(posturi(PROIECT_DOMENII).map((c) => c.body?.name), ["shop.magazin.ro"]);
});

// ─── Valorile DNS date clientului ─────────────────────────────────────────────

test("valorile A/CNAME recomandate vin de la Vercel, nu din cod", async () => {
  const { getDomainStatus } = await import("./vercel");

  reply = (cale) => {
    if (cale.includes("/config")) {
      return {
        status: 200,
        body: {
          misconfigured: true,
          recommendedIPv4: [{ rank: 1, value: ["216.198.79.1"] }],
          recommendedCNAME: [{ rank: 1, value: "d1d4fc829fe7bc7c.vercel-dns-017.com" }],
        },
      };
    }
    return { status: 200, body: { verified: true } };
  };

  const s = await getDomainStatus("magazin.ro");
  assert.deepEqual(s.recommendedIPv4, ["216.198.79.1"]);
  assert.deepEqual(s.recommendedCNAME, ["d1d4fc829fe7bc7c.vercel-dns-017.com"]);
});

test("configuratia se cere cu strict=true", async () => {
  const { getDomainStatus } = await import("./vercel");
  await getDomainStatus("magazin.ro");
  const config = calls.find((c) => c.cale.includes("/config"));
  assert.ok(config);
  assert.match(
    config.url,
    /strict=true/,
    "fara strict, raspunsul imprumuta nameserverele zonei parinte si ascunde ca domeniul insusi n-are nimic",
  );
});
