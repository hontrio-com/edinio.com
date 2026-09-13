import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FARA_API_DE_TARIF, rezervaEDeIncredere } from "@/lib/shipping/optiuni-de-rezerva";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * O REZERVA LA 0 LEI NU E O OFERTA                            (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ CAZUL, MASURAT IN PRODUCTIE. `okxi` (VetDepo, 142 de comenzi, activa chiar in ziua
 * scrierii) are zona Sameday pornita pe tarif VIU, cu `price: 0`. Cand Sameday nu raspunde,
 * `getShippingOptions` punea o optiune la pretul zonei si o SEMNA. Cumparatorul vedea
 * „Sameday, 0,00 lei", iar la comanda `verificaCotatia` o gasea valida, fiindca noi o
 * semnasem: rezerva `max(suma ceruta, tarif implicit)` nu se aprinde pe o semnatura care
 * bate. Comanda pleca cu transport zero si comerciantul platea cursa.
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: se scoate filtrul din `getShippingOptions`, sau se slabeste
 * regula la `>= 0`, sau se uita scutirea curierilor fara API de tarif.
 */

test("⚠⚠ rezerva la ZERO a unui curier care cota live se taie", () => {
  /* Exact cazul okxi/Sameday. */
  assert.equal(rezervaEDeIncredere("sameday", 0, true), false);
  assert.equal(rezervaEDeIncredere("cargus", 0, true), false);
  assert.equal(rezervaEDeIncredere("fan-courier", 0, true), false);
});

test("⚠ dar un tarif de rezerva REAL ramane: aia e degradarea aleasa de comerciant", () => {
  /*
   * ⚠ AFIRMATIA CARE OPRESTE O REPARATIE PREA LATA. Taind toate rezervele, curierul ar fi
   * disparut din checkout exact la magazinele care si-au scris un tarif tocmai pentru cazul
   * asta: `tonel-beauty` are 17 la Cargus si 18 la DPD, `yulmis-sound` 20 la FAN.
   */
  assert.equal(rezervaEDeIncredere("cargus", 17, true), true);
  assert.equal(rezervaEDeIncredere("dpd", 18, true), true);
  assert.equal(rezervaEDeIncredere("fan-courier", 20, true), true);
});

test("⚠⚠ si `pickup` la 0 lei ramane: acolo zero E pretul, nu o rezerva", () => {
  /*
   * ⚠ CEL MAI USOR DE STRICAT. „Ridicare personala" costa 0 lei la cinci magazine publicate,
   * si e o optiune perfect legitima. O regula scrisa doar pe pret ar fi sters-o din checkout
   * si ar fi rupt un drum care merge azi. De aceea scutirea se face pe LISTA curierilor fara
   * API de tarif, nu pe pret.
   */
  assert.equal(rezervaEDeIncredere("pickup", 0, true), true);
  assert.equal(rezervaEDeIncredere("own", 0, true), true);
  for (const c of FARA_API_DE_TARIF) {
    assert.equal(rezervaEDeIncredere(c, 0, true), true, `${c} a fost taiat, desi n-are API de tarif`);
  }
});

test("⚠ si cand magazinul e pe tarife fixe, nimic nu e rezerva", () => {
  /*
   * Cand plafonul de cotatii a trecut tot magazinul pe tarife fixe, pretul zonei nu mai e o
   * rezerva dupa un esec: e chiar pretul cerut. Taiat si acolo, plafonul de cereri ar fi golit
   * checkoutul in loc sa-l degradeze.
   */
  assert.equal(rezervaEDeIncredere("sameday", 0, false), true);
  assert.equal(rezervaEDeIncredere("cargus", 0, false), true);
});

test("⚠ un pret care nu e numar nu trece drept oferta", () => {
  assert.equal(rezervaEDeIncredere("sameday", Number.NaN, true), false);
  assert.equal(rezervaEDeIncredere("sameday", -5, true), false);
});

/* ═══════════════════════════════════════════════════════════════════════════
   CUSATURA: checkoutul chiar cheama regula
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠⚠ `getShippingOptions` filtreaza INAINTE de semnare, si nu-si mai tine propria lista", () => {
  const s = readFileSync("src/lib/actions/shipping.actions.ts", "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  assert.match(s, /rezervaEDeIncredere\(o\.courier \?\? "", o\.price, coteazaLive\)/,
    "checkoutul nu mai filtreaza rezervele la zero");

  /*
   * ⚠ ORDINEA E TOT REGULA. Filtrul pus DUPA `semneazaOptiuni` ar fi taiat optiunea dupa ce
   * i-am dat deja semnatura, iar tokenul acela ar fi ramas valabil 24 de ore in mana oricui
   * l-a cerut o data.
   */
  /*
   * ⚠ `lastIndexOf`, NU `indexOf`. `semneazaOptiuni(` apare de mai multe ori: ramura
   * internationala semneaza si iese mult mai devreme. Cu `indexOf`, proba compara filtrul cu
   * o semnare care nu-l priveste si cade spunand ca filtrul e „dupa semnare", cand de fapt
   * ancora era alta. Aceeasi capcana ca in memoria `ancora-negasita-nu-da-eroare`: unealta
   * raspunde exact ce ai intrebat, nu ce voiai.
   */
  const iFiltru = s.indexOf("rezervaEDeIncredere(");
  const iSemnare = s.lastIndexOf("semneazaOptiuni(");
  assert.ok(iFiltru > 0, "checkoutul nu mai cheama deloc filtrul de rezerve");
  assert.ok(iSemnare > 0, "nu se mai gaseste semnarea finala: proba n-are fata de ce compara");
  assert.ok(iFiltru < iSemnare,
    "filtrul de rezerve a ajuns DUPA semnarea finala: optiunea taiata ar pleca oricum semnata");

  /* ⚠ Si lista nu mai are doua copii: una in modul, alta in „use server". */
  assert.doesNotMatch(s, /const FARA_API_DE_TARIF = new Set/,
    "checkoutul si-a refacut propria lista de curieri fara API de tarif");
});
