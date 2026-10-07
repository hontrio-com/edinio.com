import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FARA_API_DE_TARIF, rezervaEDeIncredere } from "@/lib/shipping/optiuni-de-rezerva";
import { despartaIdPunct, idPunctCheckout } from "@/lib/epacket/nomenclator";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * E-PACKET IN CHECKOUT: PRET DIN ZONA, PUNCT CU RETEAUA IN ID     (07.10.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. `epacket` e in `FARA_API_DE_TARIF`: tariful lor e costul comerciantului, iar cheia de test
 *      coteaza absurd. Scoasa, o zona e-packet la 0 lei ar fi taiata ca „rezerva la zero".
 *   2. Ramura `epacket` sta INAINTEA `else`-ului generic, sincrona si fara iesiri proprii.
 *   3. `epacket` e in `CURIERI_CU_LOCKERE`, cu ramura lui de puncte; lista e a unui ORAS, deci
 *      orasul intra in cheia de cache si lista NU se mai filtreaza la iesire.
 *   4. Id-ul punctului poarta reteaua (`SDY:79`) si se desface inapoi la emitere.
 */

const COTARE = "src/lib/actions/shipping.actions.ts";

function sursaCurata(): string {
  return readFileSync(COTARE, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function corpul(s: string, antet: string): string {
  const start = s.indexOf(antet);
  assert.ok(start > 0, `nu mai gasesc ${antet}`);
  const sfarsit = s.indexOf("\n}", start);
  return s.slice(start, sfarsit + 2);
}

test("⚠ epacket e in FARA_API_DE_TARIF, deci pretul zonei E pretul", () => {
  assert.equal(FARA_API_DE_TARIF.has("epacket"), true);
  assert.equal(rezervaEDeIncredere("epacket", 0, true), true);
});

test("⚠⚠ ramura epacket exista in bucla, inaintea generic-ului, sincrona si fara iesiri", () => {
  const c = corpul(sursaCurata(), "export async function getShippingOptions(");
  const iBucla = c.indexOf("for (const [courierId, zone] of enabledZones) {");
  const iRamura = c.indexOf('} else if (courierId === "epacket") {');
  const generic = /\} else \{\s*options\.push\(\{\s*courier: courierId,/.exec(c);
  assert.ok(iBucla > 0 && iRamura > iBucla && generic && iRamura < generic.index, "ramura nu sta in bucla, inaintea generic-ului");
  const iUrmatoarea = c.indexOf('} else if (courierId === "', iRamura + 1);
  const ramura = c.slice(iRamura, iUrmatoarea > 0 && iUrmatoarea < generic!.index ? iUrmatoarea : generic!.index);
  assert.doesNotMatch(ramura, /promises\.push/, "e-packet coteaza live, desi e in FARA_API_DE_TARIF");
  assert.doesNotMatch(ramura, /\breturn\b|\bcontinue\b/, "ramura iese singura din bucla: optiunile n-ar mai fi semnate");
  assert.match(ramura, /if \(!epacketGata\(epCfg\)\) \{\s*iesitiDinLista\.add\(courierId\);/, "fara configurare completa nu se retine iesirea");
  /* Lockerul numai pornit si sub limita retelei. */
  assert.match(ramura, /if \(epCfg\.lockere && weight <= kgMaximPunct\(reteaEp\)\)/);
});

test("⚠ punctele: curier stiut, cache pe oras, fara filtrare la iesire, id cu reteaua", () => {
  const s = sursaCurata();
  assert.match(s, /const CURIERI_CU_LOCKERE = new Set\(\[[^\]]*"epacket"[^\]]*\]\);/);
  assert.match(s, /: courier === "epacket" \? `:\$\{\(city \?\? ""\)\.trim\(\)\.toLowerCase\(\)\}`/, "orasul nu intra in cheia de cache");
  assert.match(s, /const filtreaza = [^;]*courier !== "epacket"/, "lista e-packet s-ar filtra pe un oras scris altfel");
  const ramura = s.slice(s.indexOf('if (courier === "epacket") {'));
  assert.match(ramura.slice(0, 2500), /id: idPunctCheckout\(reteaEp, p\.id\)/, "id-ul punctului nu mai poarta reteaua");
});

test("id-ul punctului: reteaua dus-intors, iar un id strain nu trece", () => {
  assert.equal(idPunctCheckout("SDY", "79"), "SDY:79");
  assert.deepEqual(despartaIdPunct("FCR:F1000142"), { curier: "FCR", id: "F1000142" });
  assert.deepEqual(despartaIdPunct(" DPD:28005 "), { curier: "DPD", id: "28005" });
  assert.equal(despartaIdPunct("79"), null, "fara retea nu se ghiceste");
  assert.equal(despartaIdPunct("DSC:1"), null, "Dragon Star n-are puncte");
  assert.equal(despartaIdPunct("SDY:"), null);
});
