import { test } from "node:test";
import assert from "node:assert/strict";
import { getWootToken, uitaTokenurileWoot } from "@/lib/woot";
import { getOblioToken, uitaTokenurileOblio } from "@/lib/oblio";
import { loadSamedayAccount, uitaTokenurileSameday } from "@/lib/sameday/client";
import { tarife, uitaTokenurile as uitaTokenurileUps, type UpsConfig } from "@/lib/ups/client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *   CHEIA UNUI TOKEN PASTRAT TREBUIE SA CONTINA SECRETUL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Regula e scrisa in `cheie-token.ts` si a fost aplicata pe 09.09.2026 la patru
 * clienti: FAN, Colete, FedEx si Cargus. Patru au fost SARITI, si nicio proba nu
 * spunea nimic despre ei: Sameday, UPS, Woot si Oblio isi cheiau tokenul dupa
 * partea PUBLICA a credentialei si atat.
 *
 * ⚠ CE COSTA, si de ce nu e doar igiena:
 *
 *  1. „Testeaza conexiunea" raspunde VERDE peste o credentiala invalida. Dupa un
 *     login reusit, orice cerere cu aceeasi parte publica si un secret GRESIT
 *     primea tokenul valid din cache si trecea fara sa atinga furnizorul.
 *     Comerciantul isi roteste secretul, il lipeste gresit, ecranul confirma, si
 *     defectul iese abia la expirarea tokenului, adica la primul AWB.
 *
 *  2. Harta e a MODULULUI, deci comuna tuturor magazinelor din acelasi proces.
 *     Cine stia doar partea publica primea tokenul ALTCUIVA. La Sameday asta era
 *     cel mai lat: `loadSamedayAccountAction` lua username-ul din formular, iar
 *     raspunsul contine punctele de ridicare ale contului, cu adrese si persoane
 *     de contact.
 *
 * ⚠ MUTANTUL E PE APELANT, NU PE CABLARE. Fiecare proba incalzeste intai cache-ul
 * cu credentiala BUNA, apoi cheama A DOUA OARA cu aceeasi parte publica si ALT
 * secret. Doua lucruri trebuie sa se intample, si se cer amandoua:
 *   - cererea sa fie REFUZATA (nu a primit tokenul altcuiva), si
 *   - sa se fi ATINS reteaua din nou (nu a venit din cache).
 * A doua afirmatie e cea care chiar prinde defectul: cu cheia veche, cererea
 * gresita trecea fara niciun apel, deci prima afirmatie singura ar fi fost
 * multumita de orice.
 */

const BUN = "SECRET-BUN";
const GRESIT = "SECRET-GRESIT";

/** Inlocuieste `fetch` si tine jurnalul adreselor cerute. */
function prinde(raspunde: (url: string, init?: RequestInit) => Response | null) {
  const jurnal: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    jurnal.push(u);
    return raspunde(u, init) ?? new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { jurnal, gata: () => { globalThis.fetch = original; } };
}

/** Cate cereri din jurnal au atins calea de autentificare. */
function autentificari(jurnal: string[], bucata: string): number {
  return jurnal.filter((u) => u.includes(bucata)).length;
}

// ─── Woot ─────────────────────────────────────────────────────────────────────

test("⚠ Woot: un `secret_key` gresit NU primeste tokenul pastrat pentru cel bun", async () => {
  uitaTokenurileWoot();
  const { jurnal, gata } = prinde((u, init) => {
    if (!u.includes("/account/authorize")) return null;
    const corp = JSON.parse(String(init?.body ?? "{}")) as { secret_key?: string };
    return corp.secret_key === BUN
      ? new Response(JSON.stringify({ success: true, token: "TOKEN", expire: 86400 }), { status: 200 })
      : new Response(JSON.stringify({ success: false }), { status: 401 });
  });
  try {
    await getWootToken("CHEIA-PUBLICA", BUN);
    const dupaCald = autentificari(jurnal, "/account/authorize");
    assert.equal(dupaCald, 1, "prima conectare trebuie sa atinga Woot exact o data");

    await assert.rejects(
      () => getWootToken("CHEIA-PUBLICA", GRESIT),
      /Autentificare Woot/,
      "un secret gresit a fost acceptat pe cache cald",
    );
    assert.ok(
      autentificari(jurnal, "/account/authorize") > dupaCald,
      "cererea cu secret gresit nici n-a atins Woot: a primit tokenul din cache",
    );
  } finally { gata(); uitaTokenurileWoot(); }
});

// ─── Oblio ────────────────────────────────────────────────────────────────────

test("⚠ Oblio: un client secret gresit NU primeste tokenul pastrat pentru cel bun", async () => {
  uitaTokenurileOblio();
  const { jurnal, gata } = prinde((u, init) => {
    if (!u.includes("/api/authorize/token")) return null;
    const corp = JSON.parse(String(init?.body ?? "{}")) as { client_secret?: string };
    return corp.client_secret === BUN
      ? new Response(JSON.stringify({
          access_token: "TOKEN", expires_in: 3600, token_type: "Bearer",
          request_time: Math.floor(Date.now() / 1000),
        }), { status: 200 })
      : new Response(JSON.stringify({ statusMessage: "Autentificare Oblio esuata" }), { status: 401 });
  });
  try {
    await getOblioToken("cont@firma.ro", BUN);
    const dupaCald = autentificari(jurnal, "/api/authorize/token");
    assert.equal(dupaCald, 1, "prima conectare trebuie sa atinga Oblio exact o data");

    await assert.rejects(
      () => getOblioToken("cont@firma.ro", GRESIT),
      /Oblio/,
      "un client secret gresit a fost acceptat pe cache cald",
    );
    assert.ok(
      autentificari(jurnal, "/api/authorize/token") > dupaCald,
      "cererea cu secret gresit nici n-a atins Oblio: a primit tokenul din cache",
    );
  } finally { gata(); uitaTokenurileOblio(); }
});

// ─── Sameday ──────────────────────────────────────────────────────────────────

test("⚠ Sameday: o parola gresita nu deschide contul altui magazin", async () => {
  uitaTokenurileSameday();
  const { jurnal, gata } = prinde((u, init) => {
    if (u.includes("/api/authenticate")) {
      const antete = new Headers(init?.headers as HeadersInit | undefined);
      return antete.get("X-AUTH-PASSWORD") === BUN
        ? new Response(JSON.stringify({ token: "TOKEN", expire_at: "2030-01-01 10:00" }), { status: 200 })
        : new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
    if (u.includes("/api/client/")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    return null;
  });
  try {
    // Magazinul B isi conecteaza contul lui, cu parola lui. Cache-ul se incalzeste.
    const alLuiB = await loadSamedayAccount("contul-lui-B", BUN, false);
    assert.ok(!("error" in alLuiB), `conectarea buna a esuat: ${JSON.stringify(alLuiB)}`);
    const dupaCald = autentificari(jurnal, "/api/authenticate");
    assert.equal(dupaCald, 1, "prima conectare trebuie sa atinga Sameday exact o data");

    /*
     * ⚠ MUTANTUL: magazinul A trimite username-ul lui B si orice parola. Cu cheia
     * `${username}::${sandbox}` primea tokenul lui B si, cu el, punctele lui de
     * ridicare. `loadSamedayAccount` inghite exceptiile si le intoarce ca `{ error }`.
     */
    const furat = await loadSamedayAccount("contul-lui-B", "ORICE-PAROLA", false);
    assert.ok("error" in furat, "un username strain cu parola gresita a primit datele contului");
    assert.ok(
      autentificari(jurnal, "/api/authenticate") > dupaCald,
      "cererea cu parola gresita nici n-a atins Sameday: a nimerit intrarea lui B din cache",
    );
  } finally { gata(); uitaTokenurileSameday(); }
});

// ─── UPS ──────────────────────────────────────────────────────────────────────

const CONFIG_UPS: UpsConfig = {
  enabled: true,
  client_id: "CLIENT-ID",
  client_secret: BUN,
  account_number: "A1B2C3",
};

test("⚠ UPS: un Client Secret gresit NU primeste tokenul pastrat pentru cel bun", async () => {
  uitaTokenurileUps();
  const { jurnal, gata } = prinde((u, init) => {
    if (u.includes("/security/v1/oauth/token")) {
      const antete = new Headers(init?.headers as HeadersInit | undefined);
      const acreditare = (antete.get("Authorization") ?? "").replace(/^Basic\s+/, "");
      const secret = Buffer.from(acreditare, "base64").toString("utf8").split(":")[1] ?? "";
      return secret === BUN
        ? new Response(JSON.stringify({ access_token: "TOKEN", expires_in: "3600" }), { status: 200 })
        : new Response(
            JSON.stringify({ response: { errors: [{ code: "250003", message: "Invalid token" }] } }),
            { status: 401 },
          );
    }
    if (u.includes("/rating/")) {
      return new Response(JSON.stringify({ RateResponse: { RatedShipment: [] } }), { status: 200 });
    }
    return null;
  });
  try {
    await tarife(CONFIG_UPS, {}, "Shop");
    const dupaCald = autentificari(jurnal, "oauth/token");
    assert.equal(dupaCald, 1, "prima cotare trebuie sa ceara un token exact o data");

    await assert.rejects(
      () => tarife({ ...CONFIG_UPS, client_secret: GRESIT }, {}, "Shop"),
      "un Client Secret gresit a fost acceptat pe cache cald",
    );
    assert.ok(
      autentificari(jurnal, "oauth/token") > dupaCald,
      "cererea cu secret gresit nici n-a atins UPS: a primit tokenul din cache",
    );
  } finally { gata(); uitaTokenurileUps(); }
});
