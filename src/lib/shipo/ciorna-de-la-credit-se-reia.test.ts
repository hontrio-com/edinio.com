import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { creeazaExpediere, expedierePeEroare, validesteExpediere, type ShipoConfig } from "./client";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CIORNA SALVATA LA CREDIT INSUFICIENT SE RELUA, NU SE RECREEAZA (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La credit insuficient Shipo raspunde HTTP 402 cu `success:false`, dar SI cu id-ul unei expedieri
 * pe care a salvat-o ca ciorna. Id-ul ala se pierdea: corpul se citeste inainte de aruncare, insa
 * `descrieEroarea` scoate din el doar `message`, `error` si `errors`. Deci nu era NECITIT, era
 * ARUNCAT. Comerciantul incarca creditul, apasa din nou, si se crea a doua ciorna orfana.
 *
 * ⚠ CEA MAI IMPORTANTA AFIRMATIE DIN FISIER E CA VERDICTUL NU S-A SCHIMBAT.
 *
 * Reparatia evidenta ar fi fost sa intoarcem 402 ca rezultat normal, cu `awb: null`. Atunci
 * `cuRegistru` ar fi luat drumul de succes si ar fi inchis randul ca `reusit` cu referinta goala:
 * slotul s-ar fi blocat PENTRU TOTDEAUNA si comerciantul n-ar mai fi putut emite deloc. Deci 402
 * ramane `esuat` (reincercarea e libera, si chiar asta vrem: se incarca credit si se reia), si se
 * pastreaza DOAR id-ul.
 */

type Cerere = { url: string; corp: string };

/** `fetch` inlocuit, ca in `paginare-peste-ultima.test.ts` si `woot.test.ts`. */
function fetchFals(raspunsShipment: { status: number; corp: string }) {
  const original = globalThis.fetch;
  const cereri: Cerere[] = [];
  globalThis.fetch = (async (intrare: unknown, init?: RequestInit) => {
    const url = String(typeof intrare === "string" ? intrare : (intrare as { url?: string })?.url ?? "");
    cereri.push({ url, corp: String(init?.body ?? "") });

    /* Autentificarea sta in fata oricarei cereri; ii raspundem ca sa ajungem la cea care conteaza. */
    if (url.includes("/auth")) {
      return new Response(JSON.stringify({ access_token: "jeton-de-proba" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(raspunsShipment.corp, {
      status: raspunsShipment.status, headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return { cereri, restaureaza: () => { globalThis.fetch = original; } };
}

const CFG = { enabled: true, api_key: "cheie-de-proba" } as unknown as ShipoConfig;

/** Raspunsul lor la credit insuficient: refuz, dar cu ciorna salvata. */
const CREDIT_INSUFICIENT = {
  status: 402,
  corp: JSON.stringify({ success: false, message: "Insufficient credit", expedition: 4242 }),
};

async function eroareaDeLa(f: () => Promise<unknown>): Promise<unknown> {
  try {
    await f();
  } catch (e) {
    return e;
  }
  assert.fail("apelul ar fi trebuit sa arunce");
}

/* ── 1. Regula, dusa pana la capat prin `fetch` ───────────────────────────── */

test("⚠⚠ la 402 id-ul ciornei iese PE EROARE, nu se pierde", async () => {
  const f = fetchFals(CREDIT_INSUFICIENT);
  try {
    const e = await eroareaDeLa(() => creeazaExpediere(CFG, { x: 1 }));
    assert.equal(expedierePeEroare(e), 4242,
      "id-ul ciornei s-a pierdut: fiecare reincercare creeaza alta ciorna orfana");
  } finally {
    f.restaureaza();
  }
});

test("⚠⚠ SI VERDICTUL RAMANE `esuat`, adica slotul NU se inchide", async () => {
  /*
   * ⚠ ASTA E AFIRMATIA CARE APARA TOATA REPARATIA.
   *
   * `esuat` inseamna „furnizorul a refuzat dovedit, nu s-a creat nimic, reincercarea e libera".
   * E adevarat aici: se incarca creditul si se reia. Daca ar deveni `necunoscut`, randul ar BLOCA
   * si ar iesi la om pentru un caz in care stim exact ce s-a intamplat. Iar daca 402 ar deveni o
   * intoarcere normala, randul s-ar inchide `reusit` cu referinta goala si emiterea ar muri
   * definitiv pe comanda aia.
   */
  const f = fetchFals(CREDIT_INSUFICIENT);
  try {
    const e = await eroareaDeLa(() => creeazaExpediere(CFG, { x: 1 }));
    assert.equal(verdictFurnizor(e), "esuat", "402 nu mai e refuz dovedit, deci purtarea registrului s-a schimbat");
  } finally {
    f.restaureaza();
  }
});

test("⚠ pe o CITIRE nu se culege niciun `expedition` strain", async () => {
  /*
   * `apel` e comun pentru citiri si scrieri. Un `expedition` dintr-un corp de citire n-are nicio
   * legatura cu o ciorna de-a noastra, iar pastrat ar fi trimis mai tarziu la curier.
   */
  const f = fetchFals(CREDIT_INSUFICIENT);
  try {
    const e = await eroareaDeLa(() => validesteExpediere(CFG, { x: 1 }));
    assert.equal(expedierePeEroare(e), null, "s-a agatat un id de expediere venit de pe o citire");
  } finally {
    f.restaureaza();
  }
});

test("o eroare fara ciorna, si orice altceva, dau `null`", async () => {
  assert.equal(expedierePeEroare(new Error("oarecare")), null);
  assert.equal(expedierePeEroare(null), null);
  assert.equal(expedierePeEroare("nu e eroare"), null);
  assert.equal(expedierePeEroare(undefined), null);
});

test("⚠ un 402 FARA ciorna nu inventeaza una", async () => {
  /* Altfel reluarea ar cere `/shipment/send/0` si ar strica si drumul care merge azi. */
  const f = fetchFals({ status: 402, corp: JSON.stringify({ success: false, message: "Insufficient credit" }) });
  try {
    const e = await eroareaDeLa(() => creeazaExpediere(CFG, { x: 1 }));
    assert.equal(expedierePeEroare(e), null, "s-a inventat un id de ciorna acolo unde raspunsul n-avea");
    assert.equal(verdictFurnizor(e), "esuat");
  } finally {
    f.restaureaza();
  }
});

test("⚠⚠ un `expedition` zero, negativ sau nenumeric NU devine ciorna", async () => {
  /*
   * ═══ ⚠ SCRISA DUPA UN MUTANT CARE A SCAPAT (14.09.2026) ═══
   *
   * Bancul a stins paza `n > 0` din `idExpedierii` si proba a ramas verde. Nu fiindca proba era
   * slaba, ci fiindca paza e DUBLA dinadins: o are scriitorul (`idExpedierii`) si o are din nou
   * cititorul (`expedierePeEroare`). Stinsa una, cealalta tine; stinsa cealalta, tine prima.
   *
   * ⚠ Asta INSEAMNA ca niciun mutant singur nu poate cadea, si ala e chiar adevarul despre cod, nu
   * o gaura. Ce lipsea era o afirmatie despre PURTARE, ceruta prin drumul adevarat: ea cade daca
   * se sting AMANDOUA, si nu cere niciuneia dintre ele sa existe intr-un anume rand.
   *
   * De ce conteaza: un `0` scurs pana la apelant s-ar scrie pe comanda, iar reluarea de mai tarziu
   * ar cere `POST /shipment/send/0`.
   */
  for (const valoare of [0, -5, "abc", null]) {
    const f = fetchFals({
      status: 402,
      corp: JSON.stringify({ success: false, message: "Insufficient credit", expedition: valoare }),
    });
    try {
      const e = await eroareaDeLa(() => creeazaExpediere(CFG, { x: 1 }));
      assert.equal(expedierePeEroare(e), null,
        `un expedition ${JSON.stringify(valoare)} a fost luat drept ciorna`);
      assert.equal(verdictFurnizor(e), "esuat", "si verdictul s-a schimbat pe drum");
    } finally {
      f.restaureaza();
    }
  }
});

/* ── 2. Cusatura pe client ────────────────────────────────────────────────── */

const sursa = (cale: string) =>
  readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const CLIENT = "src/lib/shipo/client.ts";
const ACTIUNE = "src/lib/actions/shipo.actions.ts";

test("⚠ corpul se citeste INAINTE de ramura de eroare", () => {
  /*
   * Aici era neintelegerea din audit: se credea ca aruncarea e mai devreme decat citirea corpului.
   * Nu e, si tocmai de asta reparatia e o extragere de camp, nu o restructurare. Daca cineva muta
   * vreodata `res.text()` dupa `if (!res.ok)`, id-ul chiar devine necitit.
   */
  const s = sursa(CLIENT);
  const iCorp = s.indexOf("const text = await res.text();");
  const iRamura = s.indexOf("if (!res.ok) {", iCorp);
  assert.ok(iCorp > 0 && iRamura > iCorp,
    "corpul nu se mai citeste inaintea ramurii de eroare: id-ul ciornei devine de negasit");
});

test("⚠ agatarea se face doar pe SCRIERI, si nu schimba verdictul", () => {
  const s = sursa(CLIENT);
  assert.match(s, /throw insemneaza\(e, res\.status, efect === "scriere" \? idExpedierii\(date\) : null\);/,
    "id-ul nu se mai agata, ori se agata si pe citiri");
  assert.match(s, /export function expedierePeEroare\(/, "cititorul id-ului a disparut");
});

/* ── 3. Cusatura pe apelant ───────────────────────────────────────────────── */

test("⚠⚠ reluarea sta SUB rezervarea din registru, nu inaintea ei", () => {
  /*
   * Mutata inaintea lui `cuRegistru`, doua apasari deodata ar trimite aceeasi ciorna de doua ori
   * la curier, adica exact duplicatul pentru care exista registrul.
   */
  const s = sursa(ACTIUNE);
  const iRegistru = s.indexOf("const r = await cuRegistru(");
  const iReluare = s.indexOf("trimiteExpediere(config, ciorna)");
  assert.ok(iRegistru > 0, "nu mai gasesc rezervarea din registru");
  assert.ok(iReluare > iRegistru, "reluarea a iesit din rezervare: doua apasari o pot trimite de doua ori");
});

test("⚠⚠ ciorna se PASTREAZA pe comanda cand apelul pica", () => {
  /*
   * Fara scrierea asta, totul de mai sus ar fi corect si tot s-ar crea ciorne orfane: id-ul ar
   * trai doar cat traieste exceptia.
   */
  const s = sursa(ACTIUNE);
  assert.match(s, /const idNou = expedierePeEroare\(e\);/, "id-ul nu se mai citeste de pe eroare");
  assert.match(s, /shipo_expedition_id: idNou/, "id-ul nu se mai scrie pe comanda");
  assert.match(s, /throw e;/, "eroarea nu se mai arunca mai departe, deci registrul ar crede ca a mers");
});

test("⚠ si cand comanda are deja o ciorna, NU se mai creeaza una noua", () => {
  const s = sursa(ACTIUNE);
  assert.match(s, /ciorna === null\s*\?\s*creeazaExpediere\(config, corp\)\s*:\s*trimiteExpediere\(config, ciorna\)/,
    "ramura de reluare a disparut: o comanda cu ciorna ar primi inca una");
});
