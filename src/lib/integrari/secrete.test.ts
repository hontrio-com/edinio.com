import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mascheazaConfig, pastreazaSecretele, CAMPURI_SECRETE } from "./secrete";

describe("mascarea scoate secretele din payloadul de browser", () => {
  test("parola de curier pleaca goala, dar se stie ca exista", () => {
    const m = mascheazaConfig("dpd_config", { enabled: true, username: "user1", password: "parolaSecreta" });
    assert.equal(m?.password, "");
    assert.equal(m?.username, "user1", "campurile ne-secrete raman intacte");
    assert.equal(m?._completate?.password, true);
  });

  test("un camp secret gol se raporteaza ca necompletat", () => {
    const m = mascheazaConfig("smartbill_config", { email: "a@b.ro", token: "" });
    assert.equal(m?._completate?.token, false);
  });

  test("mai multe secrete pe aceeasi integrare", () => {
    const m = mascheazaConfig("netopia_config", { api_key: "k", pos_signature: "s", title: "Card" });
    assert.equal(m?.api_key, "");
    assert.equal(m?.pos_signature, "");
    assert.equal(m?.title, "Card");
  });

  test("nicio valoare secreta nu supravietuieste in JSON-ul serializat", () => {
    const brut = { username: "u", password: "PAROLA_SECRETA", subscription_key: "CHEIE_SECRETA" };
    const serializat = JSON.stringify(mascheazaConfig("cargus_config", brut));
    assert.ok(!serializat.includes("PAROLA_SECRETA"));
    assert.ok(!serializat.includes("CHEIE_SECRETA"));
  });

  test("o configuratie fara secrete cunoscute trece neatinsa", () => {
    const m = mascheazaConfig("marketing_config", { fb_pixel_id: "123" });
    assert.equal(m?.fb_pixel_id, "123");
  });
});

describe("salvarea nu sterge niciodata un secret existent", () => {
  test("camp gol => se pastreaza valoarea salvata (cazul periculos)", () => {
    const rez = pastreazaSecretele("dpd_config",
      { enabled: true, username: "user1", password: "" },
      { enabled: true, username: "user1", password: "parolaVeche" });
    assert.equal(rez.password, "parolaVeche");
  });

  test("camp completat => se scrie valoarea noua", () => {
    const rez = pastreazaSecretele("dpd_config",
      { password: "parolaNoua" }, { password: "parolaVeche" });
    assert.equal(rez.password, "parolaNoua");
  });

  test("doar spatii inseamna tot gol", () => {
    const rez = pastreazaSecretele("smartbill_config", { token: "   " }, { token: "vechi" });
    assert.equal(rez.token, "vechi");
  });

  test("`_completate` nu ajunge niciodata in baza", () => {
    const rez = pastreazaSecretele("dpd_config",
      { password: "x", _completate: { password: true } }, {});
    assert.ok(!("_completate" in rez));
  });

  test("prima configurare, fara valoare veche, nu inventeaza nimic", () => {
    const rez = pastreazaSecretele("dpd_config", { username: "u", password: "" }, null);
    assert.equal(rez.password, "");
  });

  test("drumul complet: citesti mascat, salvezi fara sa retastezi", () => {
    const inBaza = { enabled: true, username: "u", password: "secret" };
    const catreBrowser = mascheazaConfig("dpd_config", inBaza)!;
    // comerciantul schimba doar username-ul si trimite formularul inapoi
    const trimis = { ...catreBrowser, username: "u2" };
    const deSalvat = pastreazaSecretele("dpd_config", trimis, inBaza);
    assert.equal(deSalvat.username, "u2");
    assert.equal(deSalvat.password, "secret", "parola NU trebuie sa se piarda");
  });
});

describe("acoperire", () => {
  test("toate integrarile cu secrete au campurile declarate", () => {
    for (const [cheie, campuri] of Object.entries(CAMPURI_SECRETE)) {
      assert.ok(campuri.length > 0, `${cheie} nu are campuri`);
      assert.ok(cheie.endsWith("_config"), `${cheie} nu arata a coloana de config`);
    }
  });
});
