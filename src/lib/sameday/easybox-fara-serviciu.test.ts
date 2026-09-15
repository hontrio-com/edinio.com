import test from "node:test";
import assert from "node:assert/strict";
import { createSamedayAwb, type SamedayAwbInput, type SamedayConfig } from "./client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN COLET LA DULAP NU PLEACA PE SERVICIUL DE ACASA            (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `createSamedayAwb` cauta serviciul de easybox dupa COD, fiindca id-ul 15 din documentatia
 * lor nu e garantat pe orice cont. Cand nu-l gasea, randul era `?? config.service_id`: adica
 * id-ul dulapului ales de cumparator pleca scris pe un serviciu de livrare la domiciliu. O
 * expediere pe care nimeni n-o poate duce unde scrie pe ea, plecata TACUT si facturata.
 *
 * ⚠ Proba trece prin CLIENTUL ADEVARAT, cu `fetch` inlocuit, nu printr-o functie pura
 * alaturata: ce se apara aici e purtarea lui `createSamedayAwb`, nu a unui ajutor.
 *
 * ⚠ Si masurat: ZERO AWB-uri cu dulap in toata viata platformei, iar cele cinci comenzi la
 * easybox care asteapta sunt toate la magazinul al carui serviciu configurat e 57. De-aia
 * refuzul nu poate strica nimic ce merge azi.
 */

const CONFIG: SamedayConfig = {
  enabled: true,
  username: "proba",
  password: "proba",
  sandbox: true,
  service_id: 57,
  pickup_point_id: 443208,
  contact_person_id: 1,
} as SamedayConfig;

const INTRARE: SamedayAwbInput = {
  recipientPostalCode: "400000",
  observation: "",
  clientInternalReference: "CMD-1",
  recipientName: "Ion Popescu",
  recipientPhone: "0722222222",
  recipientCounty: "Cluj",
  recipientCity: "Cluj-Napoca",
  recipientAddress: "Strada Memorandumului 1",
  packageType: 0 as const,
  packageNumber: 1,
  weightKg: 1,
  cashOnDelivery: 0,
  insuredValue: 0,
  lockerId: 4321,
};

/** `fetch` inlocuit: tine minte fiecare cale ceruta si intoarce ce s-a cerut. */
function fetchDeProba(servicii: { id: number; serviceCode: string }[]) {
  const cerute: string[] = [];
  const stub = async (intrare: unknown): Promise<Response> => {
    const url = String(intrare);
    cerute.push(url);
    const corp = url.includes("api/authenticate")
      ? { token: "jeton" }
      : url.includes("api/client/services")
        ? { data: servicii.map((s) => ({ ...s, name: s.serviceCode, deliveryType: { name: "x" } })) }
        : { awbNumber: "1ONB999" };
    return new Response(JSON.stringify(corp), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  };
  return { cerute, stub };
}

test("fara serviciu de easybox, AWB-ul se REFUZA si nu se trimite nimic la ei", async () => {
  const { cerute, stub } = fetchDeProba([{ id: 7, serviceCode: "24" }]);
  const vechi = globalThis.fetch;
  globalThis.fetch = stub as typeof fetch;
  try {
    await assert.rejects(
      () => createSamedayAwb(CONFIG, INTRARE),
      /nu are niciun serviciu de livrare in easybox/i,
    );
  } finally {
    globalThis.fetch = vechi;
  }

  /*
   * ⚠ Miezul: nu doar ca a aruncat, ci ca a aruncat INAINTE de POST. Un refuz de dupa
   * emitere ar fi un colet deja platit si o eticheta deja tiparita.
   */
  assert.equal(
    cerute.filter((u) => /\/api\/awb(\?|$)/.test(u)).length,
    0,
    `s-a trimis totusi expedierea: ${cerute.join(", ")}`,
  );
});

test("cu serviciu de easybox pe codul XL, nu doar pe LN, AWB-ul pleaca", async () => {
  /*
   * ⚠ Cautarea era numai dupa `LN`. Un cont care are dulapurile pe `XL` (Locker Crossborder)
   * intorcea `null`, deci cadea pe serviciul de acasa: acelasi defect, pe alta usa.
   */
  const { cerute, stub } = fetchDeProba([
    { id: 7, serviceCode: "24" },
    { id: 88, serviceCode: "XL" },
  ]);
  const vechi = globalThis.fetch;
  globalThis.fetch = stub as typeof fetch;
  try {
    const creat = await createSamedayAwb(CONFIG, INTRARE);
    assert.equal(creat.awbNumber, "1ONB999");
  } finally {
    globalThis.fetch = vechi;
  }
  assert.ok(cerute.some((u) => /\/api\/awb(\?|$)/.test(u)), "expedierea trebuia trimisa");
});

test("„nu are easybox” NU se tine minte: contul caruia i se activeaza serviciul poate emite pe loc", async () => {
  /*
   * ⚠ Cache-ul tinea minte si `null`. De cand `null` inseamna REFUZ, asta ar fi insemnat un
   * cont blocat pana la urmatoarea pornire a procesului, desi Sameday tocmai i-a activat
   * serviciul. Proba merge pe ACELASI cont, de doua ori.
   */
  const CONT = { ...CONFIG, username: "cont-care-primeste-easybox" };

  const fara = fetchDeProba([{ id: 7, serviceCode: "24" }]);
  const vechi = globalThis.fetch;
  globalThis.fetch = fara.stub as typeof fetch;
  try {
    await assert.rejects(() => createSamedayAwb(CONT, INTRARE), /easybox/i);
  } finally {
    globalThis.fetch = vechi;
  }

  /* Sameday i-a activat intre timp Locker NextDay. */
  const cu = fetchDeProba([{ id: 7, serviceCode: "24" }, { id: 15, serviceCode: "LN" }]);
  globalThis.fetch = cu.stub as typeof fetch;
  try {
    const creat = await createSamedayAwb(CONT, INTRARE);
    assert.equal(creat.awbNumber, "1ONB999");
  } finally {
    globalThis.fetch = vechi;
  }
});
