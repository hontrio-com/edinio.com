import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FARA_API_DE_TARIF, rezervaEDeIncredere } from "@/lib/shipping/optiuni-de-rezerva";
import { normalizeazaPuncteCuriera } from "@/lib/curiera/puncte";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CURIERA IN CHECKOUT: PRET DIN ZONA, PUNCT CU ID DE SIR          (29.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Patru reguli, fiecare cu gaura ei tacuta daca se pierde:
 *
 *   1. `curiera` e in `FARA_API_DE_TARIF`: `get_price` da 0 lei pe orice cerere (masurat), deci
 *      pretul e cel din zona. Scoasa, un pret de zona 0 ar fi taiat ca „rezerva la zero" si
 *      Curiera ar disparea din checkout.
 *   2. Ramura `curiera` sta INAINTEA `else`-ului generic: fara ea, generic-ul ar oferi doar
 *      livrarea la adresa, fara punct, si nimic nu s-ar plange.
 *   3. `curiera` e in `CURIERI_CU_LOCKERE`, si fiecare curier de acolo are ramura lui de puncte.
 *   4. Punctul pastreaza `id`-ul ca SIR (e `to_delivery_location` la emitere) si nu primeste un
 *      `postCode` gol (16 puncte n-au cod postal).
 *
 * ⚠ Regula 4 se probeaza RULAND chiar harta din sursa, nu cautand un subsir: fisierul e „use
 * server" (antete, Supabase), deci nu se poate importa intr-o proba de Node.
 */

const COTARE = "src/lib/actions/shipping.actions.ts";

/* Comentariile se taie: fisierul isi explica ramurile folosind chiar numele cautate aici. */
function sursaCurata(): string {
  return readFileSync(COTARE, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Corpul unei functii de nivel de fisier, taiat pe acolada de la marginea randului. */
function corpul(s: string, antet: string): string {
  const start = s.indexOf(antet);
  assert.ok(start > 0, `nu mai gasesc ${antet}`);
  const sfarsit = s.indexOf("\n}", start);
  assert.ok(sfarsit > start, `${antet} nu se mai inchide la marginea randului`);
  return s.slice(start, sfarsit + 2);
}

// ─── 1. Pretul ───────────────────────────────────────────────────────────────

test("⚠ curiera e in FARA_API_DE_TARIF, deci pretul zonei E pretul, nu o rezerva", () => {
  assert.equal(FARA_API_DE_TARIF.has("curiera"), true, "Curiera a iesit din lista curierilor fara tarif viu");
  /* Consecinta care conteaza: o zona Curiera la 0 lei nu e taiata ca rezerva esuata. */
  assert.equal(rezervaEDeIncredere("curiera", 0, true), true);
});

// ─── 2. Ramura din cotare ────────────────────────────────────────────────────

test("⚠⚠ ramura curiera exista in bucla de curieri, INAINTEA else-ului generic", () => {
  const c = corpul(sursaCurata(), "export async function getShippingOptions(");
  const iBucla = c.indexOf("for (const [courierId, zone] of enabledZones) {");
  const iRamura = c.indexOf('} else if (courierId === "curiera") {');
  const generic = /\} else \{\s*options\.push\(\{\s*courier: courierId,/.exec(c);
  assert.ok(iBucla > 0, "nu mai gasesc bucla de curieri");
  assert.ok(iRamura > 0, "ramura curiera a disparut: generic-ul ar da doar adresa, fara punct");
  assert.ok(generic, "nu mai gasesc else-ul generic: proba n-are fata de ce compara ordinea");
  assert.ok(iBucla < iRamura && iRamura < generic.index, "ramura curiera nu mai sta in bucla, inaintea generic-ului");

  /* ⚠ Pana la ramura URMATOARE, nu pana la generic: de la 07.10.2026 e-packet sta intre ele, iar
     regulile Curiera (de ex. „fara lockerLabel") nu sunt ale lui. */
  const iUrmatoarea = c.indexOf('} else if (courierId === "', iRamura + 1);
  const ramura = c.slice(iRamura, iUrmatoarea > 0 && iUrmatoarea < generic.index ? iUrmatoarea : generic.index);
  /* Sincrona, ca GLS si Posta: pretul vine din zona, nu dintr-o cotare. */
  assert.doesNotMatch(ramura, /promises\.push/, "Curiera coteaza iar live, desi e in FARA_API_DE_TARIF");
  /* Semnarea e unica, la sfarsit: o iesire din ramura ar pleca fara simbol. */
  assert.doesNotMatch(ramura, /\breturn\b|\bcontinue\b/, "ramura curiera iese singura din bucla");
  assert.match(ramura, /addrLabel\(zone\.label, "Livrare prin Curiera"\)/);
  /* ⚠ Numele pus de comerciant primeste „(locker sau punct)", nu „(locker)": lista are si pudo si oficii. */
  assert.match(ramura, /\(locker sau punct\)/);
  assert.match(ramura, /"Curiera: locker sau punct de ridicare"/);
  assert.doesNotMatch(ramura, /lockerLabel\(/, "sufixul „(locker)” ar ingusta eticheta semnata");
  /* ⚠ Fara Curiera gata nu se vinde nimic, nici la adresa, iar iesirea se retine pentru plasa de 25 s. */
  assert.match(ramura, /if \(!curieraGata\((\w+)\)\) \{\s*iesitiDinLista\.add\(courierId\);\s*\} else \{/,
    "optiunea la adresa se vinde si cu Curiera neconfigurata, desi AWB-ul nu se poate emite");
  /* Punctul numai cu lockerele pornite SI sub greutatea unui FANbox. */
  assert.match(ramura, /if \((\w+)\.lockere && weight <= FANBOX_MAX_WEIGHT_KG\) \{/,
    "optiunea la punct nu mai e pazita de comutatorul lockerelor si de greutatea FANbox");
});

test("⚠ fiecare configurare citita e si CERUTA in select, la cotare si la puncte", () => {
  /*
   * O coloana citita si necerutata da `undefined`: la cotare punctul Curiera ar disparea, la
   * puncte lista ar iesi goala, amandoua fara nicio urma. Regula e pe TOTI curierii.
   */
  const s = sursaCurata();
  const perechi: [string, string][] = [
    ["export async function getShippingOptions(", "export async function getShippingOptions("],
    ["async function puncteleDeLaCurier(", "async function citesteSetarileLockerelor("],
  ];
  for (const [cititor, selectant] of perechi) {
    const citite = new Set([...corpul(s, cititor).matchAll(/settings\.(\w+_config)\b/g)].map((m) => m[1]));
    const select = /\.select\("([^"]+)"\)/.exec(corpul(s, selectant))?.[1] ?? "";
    assert.ok(select, `nu mai gasesc select-ul din ${selectant}`);
    assert.ok(citite.has("curiera_config"), `${cititor} nu mai citeste configurarea Curiera`);
    const cerute = new Set(select.split(",").map((c) => c.trim()));
    const lipsa = [...citite].filter((c) => !cerute.has(c));
    assert.deepEqual(lipsa, [], `${cititor} citeste coloane pe care nu le cere: ${lipsa.join(", ")}`);
  }
});

// ─── 3. Punctele ─────────────────────────────────────────────────────────────

test("⚠ curiera e in CURIERI_CU_LOCKERE, iar lista si ramurile de puncte spun acelasi lucru", () => {
  const s = sursaCurata();
  const lista = /const CURIERI_CU_LOCKERE = new Set\(\[([^\]]*)\]\)/.exec(s)?.[1];
  assert.ok(lista, "CURIERI_CU_LOCKERE nu mai e o lista literala pe un rand");
  const curieri = [...lista.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  assert.ok(curieri.includes("curiera"), "Curiera nu mai poate cere puncte: paza o refuza inaintea citirii");

  /* Un curier in lista fara ramura ar costa o citire ca sa intoarca []; o ramura fara lista n-ar rula. */
  const c = corpul(s, "async function puncteleDeLaCurier(");
  const ramuri = [...c.matchAll(/if \(courier === "([^"]+)"\) \{/g)].map((m) => m[1]).sort();
  assert.deepEqual(ramuri, curieri);
});

/**
 * Harta din ramura Curiera a lui `puncteleDeLaCurier`, scoasa din sursa si facuta rulabila.
 *
 * ⚠ E CHIAR CODUL DIN COTARE, nu o copie scrisa in proba: o copie ar fi inghetat ce am scris eu
 * aici, nu ce serveste checkoutul.
 */
function hartaPunctelorCuriera(): (p: unknown) => Record<string, unknown> {
  const c = corpul(sursaCurata(), "async function puncteleDeLaCurier(");
  const iRamura = c.indexOf('if (courier === "curiera") {');
  assert.ok(iRamura > 0, "ramura de puncte Curiera a disparut");
  const ramura = c.slice(iRamura);

  /* Curiera ramane filtrata pe oras: orasul lor e „Bucuresti", pe care `cityMatches` il pliaza. */
  assert.match(ramura, /return filtreazaOras\(toate, city\);/, "punctele Curiera nu se mai filtreaza pe oras");

  const ancora = "normalizeazaPuncteCuriera(await puncteCuriera(config)).map(";
  const i = ramura.indexOf(ancora);
  assert.ok(i > 0, "punctele Curiera nu mai trec prin normalizator inainte de cache");
  let adancime = 1;
  let j = i + ancora.length;
  for (; j < ramura.length && adancime > 0; j++) {
    if (ramura[j] === "(") adancime++;
    else if (ramura[j] === ")") adancime--;
  }
  assert.equal(adancime, 0, "harta punctelor nu se mai inchide");
  const js = ramura.slice(i + ancora.length, j - 1).replace(/\(p: \w+\)/, "(p)");
  return new Function(`return (${js})`)() as (p: unknown) => Record<string, unknown>;
}

/* Randuri copiate din raspunsul real, 29.09.2026 (acelasi punct ca in `curiera/puncte.test.ts`). */
const LOCKER = {
  country: "RO", address: "Bd. Theodor Pallady 51", lng: "26.19726", city: "Bucuresti", county: "Bucuresti",
  type: "locker", zipcode: "032258", can_pickup: "1", name: "FANbox Kaufland Theodor Pallady", id: "16478",
  lat: "44.40874", schedule: {
    monday: [{ start: 0, end: 1439 }], tuesday: [{ start: 0, end: 1439 }], wednesday: [{ start: 0, end: 1439 }],
    thursday: [{ start: 0, end: 1439 }], friday: [{ start: 0, end: 1439 }], saturday: [{ start: 0, end: 1439 }],
    sunday: [{ start: 0, end: 1439 }],
  },
};

test("⚠⚠ id-ul punctului ramane SIR, iar codul postal si programul lipsesc cand nu exista", () => {
  const harta = hartaPunctelorCuriera();

  const [cu] = normalizeazaPuncteCuriera([LOCKER]).map(harta);
  assert.deepEqual(cu, {
    id: "16478",
    name: "FANbox Kaufland Theodor Pallady",
    address: "Bd. Theodor Pallady 51, Bucuresti",
    city: "Bucuresti",
    county: "Bucuresti",
    postCode: "032258",
    lat: 44.40874,
    lng: 26.19726,
    program: "Non-stop",
  });
  /* `Number("16478")` ar fi egal la citire, dar la emitere pleaca `to_delivery_location`. */
  assert.equal(typeof cu.id, "string");
  /* ⚠ Si NEATINS, nu doar sir: `String(Number(id))` ar trece de randul de sus si ar pierde
     zerourile din fata, adica alt punct la emitere. */
  const [cuZero] = normalizeazaPuncteCuriera([{ ...LOCKER, id: "016478" }]).map(harta);
  assert.equal(cuZero.id, "016478");

  const [fara] = normalizeazaPuncteCuriera([{ ...LOCKER, zipcode: "", schedule: null }]).map(harta);
  assert.equal("postCode" in fara, false, "un punct fara cod postal pleaca cu `postCode` gol pe comanda");
  assert.equal("program" in fara, false, "un program necunoscut pleaca drept camp gol");
});
