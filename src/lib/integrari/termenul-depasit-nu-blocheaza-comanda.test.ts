import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eroareDeTermen, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { createFanCourierAwb, deleteFanCourierAwb, uitaTokenurileFan } from "@/lib/fancourier";
import { getDpdOffices } from "@/lib/dpd";

/* ══════════════════════════════════════════════════════════════════════════
   UN TERMEN DEPASIT PE O CITIRE NU ARE VOIE SA BLOCHEZE COMANDA   (13.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE S-A INTAMPLAT. In acelasi val au primit termene sase clienti de curier. Bine,
   fiindca pana atunci un furnizor care tacea tinea checkout-ul pe loc la nesfarsit. Dar
   un `fetch` taiat arunca un `TimeoutError` care nu trece prin niciun constructor din
   `eroare-furnizor.ts`, deci `verdictFurnizor` cade pe implicitul lui, `necunoscut`.

   Pe o SCRIERE implicitul e chiar bun: coletul poate sa fi fost creat inainte sa renuntam
   noi sa asteptam, deci randul din registru TREBUIE sa blocheze.

   Pe o CITIRE e pe dos, si asta s-a schimbat azi. Tokenul si sucursala expeditoare se
   citesc INAINTE de emitere, in aceeasi functie: daca ele expira, cererea care creeaza
   nici n-a plecat. Lasat `necunoscut`, un asemenea termen bloca definitiv comanda, iar
   comerciantul trebuia sa deblocheze de mana un AWB pe care curierul nu-l vazuse niciodata.

   ⚠ MUTANTUL E PE APELANT: aceleasi functii adevarate, chemate cu alt raspuns de retea.
   Nu se probeaza `eroareDeTermen` singura si atat, fiindca ea era CORECTA si inainte;
   defectul era ca nimeni n-o chema pe drumul citirilor.
*/

/** Exact ce arunca `AbortSignal.timeout` cand expira. */
function caUnTermenDepasit(): Error {
  const e = new Error("The operation was aborted due to timeout");
  e.name = "TimeoutError";
  return e;
}

/** Inlocuieste `fetch`: `cadeLa` decide ce cerere expira; restul raspund normal. */
function reteaCu(cadeLa: (u: string) => boolean, altceva?: (u: string) => Response | null) {
  const original = globalThis.fetch;
  const atinse: string[] = [];

  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    atinse.push(u.replace("https://api.fancourier.ro/", "").split("?")[0]);
    if (cadeLa(u)) throw caUnTermenDepasit();
    const al = altceva?.(u);
    if (al) return al;

    if (u.includes("/login")) {
      return new Response(JSON.stringify({ status: "success", data: { token: "T" } }), { status: 200 });
    }
    if (u.includes("reports/branches")) {
      return new Response(JSON.stringify({
        status: "success",
        data: [{
          id: 42, name: "Depozit", email: "d@x.ro", phone: "0722000000",
          address: { locality: "Cluj-Napoca", county: "Cluj", street: "S", streetNo: "1" },
        }],
      }), { status: 200 });
    }
    if (u.includes("intern-awb")) {
      return new Response(JSON.stringify({
        response: [{ awbNumber: 2228000111, tariff: 26.19, vat: 4.98, errors: null }],
      }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  return { atinse, gata: () => { globalThis.fetch = original; } };
}

async function verdictulLui(f: () => Promise<unknown>): Promise<{ verdict: string; mesaj: string }> {
  try {
    await f();
    return { verdict: "fara eroare", mesaj: "" };
  } catch (e) {
    return { verdict: verdictFurnizor(e), mesaj: (e as Error).message };
  }
}

const CONFIG_FAN = {
  enabled: true, username: "u", password: "p", client_id: 42, client_name: "X",
  colet_implicit: { length: 30, width: 20, height: 10 },
};

const DESTINATAR = {
  recipientName: "Ion Popescu", recipientPhone: "0722000000", recipientEmail: "ion@exemplu.ro",
  recipientCounty: "Cluj", recipientLocality: "Cluj-Napoca",
  recipientStreet: "Bulevardul Eroilor", recipientStreetNo: "12", recipientZipCode: "400001",
  parcels: 1, weightKg: 2, cod: 0, content: "produse", observation: "",
};

/* ── Regula, in amandoua directiile ──────────────────────────────────────── */

test("⚠ pe CITIRE termenul e refuz dovedit, pe SCRIERE ramane „nu stim”", () => {
  const t = caUnTermenDepasit();
  assert.equal(verdictFurnizor(eroareDeTermen(t, false, "citirea X", "FAN Courier")), "esuat");
  assert.equal(verdictFurnizor(eroareDeTermen(t, true, "emiterea", "FAN Courier")), "necunoscut");

  /* ⚠ Si ce NU e termen nu se atinge: clasificarea de dedesubt ramane stapana. */
  const refuzAdevarat = new Error("Localitate invalida");
  assert.equal(eroareDeTermen(refuzAdevarat, false, "x", "FAN Courier"), refuzAdevarat);
});

/* ── Pe drumul adevarat al emiterii ──────────────────────────────────────── */

test("REPER: un refuz dovedit de FAN ramane `esuat`", async () => {
  const { gata } = reteaCu(() => false, (u) =>
    u.includes("intern-awb")
      ? new Response(JSON.stringify({ response: [{ awbNumber: null, errors: ["Localitate invalida"] }] }), { status: 200 })
      : null);
  try {
    uitaTokenurileFan();
    const r = await verdictulLui(() => createFanCourierAwb(CONFIG_FAN as never, DESTINATAR as never));
    assert.equal(r.verdict, "esuat", `refuzul dovedit a iesit ${r.verdict}`);
  } finally { gata(); }
});

test("⚠ TERMEN pe LOGIN: nicio cerere de emitere nu a plecat, deci `esuat`", async () => {
  const { atinse, gata } = reteaCu((u) => u.includes("/login"));
  try {
    uitaTokenurileFan();
    const r = await verdictulLui(() => createFanCourierAwb(CONFIG_FAN as never, DESTINATAR as never));
    /* ⚠ Intai se dovedeste ca proba e VALIDA: daca ar fi plecat o emitere, `esuat` ar fi gresit. */
    assert.equal(atinse.filter((a) => a.includes("intern-awb")).length, 0,
      "proba nu e valida: a plecat totusi o cerere de emitere");
    assert.equal(r.verdict, "esuat",
      `login expirat a iesit ${r.verdict} („${r.mesaj}”): randul din registru blocheaza o comanda pe care FAN n-a vazut-o`);
  } finally { gata(); }
});

test("⚠ TERMEN pe citirea sucursalei: tot `esuat`", async () => {
  const { atinse, gata } = reteaCu((u) => u.includes("reports/branches"));
  try {
    uitaTokenurileFan();
    const r = await verdictulLui(() => createFanCourierAwb(CONFIG_FAN as never, DESTINATAR as never));
    assert.equal(atinse.filter((a) => a.includes("intern-awb")).length, 0,
      "proba nu e valida: a plecat totusi o cerere de emitere");
    assert.equal(r.verdict, "esuat", `citirea sucursalei expirata a iesit ${r.verdict} („${r.mesaj}”)`);
  } finally { gata(); }
});

test("⚠ dar TERMENUL PE EMITERE ramane „nu stim”: coletul poate exista", async () => {
  const { gata } = reteaCu((u) => u.includes("intern-awb"));
  try {
    uitaTokenurileFan();
    const r = await verdictulLui(() => createFanCourierAwb(CONFIG_FAN as never, DESTINATAR as never));
    assert.equal(r.verdict, "necunoscut",
      "un termen pe CHIAR cererea de emitere trebuie sa blocheze: coletul poate fi creat");
  } finally { gata(); }
});

test("⚠ anularea pe un 200 cu pagina HTML NU trece drept reusita", async () => {
  /*
   * FAN, sau un intermediar din fata lui, poate raspunde 200 cu o pagina de intretinere.
   * Citita ca reusita, apelantul stergea numarul de pe comanda si elibera slotul din
   * registru, iar la FAN coletul ramanea viu: livrat, cu rambursul incasat pe un AWB
   * despre care noi nu mai stiam nimic.
   */
  const { gata } = reteaCu(() => false, (u) =>
    /\/awb\b/.test(u)
      ? new Response("<html><body>Service temporarily unavailable</body></html>",
        { status: 200, headers: { "Content-Type": "text/html" } })
      : null);
  try {
    uitaTokenurileFan();
    const r = await verdictulLui(() => deleteFanCourierAwb(CONFIG_FAN as never, "2228000111"));
    assert.notEqual(r.verdict, "fara eroare",
      "o pagina HTML pe 200 a fost citita ca anulare reusita");
    assert.equal(r.verdict, "necunoscut", "chiar nu stim daca stergerea s-a facut");
  } finally { gata(); }
});

test("⚠ DPD: acelasi invelis duce si citirea, si emiterea, iar citirea da `esuat`", async () => {
  /*
   * La DPD toate cererile sunt POST si trec prin `dpdPost`, deci separarea se face pe
   * CALE. `location/office` e citire pura: un termen acolo nu poate sa fi creat nimic.
   */
  const { gata } = reteaCu((u) => u.includes("location/office"));
  try {
    const r = await verdictulLui(() => getDpdOffices({
      enabled: true, username: "u", password: "p", client_id: 1,
    } as never));
    assert.equal(r.verdict, "esuat", `citirea oficiilor DPD a iesit ${r.verdict} („${r.mesaj}”)`);
  } finally { gata(); }
});

/* ── Si ceilalti curieri chiar cheama regula ─────────────────────────────── */

test("⚠ fiecare client caruia i s-au pus termene isi clasifica si esecurile", () => {
  /*
   * ⚠ PROBA DE CABLARE, SI O SPUN PE FATA. Cele de mai sus trec prin functiile adevarate;
   * asta doar verifica prezenta chemarii in celelalte module. Un drum adevarat pentru
   * fiecare ar cere configurarile si formele de raspuns ale altor cinci integrari, deci
   * as fi probat codul lor, nu regula asta.
   *
   * Merita totusi: singurul fel in care regula se pierde e ca al saptelea curier sa
   * primeasca termene fara clasificare, exact cum au patit cei cinci de azi.
   */
  /*
   * ⚠ SE NUMARA, NU DOAR SE CAUTA, si asta e o corectura a acestei probe.
   *
   * Prima forma cerea doar ca modulul sa contina MACAR O chemare. Mutantul care a scos
   * clasificarea din `coReq` (Colete Online) a trecut NEPRINS: tokenul din acelasi fisier
   * si-o pastra pe a lui, deci regexul gasea ce cauta. O proba care nu putea sa cada pe
   * jumatate din cod, gasita de propriul ei mutant. Pragurile sunt MASURATE pe 13.09.2026.
   *
   * ⚠ SI DE CE PRAGURILE NU SUNT EGALE CU NUMARUL DE `fetch` DIN FISIER. Raman dinadins
   * neinvelite:
   *   - SCRIERILE lui Cargus (POST, PUT, DELETE): acolo implicitul `necunoscut` e deja
   *     raspunsul corect, iar un invelis n-ar schimba decat textul mesajului;
   *   - citirile din afara drumului de emitere, care n-au niciun rand in registru pe care
   *     sa-l blocheze: eticheta si starea AWB-ului la Sameday, nomenclatoarele publice la
   *     Woot, descarcarea AWB-ului la Colete Online.
   */
  const PRAG: Record<string, number> = {
    "src/lib/fancourier.ts": 5,
    "src/lib/sameday/client.ts": 4,
    "src/lib/dpd.ts": 1,
    "src/lib/cargus.ts": 2,
    "src/lib/woot.ts": 2,
    "src/lib/colete.ts": 2,
  };

  for (const [cale, prag] of Object.entries(PRAG)) {
    const sursa = readFileSync(cale, "utf8");
    assert.match(sursa, /AbortSignal\.timeout\(/, `${cale}: nu mai are termene deloc`);
    const cate = (sursa.match(/eroareDeTermen\(/g) ?? []).length;
    assert.ok(
      cate >= prag,
      `${cale}: doar ${cate} din ${prag} cereri isi mai clasifica esecul; un termen pe o `
      + "CITIRE va bloca in registru o comanda pentru un colet care nu exista",
    );
  }
});
