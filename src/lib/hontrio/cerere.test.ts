import test from "node:test";
import assert from "node:assert/strict";
import {
  DURATA_CERERE_MS, adresaCuCod, adresaCuEroare, cerereaDinCookie, citesteCererea, serializeazaCererea,
} from "./cerere";

const INTOARCERE = "https://hontrio.com/api/integrations/edinio/callback";
const PERMISE = [INTOARCERE, "http://localhost:3002/api/integrations/edinio/callback"];
const PROVOCARE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const ACUM = Date.UTC(2026, 9, 25, 12, 0, 0);

function cerere(peste: Record<string, string | null> = {}): URLSearchParams {
  const baza: Record<string, string | null> = {
    client_id: "hontrio",
    redirect_uri: INTOARCERE,
    response_type: "code",
    code_challenge: PROVOCARE,
    code_challenge_method: "S256",
    state: "stare-de-la-hontrio_123",
    ...peste,
  };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(baza)) if (v !== null) p.set(k, v);
  return p;
}

test("cererea buna trece, cu tot ce trebuie regasit la schimb", () => {
  const rez = citesteCererea(cerere(), PERMISE, true, ACUM);
  assert.deepEqual(rez, {
    fel: "buna",
    cerere: { redirectUri: INTOARCERE, state: "stare-de-la-hontrio_123", codeChallenge: PROVOCARE, creataLa: ACUM },
  });
});

test("⚠ legatura oprita (fara secret sau fara adrese in mediu): nimic nu merge mai departe", () => {
  assert.deepEqual(citesteCererea(cerere(), PERMISE, false, ACUM), { fel: "oprita", motiv: "neconfigurat" });
});

test("⚠ client necunoscut: ecran la noi, NICIO intoarcere", () => {
  assert.deepEqual(citesteCererea(cerere({ client_id: "altcineva" }), PERMISE, true, ACUM), { fel: "oprita", motiv: "client" });
  assert.deepEqual(citesteCererea(cerere({ client_id: null }), PERMISE, true, ACUM), { fel: "oprita", motiv: "client" });
});

test("⚠ adresa de intoarcere se compara EXACT, nu dupa inceput sau dupa domeniu", () => {
  for (const adresa of [
    "https://hontrio.com/api/integrations/edinio/callback/",
    "https://hontrio.com/api/integrations/edinio/callback?x=1",
    "https://hontrio.com/api/integrations/edinio/callbackx",
    "https://hontrio.com.rau.ro/api/integrations/edinio/callback",
    "https://rau.ro/?https://hontrio.com/api/integrations/edinio/callback",
    "http://hontrio.com/api/integrations/edinio/callback",
  ]) {
    assert.deepEqual(citesteCererea(cerere({ redirect_uri: adresa }), PERMISE, true, ACUM), { fel: "oprita", motiv: "adresa" }, adresa);
  }
  /* Si pe lista goala nu trece nimic, oricat de bine ar arata adresa. */
  assert.deepEqual(citesteCererea(cerere(), [], true, ACUM), { fel: "oprita", motiv: "adresa" });
});

test("restul greselilor se intorc la Hontrio, cu `state`, ca sa stie ce cerere a cazut", () => {
  const tip = citesteCererea(cerere({ response_type: "token" }), PERMISE, true, ACUM);
  assert.equal(tip.fel, "intoarsa");
  const u = new URL((tip as { catre: string }).catre);
  assert.equal(`${u.origin}${u.pathname}`, INTOARCERE);
  assert.equal(u.searchParams.get("error"), "unsupported_response_type");
  assert.equal(u.searchParams.get("state"), "stare-de-la-hontrio_123");
});

test("⚠ PKCE e obligatoriu, si numai S256", () => {
  const cazuri: Record<string, string | null>[] = [
    { code_challenge: null },
    { code_challenge_method: null },
    { code_challenge_method: "plain" },
    { code_challenge: "prea-scurta" },
  ];
  for (const peste of cazuri) {
    const rez = citesteCererea(cerere(peste), PERMISE, true, ACUM);
    assert.equal(rez.fel, "intoarsa", JSON.stringify(peste));
    assert.equal(new URL((rez as { catre: string }).catre).searchParams.get("error"), "invalid_request");
  }
});

test("⚠ fara `state` cererea nu trece: Hontrio n-ar avea cum sa lege raspunsul de ea", () => {
  for (const state of [null, "", "x".repeat(513), "cu\nrand-nou"]) {
    const rez = citesteCererea(cerere({ state }), PERMISE, true, ACUM);
    assert.equal(rez.fel, "intoarsa", JSON.stringify(state));
    const u = new URL((rez as { catre: string }).catre);
    assert.equal(u.searchParams.get("error"), "invalid_request");
    assert.equal(u.searchParams.has("state"), false, "un `state` respins nu se intoarce inapoi");
  }
});

test("cookie-ul cererii: dus si intors, aceeasi cerere", () => {
  const rez = citesteCererea(cerere(), PERMISE, true, ACUM);
  assert.equal(rez.fel, "buna");
  const c = (rez as { cerere: Parameters<typeof serializeazaCererea>[0] }).cerere;
  assert.deepEqual(cerereaDinCookie(serializeazaCererea(c), PERMISE, true, ACUM + 60_000), c);
});

test("⚠ cookie-ul expira odata cu cererea, si nu poate veni „din viitor”", () => {
  const c = { redirectUri: INTOARCERE, state: "s", codeChallenge: PROVOCARE, creataLa: ACUM };
  const v = serializeazaCererea(c);
  assert.ok(cerereaDinCookie(v, PERMISE, true, ACUM + DURATA_CERERE_MS));
  assert.equal(cerereaDinCookie(v, PERMISE, true, ACUM + DURATA_CERERE_MS + 1), null);
  assert.equal(cerereaDinCookie(serializeazaCererea({ ...c, creataLa: ACUM + 3_600_000 }), PERMISE, true, ACUM), null);
});

test("⚠ cookie-ul scris de altcineva nu trimite codul unde vrea el", () => {
  const strain = serializeazaCererea({ redirectUri: "https://rau.ro/cb", state: "s", codeChallenge: PROVOCARE, creataLa: ACUM });
  assert.equal(cerereaDinCookie(strain, PERMISE, true, ACUM), null);
  /* Adresa scoasa de pe lista intre timp: cererea veche nu mai trece nici ea. */
  const buna = serializeazaCererea({ redirectUri: INTOARCERE, state: "s", codeChallenge: PROVOCARE, creataLa: ACUM });
  assert.equal(cerereaDinCookie(buna, [PERMISE[1]], true, ACUM), null);
  /* Legatura oprita: nici cererile deja pornite nu mai trec. */
  assert.equal(cerereaDinCookie(buna, PERMISE, false, ACUM), null);
  for (const gunoi of ["", "nu-e-base64-json", Buffer.from("[1,2]").toString("base64url"), Buffer.from("null").toString("base64url"), undefined, null]) {
    assert.equal(cerereaDinCookie(gunoi as string, PERMISE, true, ACUM), null, String(gunoi));
  }
});

test("adresa cu codul pastreaza interogarea adresei si codeaza `state`", () => {
  const u = new URL(adresaCuCod("https://hontrio.com/cb?magazin=1", "COD", "a b&c=d"));
  assert.equal(u.searchParams.get("magazin"), "1");
  assert.equal(u.searchParams.get("code"), "COD");
  assert.equal(u.searchParams.get("state"), "a b&c=d");
  const e = new URL(adresaCuEroare("https://hontrio.com/cb", "access_denied", null));
  assert.equal(e.searchParams.get("error"), "access_denied");
  assert.equal(e.searchParams.has("state"), false);
});
