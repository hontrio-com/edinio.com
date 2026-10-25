import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { DURATA_COD_MS, conexiuneaActiva, conexiuneaJetonului, creeazaCod, schimbaCodul } from "./conexiuni";
import { amprenta } from "./jetoane";

/*
 * O baza in memorie care stie exact cat cer `conexiuni.ts`: select / insert / update / delete, cu
 * filtrele `eq`, `neq`, `is`, `lt`, si capetele `maybeSingle`, `single` sau `await` direct.
 *
 * ⚠ `update ... select` intoarce randurile SCHIMBATE, ca PostgREST cu `return=representation`: pe
 * asta sta revendicarea atomica a codului, deci proba trebuie sa o imite intocmai.
 */
type Rand = Record<string, unknown>;
type Filtru = { op: "eq" | "neq" | "is" | "lt"; k: string; v: unknown };

function faceBaza() {
  const tabele: Record<string, Rand[]> = { hontrio_coduri: [], hontrio_conexiuni: [] };
  const scrieri: { tabela: string; fel: string }[] = [];

  function potriveste(r: Rand, f: Filtru[]): boolean {
    return f.every(({ op, k, v }) => {
      const x = r[k] ?? null;
      if (op === "eq") return x === v;
      if (op === "neq") return x !== v;
      if (op === "is") return x === v;
      return x !== null && String(x) < String(v);
    });
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  function from(tabela: string) {
    let fel: "select" | "insert" | "update" | "delete" = "select";
    let corp: Rand | null = null;
    let intoarce = false;
    const filtre: Filtru[] = [];
    let limita: number | null = null;

    function executa(): { data: Rand[] | null; error: null } {
      const t = tabele[tabela];
      if (fel === "insert") {
        const implicite: Rand = tabela === "hontrio_conexiuni"
          ? { id: randomUUID(), revocat_la: null, motiv_revocare: null, ultima_folosire: null }
          : { folosit_la: null, conexiune_id: null };
        const rand: Rand = { ...implicite, ...(corp ?? {}) };
        if (tabela === "hontrio_conexiuni" && t.some((r) => r.amprenta === rand.amprenta)) throw new Error("amprenta duplicata");
        t.push(rand);
        scrieri.push({ tabela, fel });
        return { data: [rand], error: null };
      }
      const gasite = t.filter((r) => potriveste(r, filtre));
      if (fel === "update") {
        for (const r of gasite) Object.assign(r, corp);
        scrieri.push({ tabela, fel });
        return { data: intoarce ? gasite.map((r) => ({ ...r })) : null, error: null };
      }
      if (fel === "delete") {
        tabele[tabela] = t.filter((r) => !gasite.includes(r));
        return { data: null, error: null };
      }
      return { data: (limita === null ? gasite : gasite.slice(0, limita)).map((r) => ({ ...r })), error: null };
    }

    const b: any = {
      select: () => { if (fel !== "select") intoarce = true; return b; },
      insert: (v: Rand) => { fel = "insert"; corp = v; return b; },
      update: (v: Rand) => { fel = "update"; corp = v; return b; },
      delete: () => { fel = "delete"; return b; },
      eq: (k: string, v: unknown) => { filtre.push({ op: "eq", k, v }); return b; },
      neq: (k: string, v: unknown) => { filtre.push({ op: "neq", k, v }); return b; },
      is: (k: string, v: unknown) => { filtre.push({ op: "is", k, v }); return b; },
      lt: (k: string, v: unknown) => { filtre.push({ op: "lt", k, v }); return b; },
      order: () => b,
      limit: (n: number) => { limita = n; return b; },
      maybeSingle: () => { const { data } = executa(); return Promise.resolve({ data: data?.[0] ?? null, error: null }); },
      single: () => { const { data } = executa(); return Promise.resolve({ data: data?.[0] ?? null, error: data?.[0] ? null : { message: "0 randuri" } }); },
      then: (ok: (v: unknown) => unknown, rau?: (e: unknown) => unknown) => {
        try { return Promise.resolve(executa()).then(ok, rau); } catch (e) { return Promise.reject(e).then(ok, rau); }
      },
    };
    return b;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { db: { from } as unknown as SupabaseClient<Database>, tabele, scrieri };
}

const BID = "11111111-2222-3333-4444-555555555555";
const UID = "66666666-7777-8888-9999-000000000000";
const INTOARCERE = "https://hontrio.com/api/integrations/edinio/callback";
const VERIFICATOR = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const PROVOCARE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const ACUM = Date.UTC(2026, 9, 25, 12, 0, 0);

async function cuCod(baza = faceBaza()) {
  const cod = await creeazaCod(baza.db, { businessId: BID, userId: UID, redirectUri: INTOARCERE, codeChallenge: PROVOCARE }, ACUM);
  return { ...baza, cod };
}

test("⚠ codul nu sta in baza, doar amprenta lui; si traieste 10 minute", async () => {
  const { tabele, cod } = await cuCod();
  const [rand] = tabele.hontrio_coduri;
  assert.equal(rand.amprenta, amprenta(cod));
  assert.ok(!JSON.stringify(tabele).includes(cod), "codul in clar nu apare nicaieri in baza");
  assert.equal(Date.parse(String(rand.expira_la)) - ACUM, DURATA_COD_MS);
  assert.equal(rand.aprobat_de, UID);
});

test("schimbul bun da un jeton, iar baza tine doar amprenta lui", async () => {
  const { db, tabele, cod } = await cuCod();
  const rez = await schimbaCodul(db, { cod, redirectUri: INTOARCERE, verificator: VERIFICATOR }, ACUM + 1000);
  assert.equal(rez.fel, "ok");
  const { jeton, businessId, conexiuneId } = rez as Extract<typeof rez, { fel: "ok" }>;
  assert.equal(businessId, BID);
  assert.ok(!JSON.stringify(tabele).includes(jeton), "jetonul in clar nu apare nicaieri in baza");
  assert.deepEqual(await conexiuneaJetonului(db, jeton), { id: conexiuneId, businessId: BID, ultimaFolosire: null });
  assert.equal(tabele.hontrio_coduri[0].conexiune_id, conexiuneId, "codul tine minte ce conexiune a nascut");
});

test("⚠ un cod se schimba o singura data", async () => {
  const { db, cod } = await cuCod();
  assert.equal((await schimbaCodul(db, { cod, redirectUri: INTOARCERE, verificator: VERIFICATOR }, ACUM)).fel, "ok");
  assert.equal((await schimbaCodul(db, { cod, redirectUri: INTOARCERE, verificator: VERIFICATOR }, ACUM)).fel, "refuzat");
});

test("⚠ a doua venire a codului revoca jetonul dat pe el (RFC 6749, 10.5)", async () => {
  const { db, tabele, cod } = await cuCod();
  const prima = await schimbaCodul(db, { cod, redirectUri: INTOARCERE, verificator: VERIFICATOR }, ACUM);
  assert.equal(prima.fel, "ok");
  const { jeton } = prima as Extract<typeof prima, { fel: "ok" }>;
  await schimbaCodul(db, { cod, redirectUri: INTOARCERE, verificator: VERIFICATOR }, ACUM + 5000);
  assert.equal(await conexiuneaJetonului(db, jeton), null, "jetonul nascut din codul refolosit nu mai deschide nimic");
  assert.equal(tabele.hontrio_conexiuni[0].motiv_revocare, "cod_refolosit");
});

test("⚠ codul expirat, alta adresa sau alt verificator: acelasi „nu”, iar codul ramane ars", async () => {
  const cazuri = [
    { nume: "expirat", schimb: { redirectUri: INTOARCERE, verificator: VERIFICATOR }, la: ACUM + DURATA_COD_MS },
    { nume: "alta adresa", schimb: { redirectUri: `${INTOARCERE}/`, verificator: VERIFICATOR }, la: ACUM },
    { nume: "alt verificator", schimb: { redirectUri: INTOARCERE, verificator: "x".repeat(43) }, la: ACUM },
  ];
  for (const c of cazuri) {
    const { db, tabele, cod } = await cuCod();
    assert.deepEqual(await schimbaCodul(db, { cod, ...c.schimb }, c.la), { fel: "refuzat" }, c.nume);
    assert.equal(tabele.hontrio_conexiuni.length, 0, `${c.nume}: nicio conexiune`);
    /* A doua incercare, de data asta corecta, nu mai are pe ce sa mearga. */
    assert.equal((await schimbaCodul(db, { cod, redirectUri: INTOARCERE, verificator: VERIFICATOR }, ACUM)).fel, "refuzat", c.nume);
  }
});

test("un cod inventat nu porneste nicio interogare, iar unul cu forma buna dar necunoscut e refuzat", async () => {
  const { db, scrieri } = faceBaza();
  assert.deepEqual(await schimbaCodul(db, { cod: "scurt", redirectUri: INTOARCERE, verificator: VERIFICATOR }, ACUM), { fel: "refuzat" });
  assert.equal(scrieri.length, 0);
  assert.deepEqual(await schimbaCodul(db, { cod: "a".repeat(43), redirectUri: INTOARCERE, verificator: VERIFICATOR }, ACUM), { fel: "refuzat" });
});

test("⚠ reconectarea inlocuieste legatura veche: un magazin are un singur jeton viu", async () => {
  const baza = faceBaza();
  const unu = await cuCod(baza);
  const r1 = await schimbaCodul(baza.db, { cod: unu.cod, redirectUri: INTOARCERE, verificator: VERIFICATOR }, ACUM);
  const doi = await cuCod(baza);
  const r2 = await schimbaCodul(baza.db, { cod: doi.cod, redirectUri: INTOARCERE, verificator: VERIFICATOR }, ACUM + 60_000);
  assert.equal(r1.fel, "ok");
  assert.equal(r2.fel, "ok");
  assert.equal(await conexiuneaJetonului(baza.db, (r1 as Extract<typeof r1, { fel: "ok" }>).jeton), null);
  assert.ok(await conexiuneaJetonului(baza.db, (r2 as Extract<typeof r2, { fel: "ok" }>).jeton));
  assert.equal(baza.tabele.hontrio_conexiuni.filter((r) => r.revocat_la === null).length, 1);
  assert.equal(baza.tabele.hontrio_conexiuni[0].motiv_revocare, "inlocuita");
  assert.ok(await conexiuneaActiva(baza.db, BID));
});

test("un jeton cu forma gresita nu ajunge la baza", async () => {
  const { db } = faceBaza();
  assert.equal(await conexiuneaJetonului(db, "hnt_scurt"), null);
  assert.equal(await conexiuneaJetonului(db, ""), null);
});
