import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { adresaPermisa, adreseleLui, destinatarFormular } from "./destinatar-formular";

/*
  Emailul formularelor (26.09.2026, ales de el): adresa o alege comerciantul;
  pleaca prin SMTP-ul lui daca il are, altfel de pe Edinio, si atunci numai la
  adresele LUI.
*/

const ale = adreseleLui("Magazin@Exemplu.ro", "cont@exemplu.ro");

test("adresele lui: magazinul intai, fara dubluri, fara gunoi", () => {
  assert.deepEqual(ale, ["magazin@exemplu.ro", "cont@exemplu.ro"]);
  assert.deepEqual(adreseleLui("a@b.ro", "A@B.ro"), ["a@b.ro"]);
  assert.deepEqual(adreseleLui("", "nu-e-email"), []);
});

test("FARA SMTP: o adresa straina NU pleaca de pe Edinio, cade pe a magazinului", () => {
  assert.deepEqual(destinatarFormular("victima@altundeva.ro", ale, false), { to: "magazin@exemplu.ro", liber: false });
  assert.equal(adresaPermisa("victima@altundeva.ro", ale, false), false);
  assert.deepEqual(destinatarFormular("cont@exemplu.ro", ale, false), { to: "cont@exemplu.ro", liber: false });
  assert.deepEqual(destinatarFormular("", ale, false), { to: "magazin@exemplu.ro", liber: false });
});

test("CU SMTP: orice adresa, dar marcata „libera” (fara rezerva pe Edinio)", () => {
  assert.deepEqual(destinatarFormular("vanzari@firma.ro", ale, true), { to: "vanzari@firma.ro", liber: true });
  assert.equal(adresaPermisa("vanzari@firma.ro", ale, true), true);
  assert.equal(adresaPermisa("nu e email", ale, true), false);
  // Adresa lui ramane „a lui” si cu SMTP: are voie la rezerva pe Edinio.
  assert.deepEqual(destinatarFormular("cont@exemplu.ro", ale, true), { to: "cont@exemplu.ro", liber: false });
});

test("trimiterea si salvarea folosesc aceeasi regula, iar adresa libera nu cade pe Edinio", () => {
  const act = readFileSync(new URL("../actions/page.actions.ts", import.meta.url), "utf8");
  assert.match(act, /destinatarFormular\(emailTo, adreseleLui\(biz\.email, u\.user\?\.email\), !!sender\?\.smtp\)/);
  assert.match(act, /\{ sender, faraRezervaEdinio: liber \}/);
  const form = readFileSync(new URL("../actions/form.actions.ts", import.meta.url), "utf8");
  assert.match(form, /adresaPermisa\(e, adreseleLui\(biz\?\.email, user\.email\), !!sender\?\.smtp\)/);
  const email = readFileSync(new URL("../email.ts", import.meta.url), "utf8");
  const f = email.slice(email.indexOf("export async function sendPageFormEmail"));
  assert.match(f.slice(0, 2500), /if \(cale\.faraRezervaEdinio\) return;/);
  assert.match(f.slice(0, 2500), /else if \(cale\?\.faraRezervaEdinio\) \{\s*return;/);
});
