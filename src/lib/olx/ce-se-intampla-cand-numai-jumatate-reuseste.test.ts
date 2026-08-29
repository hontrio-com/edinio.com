import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { processQueueItem, type OlxSyncContext, type OlxQueueItem } from "./sync";
import { ensureMerchantToken } from "./oauth";
import type { OlxConfig } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   CE SE INTAMPLA CAND NUMAI JUMATATE REUSESTE (31.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ PROBELE DE PANA ACUM CITEAU TEXTUL CODULUI. Ele spun ca SCRIE `if (!activare.ok)`; nu spun
   ce se intampla cand chiar pica. Iar toata integrarea asta se strica exact acolo unde doua
   lucruri trebuie sa se intample impreuna si numai unul reuseste.

   Aici se cheama functiile ADEVARATE, cu o baza falsa si cu `fetch` inlocuit. Nicio retea.

   Sora lui `proba-care-scaneaza-sursa-nu-vede-forma`: acolo scanarea confirma ca scrie
   `l.barcode`, nu ca `l.barcode` are ce citi. Aici e acelasi pas, pe stari in loc de campuri.
*/

/* ── O baza falsa, cat sa raspunda la lantul lui supabase-js ──────────────── */

interface Cerere {
  tabela: string;
  fel: "select" | "update" | "upsert" | "insert" | "";
  corp?: unknown;
  filtre: [string, unknown][];
}
type Raspuns = { data?: unknown; error?: { message: string } | null };

function faceDb(
  raspunde: (c: Cerere) => Raspuns,
  rpcRaspunde: (nume: string, args: unknown) => Raspuns = () => ({ data: null, error: null }),
) {
  const cereri: Cerere[] = [];
  const rpcuri: { nume: string; args: unknown }[] = [];

  const builder = (c: Cerere) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const b: any = {
      select: () => { if (!c.fel) c.fel = "select"; return b; },
      update: (p: unknown) => { c.fel = "update"; c.corp = p; return b; },
      upsert: (p: unknown) => { c.fel = "upsert"; c.corp = p; return b; },
      insert: (p: unknown) => { c.fel = "insert"; c.corp = p; return b; },
      eq: (k: string, v: unknown) => { c.filtre.push([k, v]); return b; },
      in: (k: string, v: unknown) => { c.filtre.push([k, v]); return b; },
      not: () => b,
      is: () => b,
      or: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(raspunde(c)),
      single: () => Promise.resolve(raspunde(c)),
      then: (bun: (v: Raspuns) => unknown, rau?: (e: unknown) => unknown) =>
        Promise.resolve(raspunde(c)).then(bun, rau),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return b;
  };

  const db = {
    from: (tabela: string) => {
      const c: Cerere = { tabela, fel: "", filtre: [] };
      cereri.push(c);
      return builder(c);
    },
    rpc: (nume: string, args: unknown) => {
      rpcuri.push({ nume, args });
      return Promise.resolve(rpcRaspunde(nume, args));
    },
  };
  return { db: db as unknown as SupabaseClient<Database>, cereri, rpcuri };
}

const CTX: OlxSyncContext = {
  token: "acces-de-proba",
  config: {},
  business: { slug: "magazin", custom_domain: null, store_name: "Magazin", business_name: "SRL" },
  gpsr: null,
};

const PID = "11111111-2222-3333-4444-555555555555";
const BID = "99999999-8888-7777-6666-555555555555";
const LUCRARE: OlxQueueItem = {
  id: "coada-1", business_id: BID, product_id: null, offer_id: PID,
  op: "delete", attempts: 0, created_at: new Date().toISOString(),
};

/* ── Retragerea, cand stergerea produsului n-a intrat ────────────────────── */

test("⚠ produsul inca exista: retragerea se AMANA, si lucrarea ramane in coada", async () => {
  /*
   * Intentia se scrie INAINTE de `DELETE`, dinadins. Daca stergerea pica, cronul nu are voie nici
   * sa stearga anuntul, nici sa arunce lucrarea: `ok` ar goli coada, si atunci retragerea s-ar
   * pierde tocmai in fereastra in care `DELETE`-ul reuseste o clipa mai tarziu.
   */
  const { db, cereri } = faceDb((c) =>
    c.tabela === "products" ? { data: { id: PID }, error: null } : { data: null, error: null });

  const r = await processQueueItem(db, CTX, LUCRARE, null);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.permanent, false, "nu e un refuz: e o stare care inca nu s-a asezat");
  assert.equal(r.ok === false && r.asteptare, 5 * 60_000);
  /* ⚠ Si NU s-a atins randul de anunt: nimic nu s-a sters, nicaieri. */
  assert.deepEqual(cereri.map((c) => `${c.fel} ${c.tabela}`), ["select products"]);
});

test("⚠ produsul chiar a disparut: se merge mai departe", async () => {
  const { db, cereri } = faceDb(() => ({ data: null, error: null }));
  const r = await processQueueItem(db, CTX, LUCRARE, null);
  /* Fara rand de anunt, `removeRemote` iese curat — si fara sa atinga OLX. */
  assert.deepEqual(r, { ok: true, action: "skipped" });
  assert.deepEqual(cereri.map((c) => `${c.fel} ${c.tabela}`), ["select products", "select olx_adverts"]);
});

test("⚠ o citire picata NU inseamna „produsul nu mai e”", async () => {
  /*
   * ⚠ Aceeasi regula ca peste tot: `null` are voie sa insemne un singur lucru — „am putut intreba,
   * si chiar nu e". Inghitita, eroarea ar fi facut din fiecare pana de baza o stergere de anunt.
   */
  const { db, cereri } = faceDb((c) =>
    c.tabela === "products" ? { data: null, error: { message: "statement timeout" } } : { data: null, error: null });

  const r = await processQueueItem(db, CTX, LUCRARE, null);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.permanent, false);
  assert.match(r.ok === false ? r.error : "", /nu am putut verifica/i);
  assert.deepEqual(cereri.map((c) => c.tabela), ["products"], "nu s-a atins nimic altceva");
});

/* ── Sesiunea, cand jumatate din rotatie reuseste ────────────────────────── */

const EXPIRAT: OlxConfig = {
  connected: true,
  access_token: "acces-vechi",
  refresh_token: "R1",
  access_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
  token_updated_at: "2026-08-31T08:00:00.000Z",
};

function stubFetch(raspuns: { status: number; corp: unknown }) {
  const vechi = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: raspuns.status >= 200 && raspuns.status < 300,
    status: raspuns.status,
    json: async () => raspuns.corp,
    text: async () => JSON.stringify(raspuns.corp),
    headers: new Headers(),
  })) as unknown as typeof fetch;
  return () => { globalThis.fetch = vechi; };
}

test("⚠ `invalid_grant` + martorul necitibil = eroare TRECATOARE, nu „reconecteaza”", async () => {
  /*
   * ═══ O CLIPA PROASTA A BAZEI STINGEA UN CONT VIU ═══
   *
   *     doua fire pornesc cu R1; A castiga si scrie R2
   *     B primeste `invalid_grant`, pe drept
   *     B reciteste martorul -> baza da timeout
   *     -> pana azi, `null` se citea ca „nimeni n-a rotit", si B scria `needs_reconnect`
   *        peste conexiunea SANATOASA a lui A
   */
  const inapoi = stubFetch({ status: 400, corp: { error: "invalid_grant" } });
  try {
    const { db, rpcuri } = faceDb(() => ({ data: null, error: { message: "timeout la citire" } }));
    const r = await ensureMerchantToken(db, BID, EXPIRAT);
    assert.ok("error" in r);
    assert.equal("needsReconnect" in r && r.needsReconnect, false,
      "fara martor nu se declara sesiunea moarta");
    /* ⚠ Si NU s-a scris nimic: niciun petic cu `needs_reconnect`. */
    assert.deepEqual(rpcuri.map((x) => x.nume), []);
  } finally { inapoi(); }
});

test("⚠ `invalid_grant` cu martorul citit si nemiscat = sesiunea chiar a murit", async () => {
  /* ⚠ Contraproba celei de mai sus: cand martorul SE poate citi si n-a fost miscat de nimeni,
     refresh tokenul chiar nu mai e bun, si atunci vestea proasta se da. */
  const inapoi = stubFetch({ status: 400, corp: { error: "invalid_grant" } });
  try {
    const { db, rpcuri } = faceDb(() => ({
      data: { olx_config: { ...EXPIRAT } }, error: null,
    }));
    const r = await ensureMerchantToken(db, BID, EXPIRAT);
    assert.ok("error" in r);
    assert.equal("needsReconnect" in r && r.needsReconnect, true);
    assert.deepEqual(rpcuri.map((x) => x.nume), ["jsonb_merge_config"]);
    assert.deepEqual((rpcuri[0].args as { p_patch: unknown }).p_patch, { needs_reconnect: true });
  } finally { inapoi(); }
});

test("⚠ un CAS picat NU coboara pe o scriere fara conditie", async () => {
  /*
   * `const scris = eRotatie ? await persistConfig(…) : true;` desfacea tocmai paza pe care CAS-ul
   * o pune. Acum, daca RPC-ul de rotatie nu se poate rula, NU se scrie nimic pe alta cale — iar
   * fiindca refresh tokenul chiar s-a rotit, nu se raporteaza nici sanatate.
   */
  const inapoi = stubFetch({
    status: 200,
    corp: { access_token: "A2", refresh_token: "R2", expires_in: 3600 },
  });
  try {
    const { db, rpcuri } = faceDb(
      () => ({ data: null, error: null }),
      (nume) => nume === "olx_roteste_tokenul"
        ? { data: null, error: { message: "lock timeout" } }
        : { data: null, error: null },
    );
    const r = await ensureMerchantToken(db, BID, EXPIRAT);
    assert.ok("error" in r, "un refresh token rotit si nescris nu e sanatate");
    assert.equal("needsReconnect" in r && r.needsReconnect, false, "se reia, nu se reconecteaza");
    /* ⚠ AICI E TOT ROSTUL: nicio scriere de rezerva dupa CAS-ul picat. */
    assert.deepEqual(rpcuri.map((x) => x.nume), ["olx_roteste_tokenul"],
      "`jsonb_merge_config` dupa un CAS picat inseamna scriere fara conditie");
  } finally { inapoi(); }
});

test("⚠ cine pierde CAS-ul ia tokenul castigatorului, nu scrie peste el", async () => {
  const inapoi = stubFetch({
    status: 200,
    corp: { access_token: "A2", refresh_token: "R2", expires_in: 3600 },
  });
  try {
    const alLui: OlxConfig = {
      connected: true, access_token: "A3", refresh_token: "R3",
      access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      token_updated_at: "2026-08-31T09:00:00.000Z",
    };
    const { db, rpcuri } = faceDb(
      () => ({ data: { olx_config: alLui }, error: null }),
      (nume) => nume === "olx_roteste_tokenul" ? { data: false, error: null } : { data: null, error: null },
    );
    const r = await ensureMerchantToken(db, BID, EXPIRAT);
    assert.ok("token" in r);
    assert.equal("token" in r && r.token, "A3", "se ia ce a scris castigatorul");
    assert.deepEqual(rpcuri.map((x) => x.nume), ["olx_roteste_tokenul"], "nu se mai scrie nimic");
  } finally { inapoi(); }
});

test("⚠ rotatia reusita duce mai departe tokenul NOU", async () => {
  /* Contraproba drumului bun: fara ea, toate cele de sus ar trece si cu o functie care nu merge. */
  const inapoi = stubFetch({
    status: 200,
    corp: { access_token: "A2", refresh_token: "R2", expires_in: 3600 },
  });
  try {
    const { db, rpcuri } = faceDb(
      () => ({ data: null, error: null }),
      () => ({ data: true, error: null }),
    );
    const r = await ensureMerchantToken(db, BID, EXPIRAT);
    assert.ok("token" in r);
    assert.equal("token" in r && r.token, "A2");
    assert.equal("config" in r && r.config.refresh_token, "R2");
    assert.deepEqual(rpcuri.map((x) => x.nume), ["olx_roteste_tokenul"]);
    const args = rpcuri[0].args as { p_vazut: string | null };
    assert.equal(args.p_vazut, "2026-08-31T08:00:00.000Z", "CAS-ul compara martorul VAZUT de noi");
  } finally { inapoi(); }
});
