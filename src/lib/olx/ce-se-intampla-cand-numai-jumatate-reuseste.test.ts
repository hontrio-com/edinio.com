import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { processQueueItem, type OlxSyncContext, type OlxQueueItem } from "./sync";
import { ensureMerchantToken } from "./oauth";
import { enqueueOlxRetragereInainteDeStergere } from "./queue";
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

/**
 * Raspunsuri DEOSEBITE, in ordinea cererilor.
 *
 * ⚠ Reluarile idempotente cer chiar asta: comanda raspunde `400`, iar intrebarea de dupa ea
 * („cum e de fapt acolo?") raspunde altceva. Un stub cu un singur raspuns n-ar putea deosebi.
 */
function stubFetchPeRand(raspunsuri: { status: number; corp: unknown }[]) {
  const vechi = globalThis.fetch;
  const cereri: string[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string) => {
    cereri.push(String(url));
    const r = raspunsuri[Math.min(i++, raspunsuri.length - 1)];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.corp,
      text: async () => JSON.stringify(r.corp),
      headers: new Headers(),
    };
  }) as unknown as typeof fetch;
  return { inapoi: () => { globalThis.fetch = vechi; }, cereri };
}

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

test("⚠ produsul a disparut si n-a lasat niciun anunt: gata", async () => {
  /*
   * ⚠ Fara rand local se intreaba TOTUSI OLX, dupa `external_id`. Aici raspunsul e gol, deci chiar
   * n-a mai ramas nimic de retras.
   */
  const inapoi = stubFetch({ status: 200, corp: { data: [] } });
  try {
    const { db, cereri } = faceDb(() => ({ data: null, error: null }));
    const r = await processQueueItem(db, CTX, LUCRARE, null);
    assert.deepEqual(r, { ok: true, action: "skipped" });
    assert.deepEqual(cereri.map((c) => `${c.fel} ${c.tabela}`), ["select products", "select olx_adverts"]);
  } finally { inapoi(); }
});

test("⚠ produsul sters lasase un anunt viu la ei: se leaga si se retrage", async () => {
  /*
   * ═══ UN ANUNT PE CARE NU-L STIM E TOT AL NOSTRU (31.08.2026) ═══
   *
   *     `POST /adverts` reuseste ✅, scrierea in `olx_adverts` pica ❌
   *     reluarile pica si ele, lucrarea devine scrisoare moarta
   *     omul sterge produsul -> nimeni nu mai are de unde sti ca anuntul exista
   *     -> ramane la vanzare, si cumparatorii scriu pentru marfa care nu mai e
   *
   * Iar reconcilierea nu-l poate salva: vede un `external_id` care nu mai e un produs al
   * magazinului si il lasa in pace, dinadins.
   */
  const inapoi = stubFetch({ status: 200, corp: { data: [{ id: 4242, status: "active", external_id: PID }] } });
  try {
    const { db, cereri } = faceDb((c) => (c.tabela === "olx_adverts" && c.fel === "select"
      ? { data: null, error: null } : { data: null, error: null }));
    await processQueueItem(db, CTX, LUCRARE, null);
    /* ⚠ S-a SCRIS randul inainte de retragere: fara el n-ar ramane nicio urma daca pica ceva. */
    const legare = cereri.find((c) => c.tabela === "olx_adverts" && c.fel === "upsert");
    assert.ok(legare, "anuntul orfan trebuie legat inainte de a fi retras");
    assert.equal((legare!.corp as { olx_advert_id: number }).olx_advert_id, 4242);
  } finally { inapoi(); }
});

test("⚠ un `external_id` strain NU se atinge", async () => {
  /*
   * ⚠ DOI MARTORI, ca la adoptare. Daca ei ignora filtrul, raspunsul e primele anunturi ale
   * contului — si am sterge un anunt STRAIN, care n-are nicio treaba cu produsul sters.
   */
  const inapoi = stubFetch({
    status: 200,
    corp: { data: [{ id: 999, status: "active", external_id: "cu-totul-altceva" }] },
  });
  try {
    const { db, cereri } = faceDb(() => ({ data: null, error: null }));
    const r = await processQueueItem(db, CTX, LUCRARE, null);
    assert.deepEqual(r, { ok: true, action: "skipped" });
    assert.ok(!cereri.some((c) => c.fel === "upsert"), "nu se leaga un anunt care nu e al produsului");
  } finally { inapoi(); }
});

test("⚠ daca nu putem INTREBA OLX, nu incheiem retragerea", async () => {
  const inapoi = stubFetch({ status: 500, corp: { error: { detail: "picat" } } });
  try {
    const { db } = faceDb(() => ({ data: null, error: null }));
    const r = await processQueueItem(db, CTX, LUCRARE, null);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.permanent, false);
    assert.match(r.ok === false ? r.error : "", /nu am putut verifica/i);
  } finally { inapoi(); }
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
    /*
     * ⚠ AICI E TOT ROSTUL: nicio scriere de rezerva dupa CAS-ul picat. Se cere REGULA — numai
     * chemari de CAS — nu un numar fix: de cand se reincearca, sunt trei, si un numar fix ar fi
     * pedepsit tocmai reincercarea.
     */
    assert.ok(rpcuri.length > 0 && rpcuri.every((x) => x.nume === "olx_roteste_tokenul"),
      "`jsonb_merge_config` dupa un CAS picat inseamna scriere fara conditie");
    /*
     * ⚠ SI SE REINCEARCA, cu ACELASI martor. Un martor recitit intre incercari ar face din reluare
     * o scriere neconditionata — adica exact caderea fara CAS pe care am scos-o. Reluarea e sigura
     * tocmai fiindca peticul muta chiar `token_updated_at`: daca prima chemare a reusit si
     * raspunsul s-a pierdut, a doua vede martorul mutat si intoarce `false`.
     */
    assert.equal(rpcuri.length, 3, "un CAS picat se reincearca");
    const martori = new Set(rpcuri.map((x) => (x.args as { p_vazut: string | null }).p_vazut));
    assert.equal(martori.size, 1, "toate incercarile trimit acelasi martor");
    const petice = new Set(rpcuri.map((x) => JSON.stringify((x.args as { p_patch: unknown }).p_patch)));
    assert.equal(petice.size, 1, "toate incercarile trimit acelasi petic");
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

/* ── Reluarea unei comenzi care a intrat deja la ei ──────────────────────── */

const RAND_ACTIV = {
  id: "rand-1", olx_advert_id: 777, status: "active", offer_id: PID,
  sters_de_om_la: null, dezactivat_de: null,
};

/** O baza care raspunde cu un rand de anunt, si tine minte ce s-a scris pe el. */
function dbCuRand(rand: Record<string, unknown> = RAND_ACTIV) {
  const scrieri: Record<string, unknown>[] = [];
  const { db, cereri } = faceDb((c) => {
    if (c.tabela === "olx_adverts" && c.fel === "select") return { data: rand, error: null };
    if (c.tabela === "olx_adverts" && (c.fel === "update" || c.fel === "upsert")) {
      scrieri.push(c.corp as Record<string, unknown>);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
  return { db, cereri, scrieri };
}

test("⚠ RELUARE: OLX zice `400` fiindca a intrat deja — motivul se scrie, nu se pierde", async () => {
  /*
   * ═══ BLOCANTUL PE CARE AUDITUL L-A CERUT PROBAT ═══
   *
   *     stoc 5 -> 0, `deactivateRemote`
   *     OLX dezactiveaza ✅, scrierea lui `dezactivat_de` PICA ❌ -> se reia (bine)
   *     a doua incercare: `400`, fiindca la ei e deja stins
   *     -> pana azi se scria doar `last_status_at`, si `dezactivat_de` ramanea NULL
   *     -> sondarea vedea `removed_by_user` peste un rand care spunea `active`, fara motiv scris,
   *        si il punea pe seama OMULUI
   *     -> stocul se intoarce si anuntul nu se mai aprinde NICIODATA
   *
   * ⚠ Acum se INTREABA cum e la ei, si se scrie adevarul.
   */
  const stub = stubFetchPeRand([
    /* ⚠ Prima cerere e LISTA: apasarea omului e asupra produsului, deci se cauta intai toate
       anunturile lui. Abia dupa aceea vine comanda pe cel canonic. */
    { status: 200, corp: { data: [{ id: 777, status: "active", external_id: PID }] } },
    { status: 400, corp: { error: { detail: "Ad has to be active" } } },
    { status: 200, corp: { data: { id: 777, status: "removed_by_user" } } },
  ]);
  try {
    const { db, scrieri } = dbCuRand();
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "deactivate" }, null);
    assert.equal(r.ok, true, "reluarea unei comenzi deja intrate nu e un esec");
    assert.equal(scrieri.length, 1);
    assert.equal(scrieri[0].dezactivat_de, "om", "motivul intentiei curente se scrie");
    assert.equal(scrieri[0].status, "removed_by_user", "si starea vine de la EI, nu ghicita");
  } finally { stub.inapoi(); }
});

test("⚠ RELUARE: un anunt `limited` nu intra in bucla, si nu primeste motiv fals", async () => {
  /*
   * ⚠ `limited` inseamna cota gratuita epuizata: anuntul EXISTA dar nu se vede. Pentru intrebarea
   * „mai trebuie dezactivat?" raspunsul e nu — altfel fiecare produs fara stoc al unui magazin
   * ajuns peste cota ar fi cerut `deactivate`, ar fi luat `400`, si s-ar fi reluat pana la
   * scrisoare moarta, la FIECARE editare de pret.
   *
   * ⚠ Dar nici motiv de dezactivare nu primeste: n-a fost o dezactivare.
   */
  const stub = stubFetchPeRand([
    /* ⚠ Prima cerere e LISTA: apasarea omului e asupra produsului, deci se cauta intai toate
       anunturile lui. Abia dupa aceea vine comanda pe cel canonic. */
    { status: 200, corp: { data: [{ id: 777, status: "active", external_id: PID }] } },
    { status: 400, corp: { error: { detail: "Ad has to be active" } } },
    { status: 200, corp: { data: { id: 777, status: "limited" } } },
  ]);
  try {
    const { db, scrieri } = dbCuRand();
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "deactivate" }, null);
    assert.equal(r.ok, true, "nu e un esec: anuntul oricum nu e la vanzare");
    assert.equal(scrieri[0].status, "limited");
    assert.equal("dezactivat_de" in scrieri[0], false, "`limited` nu e o dezactivare");
  } finally { stub.inapoi(); }
});

test("⚠ RELUARE: `400` peste un anunt care e VIU nu se socoteste dezactivare", async () => {
  /* Refuzul lor venea din altceva, si anuntul e in continuare la vanzare. Nu se pretinde nimic. */
  const stub = stubFetchPeRand([
    /* ⚠ Prima cerere e LISTA: apasarea omului e asupra produsului, deci se cauta intai toate
       anunturile lui. Abia dupa aceea vine comanda pe cel canonic. */
    { status: 200, corp: { data: [{ id: 777, status: "active", external_id: PID }] } },
    { status: 400, corp: { error: { detail: "altceva" } } },
    { status: 200, corp: { data: { id: 777, status: "active" } } },
  ]);
  try {
    const { db, scrieri } = dbCuRand();
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "deactivate" }, null);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.permanent, false, "se reia");
    assert.deepEqual(scrieri, [], "nu se scrie o stare pe care ei n-au confirmat-o");
  } finally { stub.inapoi(); }
});

test("⚠ RELUARE: activarea deja intrata stinge motivul dezactivarii", async () => {
  /*
   * ⚠ IN OGLINDA. Un `400` care nu e despre pachete inseamna, cel mai des, „anuntul e deja activ" —
   * adica reluarea comenzii noastre dupa ce scrierea locala picase. Tratat ca refuz PERMANENT (asa
   * facea `classify`), elementul se stergea din coada si starea locala ramanea „stins" peste un
   * anunt VIU: produsul aparea in ecran ca dezactivat, si nimic nu-l mai indrepta.
   */
  const stub = stubFetchPeRand([
    { status: 400, corp: { error: { detail: "Ad has to be inactive" } } },
    { status: 200, corp: { data: { id: 777, status: "active" } } },
  ]);
  try {
    const { db, scrieri } = dbCuRand({ ...RAND_ACTIV, status: "removed_by_user", dezactivat_de: "stoc" });
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "activate" }, null);
    assert.equal(r.ok, true);
    assert.equal(scrieri[0].status, "active");
    assert.equal(scrieri[0].dezactivat_de, null, "motivul apartine dezactivarii care s-a incheiat");
  } finally { stub.inapoi(); }
});

test("⚠ RELUARE: daca nu putem citi starea lor, nu pretindem nimic", async () => {
  const stub = stubFetchPeRand([
    /* ⚠ Prima cerere e LISTA: apasarea omului e asupra produsului, deci se cauta intai toate
       anunturile lui. Abia dupa aceea vine comanda pe cel canonic. */
    { status: 200, corp: { data: [{ id: 777, status: "active", external_id: PID }] } },
    { status: 400, corp: { error: { detail: "Ad has to be active" } } },
    { status: 500, corp: { error: { detail: "picat" } } },
  ]);
  try {
    const { db, scrieri } = dbCuRand();
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "deactivate" }, null);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.permanent, false, "se reia");
    assert.deepEqual(scrieri, []);
  } finally { stub.inapoi(); }
});

test("⚠ RELUARE: un `404` la dezactivare inseamna tot ca omul l-a sters", async () => {
  /* A treia usa cu acelasi inteles. Sondarea si actualizarea o stiau; dezactivarea se reincerca. */
  const stub = stubFetchPeRand([
    /* ⚠ Prima cerere e LISTA: apasarea omului e asupra produsului, deci se cauta intai toate
       anunturile lui. Abia dupa aceea vine comanda pe cel canonic. */
    { status: 200, corp: { data: [{ id: 777, status: "active", external_id: PID }] } },
    { status: 404, corp: { error: { detail: "not found" } } },
  ]);
  try {
    const { db, scrieri } = dbCuRand();
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "deactivate" }, null);
    assert.equal(r.ok, true);
    assert.equal(scrieri[0].status, "sters_de_om");
    assert.ok(scrieri[0].sters_de_om_la, "piatra poarta clipa hotararii");
  } finally { stub.inapoi(); }
});

/* ── Anuntul pe care nu-l stim: cele trei drumuri catre el ───────────────── */

const CONFIG_CONECTAT = { connected: true, refresh_token: "R1", category_map: { Pantofi: { category_id: 9 } } };

test("⚠ intentia de retragere se scrie chiar cand NU exista niciun rand local", async () => {
  /*
   * ═══ LUCRATORUL STIE SA CAUTE ORFANUL, DAR NU E CHEMAT NICIODATA (01.09.2026) ═══
   *
   * Pana azi, `enqueueOlxRetragereInainteDeStergere` citea `olx_adverts` si punea lucrarea DOAR
   * pentru produsele care aveau rand. Suna cuminte — de ce sa ceri retragerea unui produs care
   * n-a fost niciodata publicat? — si e chiar gaura pe care lucratorul o repara:
   *
   *     `POST /adverts` reuseste ✅, scrierea in `olx_adverts` pica ❌
   *     omul sterge produsul
   *     -> filtrul nu gaseste niciun rand, deci NU pune nicio lucrare
   *     -> cautarea dupa `external_id` nu se intampla niciodata
   *
   * ⚠ Si proba trebuie sa arate ca NU se mai citeste `olx_adverts` deloc: o citire pastrata
   * „doar ca sa stim" ar putea oricand redeveni filtru.
   */
  const { db, cereri } = faceDb((c) => (c.tabela === "store_settings"
    ? { data: { olx_config: CONFIG_CONECTAT }, error: null }
    : { data: null, error: null }));

  const r = await enqueueOlxRetragereInainteDeStergere(BID, [PID, "alt-produs"], db);
  assert.deepEqual(r, { fel: "gata" });

  const scrisa = cereri.find((c) => c.tabela === "olx_sync_queue" && c.fel === "upsert");
  assert.ok(scrisa, "fara lucrare in coada, anuntul orfan nu mai are cine sa-l caute");
  const randuri = scrisa!.corp as { offer_id: string; op: string }[];
  assert.deepEqual(randuri.map((x) => x.offer_id).sort(), [PID, "alt-produs"].sort(),
    "se pune pentru TOATE produsele, nu doar pentru cele cu rand local");
  assert.ok(randuri.every((x) => x.op === "delete"));
  assert.ok(!cereri.some((c) => c.tabela === "olx_adverts"),
    "nu se mai citeste `olx_adverts`: era chiar filtrul care inghitea orfanul");
});

test("⚠ magazinul neconectat nu primeste lucrari de retragere", async () => {
  /* Contraproba: fara ea, proba de sus ar trece si cu o functie care pune lucrari oricui. */
  const { db, cereri } = faceDb((c) => (c.tabela === "store_settings"
    ? { data: { olx_config: {} }, error: null } : { data: null, error: null }));
  const r = await enqueueOlxRetragereInainteDeStergere(BID, [PID], db);
  assert.deepEqual(r, { fel: "gata" });
  assert.ok(!cereri.some((c) => c.tabela === "olx_sync_queue"));
});

test("⚠ configul necitit inseamna „nesigur”, deci produsul nu se sterge", async () => {
  const { db } = faceDb(() => ({ data: null, error: { message: "timeout" } }));
  const r = await enqueueOlxRetragereInainteDeStergere(BID, [PID], db);
  assert.equal(r.fel, "nesigur");
});

/** O baza care raspunde ALTFEL la a doua citire din aceeasi tabela. */
function dbPeRand(raspunsuri: Record<string, Raspuns[]>) {
  const numarate: Record<string, number> = {};
  const scrieri: { tabela: string; corp: unknown }[] = [];
  const { db, cereri } = faceDb((c) => {
    if (c.fel === "upsert" || c.fel === "update") scrieri.push({ tabela: c.tabela, corp: c.corp });
    const lista = raspunsuri[`${c.fel} ${c.tabela}`] ?? raspunsuri[c.tabela];
    if (!lista) return { data: null, error: null };
    const i = (numarate[c.tabela] = (numarate[c.tabela] ?? 0) + 1) - 1;
    return lista[Math.min(i, lista.length - 1)];
  });
  return { db, cereri, scrieri };
}

const PRODUS_FARA_STOC = {
  id: PID, name: "Pantof", slug: "pantof", description: "", price: 100, compare_at_price: null,
  images: [], category: "Pantofi", is_active: true, track_inventory: true, stock_quantity: 0,
  page_sections: null,
};

test("⚠ stoc zero fara rand local: anuntul viu de la ei se leaga si se stinge", async () => {
  /*
   * ═══ MAI INSELATOR DECAT ORFANUL DE LA STERGERE ═══
   *
   * Produsul EXISTA in Edinio, deci comerciantul crede pe buna dreptate ca sincronizarea de stoc
   * il apara:
   *
   *     `POST /adverts` reuseste ✅, scrierea in `olx_adverts` pica ❌
   *     stocul ajunge la zero inainte ca reconcilierea sa lege randul inapoi
   *     -> fara rand, ieseam cu „nimic de facut"
   *     -> Edinio arata zero bucati, iar la OLX anuntul e ACTIV si se vinde
   */
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [{ id: 555, status: "active", external_id: PID }] } },
    { status: 200, corp: { data: { id: 555, status: "removed_by_user" } } },
  ]);
  try {
    const { db, scrieri } = dbPeRand({
      olx_adverts: [
        { data: null, error: null },                                        // getRow: nu stim nimic
        { data: null, error: null },                                        // upsert-ul de legare
        { data: { id: "r1", olx_advert_id: 555, status: "active", offer_id: PID, sters_de_om_la: null, dezactivat_de: null }, error: null },
      ],
    });
    const ctx = { ...CTX, config: CONFIG_CONECTAT } as unknown as OlxSyncContext;
    const r = await processQueueItem(db, ctx, { ...LUCRARE, op: "upsert" }, PRODUS_FARA_STOC);
    assert.equal(r.ok, true, `asteptam reusita, am primit: ${JSON.stringify(r)}`);
    const legare = scrieri.find((x) => x.tabela === "olx_adverts" && (x.corp as { olx_advert_id?: number }).olx_advert_id === 555);
    assert.ok(legare, "anuntul necunoscut trebuie legat inainte de a fi stins");
    const stingere = scrieri.find((x) => (x.corp as { dezactivat_de?: string }).dezactivat_de === "stoc");
    assert.ok(stingere, "si motivul dezactivarii se scrie");
  } finally { stub.inapoi(); }
});

test("⚠ maparea de AZI nu dovedeste nimic despre IERI", () => {
  /*
   * ═══ PROBA ASTA CEREA PE DOS, SI AVEA DREPTATE SUB PREMISA DE-ATUNCI ═══
   *
   * Se chema „fara categorie mapata nu se intreaba OLX degeaba", si pazea o paza de cost: fara
   * mapare, `upsertRemote` n-ar fi ajuns niciodata la creare, deci n-ar fi nimic de cautat.
   * Adevarat IN CLIPA CREARII. Fals peste timp:
   *
   *     „Pantofi" e mapata -> `POST /adverts` reuseste ✅, scrierea locala pica ❌
   *     comerciantul sterge maparea din ecran (butonul exista)
   *     stocul ajunge la zero
   *     -> maparea nu mai exista -> nu se cauta nimic -> „nimic de facut"
   *     -> Edinio arata zero bucati, iar la OLX anuntul se vinde mai departe
   *
   * Acelasi lucru daca produsul isi schimba categoria intre creare si recuperare.
   *
   * ⚠ Deci paza de cost a cazut, si ramane cea adevarata: se ajunge aici numai cand produsul E
   * nevandabil SI n-avem nicio legatura locala.
   */
  const sync = readFileSync("src/lib/olx/sync.ts", "utf8");
  const i = sync.indexOf("if (!isProductSellable(product))");
  const ramura = sync.slice(i, sync.indexOf("const entry = product.category", i));
  assert.match(ramura, /stingeTotulPentruProdus\(/,
    "amandoua caile trec prin acelasi rezolvitor");
  assert.doesNotMatch(ramura, /category_map\?\.\[product\.category\]/,
    "recuperarea nu are voie sa se sprijine pe maparea de azi");
});


test("⚠ DOUA anunturi cu acelasi `external_id`: se retrag amandoua", async () => {
  /*
   * `external_id` n-are constrangere de unicitate la ei, iar noi chiar am avut o fereastra in care
   * un `POST` reusit urmat de o interogare anti-duplicat picata ducea la un al doilea `POST`.
   *
   * ⚠ Retras doar primul, al doilea ramane la vanzare pentru un produs sters — si nimic nu-l mai
   * gaseste, fiindca reconcilierea nu atinge un anunt fara produs.
   */
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [
      { id: 111, status: "active", external_id: PID },
      { id: 222, status: "active", external_id: PID },
    ] } },
    { status: 200, corp: {} },   // deactivate 222
    { status: 200, corp: {} },   // delete 222
    { status: 200, corp: {} },   // deactivate 111
    { status: 200, corp: {} },   // delete 111
  ]);
  try {
    const { db } = dbPeRand({
      products: [{ data: null, error: null }],
      olx_adverts: [
        { data: null, error: null },
        { data: null, error: null },
        { data: { id: "r1", olx_advert_id: 111, status: "active", offer_id: PID, sters_de_om_la: null, dezactivat_de: null }, error: null },
      ],
    });
    await processQueueItem(db, CTX, LUCRARE, null);
    const atinse = stub.cereri.join(" ");
    assert.match(atinse, /adverts\/222/, "anuntul in plus trebuie retras, nu lasat la vanzare");
    assert.match(atinse, /adverts\/111/, "si cel dintai");
  } finally { stub.inapoi(); }
});

test("⚠ daca anuntul in plus nu se poate retrage, lucrarea NU se incheie", async () => {
  /* Altfel primul s-ar sterge, coada s-ar goli, si al doilea ar ramane viu pe veci. */
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [
      { id: 111, status: "active", external_id: PID },
      { id: 222, status: "active", external_id: PID },
    ] } },
    { status: 500, corp: { error: { detail: "picat" } } },
  ]);
  try {
    const { db } = dbPeRand({ products: [{ data: null, error: null }], olx_adverts: [{ data: null, error: null }] });
    const r = await processQueueItem(db, CTX, LUCRARE, null);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.permanent, false, "se reia");
    assert.match(r.ok === false ? r.error : "", /in plus/);
  } finally { stub.inapoi(); }
});

test("⚠ un anunt `outdated` NU primeste motiv de dezactivare", async () => {
  /*
   * ═══ `dezactivat_de` RASPUNDE LA „CINE A FACUT `removed_by_user`?" ═══
   *
   * Nu la „ce incercam noi cand am primit refuzul". Un anunt `outdated` a expirat SINGUR la ei;
   * un motiv scris acolo ar fi o minciuna care se citeste mai tarziu ca adevar — si tocmai
   * `outdated` e starea pe care sincronizarea o reactiveaza automat.
   */
  const stub = stubFetchPeRand([
    /* ⚠ Prima cerere e LISTA: apasarea omului e asupra produsului, deci se cauta intai toate
       anunturile lui. Abia dupa aceea vine comanda pe cel canonic. */
    { status: 200, corp: { data: [{ id: 777, status: "active", external_id: PID }] } },
    { status: 400, corp: { error: { detail: "Ad has to be active" } } },
    { status: 200, corp: { data: { id: 777, status: "outdated" } } },
  ]);
  try {
    const { db, scrieri } = dbCuRand();
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "deactivate" }, null);
    assert.equal(r.ok, true, "anuntul oricum nu e la vanzare, deci nu e un esec");
    assert.equal(scrieri[0].status, "outdated", "starea vine de la EI");
    assert.equal("dezactivat_de" in scrieri[0], false,
      "`outdated` nu e o dezactivare facuta de noi");
  } finally { stub.inapoi(); }
});

test("⚠ la nevandabil, o cautare picata NU inseamna „nimic de facut”", async () => {
  /*
   * ⚠ Aceeasi regula ca peste tot: `skipped` inseamna „am putut intreba, si chiar nu e nimic".
   * Inghitita, eroarea ar fi golit coada exact cand anuntul putea fi viu — si nimic n-ar mai fi
   * reincercat.
   */
  const stub = stubFetchPeRand([{ status: 500, corp: { error: { detail: "picat" } } }]);
  try {
    const { db } = dbPeRand({ olx_adverts: [{ data: null, error: null }] });
    const ctx = { ...CTX, config: CONFIG_CONECTAT } as unknown as OlxSyncContext;
    const r = await processQueueItem(db, ctx, { ...LUCRARE, op: "upsert" }, PRODUS_FARA_STOC);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.permanent, false, "se reia");
    assert.match(r.ok === false ? r.error : "", /nu am putut verifica/i);
  } finally { stub.inapoi(); }
});

/* ── Duplicatele, si cand unul dintre ele E legat ────────────────────────── */

test("⚠ un rand legat NU dovedeste ca e singurul anunt", async () => {
  /*
   * ═══ STAREA CEA MAI PROBABILA A UNUI DUPLICAT ISTORIC ═══
   *
   * Pana azi, daca aveam un `olx_advert_id` local ieseam direct pe retragerea obisnuita — deci
   * cautarea duplicatelor se facea DOAR cand nu stiam nimic. Dar un duplicat vechi arata tocmai
   * pe dos: unul legat, celalalt orfan.
   *
   *     OLX:    anunt 111 (external_id = P)  si  anunt 222 (external_id = P)
   *     Edinio: `olx_adverts` -> 111
   *     omul sterge produsul -> se retragea 111, lucrarea se incheia
   *     -> 222 ramanea la vanzare, si nimic nu-l mai gasea: reconcilierea nu atinge
   *        un anunt al carui produs nu mai exista
   */
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [
      { id: 111, status: "active", external_id: PID },
      { id: 222, status: "active", external_id: PID },
    ] } },
    { status: 200, corp: {} },   // deactivate 222
    { status: 200, corp: {} },   // delete 222
    { status: 200, corp: {} },   // deactivate 111
    { status: 200, corp: {} },   // delete 111
  ]);
  try {
    const { db } = dbPeRand({
      products: [{ data: null, error: null }],
      olx_adverts: [{ data: { id: "r1", olx_advert_id: 111, status: "active", offer_id: PID, sters_de_om_la: null, dezactivat_de: null }, error: null }],
    });
    const r = await processQueueItem(db, CTX, LUCRARE, null);
    assert.equal(r.ok, true, `asteptam reusita, am primit: ${JSON.stringify(r)}`);
    const atinse = stub.cereri.join(" ");
    assert.match(atinse, /adverts\/222/, "anuntul in plus trebuie retras, desi randul local arata spre 111");
    assert.match(atinse, /adverts\/111/, "si cel legat");
  } finally { stub.inapoi(); }
});

test("⚠ cand exista rand legat, intrebarea se pune INAINTEA retragerii", async () => {
  /*
   * ⚠ O retragere pe jumatate, urmata de o lucrare incheiata, e chiar defectul de mai sus. Daca
   * intrebarea pica, nu se atinge NIMIC si se reia.
   */
  const stub = stubFetchPeRand([{ status: 500, corp: { error: { detail: "picat" } } }]);
  try {
    const { db } = dbPeRand({
      products: [{ data: null, error: null }],
      olx_adverts: [{ data: { id: "r1", olx_advert_id: 111, status: "active", offer_id: PID, sters_de_om_la: null, dezactivat_de: null }, error: null }],
    });
    const r = await processQueueItem(db, CTX, LUCRARE, null);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.permanent, false, "se reia");
    assert.equal(stub.cereri.length, 1, "nu s-a atins niciun anunt inainte de a sti cate sunt");
  } finally { stub.inapoi(); }
});

test("⚠ stoc zero: NICIUN anunt al produsului nu ramane la vanzare", async () => {
  /*
   * ⚠ Aceeasi regula pe drumul de stoc: cand produsul devine nevandabil, niciun anunt cu acel
   * `external_id` n-are voie sa ramana vizibil. Nu e nevoie sa fie sterse — dar stinse, da.
   */
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [
      { id: 111, status: "active", external_id: PID },
      { id: 222, status: "active", external_id: PID },
    ] } },
    { status: 200, corp: {} },   // deactivate 222 (in plus)
    { status: 200, corp: {} },   // deactivate 111 (cel legat)
  ]);
  try {
    const { db, scrieri } = dbPeRand({
      olx_adverts: [
        { data: null, error: null },
        { data: null, error: null },
        { data: { id: "r1", olx_advert_id: 111, status: "active", offer_id: PID, sters_de_om_la: null, dezactivat_de: null }, error: null },
      ],
    });
    const ctx = { ...CTX, config: CONFIG_CONECTAT } as unknown as OlxSyncContext;
    const r = await processQueueItem(db, ctx, { ...LUCRARE, op: "upsert" }, PRODUS_FARA_STOC);
    assert.equal(r.ok, true, `asteptam reusita, am primit: ${JSON.stringify(r)}`);
    const atinse = stub.cereri.join(" ");
    assert.match(atinse, /adverts\/222\/commands/, "anuntul in plus trebuie stins");
    assert.match(atinse, /adverts\/111\/commands/, "si cel legat");
    assert.ok(scrieri.some((x) => (x.corp as { dezactivat_de?: string }).dezactivat_de === "stoc"));
  } finally { stub.inapoi(); }
});

test("⚠ daca anuntul in plus nu se poate stinge, lucrarea NU se incheie", async () => {
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [
      { id: 111, status: "active", external_id: PID },
      { id: 222, status: "active", external_id: PID },
    ] } },
    { status: 500, corp: { error: { detail: "picat" } } },
  ]);
  try {
    const { db } = dbPeRand({ olx_adverts: [{ data: null, error: null }] });
    const ctx = { ...CTX, config: CONFIG_CONECTAT } as unknown as OlxSyncContext;
    const r = await processQueueItem(db, ctx, { ...LUCRARE, op: "upsert" }, PRODUS_FARA_STOC);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.permanent, false, "se reia");
    assert.match(r.ok === false ? r.error : "", /in plus/);
  } finally { stub.inapoi(); }
});

test("⚠ un anunt STRAIN nu se atinge nici pe drumul de stoc", async () => {
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [{ id: 999, status: "active", external_id: "cu-totul-altceva" }] } },
  ]);
  try {
    const { db } = dbPeRand({ olx_adverts: [{ data: null, error: null }] });
    const ctx = { ...CTX, config: CONFIG_CONECTAT } as unknown as OlxSyncContext;
    const r = await processQueueItem(db, ctx, { ...LUCRARE, op: "upsert" }, PRODUS_FARA_STOC);
    assert.deepEqual(r, { ok: true, action: "skipped" });
    assert.equal(stub.cereri.length, 1, "nicio comanda peste un anunt care nu e al produsului");
  } finally { stub.inapoi(); }
});

test("⚠ stoc zero cu rand CANONIC legat: si duplicatul se stinge", async () => {
  /*
   * ═══ ULTIMUL CAZ DE DUPLICAT (01.09.2026) ═══
   *
   * Proba de dinainte pornea cu `getRow` gol, deci masura ramura orfanului. Aici randul CHIAR
   * exista — starea cea mai probabila a unui duplicat istoric — si pana azi calea aceea iesea din
   * prima, fara sa mai caute:
   *
   *     OLX:    111 ACTIVE (external_id = P)  si  222 ACTIVE (external_id = P)
   *     Edinio: `olx_adverts` -> 111
   *     stoc 10 -> 0  ->  se stingea 111 si se intorcea
   *     -> 222 ramanea la vanzare, si marfa se vindea cand nu mai era
   */
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [
      { id: 111, status: "active", external_id: PID },
      { id: 222, status: "active", external_id: PID },
    ] } },
    { status: 200, corp: {} },   // deactivate 222 (in plus)
    { status: 200, corp: {} },   // deactivate 111 (canonic)
  ]);
  try {
    const RAND = { id: "r1", olx_advert_id: 111, status: "active", offer_id: PID, sters_de_om_la: null, dezactivat_de: null };
    const { db, scrieri } = dbPeRand({ olx_adverts: [{ data: RAND, error: null }] });
    const ctx = { ...CTX, config: CONFIG_CONECTAT } as unknown as OlxSyncContext;
    const r = await processQueueItem(db, ctx, { ...LUCRARE, op: "upsert" }, PRODUS_FARA_STOC);
    assert.equal(r.ok, true, `asteptam reusita, am primit: ${JSON.stringify(r)}`);
    const atinse = stub.cereri.join(" ");
    assert.match(atinse, /adverts\/222\/commands/, "duplicatul trebuie stins, desi randul arata spre 111");
    assert.match(atinse, /adverts\/111\/commands/, "si cel canonic");
    const motiv = scrieri.find((x) => (x.corp as { dezactivat_de?: string }).dezactivat_de === "stoc");
    assert.ok(motiv, "motivul se scrie pe randul canonic");
  } finally { stub.inapoi(); }
});

test("⚠ apasarea „Dezactivează” stinge si duplicatul", async () => {
  /*
   * ⚠ Omul vede un PRODUS si un buton, nu un `olx_advert_id`. Daca produsul are un duplicat
   * istoric, „am dezactivat" trebuie sa insemne ca nu mai e vandabil nicaieri — altfel ii spunem
   * ceva ce nu e adevarat.
   */
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [
      { id: 111, status: "active", external_id: PID },
      { id: 222, status: "active", external_id: PID },
    ] } },
    { status: 200, corp: {} },
    { status: 200, corp: {} },
  ]);
  try {
    const RAND = { id: "r1", olx_advert_id: 111, status: "active", offer_id: PID, sters_de_om_la: null, dezactivat_de: null };
    const { db, scrieri } = dbPeRand({ olx_adverts: [{ data: RAND, error: null }] });
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "deactivate" }, null);
    assert.equal(r.ok, true, `asteptam reusita, am primit: ${JSON.stringify(r)}`);
    const atinse = stub.cereri.join(" ");
    assert.match(atinse, /adverts\/222\/commands/);
    assert.match(atinse, /adverts\/111\/commands/);
    assert.ok(scrieri.some((x) => (x.corp as { dezactivat_de?: string }).dezactivat_de === "om"),
      "apasarea omului ramane insemnata ca a lui");
  } finally { stub.inapoi(); }
});

test("⚠ `stingeLaEi` nu socoteste orice `400` drept reusita", async () => {
  /*
   * ═══ UN `400` NU E O DOVADA DE STARE (01.09.2026) ═══
   *
   * `400` e familia intreaga de refuzuri de validare la ei. Din codul HTTP nu se poate deduce ca
   * starea dorita a fost atinsa — iar aici concluzia „e stins" opreste o lucrare care apara marfa
   * de la a se vinde cand nu exista.
   */
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [
      { id: 111, status: "active", external_id: PID },
      { id: 222, status: "active", external_id: PID },
    ] } },
    { status: 400, corp: { error: { detail: "altceva" } } },   // deactivate 222 refuzat
    { status: 200, corp: { data: { id: 222, status: "active" } } },  // …si e in continuare VIU
  ]);
  try {
    const { db } = dbPeRand({ olx_adverts: [{ data: null, error: null }] });
    const ctx = { ...CTX, config: CONFIG_CONECTAT } as unknown as OlxSyncContext;
    const r = await processQueueItem(db, ctx, { ...LUCRARE, op: "upsert" }, PRODUS_FARA_STOC);
    assert.equal(r.ok, false, "un anunt ramas VIU nu e o stingere reusita");
    assert.equal(r.ok === false && r.permanent, false, "se reia");
  } finally { stub.inapoi(); }
});

test("⚠ dar un `400` peste un anunt chiar stins ESTE reusita", async () => {
  /* Contraproba: fara ea, proba de sus ar trece si cu o functie care refuza mereu. */
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: [
      { id: 111, status: "active", external_id: PID },
      { id: 222, status: "active", external_id: PID },
    ] } },
    { status: 400, corp: { error: { detail: "Ad has to be active" } } },
    { status: 200, corp: { data: { id: 222, status: "removed_by_user" } } },
    { status: 200, corp: {} },   // deactivate 111
  ]);
  try {
    const { db } = dbPeRand({ olx_adverts: [{ data: null, error: null }] });
    const ctx = { ...CTX, config: CONFIG_CONECTAT } as unknown as OlxSyncContext;
    const r = await processQueueItem(db, ctx, { ...LUCRARE, op: "upsert" }, PRODUS_FARA_STOC);
    assert.notEqual(r.ok, false, `asteptam sa treaca de anuntul in plus: ${JSON.stringify(r)}`);
  } finally { stub.inapoi(); }
});

test("⚠ cautarea dupa `external_id` trece prin TOATE paginile", async () => {
  /*
   * ⚠ O curatenie exhaustiva n-are voie sa se sprijine pe un numar maxim pe care API-ul lor nu l-a
   * promis: `external_id` e un filtru de lista, nu o cheie unica.
   */
  const paginaPlina = Array.from({ length: 50 }, (_, i) => ({ id: 1000 + i, status: "removed_by_user", external_id: PID }));
  const stub = stubFetchPeRand([
    { status: 200, corp: { data: paginaPlina } },
    { status: 200, corp: { data: [{ id: 2222, status: "active", external_id: PID }] } },
    { status: 200, corp: {} },
    { status: 200, corp: {} },
  ]);
  try {
    const { db } = dbPeRand({ products: [{ data: null, error: null }], olx_adverts: [{ data: null, error: null }] });
    await processQueueItem(db, CTX, LUCRARE, null);
    assert.match(stub.cereri[0], /offset=0/);
    assert.match(stub.cereri[1] ?? "", /offset=50/, "o pagina plina inseamna ca mai pot fi si altele");
  } finally { stub.inapoi(); }
});
