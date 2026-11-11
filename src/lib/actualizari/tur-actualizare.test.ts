import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { TUR_ACTUALIZARE, deschideLaIntrare } from "./tur-actualizare";

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
const VECHI = "2026-10-01T10:00:00.000Z";

test("se deschide singura doar pentru un cont de dinainte de lansare, care n-a inchis-o, si nu in impersonare", () => {
  assert.equal(deschideLaIntrare({ contCreatLa: VECHI, vazutLa: null, impersonare: false }), true);
  // A vazut doar anunturi de dinainte: turul e nou pentru el.
  assert.equal(deschideLaIntrare({ contCreatLa: VECHI, vazutLa: "2026-09-01T00:00:00.000Z", impersonare: false }), true);
  // L-a inchis dupa lansare: nu se mai deschide singura.
  assert.equal(deschideLaIntrare({ contCreatLa: VECHI, vazutLa: "2026-11-11T09:00:00.000Z", impersonare: false }), false);
  // Cont facut dupa lansare (sau chiar in clipa ei): n-are nimic „nou” de vazut.
  assert.equal(deschideLaIntrare({ contCreatLa: "2026-11-12T10:00:00.000Z", vazutLa: null, impersonare: false }), false);
  assert.equal(deschideLaIntrare({ contCreatLa: TUR_ACTUALIZARE.lansare, vazutLa: null, impersonare: false }), false);
  // Adminul care intra in locul comerciantului nu i-o consuma.
  assert.equal(deschideLaIntrare({ contCreatLa: VECHI, vazutLa: null, impersonare: true }), false);
  // Fara data contului (sau una stricata): nu se deschide, nu ghicim.
  assert.equal(deschideLaIntrare({ contCreatLa: null, vazutLa: null, impersonare: false }), false);
  assert.equal(deschideLaIntrare({ contCreatLa: "nu e o data", vazutLa: null, impersonare: false }), false);
  // Un tur viitor, cu lansarea lui: cine l-a inchis pe acesta il vede pe cel nou.
  assert.equal(deschideLaIntrare({ contCreatLa: VECHI, vazutLa: "2026-11-11T09:00:00.000Z", impersonare: false }, { lansare: "2027-01-10T00:00:00.000Z" }), true);
});

test("fiecare pas are clip (MP4) si poza, in `public`", () => {
  assert.equal(TUR_ACTUALIZARE.pasi.length, 5);
  for (const p of TUR_ACTUALIZARE.pasi) {
    assert.ok(existsSync(`public${p.poster}`), `lipseste ${p.poster}`);
    assert.ok(p.video, `pasul „${p.titlu}” n-are clip`);
    assert.ok(existsSync(`public${p.video!.mp4}`), `lipseste ${p.video!.mp4}`);
  }
});

test("fereastra si legatura din panou n-au steluta (cerut de el, 11.11)", () => {
  assert.doesNotMatch(cod("src/components/dashboard/TurActualizare.tsx"), /Sparkles/);
  const pagina = cod("src/app/(dashboard)/dashboard/page.tsx");
  const legatura = pagina.match(/<Link href="\/dashboard\?tur=actualizare"[\s\S]*?<\/Link>/);
  assert.ok(legatura, "legatura „Ce e nou în editor” nu mai e unde o stiam");
  assert.doesNotMatch(legatura![0], /Sparkles|<svg/);
});

test("layoutul panoului monteaza fereastra cu regula, iar actiunea nu scrie in impersonare", () => {
  const l = cod("src/app/(dashboard)/layout.tsx");
  assert.match(l, /announcements_seen_at"\)\.eq\("id", user\.id\)/);
  assert.match(l, /deschideLaIntrare\(\{\n\s*contCreatLa: user\.created_at,\n\s*vazutLa: profile\.announcements_seen_at,\n\s*impersonare: esteImpersonare,\n\s*\}\)/);
  assert.match(l, /<TurActualizare laIntrare=\{turLaIntrare\} \/>/);
  const a = cod("src/lib/actions/tur-actualizare.actions.ts");
  assert.match(a, /if \(\(await cookies\(\)\)\.get\("impersonare"\)\?\.value != null\) return \{ ok: false \};/);
  // „use server” face actiune din fiecare export: aici e unul singur.
  assert.equal((a.match(/^export /gm) ?? []).length, 1);
});

test("fereastra nu se deschide singura peste editorul pe tot ecranul, iar clipul se poate opri", () => {
  const c = cod("src/components/dashboard/TurActualizare.tsx");
  assert.match(c, /if \(!laIntrare \|\| marcat\.current \|\| esteEcranIntreg\(pathname\)\) return;/);
  // WCAG 2.2.2: o animatie de peste 5 secunde care porneste singura trebuie sa se poata opri.
  assert.match(c, /aria-label=\{ruleaza \? "Oprește clipul" : "Pornește clipul"\}/);
  // Miscarea redusa din sistem: clipul nu porneste singur.
  assert.match(c, /autoPlay=\{!miscareRedusa\}/);
  // Inchiderea o marcheaza vazuta, o singura data si doar cand s-a deschis singura.
  assert.match(c, /if \(laIntrare && !marcat\.current\) \{\n\s*marcat\.current = true;/);
});
