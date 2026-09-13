import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { estimateFanCourierCost } from "@/lib/fancourier";
import { computeVat, vatBase } from "@/lib/utils/vat";

/**
 * TARIFUL FAN NU SE TAXEAZA A DOUA OARA.
 *
 * ═══ ⚠ CE S-A INCHIS ═══
 *
 * `reports/awb/internal-tariff` raspunde cu TREI numere (pag. 31 din documentatia
 * oficiala): `costNoVAT: 26.19`, `vat: 4.98`, `total: 31.17`. Adica `total` E CU
 * TVA. Codul lua doar `total` si il punea drept pretul optiunii de livrare.
 *
 * Mai departe, `order.actions.ts` baga transportul in `vatBase(...)`, iar
 * `computeVat` adauga TVA peste baza cand magazinul afiseaza preturi FARA TVA.
 * Deci pe acele magazine cumparatorul platea 37,09 lei transport in loc de
 * 31,17: 19% peste, la fiecare comanda, fara sa apara in nicio raportare.
 *
 * Masurat pe baza reala inainte de reparatie: din 131 de magazine, 3 au FAN
 * activ si 1 are preturi fara TVA, iar intersectia era goala. Deci defectul nu
 * luase inca bani de la nimeni. Se repara tocmai fiindca primul magazin care
 * bifeaza amandoua nu are cum sa observe.
 *
 * ═══ ⚠ DE CE PROBA A DOUA CITESTE SURSA ═══
 *
 * Regula se probeaza pur, mai jos. Ce nu se poate rula fara sesiune, baza si
 * furnizor e CABLAREA ei in cotare, iar acolo statea defectul: helperul stia de
 * mult sa primeasca dimensiuni, dar apelantul nu i le dadea. Acelasi tipar.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1. REGULA: pe regim NET se ia `costNoVAT`, nu `total`
   ═══════════════════════════════════════════════════════════════════════════ */

const CONFIG = { enabled: true, username: "u", password: "p", client_id: 42, client_name: "X" };

/** Raspunsul EXACT din documentatia oficiala, pagina fizica 31. */
function fanCuTarifulDinDocumentatie() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    if (String(url).includes("/login")) {
      return new Response(JSON.stringify({ status: "success", data: { token: "T" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: "success", data: {
      extraKmCost: 0, weightCost: 24.5, insuranceCost: 0, optionsCost: 0, fuelCost: 1.69,
      costNoVAT: 26.19, vat: 4.98, total: 31.17,
    } }), { status: 200 });
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

const REGIM_NET = { vat_enabled: true, vat_rate: 19, prices_include_vat: false };
const REGIM_BRUT = { vat_enabled: true, vat_rate: 19, prices_include_vat: true };

/** Ce plateste cumparatorul pentru transport, dupa ce trece prin socoteala comenzii. */
function platitDeCumparator(transport: number, cfg: typeof REGIM_NET): number {
  const baza = vatBase({
    goods: 0, extras: 0, shipping: transport,
    discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0,
  });
  return Math.round((transport + computeVat(baza, cfg).vatAddOn) * 100) / 100;
}

test("⚠ magazin cu preturi FARA TVA: cotat pe `costNoVAT`, cumparatorul plateste exact `total`", async () => {
  const gata = fanCuTarifulDinDocumentatie();
  try {
    const t = await estimateFanCourierCost(CONFIG, {
      recipientCounty: "Constanta", recipientLocality: "Constanta", weightKg: 1,
    });

    // Asa alege cotarea pretul optiunii pe regim NET (vezi `pretFan` din shipping.actions.ts).
    assert.notEqual(t.costNoVAT, null, "FAN trimite `costNoVAT` in acelasi raspuns");
    const optiune = Math.round(t.costNoVAT! * 100) / 100;

    assert.equal(platitDeCumparator(optiune, REGIM_NET), 31.17,
      "cu TVA-ul adaugat o singura data, cumparatorul plateste chiar tariful FAN");

    // ⚠ MUTANTUL, adica exact ce facea codul inainte: se coteaza `total`.
    assert.equal(platitDeCumparator(t.total, REGIM_NET), 37.09,
      "daca s-ar cota `total`, TVA-ul s-ar aplica peste unul deja inclus");
  } finally { gata(); }
});

test("⚠ magazin cu preturi CU TVA: se coteaza `total`, si nu se adauga nimic peste", async () => {
  const gata = fanCuTarifulDinDocumentatie();
  try {
    const t = await estimateFanCourierCost(CONFIG, {
      recipientCounty: "Constanta", recipientLocality: "Constanta", weightKg: 1,
    });
    assert.equal(platitDeCumparator(t.total, REGIM_BRUT), 31.17,
      "pe regim brut transportul e deja final: `vatAddOn` e zero");
    // Contra-cazul care apara reparatia de exces: pe regim BRUT, `costNoVAT` ar
    // subcota cu 19%, iar diferenta ar plati-o comerciantul.
    assert.equal(platitDeCumparator(t.costNoVAT!, REGIM_BRUT), 26.19);
  } finally { gata(); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. CABLAREA: cotarea chiar alege dupa regim
   ═══════════════════════════════════════════════════════════════════════════ */

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierul isi explica pe larg propria regula. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const COTARE = "src/lib/actions/shipping.actions.ts";

test("⚠ cotarea citeste regimul de TVA al magazinului", () => {
  const s = sursa(COTARE);
  assert.match(s, /vat_enabled, prices_include_vat/,
    "coloanele de TVA nu mai sunt cerute in `select`, deci regimul nu se poate sti");
  assert.match(s, /const tvaPeDeasupra = !!settings\.vat_enabled && settings\.prices_include_vat === false;/,
    "regimul nu se mai calculeaza");
});

test("⚠ nicio optiune FAN nu se mai construieste direct din `r.total`", () => {
  const s = sursa(COTARE);
  const ramuraFan = s.slice(s.indexOf('courierId === "fan-courier"'));
  const pana = ramuraFan.slice(0, ramuraFan.indexOf("} else if (courierId ==="));

  assert.equal((pana.match(/price: pretFan\(r\)/g) ?? []).length, 2,
    "amandoua optiunile FAN (domiciliu si FANbox) trebuie sa treaca prin `pretFan`");
  assert.doesNotMatch(pana, /price: Math\.round\(r\.total \* 100\) \/ 100/,
    "tariful CU TVA ajunge din nou direct in pretul optiunii");
});

test("⚠ pe regim NET, lipsa lui `costNoVAT` cade pe rezerva, nu pe un net dedus", () => {
  const s = sursa(COTARE);
  assert.match(s, /if \(t\.costNoVAT === null\) \{\s*throw new Error/,
    "un `costNoVAT` lipsa nu mai opreste cotarea, deci s-ar putea inventa un net");
  assert.doesNotMatch(s, /costNoVAT.*\/\s*\(1 \+/,
    "netul nu se deduce impartind la cota: ar fi tot o suma ghicita");
});
