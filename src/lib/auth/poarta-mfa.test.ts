import { strict as assert } from "node:assert";
import { test, describe, before } from "node:test";

/*
  ═══ POARTA MFA SE UITA DOAR LA COOKIE-UL NOSTRU DE SESIUNE (10.11.2026) ═══

  Gasit la proba de dinaintea lansarii editorului: pe `localhost` statea si cookie-ul altei aplicatii facute cu Supabase
  (`sb-<alt-proiect>-auth-token`). Poarta il lua drept sesiune, nu-i gasea `sub`-ul in `users_profile` si refuza: inscrierea
  a primit 403, fara niciun mesaj pe ecran. Acelasi lucru se poate intampla pe domeniul propriu al unui magazin, cu un
  cookie ramas de la site-ul de dinainte: atunci 403 il primea comanda din cos a unui cumparator anonim.

  Proba ruleaza CHIAR poarta, cu `NextRequest` adevarate. Cheia de serviciu lipseste dinadins: profilul nu se poate citi,
  deci orice sesiune ajunsa pana la verificare e refuzata (fara profil = neconfirmat). Asa se vede limpede cine trece de
  primul pas si cine nu, fara nicio baza.
*/

const ADRESA = "https://proiectulnostru.supabase.co";

let poartaMfaActiuneServer: (typeof import("./poarta-mfa"))["poartaMfaActiuneServer"];
let poartaMfaApi: (typeof import("./poarta-mfa"))["poartaMfaApi"];
let numeleCookieuluiDeSesiune: (typeof import("./poarta-mfa"))["numeleCookieuluiDeSesiune"];
let NextRequest: (typeof import("next/server"))["NextRequest"];

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ADRESA;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  ({ poartaMfaActiuneServer, poartaMfaApi, numeleCookieuluiDeSesiune } = await import("./poarta-mfa"));
  ({ NextRequest } = await import("next/server"));
});

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Valoarea unui cookie de sesiune in formatul @supabase/ssr (`base64-` + JSON-ul sesiunii). */
function sesiune(sub: string): string {
  const jwt = `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ sub, session_id: `sesiune-${sub}` }))}.semnatura`;
  return `base64-${b64url(JSON.stringify({ access_token: jwt }))}`;
}

function actiune(cookieuri: Record<string, string>) {
  const cookie = Object.entries(cookieuri).map(([n, v]) => `${n}=${v}`).join("; ");
  return new NextRequest("https://magazin-client.ro/cos", {
    method: "POST",
    headers: { cookie, "next-action": "7f00aa", accept: "text/x-component" },
  });
}

describe("numele cookie-ului de sesiune vine din adresa proiectului", () => {
  test("doar `sb-<ref>-auth-token` si bucatile lui; nu alt proiect, nu cookie-ul PKCE", () => {
    const nume = numeleCookieuluiDeSesiune(ADRESA);
    for (const bun of ["sb-proiectulnostru-auth-token", "sb-proiectulnostru-auth-token.0", "sb-proiectulnostru-auth-token.12"]) {
      assert.ok(nume.test(bun), bun);
    }
    for (const strain of [
      "sb-altproiect-auth-token",
      "sb-altproiect-auth-token.0",
      "sb-proiectulnostru-auth-token-code-verifier",
      "sb-proiectulnostru-auth-token.x",
      "xsb-proiectulnostru-auth-token",
    ]) {
      assert.ok(!nume.test(strain), strain);
    }
  });

  test("fara adresa (sau cu una stricata) ramane forma larga de dinainte, nu o poarta oarba", () => {
    const verifica = (nume: RegExp, eticheta: string) => {
      assert.ok(nume.test("sb-oricare-auth-token"), eticheta);
      assert.ok(!nume.test("sb-oricare-auth-token-code-verifier"), eticheta);
    };
    verifica(numeleCookieuluiDeSesiune(""), "adresa goala");
    verifica(numeleCookieuluiDeSesiune("nu-e-o-adresa"), "adresa stricata");
    // Fara argument, adresa vine din mediu; lipsa ei da tot forma larga.
    const salvata = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      verifica(numeleCookieuluiDeSesiune(), "fara variabila de mediu");
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = salvata;
    }
    assert.ok(!numeleCookieuluiDeSesiune().test("sb-oricare-auth-token"), "cu mediul pus la loc, iar doar al nostru");
  });
});

describe("poarta trece pe langa cookie-ul altei aplicatii, dar il opreste pe al nostru", () => {
  test("⚠⚠ DOAR un cookie strain: actiunea de server trece (comanda cumparatorului anonim nu mai primeste 403)", async () => {
    const r = await poartaMfaActiuneServer(actiune({ "sb-altproiect-auth-token": sesiune("om-de-pe-alt-site") }));
    assert.equal(r, null);
  });

  test("si pe /api: cookie-ul strain nu e o sesiune", async () => {
    const cerere = new NextRequest("https://www.edinio.com/api/orders", {
      headers: { cookie: `sb-altproiect-auth-token=${sesiune("om-de-pe-alt-site")}` },
    });
    const r = await poartaMfaApi(cerere);
    assert.notEqual(r.status, 403);
  });

  test("cookie-ul NOSTRU cu o sesiune neconfirmata e oprit, ca inainte (si cand e taiat in bucati)", async () => {
    const intreg = await poartaMfaActiuneServer(actiune({ "sb-proiectulnostru-auth-token": sesiune("cont-necunoscut") }));
    assert.equal(intreg?.status, 403);

    const valoare = sesiune("cont-necunoscut");
    const jumatate = Math.ceil(valoare.length / 2);
    const bucati = await poartaMfaActiuneServer(actiune({
      "sb-proiectulnostru-auth-token.1": valoare.slice(jumatate),
      "sb-proiectulnostru-auth-token.0": valoare.slice(0, jumatate),
    }));
    assert.equal(bucati?.status, 403);
  });

  test("cu amandoua cookie-urile, poarta il citeste pe al nostru si il opreste", async () => {
    const r = await poartaMfaActiuneServer(actiune({
      "sb-altproiect-auth-token": sesiune("om-de-pe-alt-site"),
      "sb-proiectulnostru-auth-token": sesiune("cont-necunoscut"),
    }));
    assert.equal(r?.status, 403);
  });
});
