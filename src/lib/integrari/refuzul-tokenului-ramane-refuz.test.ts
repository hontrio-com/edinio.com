import { strict as assert } from "node:assert";
import { test, describe, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import * as fedex from "@/lib/fedex/client";
import * as ups from "@/lib/ups/client";
import * as shipo from "@/lib/shipo/client";

/*
 * ⚠⚠ O REGULA, TREI COPII.
 *
 * FedEx, UPS si Shipo sunt scrisi dupa acelasi sablon, si toti trei aveau acelasi
 * defect: luarea tokenului statea INAUNTRUL lui `try`, iar `catch`-ul de acolo
 * rescria orice a iesit din ea ca `ambiguu`. Pe o SCRIERE, `ambiguu` inseamna
 * `necunoscut`: randul din registru BLOCHEAZA si cazul iese la om.
 *
 * Numai ca un refuz al autentificarii nu e o nesiguranta. Cand furnizorul ne-a
 * respins CHEILE, stim un lucru sigur: cererea de expediere nu a plecat. Verdictul
 * cinstit e `esuat`, care elibereaza reincercarea — comerciantul isi repara cheia si
 * apasa din nou. Cu `necunoscut`, ramanea cu o comanda inghetata despre NIMIC.
 *
 * ⚠ Probele stau IMPREUNA, intr-un singur fisier, tocmai fiindca regula e una
 * singura. Asezate cate una in dosarul fiecarui curier, al patrulea client scris
 * maine dupa acelasi sablon n-ar avea de unde sa cada.
 *
 * ⚠ Si a doua jumatate a regulii: o cadere de RETEA pe cererea propriu-zisa ramane
 * `necunoscut`. Acolo chiar nu stim daca a ajuns, si acolo blocarea e purtarea buna.
 */

type Raspuns = (url: string) => Response;

function retea(raspunde: Raspuns) {
  const original = globalThis.fetch;
  const cereri: string[] = [];
  globalThis.fetch = (async (intrare: unknown) => {
    const url = String(typeof intrare === "string" ? intrare : (intrare as { url?: string })?.url ?? "");
    cereri.push(url);
    return raspunde(url);
  }) as unknown as typeof globalThis.fetch;
  return { cereri, restaureaza: () => { globalThis.fetch = original; } };
}

const json = (corp: unknown, status = 200) =>
  new Response(JSON.stringify(corp), { status, headers: { "Content-Type": "application/json" } });

/** Cei trei clienti scrisi dupa acelasi sablon, cu drumul lor de SCRIERE. */
const CLIENTI = [
  {
    nume: "FedEx",
    caleToken: "/oauth/token",
    uita: fedex.uitaTokenurile,
    refuz: () => json({ errors: [{ code: "NOT.AUTHORIZED.ERROR" }] }, 401),
    bun: () => json({ access_token: "t", expires_in: 3600 }),
    scrie: () => fedex.creeazaExpediere(
      { enabled: true, client_id: "a", client_secret: "b", account_number: "613902139",
        expeditor: { nume: "D", telefon: "0721000111", strada: "Str. A 1", oras: "Cluj-Napoca", cod_postal: "400001" } },
      { requestedShipment: {} },
      "CMD-1",
    ),
  },
  {
    nume: "UPS",
    caleToken: "/security/v1/oauth/token",
    uita: ups.uitaTokenurile,
    refuz: () => json({ response: { errors: [{ code: "10401", message: "Invalid" }] } }, 401),
    bun: () => json({ access_token: "t", expires_in: "3600" }),
    scrie: () => ups.creeazaExpediere(
      { enabled: true, client_id: "a", client_secret: "b", account_number: "A1B2C3",
        expeditor: { nume: "D", telefon: "0721000111", strada: "Str. A 1", oras: "Cluj-Napoca", cod_postal: "400001" } },
      { ShipmentRequest: {} } as never,
      "CMD-1",
    ),
  },
  {
    nume: "Shipo",
    caleToken: "/auth",
    uita: shipo.uitaTokenurile,
    refuz: () => json({ success: false, message: "Invalid key" }, 401),
    bun: () => json({ access_token: "t", expiresIn: 3600 }),
    scrie: () => shipo.creeazaExpediere(
      { enabled: true, api_key: "cheie" } as never,
      {},
    ),
  },
];

beforeEach(() => { for (const c of CLIENTI) c.uita(); });

describe("Autentificarea respinsa e refuz DOVEDIT, la toti trei", () => {
  for (const c of CLIENTI) {
    test(`${c.nume}: cheia respinsa => \`esuat\`, si nicio cerere de expediere`, async () => {
      const r = retea((url) => url.includes(c.caleToken) ? c.refuz() : json({}));
      try {
        await assert.rejects(c.scrie, (e: unknown) => {
          assert.equal(verdictFurnizor(e), "esuat", `${c.nume}: verdictul nu mai e refuz dovedit`);
          return true;
        });
        const catreToken = r.cereri.filter((u) => u.includes(c.caleToken)).length;
        assert.equal(r.cereri.length, catreToken, `${c.nume}: a plecat o cerere desi cheia fusese respinsa`);
      } finally { r.restaureaza(); }
    });

    test(`${c.nume}: dar reteaua cazuta pe cerere ramane \`necunoscut\``, async () => {
      const r = retea((url) => {
        if (url.includes(c.caleToken)) return c.bun();
        throw new Error("socket hang up");
      });
      try {
        await assert.rejects(c.scrie, (e: unknown) => {
          assert.equal(verdictFurnizor(e), "necunoscut", `${c.nume}: o nesiguranta a devenit refuz dovedit`);
          return true;
        });
      } finally { r.restaureaza(); }
    });
  }
});

describe("Cheia respinsa nu se mai cere la fiecare apel", () => {
  /*
   * ⚠ Nu e o optimizare, e o plasa. La FedEx pragul e pe ADRESA IP (3 cereri/s timp
   * de 5s => 403 timp de zece minute), iar pe Vercel IP-ul e partajat intre magazine:
   * un singur magazin prost configurat stingea cotarea pentru TOATE. La UPS cota e a
   * contului si e scrisa in chiar schema lor (`429 Quota Limit Exceeded`).
   */
  for (const c of CLIENTI.filter((x) => x.nume !== "Shipo")) {
    test(`${c.nume}: al doilea apel nu mai cere token`, async () => {
      const r = retea((url) => url.includes(c.caleToken) ? c.refuz() : json({}));
      try {
        await assert.rejects(c.scrie);
        const dupaUnu = r.cereri.filter((u) => u.includes(c.caleToken)).length;
        await assert.rejects(c.scrie);
        const dupaDoi = r.cereri.filter((u) => u.includes(c.caleToken)).length;
        assert.equal(dupaUnu, 1, `${c.nume}: primul apel n-a cerut exact un token`);
        assert.equal(dupaDoi, 1, `${c.nume}: al doilea apel a mai cerut un token`);
      } finally { r.restaureaza(); }
    });
  }
});

describe("⚠ Si niciun client nou nu scapa de regula", () => {
  /*
   * Plasa de mai sus e behaviorala si apara trei fisiere anume. Asta apara LISTA: un
   * al patrulea client scris dupa acelasi sablon (`await token(...)` chiar inauntrul
   * lui `try`, cu un `catch` care rescrie prin `ambiguu`) cade aici, chiar daca nimeni
   * nu s-a gandit sa-i scrie o proba.
   */
  const CLIENTI_CU_TOKEN = [
    "src/lib/fedex/client.ts",
    "src/lib/ups/client.ts",
    "src/lib/shipo/client.ts",
  ];

  test("tokenul nu se mai ia inauntrul unui `try` care rescrie verdictul", () => {
    const vinovate: string[] = [];
    for (const f of CLIENTI_CU_TOKEN) {
      const text = readFileSync(join(process.cwd(), f), "utf8");
      /* `try {` urmat, inainte de `catch`, de o luare de token pe acelasi rand cu trimiterea. */
      for (const bucata of text.split(/\btry\s*\{/).slice(1)) {
        const panaLaCatch = bucata.split(/\}\s*catch/)[0];
        if (!/await\s+token\s*\(/.test(panaLaCatch)) continue;
        if (!/ambiguu\s*\(/.test(bucata.slice(panaLaCatch.length, panaLaCatch.length + 400))) continue;
        vinovate.push(f);
        break;
      }
    }
    assert.deepEqual(vinovate, [], "tokenul se ia iar inauntrul unui `try` cu `catch` ambiguu");
  });

  test("cititorul chiar citeste fisierele", () => {
    for (const f of CLIENTI_CU_TOKEN) {
      const text = readFileSync(join(process.cwd(), f), "utf8");
      assert.match(text, /await token\(/, `${f}: nu mai are luare de token, sau s-a mutat`);
      assert.match(text, /ambiguu/, `${f}: nu mai are clasificarea ambigua`);
    }
  });
});
