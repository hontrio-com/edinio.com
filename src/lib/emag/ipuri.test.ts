import { strict as assert } from "node:assert";
import { test } from "node:test";
import { citesteIpuri, esteIpv4, IP_DIN_DOCUMENTATIE, ipuriPermise, sAuSchimbat } from "./ipuri";

/*
 * Probele listei de IP-uri de la care sună eMAG.
 *
 * Toate pazesc aceeasi jumatate de defect: lista alba nu are voie sa se goleasca, si
 * nu are voie sa se largeasca cu gunoi. Prima ar refuza toate notificarile, a doua ar
 * lasa pe oricine sa declanseze citiri in numele unui magazin.
 */

test("eMAG IP: cele din documentatie nu se pierd niciodata", () => {
  /*
   * ⚠ O aducere cazuta, sau un fisier cu alta forma, NU are voie sa lase integrarea
   * fara nicio adresa permisa — asta ar refuza toate notificarile, adica ar face chiar
   * raul de care ne aparam.
   */
  for (const lista of [null, undefined, []] as (string[] | null | undefined)[]) {
    const p = ipuriPermise(lista, null);
    for (const ip of IP_DIN_DOCUMENTATIE) {
      assert.ok(p.includes(ip), `lipseste ${ip} cand aduse = ${JSON.stringify(lista)}`);
    }
  }
});

test("eMAG IP: cele trei surse se ADUNA, nu se inlocuiesc", () => {
  const p = ipuriPermise(["1.2.3.4"], "5.6.7.8, 9.10.11.12");
  assert.ok(p.includes("1.2.3.4"), "adusa de la ei");
  assert.ok(p.includes("5.6.7.8"), "din mediu");
  assert.ok(p.includes("9.10.11.12"), "a doua din mediu");
  assert.ok(p.includes(IP_DIN_DOCUMENTATIE[0]), "si cea din documentatie");
});

test("eMAG IP: acelasi IP din doua surse apare o data", () => {
  const p = ipuriPermise([IP_DIN_DOCUMENTATIE[0]], IP_DIN_DOCUMENTATIE[0]);
  assert.equal(p.filter((x) => x === IP_DIN_DOCUMENTATIE[0]).length, 1);
});

test("eMAG IP: gunoiul nu intra in lista alba", () => {
  const p = ipuriPermise(["nu e ip", "999.1.1.1", "1.2.3"], "  ,  , tot gunoi");
  assert.deepEqual(p.sort(), [...IP_DIN_DOCUMENTATIE].sort());
});

test("eMAG IP: un octet peste 255 nu e o adresa", () => {
  /* ⚠ „999.1.1.1" trece de o potrivire lenesa pe cifre si puncte. */
  assert.equal(esteIpv4("999.1.1.1"), false);
  assert.equal(esteIpv4("1.2.3.4"), true);
  assert.equal(esteIpv4("255.255.255.255"), true);
  assert.equal(esteIpv4("1.2.3"), false);
  assert.equal(esteIpv4("1.2.3.4.5"), false);
  assert.equal(esteIpv4(""), false);
});

/* ── Citirea unui fisier fara schema ───────────────────────────────────────── */

test("eMAG IP: fisierul se citeste in toate formele plauzibile", () => {
  /* Documentatia pomeneste `/public-ips.json` dar nu-i da schema. Citit pe o singura
     forma, o schimbare la ei ar fi golit lista fara nicio eroare. */
  assert.deepEqual(citesteIpuri(["1.2.3.4", "5.6.7.8"]).sort(), ["1.2.3.4", "5.6.7.8"]);
  assert.deepEqual(citesteIpuri({ ips: ["1.2.3.4"] }), ["1.2.3.4"]);
  assert.deepEqual(citesteIpuri([{ ip: "1.2.3.4" }]), ["1.2.3.4"]);
  assert.deepEqual(citesteIpuri({ data: { marketplace: ["1.2.3.4"] } }), ["1.2.3.4"]);
});

test("eMAG IP: ce nu e adresa nu iese din citire", () => {
  assert.deepEqual(citesteIpuri({ mesaj: "unauthorized" }), []);
  assert.deepEqual(citesteIpuri(null), []);
  assert.deepEqual(citesteIpuri("1.2.3.4"), ["1.2.3.4"]);
});

test("eMAG IP: acelasi IP de doua ori in fisier iese o data", () => {
  assert.deepEqual(citesteIpuri(["1.2.3.4", { ip: "1.2.3.4" }]), ["1.2.3.4"]);
});

/* ── Cand se strigă ────────────────────────────────────────────────────────── */

test("eMAG IP: reordonarea NU e o schimbare", () => {
  /*
   * ⚠ Comparate ca siruri, o reordonare a fisierului lor ar fi strigat „s-a schimbat
   * lista" degeaba — iar dupa a treia alarma falsa nu se mai uita nimeni la ele.
   */
  assert.equal(sAuSchimbat(["1.2.3.4", "5.6.7.8"], ["5.6.7.8", "1.2.3.4"]), false);
});

test("eMAG IP: o adresa in plus sau in minus E o schimbare", () => {
  assert.equal(sAuSchimbat(["1.2.3.4"], ["1.2.3.4", "5.6.7.8"]), true);
  assert.equal(sAuSchimbat(["1.2.3.4", "5.6.7.8"], ["1.2.3.4"]), true);
  assert.equal(sAuSchimbat(["1.2.3.4"], ["9.9.9.9"]), true);
});

test("eMAG IP: prima aducere e o schimbare, ca sa se vada in jurnal", () => {
  assert.equal(sAuSchimbat(null, ["1.2.3.4"]), true);
});
