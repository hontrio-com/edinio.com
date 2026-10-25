import test from "node:test";
import assert from "node:assert/strict";
import { apiFaraPoarta } from "@/lib/auth/poarta-mfa";
import { adresaDeIntoarcereAcceptabila, secretulEsteCorect } from "./config";
import { autentifica, citestePaginarea, jetonulDinCerere } from "./api";

const LIMITE = { implicit: 50, maxim: 100 };

test("paginarea: implicitul, si fiecare parametru verificat", () => {
  assert.deepEqual(citestePaginarea(new URLSearchParams(), LIMITE), { dupa: null, actualizateDupa: null, limita: 50 });
  const p = citestePaginarea(new URLSearchParams({
    dupa: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE", actualizate_dupa: "2026-10-25T10:00:00+03:00", limita: "100",
  }), LIMITE);
  assert.deepEqual(p, { dupa: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", actualizateDupa: "2026-10-25T07:00:00.000Z", limita: 100 });
});

test("⚠ parametrii gresiti se refuza, nu se ghicesc", () => {
  for (const [k, v] of [["dupa", "1 or 1=1"], ["dupa", "abc"], ["actualizate_dupa", "ieri"], ["limita", "0"], ["limita", "101"], ["limita", "5.5"]]) {
    assert.ok("eroare" in citestePaginarea(new URLSearchParams({ [k]: v }), LIMITE), `${k}=${v}`);
  }
});

test("jetonul se citeste numai din antetul `Bearer`", () => {
  const cu = (antet?: string) => new Request("https://www.edinio.com/api/hontrio/v1/magazin", { headers: antet ? { authorization: antet } : {} });
  assert.equal(jetonulDinCerere(cu("Bearer hnt_abc")), "hnt_abc");
  assert.equal(jetonulDinCerere(cu("bearer hnt_abc")), "hnt_abc");
  assert.equal(jetonulDinCerere(cu("Basic aG9udHJpbzp4")), null);
  assert.equal(jetonulDinCerere(cu()), null);
});

test("⚠ legatura oprita din mediu: rutele raspund 503, fara sa se uite la jeton", async () => {
  const vechi = { s: process.env.HONTRIO_CLIENT_SECRET, r: process.env.HONTRIO_REDIRECT_URIS };
  delete process.env.HONTRIO_CLIENT_SECRET;
  try {
    const r = await autentifica(new Request("https://x/api/hontrio/v1/magazin", { headers: { authorization: "Bearer hnt_x" } }), "magazin");
    assert.ok(r instanceof Response);
    assert.equal((r as Response).status, 503);
  } finally {
    if (vechi.s !== undefined) process.env.HONTRIO_CLIENT_SECRET = vechi.s;
    if (vechi.r !== undefined) process.env.HONTRIO_REDIRECT_URIS = vechi.r;
  }
});

test("⚠ un jeton cu forma gresita primeste 401 inainte de orice citire din baza", async () => {
  const vechi = { s: process.env.HONTRIO_CLIENT_SECRET, r: process.env.HONTRIO_REDIRECT_URIS };
  process.env.HONTRIO_CLIENT_SECRET = "s".repeat(40);
  process.env.HONTRIO_REDIRECT_URIS = "https://hontrio.com/api/integrations/edinio/callback";
  try {
    /* Fara variabilele Supabase, orice drum pana la baza ar fi aruncat: 401 dovedeste ca n-a plecat. */
    for (const antet of ["Bearer hnt_scurt", "Bearer nimic", ""]) {
      const r = await autentifica(new Request("https://x/api/hontrio/v1/magazin", { headers: antet ? { authorization: antet } : {} }), "magazin");
      assert.equal((r as Response).status, 401, antet);
      assert.match((r as Response).headers.get("www-authenticate") ?? "", /^Bearer /);
    }
  } finally {
    if (vechi.s === undefined) delete process.env.HONTRIO_CLIENT_SECRET; else process.env.HONTRIO_CLIENT_SECRET = vechi.s;
    if (vechi.r === undefined) delete process.env.HONTRIO_REDIRECT_URIS; else process.env.HONTRIO_REDIRECT_URIS = vechi.r;
  }
});

test("⚠ adresele de intoarcere din mediu: numai https, si http doar pe localhost in afara productiei", () => {
  assert.ok(adresaDeIntoarcereAcceptabila("https://hontrio.com/api/integrations/edinio/callback", true));
  assert.ok(adresaDeIntoarcereAcceptabila("http://localhost:3002/api/integrations/edinio/callback", false));
  assert.equal(adresaDeIntoarcereAcceptabila("http://localhost:3002/cb", true), false, "localhost pe productie");
  assert.equal(adresaDeIntoarcereAcceptabila("http://hontrio.com/cb", false), false);
  assert.equal(adresaDeIntoarcereAcceptabila("https://hontrio.com/cb#x", true), false, "fragment");
  assert.equal(adresaDeIntoarcereAcceptabila("https://u:p@hontrio.com/cb", true), false, "credentiale in adresa");
  assert.equal(adresaDeIntoarcereAcceptabila("javascript:alert(1)", false), false);
  assert.equal(adresaDeIntoarcereAcceptabila("nu e adresa", false), false);
});

test("secretul clientului: numai cel din mediu, si numai daca e destul de lung", () => {
  const vechi = process.env.HONTRIO_CLIENT_SECRET;
  try {
    process.env.HONTRIO_CLIENT_SECRET = "s".repeat(40);
    assert.ok(secretulEsteCorect("s".repeat(40)));
    assert.equal(secretulEsteCorect("s".repeat(39)), false);
    assert.equal(secretulEsteCorect(""), false);
    assert.equal(secretulEsteCorect(null), false);
    process.env.HONTRIO_CLIENT_SECRET = "scurt";
    assert.equal(secretulEsteCorect("scurt"), false, "un secret scurt in mediu tine legatura oprita");
  } finally {
    if (vechi === undefined) delete process.env.HONTRIO_CLIENT_SECRET; else process.env.HONTRIO_CLIENT_SECRET = vechi;
  }
});

test("rutele Hontrio ocolesc poarta MFA, fara sa deschida si altele", () => {
  assert.equal(apiFaraPoarta("/api/hontrio/v1/produse"), true);
  assert.equal(apiFaraPoarta("/api/hontrio/v1/token"), true);
  assert.equal(apiFaraPoarta("/api/hontriox/ceva"), false);
  assert.equal(apiFaraPoarta("/api/products/export"), false);
});
