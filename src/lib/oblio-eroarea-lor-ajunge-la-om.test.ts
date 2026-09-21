import test from "node:test";
import assert from "node:assert/strict";

import { getOblioToken, uitaTokenurileOblio } from "./oblio";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CE SPUNE OBLIO AJUNGE LA COMERCIANT                            (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DINTR-O SESIZARE ADEVARATA. Un magazin a incercat sa conecteze Oblio si a
 * primit pe ecran „Autentificarea a esuat HTTP 400" — un numar. Masurat apoi in
 * baza: in campul de secret avea noua semne, in timp ce celelalte doua magazine
 * cu Oblio conectat au patruzeci. Pusese parola contului in locul tokenului.
 *
 * Raspunsul lui Oblio continea chiar explicatia, si noi o aruncam: la
 * `/api/authorize/token` erorile NU vin ca `{ statusMessage }`, ca in restul
 * API-ului lor, ci ca `{ error, error_description }`. Cautand doar
 * `statusMessage`, cadeam mereu pe ramura de rezerva cu numarul.
 *
 * ⚠ Masurat pe capatul lor adevarat, cu date false: si `application/json`, si
 * `application/x-www-form-urlencoded`, cu si fara `grant_type`, primesc TOATE
 * `400 {"error":"invalid_client","error_description":"The client credentials
 * are invalid"}`. Deci forma cererii nu e cauza, desi documentatia lor si
 * modulul lor de WooCommerce folosesc form-urlencoded.
 */

/** Pune in locul retelei un raspuns scris de noi, si il da inapoi pe cel adevarat. */
function raspundeCu(status: number, corp: unknown): () => void {
  const adevaratul = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(corp), {
    status,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;
  return () => { globalThis.fetch = adevaratul; };
}

async function mesajul(status: number, corp: unknown): Promise<string> {
  uitaTokenurileOblio();
  const inapoi = raspundeCu(status, corp);
  try {
    await getOblioToken("om@example.com", "secret-de-proba");
    return "(n-a aruncat deloc)";
  } catch (e) {
    return (e as Error).message;
  } finally {
    inapoi();
  }
}

test("⚠⚠ „invalid_client” ii spune omului UNDE e tokenul, nu un numar", async () => {
  /*
   * Asta e chiar sesizarea. Mesajul trebuie sa lamureasca cele doua lucruri pe
   * care le incurca toata lumea: ce email, si ca secretul NU e parola.
   */
  const m = await mesajul(400, { error: "invalid_client", error_description: "The client credentials are invalid" });
  assert.ok(!m.includes("HTTP 400"), `mesajul e tot un numar: ${m}`);
  assert.match(m, /token/i, "nu spune ce anume trebuie pus");
  assert.match(m, /Date cont/i, "nu spune de unde se ia");
  assert.match(m, /parol/i, "nu spune ca NU e parola");
});

test("⚠ secretul NU intra niciodata in mesaj", async () => {
  /*
   * Mesajul ajunge pe ecran si in `error_logs`. Un secret scapat acolo ramane
   * scris si dupa ce omul il schimba.
   */
  const m = await mesajul(400, { error: "invalid_client", error_description: "The client credentials are invalid" });
  assert.ok(!m.includes("secret-de-proba"), "secretul a ajuns in mesaj");
  const n = await mesajul(500, { statusMessage: "Eroare interna" });
  assert.ok(!n.includes("secret-de-proba"), "secretul a ajuns in mesaj");
});

test("⚠ `statusMessage` ramane prima alegere — asa vorbeste restul API-ului lor", async () => {
  assert.equal(await mesajul(403, { statusMessage: "Abonamentul nu permite acces API" }),
    "Abonamentul nu permite acces API");
});

test("⚠ `error_description` se foloseste cand nu e `statusMessage`", async () => {
  /* Altfel se pierdea orice alt fel de eroare de autentificare a lor. */
  assert.equal(await mesajul(400, { error: "invalid_request", error_description: "Missing client_id" }),
    "Missing client_id");
});

test("un raspuns fara nimic de citit cade tot pe numar, si e in regula", async () => {
  /* Aici numarul e singurul lucru adevarat pe care il avem. */
  assert.match(await mesajul(502, {}), /HTTP 502/);
});

test("⚠ un token bun se pastreaza, ca pana acum", async () => {
  uitaTokenurileOblio();
  const acum = Math.floor(Date.now() / 1000);
  const inapoi = raspundeCu(200, {
    access_token: "abc123", expires_in: "3600", token_type: "Bearer", request_time: String(acum),
  });
  try {
    assert.equal(await getOblioToken("om@example.com", "secret-de-proba"), "abc123");
  } finally {
    inapoi();
    uitaTokenurileOblio();
  }
});
