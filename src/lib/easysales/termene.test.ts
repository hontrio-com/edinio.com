import { test } from "node:test";
import assert from "node:assert/strict";
import { cerereEasySales, type ContextEasySales } from "./client";
import { TERMEN_BLOC_MS, TERMEN_SIMPLU_MS } from "./constante";
import { depozitFals, serverFals } from "./fals-easysales";

/*
 * Termenele cererilor, probate pe PURTARE (planul, §5.0): fiecare cerere catre easySales pleaca
 * cu un `AbortSignal.timeout`, de 20 s la cele simple si de 60 s la cele in bloc, iar emiterea
 * tokenului tot cu 20 s. O cerere fara termen ar putea tine cronul agatat pana la `maxDuration`,
 * si cu el toate celelalte magazine.
 *
 * ⚠ Proba existenta `curierii-au-termen-la-cerere.test.ts` cere numai `signal:` la curieri, nu
 * durate, si nu acopera integrarile de marketplace.
 */

const B = "22222222-2222-4222-8222-222222222222";

test("cererea simpla 20 s, cea in bloc 60 s, emiterea tokenului 20 s; fiecare fetch are termen", async () => {
  process.env.EASYSALES_API_URL = "https://easysales.fals";
  const srv = serverFals();
  const dep = depozitFals({ [B]: {
    connected: true, client_id: srv.optiuni.clientId, client_secret: srv.optiuni.clientSecret,
    website_token: srv.optiuni.websiteToken, token_versiune: 0,
  } });
  const ctx: ContextEasySales = { dep, businessId: B, cfg: dep.configuri.get(B)! };

  const cerute: number[] = [];
  const original = AbortSignal.timeout;
  const fetchFals = srv.fetch;
  let faraSemnal = 0;
  AbortSignal.timeout = ((ms: number) => { cerute.push(ms); return original.call(AbortSignal, ms); }) as typeof AbortSignal.timeout;
  try {
    await srv.cuFetch(async () => {
      const cuPaza = globalThis.fetch;
      globalThis.fetch = ((u: string | URL | Request, init?: RequestInit) => {
        if (!init?.signal) faraSemnal++;
        return fetchFals(u, init);
      }) as typeof fetch;
      try {
        await cerereEasySales(ctx, { metoda: "GET", cale: "/account" });
        await cerereEasySales(ctx, { metoda: "POST", cale: "/orders/save", corp: { order: {} }, inBloc: true });
      } finally {
        globalThis.fetch = cuPaza;
      }
    });
  } finally {
    AbortSignal.timeout = original;
    delete process.env.EASYSALES_API_URL;
  }
  assert.equal(faraSemnal, 0, "o cerere a plecat fara termen");
  /* emiterea (prima cerere), apoi cererea simpla, apoi cea in bloc */
  assert.deepEqual(cerute, [TERMEN_SIMPLU_MS, TERMEN_SIMPLU_MS, TERMEN_BLOC_MS]);
  assert.equal(TERMEN_SIMPLU_MS, 20_000);
  assert.equal(TERMEN_BLOC_MS, 60_000);
});
