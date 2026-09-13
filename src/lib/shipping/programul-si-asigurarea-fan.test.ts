import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { rezumaProgram } from "@/lib/fancourier";

/**
 * PROGRAMUL PUNCTULUI SI ASIGURAREA COLETULUI.
 *
 * Doua lipsuri inchise pe 13.09.2026, amandoua din aceeasi familie: FAN trimitea ceva, iar noi
 * il aruncam.
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: facand `rezumaProgram` sa inventeze zile, scotand `program`
 * din maparea punctelor, sau pornind asigurarea fara bifa, probele de mai jos cad.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1. PROGRAMUL: se spune doar cand se poate spune FARA GHICEALA
   ═══════════════════════════════════════════════════════════════════════════ */

const ZI = (de: string, pana: string) => ({ firstHour: de, secondHour: pana });

test("⚠ cand toate zilele au acelasi interval, se poate spune fara sa stim care zi e care", () => {
  /*
   * ⚠ MIEZUL REGULII. FAN trimite SAPTE intervale, dar NU documenteaza care indice e care zi:
   * nu se stie nici macar daca sirul incepe luni sau duminica. Cand toate sunt la fel, ordinea
   * nu mai conteaza, si abia atunci programul se poate arata.
   */
  assert.equal(rezumaProgram(Array(7).fill(ZI("09:00", "18:00"))), "Zilnic 09:00-18:00");
  /* Non-stop se spune pe nume: „00:00-23:59" nu-i spune nimic cumparatorului. */
  assert.equal(rezumaProgram(Array(7).fill(ZI("00:00", "23:59"))), "Non-stop");
});

test("⚠⚠ cand zilele DIFERA, nu se arata nimic: un orar gresit trimite omul la usa inchisa", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA CEL MAI MULT. Tentatia e sa scrii „L-V 09:00-18:00, S 09:00-13:00".
   * Dar fara sa stim ce zi e indicele 0, eticheta e inventata: un cumparator care merge sambata
   * la un punct inchis fiindca noi am scris „L-S" plateste o greseala pe care nimeni n-ar
   * putea-o explica. Tacerea e singurul raspuns cinstit.
   */
  const saptamana = [...Array(5).fill(ZI("09:00", "18:00")), ZI("09:00", "13:00"), ZI("00:00", "00:00")];
  assert.equal(rezumaProgram(saptamana), null);

  /* ⚠ Si nicio zi nu se numeste NICIODATA, oricare ar fi intrarea. */
  for (const iesire of [rezumaProgram(Array(7).fill(ZI("08:00", "20:00"))), rezumaProgram(saptamana)]) {
    if (iesire === null) continue;
    assert.doesNotMatch(iesire, /luni|marti|miercuri|joi|vineri|sambata|duminica|L-V|L-S/i,
      "programul a inceput sa numeasca zile, desi ordinea lor nu e documentata");
  }
});

test("⚠ un interval necitibil face TOT programul nesigur, nu doar ziua lui", () => {
  /* O singura ora stricata inseamna ca nu intelegem raspunsul; restul n-are cum sa fie sigur. */
  assert.equal(rezumaProgram([...Array(6).fill(ZI("09:00", "18:00")), ZI("9:00", "18:00")]), null);
  assert.equal(rezumaProgram([...Array(6).fill(ZI("09:00", "18:00")), { firstHour: null, secondHour: "18:00" }]), null);
  assert.equal(rezumaProgram([]), null);
  assert.equal(rezumaProgram(undefined), null);
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. CABLAREA
   ═══════════════════════════════════════════════════════════════════════════ */

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierele isi explica pe larg propriile reguli. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const COTARE = "src/lib/actions/shipping.actions.ts";
const CLIENT_FAN = "src/lib/fancourier.ts";
const ACTIUNE_FAN = "src/lib/actions/fancourier.actions.ts";
const CONFIG_FAN = "src/components/dashboard/FanCourierConfigClient.tsx";
const SELECTOR = "src/components/ministore/CourierSelector.tsx";

test("⚠ programul calatoreste de la FAN pana in checkout", () => {
  /* Pana azi `mapPickupPoint` il arunca, desi FAN il trimite in acelasi raspuns. */
  assert.match(sursa(CLIENT_FAN), /schedule: Array\.isArray\(p\.schedule\)/,
    "punctele nu mai pastreaza programul primit de la FAN");
  assert.match(sursa(COTARE), /program: rezumaProgram\(p\.schedule\) \?\? undefined,/,
    "lista de puncte nu mai duce programul mai departe");
  assert.match(sursa(SELECTOR), /\{locker\.program && \(/,
    "checkout-ul nu mai arata programul punctului");
});

test("⚠⚠ asigurarea e OPT-IN, si se socoteste pe SUBTOTAL, nu pe total", () => {
  /*
   * ⚠ DOUA GRESELI POSIBILE, AMANDOUA SCUMPE, SI IN SENSURI OPUSE.
   *
   * Pornita fara bifa, FAN taxeaza asigurarea pe fiecare colet al fiecarui magazin, fara ca
   * nimeni sa fi cerut-o. Socotita pe `total`, s-ar asigura si transportul si taxa de ramburs,
   * deci s-ar plati o prima mai mare pentru ceva ce nu se poate pierde.
   */
  const s = sursa(ACTIUNE_FAN);
  assert.match(s, /declaredValue: config\.declared_value_enabled \? \(Number\(order\.subtotal\) \|\| undefined\) : undefined,/,
    "valoarea asigurata nu mai e legata de bifa, sau nu mai vine din subtotal");
  assert.doesNotMatch(s, /declaredValue:[^;\n]*order\.total/,
    "asigurarea s-a mutat pe `total`: ar acoperi si transportul, si taxa de ramburs");

  /* Si bifa chiar exista in panou, si chiar se salveaza: altfel n-ar putea fi pornita nicaieri. */
  const cfg = sursa(CONFIG_FAN);
  assert.match(cfg, /checked=\{asigurare\}/, "configurarea nu mai are bifa de asigurare");
  assert.match(cfg, /declared_value_enabled: asigurare,/, "bifa de asigurare nu se mai salveaza");
});

test("⚠ fara asigurare ceruta, pleaca ZERO, nu o valoare ghicita", () => {
  /* Purtarea de pana azi ramane implicita: cine n-a bifat nimic nu plateste nimic in plus. */
  assert.match(sursa(CLIENT_FAN), /declaredValue: input\.declaredValue && input\.declaredValue > 0/,
    "AWB-ul nu mai trimite zero cand nu s-a cerut asigurare");
});
