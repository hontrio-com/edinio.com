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
  const stub = stubFetchPeRand([{ status: 404, corp: { error: { detail: "not found" } } }]);
  try {
    const { db, scrieri } = dbCuRand();
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "deactivate" }, null);
    assert.equal(r.ok, true);
    assert.equal(scrieri[0].status, "sters_de_om");
    assert.ok(scrieri[0].sters_de_om_la, "piatra poarta clipa hotararii");
  } finally { stub.inapoi(); }
});
