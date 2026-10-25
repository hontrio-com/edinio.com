import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esteEcranIntreg } from "./ecran-intreg";

/**
 * EDITORUL PE TOT ECRANUL (25.10.2026). Cerut de proprietar: in „Editează magazinul” nu mai apar
 * nici bara laterala, nici bara de sus, ca editarea sa aiba tot locul. Vezi `CadruPanou`.
 *
 * Rulare: `npm test`.
 */

test("doar editorul ia tot ecranul; Biblioteca Media ramane in cadrul panoului", () => {
  assert.equal(esteEcranIntreg("/dashboard/editor"), true);
  assert.equal(esteEcranIntreg("/dashboard/editor/"), true);
  assert.equal(esteEcranIntreg("/dashboard/editor/media"), false);
  assert.equal(esteEcranIntreg("/dashboard"), false);
  assert.equal(esteEcranIntreg("/dashboard/editorul"), false);
  assert.equal(esteEcranIntreg(null), false);
});

const fara = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠⚠ layoutul panoului trece toate barele prin `CadruPanou`, niciuna pe langa el", () => {
  const s = fara(readFileSync("src/app/(dashboard)/layout.tsx", "utf8"));
  const inceput = s.indexOf("<CadruPanou");
  const sfarsit = s.indexOf("</CadruPanou>");
  assert.ok(inceput > 0 && sfarsit > inceput, "layoutul nu mai foloseste `CadruPanou`");
  // O bara scoasa din cadru ar aparea iar peste editor, si nimic nu s-ar plange.
  for (const bara of ["<Sidebar", "<DashboardTopbar", "<BottomNav", "<TrialBanner", "<GracePeriodBanner", "<PaymentPastDueBanner", "<ImpersonationBanner"]) {
    const unde = [...s.matchAll(new RegExp(bara + "\\b", "g"))].map((m) => m.index!);
    assert.equal(unde.length, 1, `${bara} apare de ${unde.length} ori`);
    assert.ok(unde[0] > inceput && unde[0] < sfarsit, `${bara} sta in afara cadrului`);
  }
  assert.equal(s.split("{children}").length - 1, 1);
  assert.ok(s.indexOf("{children}") > inceput && s.indexOf("{children}") < sfarsit, "pagina sta in afara cadrului");
});

test("editorul umple ce i se da, fara inaltimi care scad barele panoului", () => {
  for (const f of ["src/components/editor-magazin/EditorMagazin.tsx", "src/components/editor-magazin/ScheletEditor.tsx"]) {
    const s = fara(readFileSync(f, "utf8"));
    // Barele nu mai sunt; o inaltime care le scade ar lasa o fasie goala sub editor.
    assert.doesNotMatch(s, /100dvh-3\.5rem/, `${f} scade inca bara de sus`);
    assert.match(s, /flex flex-col h-full/, `${f} nu mai umple cadrul`);
  }
});
