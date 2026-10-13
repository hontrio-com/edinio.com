import { test } from "node:test";
import assert from "node:assert/strict";
import * as api from "./api";
import { CALE_TOKEN } from "./constante";
import { RUTE_COLECTIE } from "./rute-colectie";
import { depozitFals, serverFals } from "./fals-easysales";
import type { ContextEasySales } from "./client";

/*
 * ═══ CE NU E IN COLECTIA LOR NU SE CHEAMA ═══
 *
 * Fiecare functie exportata din `api.ts` e chemata aici, prin serverul fals, iar cererea care
 * pleaca (metoda + cale, cu parametrii adusi la `{}`) trebuie sa fie una din rutele colectiei
 * (`rute-colectie.ts`). O functie noua fara rand in tabelul de mai jos pica proba: nu exista
 * cale „nechemata" prin care sa intre o ruta inventata.
 */

const B = "11111111-1111-4111-8111-111111111111";

/** Parametrii de cale adusi la `{}`: id-urile numerice si slug-ul abonarii (`/webhooks/{slug}` in colectie). */
function normalizeaza(cale: string): string {
  return cale.replace(/^\/api\/v2/, "")
    .replace(/^\/webhooks\/[a-z][a-z-]*$/, "/webhooks/{}")
    .split("/").map((s) => (/^\d+$/.test(s) ? "{}" : s)).join("/");
}

const CHEMARI: Record<string, (ctx: ContextEasySales) => Promise<unknown>> = {
  citesteContul: (c) => api.citesteContul(c),
  listaWebsiteuri: (c) => api.listaWebsiteuri(c),
  listaMarketplaceuri: (c) => api.listaMarketplaceuri(c),
  statusuriLivrare: (c) => api.statusuriLivrare(c),
  listaAbonari: (c) => api.listaAbonari(c),
  aboneaza: (c) => api.aboneaza(c, "order-updated", "https://www.edinio.com/api/easysales/webhook?businessId=x&t=y", "s".repeat(48), "secret"),
  schimbaAdresaAbonarii: (c) => api.schimbaAdresaAbonarii(c, "1", "https://www.edinio.com/x"),
  dezaboneaza: (c) => api.dezaboneaza(c, "1"),
  declanseazaAbonarea: (c) => api.declanseazaAbonarea(c, "1"),
  salveazaComanda: (c) => api.salveazaComanda(c, { order_id: 1000000001 }),
  citesteComanda: (c) => api.citesteComanda(c, "500"),
  listaComenzi: (c) => api.listaComenzi(c, { order_display_id: "1000000001" }),
  anuleazaComandaLaEi: (c) => api.anuleazaComandaLaEi(c, "500", "motiv"),
  adaugaMetadate: (c) => api.adaugaMetadate(c, "500", [{ key: "k", value: "v" }]),
  listaProduse: (c) => api.listaProduse(c, { website: "Edinio Test" }),
};

test("fiecare functie exportata din api.ts are o chemare de contract", () => {
  const exportate = Object.entries(api).filter(([, v]) => typeof v === "function").map(([k]) => k).sort();
  assert.deepEqual(exportate, Object.keys(CHEMARI).sort());
});

test("⚠ fiecare cerere pleaca pe o ruta din colectia lor", async () => {
  process.env.EASYSALES_API_URL = "https://easysales.fals";
  const srv = serverFals();
  const dep = depozitFals({ [B]: {
    connected: true, client_id: srv.optiuni.clientId, client_secret: srv.optiuni.clientSecret,
    website_token: srv.optiuni.websiteToken, token_versiune: 0,
  } });
  const ctx: ContextEasySales = { dep, businessId: B, cfg: dep.configuri.get(B)! };
  const colectie = new Set(RUTE_COLECTIE);
  for (const [nume, chemare] of Object.entries(CHEMARI)) {
    const inainte = srv.stare.cereri.length;
    await srv.cuFetch(() => chemare(ctx));
    const ale_ei = srv.stare.cereri.slice(inainte).filter((c) => c.cale !== CALE_TOKEN);
    assert.ok(ale_ei.length >= 1, `${nume} n-a trimis nicio cerere`);
    for (const c of ale_ei) {
      const ruta = `${c.metoda} ${normalizeaza(c.cale)}`;
      assert.ok(colectie.has(ruta), `${nume} cheama ${ruta}, care nu e in colectie`);
    }
  }
  /* si emiterea tokenului */
  assert.ok(colectie.has(`POST ${CALE_TOKEN}`));
  delete process.env.EASYSALES_API_URL;
});

test("lista colectiei e cea derivata: forma randurilor, fara dubluri", () => {
  for (const r of RUTE_COLECTIE) assert.match(r, /^(GET|POST|PUT|PATCH|DELETE) \/[a-z0-9\-/{}]+$/);
  assert.equal(new Set(RUTE_COLECTIE).size, RUTE_COLECTIE.length);
  assert.ok(RUTE_COLECTIE.length >= 80, "lista pare taiata");
});

/*
 * ⚠ SCHEMA DERIVATA E SURSA, IAR AMPRENTA EI E FIXATA. Colectia insasi nu intra in depozit (are
 * credentiale si date de cumparatori in exemple), deci `docs/marketplace/easysales-api-schema-*.json`
 * tine numele, metoda, calea si tabelele de campuri. O descarcare noua a colectiei reface schema;
 * proba cade pana cand lista rutelor si amprenta de aici se pun de acord cu ea, constient.
 */
const SCHEMA = "docs/marketplace/easysales-api-schema-2026-10-12.json";
const AMPRENTA_SCHEMEI = "3828ef3f929da89be4ba2458269c9b30f726f09e7f826da9dd4694644b681024";

test("rutele din `rute-colectie.ts` sunt EXACT cele din schema derivata, iar schema e cea stiuta", async () => {
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  /* ⚠ Terminatiile de rand se aduc la LF inainte de amprenta: pe Windows, git le poate face CRLF la checkout. */
  const text = readFileSync(SCHEMA, "utf8").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(text, "utf8").digest("hex"), AMPRENTA_SCHEMEI, "schema s-a schimbat: reface lista rutelor si amprenta");
  const schema = JSON.parse(text) as { cereri: { metoda: string; cale: string }[] };
  const derivate = new Set(schema.cereri
    .filter((c) => c.cale.startsWith("/api/v2") || c.cale.startsWith("/oauth"))
    .map((c) => `${c.metoda} ${c.cale.replace(/^\/api\/v2/, "").split("/").map((x) => (x.startsWith(":") || /^\{\{.*\}\}$/.test(x) || /^\d+$/.test(x) ? "{}" : x)).join("/")}`));
  assert.deepEqual([...derivate].sort(), [...RUTE_COLECTIE].sort());
  assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/, "schema are o adresa de email");
  assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{10,}/, "schema are un JWT");
});
