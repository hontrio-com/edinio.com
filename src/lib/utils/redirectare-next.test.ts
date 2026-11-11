import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { esteRedirectareNext } from "./redirectare-next";

// Modulele lui Next sunt CommonJS: exporturile numite nu se pot importa direct dintr-o proba ESM.
const cere = createRequire(import.meta.url);
const { getRedirectError } = cere("next/dist/client/components/redirect") as {
  getRedirectError: (url: string, type: "push" | "replace") => unknown;
};
const RedirectType = { push: "push", replace: "replace" } as const;

/*
  Inscrierea si intrarea in cont (11.11.2026): o actiune care cade arata un mesaj; redirectarea de dupa o inscriere
  REUSITA (care ajunge la client ca respingere, vezi `redirectare-next.ts`) nu arata nimic.
*/

test("eroarea de redirectare facuta chiar de Next e recunoscuta, si la „push”, si la „replace”", () => {
  // Chiar functia din Next, ca o schimbare a formei in versiunea urmatoare sa cada aici, nu in fata omului.
  assert.equal(esteRedirectareNext(getRedirectError("/onboarding/details", RedirectType.push)), true);
  assert.equal(esteRedirectareNext(getRedirectError("/dashboard", RedirectType.replace)), true);
});

test("o cadere adevarata NU e luata drept redirectare", () => {
  assert.equal(esteRedirectareNext(new Error("An unexpected response was received from the server.")), false);
  assert.equal(esteRedirectareNext(new TypeError("Failed to fetch")), false);
  assert.equal(esteRedirectareNext({ digest: "NEXT_NOT_FOUND" }), false);
  assert.equal(esteRedirectareNext({ digest: 42 }), false);
  assert.equal(esteRedirectareNext(null), false);
  assert.equal(esteRedirectareNext("NEXT_REDIRECT;push;/x;307;"), false);
});

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

for (const [cale, mesaj] of [
  ["src/app/(auth)/register/page.tsx", "Nu am putut crea contul. Verifica conexiunea si incearca din nou."],
  ["src/app/(auth)/login/page.tsx", "Nu am putut intra in cont. Verifica conexiunea si incearca din nou."],
] as const) {
  test(`${cale}: caderea are mesaj, redirectarea iese inaintea lui`, () => {
    const s = cod(cale);
    const prinde = s.match(/\} catch \(e\) \{([\s\S]*?)\n {4}\}/);
    assert.ok(prinde, "catch-ul cu eroarea numita lipseste (un `catch {}` tacut ascunde caderile)");
    const corp = prinde[1];
    const iesire = corp.indexOf("if (esteRedirectareNext(e)) return;");
    const mesajLa = corp.indexOf(`toast.error("${mesaj}")`);
    assert.ok(iesire >= 0 && mesajLa > iesire, "intai redirectarea (iese), apoi mesajul caderii");
    assert.match(corp, /setLoading\(false\);/);
    // Paginile de autentificare sunt scrise fara diacritice; mesajul nou le urmeaza.
    assert.doesNotMatch(mesaj, /[ăâîșțĂÂÎȘȚ]/);
  });
}
