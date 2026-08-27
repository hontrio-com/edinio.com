import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { momentulValorii } from "./sync";

/* ══════════════════════════════════════════════════════════════════════════
   `products.updated_at` SINGUR ERA GRESIT LA DOUA CAI DIN TREI (27.08.2026, seara)
   ══════════════════════════════════════════════════════════════════════════

   Pretul trimis la About You nu vine mereu din `products`:

     `manual_eur`  → `aboutyou_variants.retail_price_eur`. Comerciantul schimba 20 EUR in 18 EUR,
                     se scrie randul variantei, iar `products.updated_at` NU se misca. Plecam cu
                     18 si o marca de timp veche - deci About You putea socoti actualizarea mai
                     batrana decat una deja aplicata, si sa pastreze 20.
     `fx_from_ron` → pretul in RON, prin curs. Se schimba doar cursul (5.00 → 4.80) si pretul in
                     euro se schimba, dar produsul n-a fost atins deloc.

   Adica exact problema pe care `valid_at` trebuie s-o previna, lasata deschisa pe caile pe care
   comerciantii chiar le folosesc.
*/

const V = (t: string | null) => ({ updated_at: t });

test("⚠ pretul EUR schimbat pe varianta duce marca de timp inainte", () => {
  const m = momentulValorii("2026-08-01T10:00:00Z", [V("2026-08-27T09:00:00Z")], null);
  assert.equal(m, "2026-08-27T09:00:00Z");
});

test("⚠ si cursul schimbat, la fel", () => {
  /* Produsul n-a fost atins deloc, dar pretul lui in euro s-a schimbat. */
  const m = momentulValorii("2026-08-01T10:00:00Z", [V("2026-08-01T10:00:00Z")], "2026-08-27T11:00:00Z");
  assert.equal(m, "2026-08-27T11:00:00Z");
});

test("⚠ se ia MAXIMUL, deci ordinea dintre doua trimiteri se pastreaza", () => {
  /*
   * Monotonia e chiar ce i se cere: orice schimbare adevarata duce marca inainte, iar o trimitere
   * de mai tarziu are un maxim cel putin la fel de mare.
   */
  const intai = momentulValorii("2026-08-01T10:00:00Z", [V("2026-08-10T10:00:00Z")], null);
  const apoi = momentulValorii("2026-08-01T10:00:00Z", [V("2026-08-11T10:00:00Z")], null);
  assert.ok(Date.parse(apoi!) > Date.parse(intai!));
});

test("⚠ cea mai noua varianta castiga, nu prima din lista", () => {
  const m = momentulValorii(null, [V("2026-08-05T00:00:00Z"), V("2026-08-20T00:00:00Z"), V("2026-08-07T00:00:00Z")], null);
  assert.equal(m, "2026-08-20T00:00:00Z");
});

test("⚠ cand nu stim nimic, campul se OMITE", () => {
  /*
   * O marca de timp inventata ar fi mai rea decat lipsa ei: ar putea face o valoare veche sa bata
   * una noua - exact pe dos fata de ce apara campul.
   */
  assert.equal(momentulValorii(null, [], null), undefined);
  assert.equal(momentulValorii(undefined, [V(null), V(undefined as never)], undefined), undefined);
});

test("⚠ o data stalcita nu trece drept marca de timp", () => {
  /* `Date.parse` da `NaN`, iar un `NaN` strecurat in comparatii ar fi ales la intamplare. */
  assert.equal(momentulValorii("maine", [V("nu stiu")], "candva"), undefined);
  assert.equal(momentulValorii("maine", [V("2026-08-20T00:00:00Z")], null), "2026-08-20T00:00:00Z");
});

test("⚠ si toate trei sursele chiar sunt legate la trimitere", () => {
  const viu = readFileSync("src/lib/aboutyou/sync.ts", "utf8")
    .replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(viu, /momentulValorii\(produs\.updated_at, variants, null\)/, "stocul");
  assert.match(viu, /momentulValorii\(produs\.updated_at, variants, ctx\.config\.fx\?\.updated_at\)/, "pretul");
  /* Si `updated_at` chiar se cere din randurile de varianta: fara el ar fi mereu `undefined`. */
  assert.match(viu, /enabled, ay_status, updated_at"/);
});

test("⚠ reluarea fara `valid_at` la orice 4xx s-a scos", () => {
  /*
   * „Limpede" inseamna ORICE 4xx, inclusiv `400 Invalid price` - care n-are nicio legatura cu
   * campul. Adica prima greseala de pret dintr-un lot stingea tacut chiar paza impotriva
   * reordonarii, si o stingea pentru totdeauna.
   *
   * ⚠ Si nu se poate inlocui cu o citire a mesajului lor: regula casei e ca refuzul se clasifica
   * pe codul HTTP, niciodata pe text.
   */
  const viu = readFileSync("src/lib/aboutyou/sync.ts", "utf8")
    .replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(viu, /trimite\(transa, undefined\)/);
  assert.doesNotMatch(viu, /if \(validAt && isAboutYouError\(res\)/);
});
