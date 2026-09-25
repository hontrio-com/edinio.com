import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  amprentaCheii, identitateNormalizata, magazinulCareFolosesteContul, mesajContFolosit,
} from "./cont-marketplace-unic";

/*
 * Un cont de marketplace, un singur magazin Edinio (25.09.2026). Incidentul care
 * a cerut-o: Okxi si VetDepo pe aceleasi chei Trendyol, comenzi intrate in ambele.
 */

const EU = "11111111-1111-4111-8111-111111111111";
const ALTUL = "22222222-2222-4222-8222-222222222222";

test("alt magazin pe acelasi Seller ID Trendyol: refuzat; propriul magazin nu se numara", () => {
  const noua = identitateNormalizata("trendyol", { id: " 1182665 " })!;
  assert.equal(magazinulCareFolosesteContul("trendyol", noua, EU, [{ business_id: ALTUL, id: "1182665" }]), ALTUL);
  // reconectarea aceluiasi magazin trece
  assert.equal(magazinulCareFolosesteContul("trendyol", noua, EU, [{ business_id: EU, id: "1182665" }]), null);
  assert.equal(magazinulCareFolosesteContul("trendyol", noua, EU, [{ business_id: ALTUL, id: "999" }]), null);
  assert.equal(magazinulCareFolosesteContul("trendyol", noua, EU, []), null);
});

test("eMAG: acelasi utilizator, fara diferenta de litere; alta tara e alt cont; fara tara = ro", () => {
  const ro = identitateNormalizata("emag", { id: "Vanzator@Firma.ro", tara: "ro" })!;
  assert.equal(magazinulCareFolosesteContul("emag", ro, EU, [{ business_id: ALTUL, id: "vanzator@firma.ro", tara: "ro" }]), ALTUL);
  assert.equal(magazinulCareFolosesteContul("emag", ro, EU, [{ business_id: ALTUL, id: "vanzator@firma.ro", tara: null }]), ALTUL);
  assert.equal(magazinulCareFolosesteContul("emag", ro, EU, [{ business_id: ALTUL, id: "vanzator@firma.ro", tara: "bg" }]), null);
});

test("OLX: id-ul numeric al contului se compara ca text", () => {
  const noua = identitateNormalizata("olx", { id: 123456 })!;
  assert.equal(magazinulCareFolosesteContul("olx", noua, EU, [{ business_id: ALTUL, id: "123456" }]), ALTUL);
});

test("About You: aceeasi cheie; si conectarile vechi, fara amprenta, se prind dupa cheie", () => {
  const noua = amprentaCheii("cheie-about-you-lunga");
  assert.equal(amprentaCheii("  cheie-about-you-lunga "), noua);
  assert.equal(magazinulCareFolosesteContul("aboutyou", noua, EU, [{ business_id: ALTUL, id: noua }]), ALTUL);
  assert.equal(
    magazinulCareFolosesteContul("aboutyou", noua, EU, [{ business_id: ALTUL, id: null, cheie: "cheie-about-you-lunga" }]),
    ALTUL,
  );
  // o cheie ramasa criptata (citita fara decriptare) nu se compara, nu se potriveste din greseala
  assert.equal(
    magazinulCareFolosesteContul("aboutyou", amprentaCheii("enc.v1.x"), EU, [{ business_id: ALTUL, id: null, cheie: "enc.v1.x" }]),
    null,
  );
});

test("fara identitate nu se refuza nimic, iar mesajul nu numeste celalalt magazin", () => {
  assert.equal(identitateNormalizata("trendyol", { id: "" }), null);
  assert.equal(identitateNormalizata("olx", { id: undefined }), null);
  const m = mesajContFolosit("trendyol");
  assert.match(m, /deja conectat la alt magazin Edinio/);
  assert.doesNotMatch(m, /—/);
});

/* ─── Pe sursa: fiecare conectare intreaba paza INAINTE sa salveze ─── */

function ordine(cale: string, functie: RegExp, pasi: RegExp[]) {
  const sursa = readFileSync(cale, "utf8");
  const start = sursa.search(functie);
  assert.ok(start >= 0, `${cale}: functia de conectare nu mai e unde o stiam`);
  const corp = sursa.slice(start, start + 6000);
  let ultim = -1;
  for (const p of pasi) {
    const i = corp.search(p);
    assert.ok(i > ultim, `${cale}: ${p} lipseste sau vine prea devreme`);
    ultim = i;
  }
}

test("Trendyol, eMAG si About You intreaba paza inainte de proba si de salvare", () => {
  ordine("src/lib/actions/trendyol.actions.ts", /export async function connectTrendyol\(/,
    [/refuzaContFolositDeAltMagazin\("trendyol", businessId, \{ id: supplierId \}\)/, /await testConnection\(/, /await saveConfig\(/]);
  ordine("src/lib/actions/emag.actions.ts", /export async function connectEmag\(/,
    [/refuzaContFolositDeAltMagazin\("emag", businessId, \{ id: username, tara: date\.tara \}\)/, /await testeazaConexiunea\(/, /await saveConfig\(/]);
  ordine("src/lib/actions/aboutyou.actions.ts", /export async function connectAboutYou\(/,
    [/refuzaContFolositDeAltMagazin\("aboutyou", businessId, \{ id: amprenta \}\)/, /await testConnection\(/, /api_key_amprenta: amprenta/, /await saveConfig\(/]);
});

test("OLX intreaba paza dupa ce afla contul si inainte sa scrie ceva", () => {
  ordine("src/app/api/olx/oauth/callback/route.ts", /export async function GET\(/,
    [/const me = await getMe\(/, /refuzaContFolositDeAltMagazin\("olx", businessId, \{ id: me\.data\.id \}\)/, /patchOlxConfig\(admin, businessId, config\)/]);
  assert.match(readFileSync("src/components/dashboard/OlxClient.tsx", "utf8"), /p === "cont_folosit"/);
});

test("paza nu citeste configurile intregi ale altor magazine, doar identificatorii", () => {
  const sursa = readFileSync("src/lib/integrari/cont-marketplace-unic.ts", "utf8");
  const selectii = [...sursa.matchAll(/select: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(selectii.length, 4);
  for (const sel of selectii) {
    for (const bucata of sel.split(",").map((b) => b.trim())) {
      // fie `business_id`, fie `alias:coloana->>cheie`: niciodata o coloana de config intreaga
      assert.match(bucata, /^(business_id|\w+:\w+_config->>\w+)$/, `se citeste prea mult: ${bucata}`);
    }
    assert.doesNotMatch(sel, /api_secret|password|access_token|refresh_token/);
  }
  assert.doesNotMatch(sursa, /^["']use server["']/m);
});
