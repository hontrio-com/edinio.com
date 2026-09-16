import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { createCargusAwb, calculateCargusPrice, type CargusConfig } from "@/lib/cargus";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CARGUS: TERMENUL DEPASIT SPUNE ACUM CE SA FACA OMUL       (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `cargusPost`, `cargusPut` si `cargusDelete` n-aveau niciun `try` pe `fetch`. Un termen
 * depasit iesea ca `TimeoutError` BRUT, netrecut prin niciun constructor de verdict.
 *
 * ⚠ VERDICTUL era totusi cel bun, din intamplare fericita: `verdictFurnizor` da `necunoscut`
 * implicit, iar pe o SCRIERE aia e purtarea corecta. Ce lipsea era PROPOZITIA — comerciantul
 * primea „The operation was aborted due to timeout" si nu afla lucrul care conteaza: sa se uite
 * in contul Cargus INAINTE de a apasa din nou.
 *
 * ⚠⚠ SI PE CITIRE VERDICTUL ERA CHIAR GRESIT. `ShippingCalculation` e un POST, dar nu creeaza
 * nimic: e o cotare de tarif. Ramas `necunoscut`, un termen depasit acolo ar fi blocat degeaba
 * o reincercare despre care se stie sigur ca n-a lasat nimic in urma. Aceeasi lectie ca la FAN,
 * unde `reports/branches` bloca o comanda pe o citire expirata.
 */

const CONFIG: CargusConfig = {
  username: "u", password: "p", subscription_key: "k",
  location_id: 1, price_table_id: 1,
} as CargusConfig;


/** Cea mai mica intrare care trece de verificarile dinaintea apelului. */
const AWB = {
  recipientName: "Ion Popescu",
  recipientPhone: "0721000111",
  recipientEmail: "ion@example.com",
  recipientCounty: "Cluj",
  recipientCity: "Cluj-Napoca",
  recipientAddress: "Str. A 1",
  recipientPostalCode: "400001",
  parcels: 1,
  totalWeightKg: 1,
  cashRepayment: 0,
  openPackage: false,
  observations: "",
  packageContent: "Produse",
  customString: "#0001",
  parcelsDetails: [{ weight: 1 }],
};

/** `fetch` care cade exact cum cade un termen depasit. */
function reteaCareExpira() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (intrare: unknown) => {
    const url = String(typeof intrare === "string" ? intrare : (intrare as { url?: string })?.url ?? "");
    /*
     * Autentificarea si citirile dinaintea cererii reusesc: altfel n-am ajunge niciodata la
     * cea care ne intereseaza. ⚠ Chiar asa a si cazut proba prima oara: cotarea cheama INTAI
     * `PickupLocations`, iar mesajul primit numea acea citire, nu tariful.
     */
    if (url.includes("LoginUser")) {
      return new Response(JSON.stringify("jeton-de-proba"), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("PickupLocations")) {
      return new Response(JSON.stringify([{ LocationId: 1, Name: "Depozit", LocationName: "Depozit",
        /* ⚠ Fara astea doua, rezolvarea expeditorului iese `null` si cotarea se opreste
           cinstit INAINTE de tarif — asa a cazut proba a doua oara. */
        CountyName: "Cluj", LocalityName: "Cluj-Napoca" }]), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    throw e;
  }) as unknown as typeof globalThis.fetch;
  return { restaureaza: () => { globalThis.fetch = original; } };
}

describe("Cargus: ce vede omul cand ei nu raspund la timp", () => {
  test("⚠ pe EMITERE: „nu stim”, si i se spune sa verifice in contul lor", async () => {
    const r = reteaCareExpira();
    try {
      await assert.rejects(
        () => createCargusAwb(CONFIG, AWB as never),
        (e: unknown) => {
          const m = (e as Error).message;
          assert.equal(verdictFurnizor(e), "necunoscut", "o scriere expirata nu mai blocheaza");
          assert.match(m, /Cargus nu a raspuns la timp/, `mesaj brut: ${m}`);
          assert.match(m, /emiterea AWB-ului/, "mesajul nu spune CE anume a expirat");
          assert.match(m, /Verifica in contul/, "mesajul nu spune omului ce sa faca");
          return true;
        },
      );
    } finally { r.restaureaza(); }
  });

  test("⚠⚠ pe COTARE: refuz DOVEDIT, fiindca un tarif nu creeaza nimic", async () => {
    const r = reteaCareExpira();
    try {
      await assert.rejects(
        () => calculateCargusPrice(CONFIG, { county: "Cluj", city: "Cluj-Napoca", weightKg: 1 }),
        (e: unknown) => {
          assert.equal(
            verdictFurnizor(e), "esuat",
            "o cotare expirata blocheaza degeaba: nu s-a creat nimic la ei",
          );
          assert.match((e as Error).message, /Cargus nu a raspuns la timp \(cotarea de tarif\)/);
          return true;
        },
      );
    } finally { r.restaureaza(); }
  });
});

describe("⚠ si efectul e OBLIGATORIU in semnatura, ca `tsc` sa enumere apelantii", () => {
  /*
   * Acelasi tipar ca la FedEx: fara camp obligatoriu, o cerere noua s-ar strecura fara ca nimeni
   * sa se gandeasca daca lasa sau nu ceva in urma. Cu el, `tsc` cade pe fiecare apelant nou.
   */
  const s = readFileSync("src/lib/cargus.ts", "utf8").replace(/\r\n/g, "\n");

  test("tipul exista si nu e optional", () => {
    assert.match(s, /type EfectCargus = \{ efect: "citire" \| "scriere"; ce: string \}/);
    assert.match(s, /\n  efect: EfectCargus,\n/, "campul a devenit optional undeva");
  });

  test("toate cele trei invelisuri il cer", () => {
    const fara = ["cargusPost", "cargusPut", "cargusDelete"].filter((f) => {
      const i = s.indexOf(`async function ${f}`);
      return i < 0 || !s.slice(i, i + 400).includes("efect: EfectCargus");
    });
    assert.deepEqual(fara, [], "un invelis de cerere nu mai cere efectul");
  });

  test("⚠ si cotarea e declarata CITIRE, desi e POST", () => {
    assert.match(
      s, /efect: "citire", ce: "cotarea de tarif"/,
      "cotarea a redevenit scriere: un termen depasit ar bloca degeaba",
    );
  });
});
